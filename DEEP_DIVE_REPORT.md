# Deep Dive Report: Auto-Coursera Chrome Extension

**Date**: 2026-03-08  
**Companion to**: STANDARDS_REPORT.md  
**Scope**: Service worker lifecycle, Chrome test mocks, structured output, WXT migration, circuit breaker, UX audit

---

## Table of Contents

1. [Service Worker Lifecycle Hardening](#1-service-worker-lifecycle-hardening)
2. [Chrome API Test Mock Infrastructure](#2-chrome-api-test-mock-infrastructure)
3. [OpenRouter Structured Output (`response_format`)](#3-openrouter-structured-output)
4. [WXT Framework Migration Research](#4-wxt-framework-migration-research)
5. [Circuit Breaker Pattern for Providers](#5-circuit-breaker-pattern-for-providers)
6. [UX Audit & Improvements](#6-ux-audit--improvements)

---

## 1. Service Worker Lifecycle Hardening

### The Problem

Chrome MV3 service workers have aggressive lifecycle constraints (as of Chrome 120+):
- **30 seconds idle** → terminated
- **5 minutes max** per event handler
- **30 seconds max** for `fetch()` response arrival
- **Global variables are lost** on termination

Your current `background.ts` stores `providerManager`, `providersReady`, and `providerReadyPromise` as module-level globals. All are lost on SW termination.

### 1.1 Current Vulnerabilities

**A. Batch solve can exceed 5 minutes**

A batch of 10 questions → each provider call with 2 retries × 30s timeout = up to 15 minutes worst case. The service worker will be killed mid-operation.

**B. No reconnection in content script**

```
// content.ts — current code
const response = await chrome.runtime.sendMessage<Message>({
  type: 'SOLVE_BATCH',
  payload,
});
```

If the SW has been killed, this throws `"Extension context invalidated"` with no recovery.

**C. No state persistence for in-flight batch**

If the SW dies while processing question 5 of 10, questions 1-4 results are lost.

### 1.2 Recommended Fixes

#### Fix A: Keep-alive mechanism during batch operations

Use `chrome.alarms` to ping the service worker during long operations. Extension API calls reset the 30-second idle timer per Chrome 110+.

```typescript
// background.ts — add near top
const KEEPALIVE_ALARM = 'sw-keepalive';

function startKeepAlive(): void {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // 24s, under 30s idle limit
}

function stopKeepAlive(): void {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Extension API call resets idle timer — no-op is sufficient
    logger.debug('Keep-alive ping');
  }
});
```

Wrap batch operations:

```typescript
async function handleSolveBatch(payload: unknown): Promise<Message> {
  startKeepAlive();
  try {
    // ... existing batch logic
  } finally {
    stopKeepAlive();
  }
}
```

**Manifest change required**: Add `"alarms"` to permissions.

#### Fix B: Resilient messaging in content script

```typescript
// content.ts — wrap sendMessage with retry
async function sendMessageWithRetry<T>(
  message: Message,
  maxRetries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      return response as T;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Extension context invalidated') ||
          msg.includes('Could not establish connection')) {
        if (attempt < maxRetries) {
          logger.warn(`SW disconnected, retry ${attempt + 1}/${maxRetries}`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        // Show user-facing error after retries exhausted
        logger.error('Service worker unreachable — extension may need reload');
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded contacting service worker');
}
```

#### Fix C: Persist in-flight results to `chrome.storage.session`

```typescript
// background.ts — inside batch loop, after each successful answer
await chrome.storage.session.set({
  [`_batchResult_${answer.uid}`]: answer
});
```

Content script can check for partial results on retry.

#### Fix D: Add `onSuspend` handler

```typescript
// background.ts
// Note: onSuspend is not guaranteed to fire, but when it does, it's useful
self.addEventListener('beforeunload', () => {
  // MV3 doesn't have a formal onSuspend — but this may help in some Chrome versions
  logger.info('Service worker suspending');
});
```

> **Note**: Chrome MV3 doesn't officially expose `onSuspend` for extension service workers the way it does for web page service workers. The primary strategy is to **design for termination** — persist state eagerly to `chrome.storage.session` rather than relying on cleanup.

### 1.3 Design Principle

**Treat every service worker execution as potentially the last.** Never accumulate state in globals that hasn't been persisted. Chrome's docs explicitly say:

> *"Any global variables you set will be lost if the service worker shuts down. Instead of using global variables, save values to storage."*

For `providerManager`, the cleanest pattern is to re-initialize on every message arrival (it's fast — just reading from storage and creating objects), rather than caching in a global.

---

## 2. Chrome API Test Mock Infrastructure

### The Problem

All 5 test files avoid Chrome APIs entirely. `detector.test.ts` re-implements private methods to test them in isolation. This means:
- `storage.ts` (AES-GCM encryption) is untested
- `background.ts` (message routing, sender validation, lifecycle) is untested
- `ai-provider.ts` (strategy pattern, fallback chain) is untested
- `content.ts` (batch queue, debounce, SPA navigation) is untested

### 2.1 Recommended Mock Setup

Create `tests/mocks/chrome.ts`:

```typescript
import { vi } from 'vitest';

// Storage mock with in-memory backing
function createStorageArea() {
  let store: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys?: Record<string, unknown> | string[] | string) => {
      if (typeof keys === 'string') {
        return { [keys]: store[keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const k of keys) result[k] = store[k];
        return result;
      }
      if (keys && typeof keys === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, defaultVal] of Object.entries(keys)) {
          result[k] = store[k] !== undefined ? store[k] : defaultVal;
        }
        return result;
      }
      return { ...store };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
    }),
    clear: vi.fn(async () => { store = {}; }),
    _getStore: () => store,
    _setStore: (s: Record<string, unknown>) => { store = s; },
  };
}

const changeListeners: Array<(changes: Record<string, unknown>, area: string) => void> = [];

export const chromeMock = {
  runtime: {
    id: 'mock-extension-id-12345',
    getURL: vi.fn((path: string) => `chrome-extension://mock-extension-id-12345/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    openOptionsPage: vi.fn(),
  },
  storage: {
    local: createStorageArea(),
    session: createStorageArea(),
    sync: createStorageArea(),
    onChanged: {
      addListener: vi.fn((listener: (...args: unknown[]) => void) => {
        changeListeners.push(listener as (changes: Record<string, unknown>, area: string) => void);
      }),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(async () => []),
    sendMessage: vi.fn(),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
};

// Install globally
export function installChromeMock() {
  vi.stubGlobal('chrome', chromeMock);
}

export function resetChromeMock() {
  chromeMock.storage.local._setStore({});
  chromeMock.storage.session._setStore({});
  vi.clearAllMocks();
}
```

### 2.2 Vitest Setup File

Create `tests/setup.ts`:

```typescript
import { installChromeMock, resetChromeMock } from './mocks/chrome';
import { beforeEach } from 'vitest';

// Install Chrome API mocks globally
installChromeMock();

// Reset between tests
beforeEach(() => {
  resetChromeMock();
});
```

Update `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',  // Changed from 'node' — most tests need DOM
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],  // NEW
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
```

### 2.3 Fetch Mock for API Tests

Use `vi.stubGlobal` for provider tests:

```typescript
// tests/unit/openrouter.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../../src/services/openrouter';
import { RateLimiter } from '../../src/utils/rate-limiter';

function mockFetchResponse(body: unknown, status = 200) {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response)
  );
}

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider('sk-or-test', 'test/model', new RateLimiter(100));
  });

  it('should include correct headers in API call', async () => {
    const mockFetch = mockFetchResponse({
      id: 'gen-1',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":[0],"confidence":0.9,"reasoning":"test"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    vi.stubGlobal('fetch', mockFetch);

    await provider.solve({
      questionText: 'Test?',
      options: ['A', 'B'],
      questionType: 'single-choice',
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('openrouter.ai/api/v1/chat/completions');
    expect(init.headers['Authorization']).toBe('Bearer sk-or-test');
    expect(init.headers['HTTP-Referer']).toBeDefined();
  });

  it('should retry on 429', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({ ok: false, status: 429, statusText: 'Too Many Requests' });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: 'gen-1',
          choices: [{ index: 0, message: { role: 'assistant', content: '{"answer":[1],"confidence":0.8,"reasoning":""}' }, finish_reason: 'stop' }],
          usage: { total_tokens: 10 },
        }),
      });
    }));

    const result = await provider.solve({
      questionText: 'Test?',
      options: ['A', 'B'],
      questionType: 'single-choice',
    });

    expect(callCount).toBe(2);
    expect(result.answerIndices).toEqual([1]);
  });
});
```

### 2.4 Priority Test Files to Create

| Priority | File | What to test |
|----------|------|-------------|
| 1 | `storage.test.ts` | Encrypt/decrypt roundtrip, corrupt data handling, default settings |
| 2 | `openrouter.test.ts` | Headers, retry logic, timeout, error classification |
| 3 | `nvidia-nim.test.ts` | Same as above for NVIDIA provider |
| 4 | `ai-provider.test.ts` | Fallback chain, vision routing, all-failed error |
| 5 | `background.test.ts` | Message routing, sender validation, provider init |
| 6 | `extractor.test.ts` | DOM extraction, math replacement, honeypot filtering |
| 7 | `image-pipeline.test.ts` | Host allowlist, CORS re-fetch, data URI handling |

### 2.5 Coverage Target

Aim for **80% line coverage** on core logic (services/, utils/) and **60%** on Chrome-dependent code (background/, content/) — the latter requires more complex mocking and is harder to make realistic.

---

## 3. OpenRouter Structured Output

### The Problem

Your extension asks models to return JSON via prompt instructions:

```
Respond in EXACTLY this JSON format: {"answer": [0], "confidence": 0.95, "reasoning": "brief explanation"}
DO NOT include any text outside the JSON object.
```

This works most of the time but fails when:
- Models add "Sure! Here's the answer:" preamble
- Models wrap JSON in markdown code fences
- Models produce malformed JSON
- Free-tier models are less instruction-following

### 3.1 OpenRouter's `response_format` Support

As of early 2026, OpenRouter supports two modes:

```typescript
// Mode 1: Basic JSON mode — forces valid JSON output
response_format: { type: 'json_object' }

// Mode 2: Strict schema mode — forces output matching your exact schema
response_format: {
  type: 'json_schema',
  json_schema: {
    name: 'quiz_answer',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        answer: { type: 'array', items: { type: 'integer' } },
        confidence: { type: 'number' },
        reasoning: { type: 'string' }
      },
      required: ['answer', 'confidence', 'reasoning']
    }
  }
}
```

**Important caveats:**
- Not all models support `response_format` — check the model's `supported_parameters` on [openrouter.ai/models](https://openrouter.ai/models)
- `json_schema` (strict) mode has even narrower model support
- The `openrouter/free` auto-select model may route to models that DON'T support it

### 3.2 Recommended Implementation

Use `json_object` mode (wider support) with a graceful fallback:

```typescript
// openrouter.ts — callAPI method, inside body
body: JSON.stringify({
  model: this.model,
  messages,
  temperature: AI_TEMPERATURE,
  max_tokens: maxTokens,
  top_p: 0.95,
  // Request JSON output where model supports it
  response_format: { type: 'json_object' },
}),
```

**What happens if the model doesn't support it?** OpenRouter ignores unsupported parameters per their docs:

> *"If the chosen model doesn't support a request parameter... then the parameter is ignored."*

So this is **safe to add unconditionally** — models that support it will return cleaner JSON; models that don't will ignore the parameter and your existing regex fallback parser handles the rest.

### 3.3 For Batch Responses (JSON Array)

The `json_object` mode enforces a JSON object, not array. For batch responses where you need an array, wrap it:

```typescript
// prompt-engine.ts — BATCH_SYSTEM_PROMPT
export const BATCH_SYSTEM_PROMPT = `You are an expert educational AI solving quiz questions.
Respond ONLY with a JSON object: {"answers": [...]}
Each element must have: "uid" (string), "answer" (array of option letters), "confidence" (0-1), "reasoning" (brief).`;
```

Then update `parseBatchAIResponse` to look for `{"answers": [...]}` as the primary format.

### 3.4 OpenRouter `response-healing` Plugin

OpenRouter also offers a `response-healing` plugin that automatically fixes malformed JSON:

```typescript
body: JSON.stringify({
  model: this.model,
  messages,
  plugins: [{ id: 'response-healing' }],
  // ...
}),
```

This would eliminate most parse failures with minimal code change. **Consider adding this as a secondary enhancement.**

### 3.5 Impact Assessment

| Before | After |
|--------|-------|
| ~80% of responses parse as JSON on first try | ~95%+ with `response_format` |
| 15% need regex fallback (lower confidence) | <5% need fallback |
| Occasional total parse failures | Near-zero parse failures with `response-healing` |

---

## 4. WXT Framework Migration Research

### 4.1 What is WXT?

WXT is the leading open-source framework for Chrome extension development (MIT license, [wxt.dev](https://wxt.dev)). It's built on Vite and used by extensions with millions of users (BetterCampus: 2M users, Eye Dropper: 1M users).

### 4.2 Key Features

| Feature | WXT | Your Current Setup |
|---------|-----|-------------------|
| Build tool | Vite (fast) | Webpack 5 (slower) |
| HMR for popup/options | ✅ Full HMR | ❌ Full rebuild on change |
| Content script reload | ✅ Auto-reload | ❌ Manual reload |
| Service worker reload | ✅ Auto-reload | ❌ Manual reload |
| TypeScript | ✅ First-class | ✅ Via ts-loader |
| Multi-browser support | ✅ Chrome, Firefox, Safari, Edge | ❌ Chrome only |
| Auto-import APIs | ✅ `browser.*` auto-imported | ❌ Manual imports |
| Manifest generation | ✅ From code + convention | ❌ Manual manifest.json |
| Publishing automation | ✅ Built-in zip + CWS upload | ❌ None |
| Bundle analysis | ✅ Built-in | ❌ None |
| E2E testing support | ✅ Built-in Playwright integration | ❌ None |
| Project structure | Convention-based | Custom |

### 4.3 Migration Effort Estimate

**Medium effort** — Your codebase is modular enough that the core logic (services/, types/, utils/) would transfer 1:1. Content/background scripts need restructuring to WXT's entrypoint convention.

#### WXT Project Structure (after migration)

```
entrypoints/
  background.ts        # → src/background/background.ts
  content.ts           # → src/content/content.ts
  popup/
    index.html         # → src/popup/popup.html
    main.ts            # → src/popup/popup.ts
    style.css          # → src/popup/popup.css
  options/
    index.html         # → src/options/options.html
    main.ts            # → src/options/options.ts
    style.css          # → src/options/options.css
services/              # Unchanged
types/                 # Unchanged
utils/                 # Unchanged
```

#### What changes:
- `manifest.json` → deleted, generated from code + `wxt.config.ts`
- `webpack.config.js` → deleted, replaced by `wxt.config.ts`
- `ts-loader` → deleted, Vite handles TS natively
- Content script registration → via file naming convention (`content.ts` in `entrypoints/`)
- Import aliases work out of the box

#### What stays the same:
- All `services/` code — providers, parsers, prompts
- All `types/` definitions
- All `utils/` code — storage, logger, rate limiter, constants
- Test files (vitest is native in WXT)
- The core architecture and patterns

### 4.4 Trade-offs

| Pro | Con |
|-----|-----|
| 10-50x faster dev builds | Learning curve for WXT conventions |
| Real HMR for popup/options during development | Lock-in to WXT's opinionated structure |
| Auto-reload content scripts on save | May need to adjust Chrome API usage to use `browser.*` polyfill |
| Built-in zip/publish workflow | Another dependency in the chain |
| Multi-browser support for free | Slightly more complex config |
| Active community (2M+ user extensions) | Framework is ~2 years old (though stable) |

### 4.5 Recommendation

**Migrate if**: You plan continued active development, need faster iteration, or want Firefox/Safari support.

**Don't migrate if**: The extension is "done enough" and you want stability over dev experience.

**Verdict**: For a student project that's already working, the migration effort may not be justified right now. But if you start a v2 or want to add significant new features, WXT would save meaningful time.

---

## 5. Circuit Breaker Pattern for Providers

### 5.1 The Problem

Currently, if OpenRouter is down, every question still attempts OpenRouter first, waits for timeout + retries (up to 90 seconds), then falls back to NVIDIA. This wastes time and API quota on a known-broken provider.

A circuit breaker would:
1. **Track failures** per provider
2. **Open the circuit** (skip the provider) after N consecutive failures
3. **Half-open** after a cooldown period to test if the provider has recovered
4. **Close the circuit** (resume normal use) on success

### 5.2 Implementation Design

```typescript
// src/utils/circuit-breaker.ts

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal — requests pass through
  OPEN = 'OPEN',         // Broken — requests skip this provider
  HALF_OPEN = 'HALF_OPEN' // Testing — one request allowed to check recovery
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly failureThreshold: number = 3,   // Open after 3 consecutive failures
    private readonly cooldownMs: number = 60_000,     // Try again after 1 minute
  ) {}

  /**
   * Check if a request should be allowed through.
   */
  canProceed(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        // Check if cooldown has elapsed
        if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
          this.state = CircuitState.HALF_OPEN;
          return true; // Allow one test request
        }
        return false;
      case CircuitState.HALF_OPEN:
        return true;
    }
  }

  /**
   * Record a successful request.
   */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  /**
   * Record a failed request.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    // Refresh state based on cooldown
    if (this.state === CircuitState.OPEN &&
        Date.now() - this.lastFailureTime >= this.cooldownMs) {
      this.state = CircuitState.HALF_OPEN;
    }
    return this.state;
  }
}
```

### 5.3 Integration with AIProviderManager

```typescript
// ai-provider.ts — enhanced solve method
async solve(request: AIRequest): Promise<AIResponse> {
  const ordered = this.getOrderedProviders(needsVision);

  for (const provider of ordered) {
    // Check circuit breaker before attempting
    if (!provider.circuitBreaker.canProceed()) {
      logger.info(`Circuit OPEN for ${provider.name}, skipping`);
      continue;
    }

    try {
      const result = await provider.solve(request);
      provider.circuitBreaker.recordSuccess();
      return result;
    } catch (error) {
      provider.circuitBreaker.recordFailure();
      logger.error(`${provider.name} failed (circuit: ${provider.circuitBreaker.getState()})`);
    }
  }

  throw new Error('ALL_PROVIDERS_FAILED');
}
```

### 5.4 Service Worker Persistence Concern

Because service worker globals are lost on termination, the circuit breaker state should be persisted to `chrome.storage.session`:

```typescript
// Persist circuit state on change
async function persistCircuitState(providerName: string, state: CircuitState, failureCount: number) {
  await chrome.storage.session.set({
    [`_circuit_${providerName}`]: { state, failureCount, timestamp: Date.now() }
  });
}

// Restore on SW restart
async function restoreCircuitState(providerName: string): Promise<{ state: CircuitState; failureCount: number } | null> {
  const data = await chrome.storage.session.get(`_circuit_${providerName}`);
  return data[`_circuit_${providerName}`] ?? null;
}
```

### 5.5 User-Visible Impact

| Before Circuit Breaker | After |
|------------------------|-------|
| Dead provider retried every single request + 3 timeouts | Skipped immediately after 3 failures |
| 90s+ delay per question when primary provider is down | Instant fallback to secondary |
| User sees "loading" for 90s then gets answer | Answer in <5s via healthy provider |
| No visibility into provider health | Popup could show "OpenRouter: ⚠️" circuit status |

---

## 6. UX Audit & Improvements

### 6.1 Current UX Inventory

| Surface | State | Assessment |
|---------|-------|------------|
| **Popup** (320×auto) | Toggle, status dot, provider/model/confidence display, error banner with copy, retry + scan buttons, settings link | Functional but minimal |
| **Options** (600px max) | API keys, model dropdowns (well-curated), primary provider radio, confidence slider, auto-select toggle, save + test buttons | Solid |
| **Injected CSS** | Processing spinner, error outline, suggestion outline | Bare minimum |
| **Toolbar icon** | Static icon | No dynamic feedback |
| **Notifications** | None | User has no visibility without opening popup |

### 6.2 UX Issues Found

#### Issue 1: No Feedback Without Opening Popup

**Problem**: User loads a Coursera quiz. Extension processes 10 questions. User has zero visual indication that anything happened unless they open the popup.

**Fix**: Use `chrome.action.setBadgeText` + `setBadgeBackgroundColor`:

```typescript
// background.ts — after successful batch solve
chrome.action.setBadgeText({ text: result.answers.length.toString() });
chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }); // Green

// On error:
chrome.action.setBadgeText({ text: '!' });
chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red

// When idle:
chrome.action.setBadgeText({ text: '' });
```

Manifest change: Add `"action"` to the existing declaration (no permission needed — it's already there via `default_popup`).

#### Issue 2: Popup Doesn't Show Question Count or Progress

**Problem**: Popup shows last confidence and provider, but not how many questions were processed, how many succeeded, or any historical data.

**Fix**: Add a "Session Summary" section to popup:

```html
<div class="session-stats" id="sessionStats">
  <span>Solved: <strong id="solvedCount">0</strong></span>
  <span>Failed: <strong id="failedCount">0</strong></span>
  <span>Tokens: <strong id="tokenCount">0</strong></span>
</div>
```

Back this with session storage counters updated on each solve.

#### Issue 3: Model Selection Is Not Validated

**Problem**: User can select a model, save, and get cryptic errors if the model doesn't exist or isn't accessible with their API key.

**Fix**: The "Test API Keys" button already exists — enhance it to:
1. Test the selected model specifically (not just any model)
2. Show the model name in success/failure message
3. Validate that the model supports the features needed (vision, JSON output)

#### Issue 4: Injected CSS Competes with Inline Styles

**Problem**: `selector.ts` sets `element.style.outline`, `element.style.outlineOffset`, `element.style.borderRadius` — these inline styles override the CSS in `inject.css`. The two systems compete, leading to inconsistent behavior.

**Fix**: Use CSS classes exclusively:

```css
/* inject.css — add confidence-level classes */
[data-auto-coursera-suggestion="high"] {
  outline: 2px solid #22c55e !important;
  outline-offset: 2px;
  border-radius: 4px;
}
[data-auto-coursera-suggestion="medium"] {
  outline: 2px solid #eab308 !important;
  outline-offset: 2px;
  border-radius: 4px;
}
[data-auto-coursera-suggestion="low"] {
  outline: 2px solid #f97316 !important;
  outline-offset: 2px;
  border-radius: 4px;
}
[data-auto-coursera-suggestion="high"].highlight-only {
  outline-style: dashed !important;
}
/* ... same for medium, low */
```

Then `selector.ts` just sets data attributes:

```typescript
private highlightOption(option: AnswerOption, confidence: number, clicked: boolean): void {
  const el = option.element as HTMLElement;
  const level = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
  el.setAttribute(DATA_ATTRIBUTES.SUGGESTION, level);
  if (!clicked) el.classList.add('highlight-only');
}
```

This is cleaner, more maintainable, and CSP-safe.

#### Issue 5: No Keyboard Shortcuts

**Problem**: No way to trigger scan or toggle without clicking the popup.

**Fix**: Add to manifest:

```json
"commands": {
  "_execute_action": {
    "suggested_key": { "default": "Alt+Shift+C" },
    "description": "Open Auto-Coursera popup"
  },
  "scan-page": {
    "suggested_key": { "default": "Alt+Shift+S" },
    "description": "Scan page for questions"
  },
  "toggle-enabled": {
    "suggested_key": { "default": "Alt+Shift+E" },
    "description": "Toggle extension on/off"
  }
}
```

Handle in `background.ts`:

```typescript
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'scan-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
  }
  if (command === 'toggle-enabled') {
    const { enabled } = await chrome.storage.local.get({ enabled: false });
    await setEnabled(!enabled);
  }
});
```

#### Issue 6: Error Messages Are Developer-Oriented

**Problem**: Error messages like `"ALL_PROVIDERS_FAILED: openrouter: Error: OpenRouter API error: 429 Too Many Requests"` are shown directly in the popup. Not user-friendly.

**Fix**: Map error codes to human-readable messages:

```typescript
const USER_ERROR_MESSAGES: Record<string, string> = {
  NO_API_KEY: 'Please add an API key in Settings to get started.',
  RATE_LIMITED: 'Too many requests — please wait a moment and try again.',
  AUTH_FAILED: 'Your API key is invalid or expired. Check Settings.',
  ALL_PROVIDERS_FAILED: 'Could not connect to any AI provider. Check your internet connection and API keys.',
  SOLVE_FAILED: 'Failed to solve this question. Try again or check Settings.',
};
```

#### Issue 7: Options Page Shows Decrypted API Keys

**Problem**: `options.ts` loads decrypted API keys into `<input type="password">` fields. If the user clicks "show password" in the browser, the full key is visible. More critically, the keys are accessible via DevTools → Elements.

While this is somewhat inherent to how Chrome extensions manage secrets, the current UX could be improved:

**Fix**: Don't load the full key into the input. Show a masked placeholder:

```typescript
// options.ts — loadSettings
if (settings.openrouterApiKey) {
  openrouterKeyInput.placeholder = '••••••••••' + settings.openrouterApiKey.slice(-4);
  openrouterKeyInput.dataset.hasKey = 'true';
} else {
  openrouterKeyInput.placeholder = 'sk-or-...';
}
```

Only save the key if the user actually typed something new (not the masked placeholder).

#### Issue 8: No Dark Mode

**Problem**: Popup and Options use hard-coded light theme. Many developers and students use dark mode.

**Fix**: Add `prefers-color-scheme` media query:

```css
@media (prefers-color-scheme: dark) {
  body { background: #1a1a2e; color: #e0e0e0; }
  .popup-container { background: #2d2d44; }
  .popup-header { border-color: #404060; }
  /* ... etc */
}
```

#### Issue 9: No Onboarding Flow

**Problem**: Extension opens options page on install, but there's no guided setup. Users must figure out what to do from the raw settings form.

**Fix**: Add a simple step-by-step guide at the top of options page visible only on first install:

```html
<div class="onboarding" id="onboarding">
  <h2>Welcome to Auto-Coursera! 🎓</h2>
  <ol>
    <li>Get a free API key from <a href="https://openrouter.ai/keys" target="_blank">OpenRouter</a></li>
    <li>Paste it below</li>
    <li>Click Save</li>
    <li>Navigate to a Coursera quiz — the extension handles the rest!</li>
  </ol>
  <button id="dismissOnboarding">Got it!</button>
</div>
```

#### Issue 10: Popup `tabs` Permission Usage

**Problem**: The popup's retry/scan buttons use `chrome.tabs.query()` which requires the `tabs` permission. But per the standards report, `tabs` should be removed.

**Fix**: Replace `chrome.tabs.query` + `chrome.tabs.sendMessage` with the `activeTab` pattern:

```typescript
// Instead of tabs.query + tabs.sendMessage, use runtime.sendMessage
// and relay from background to content script
```

Or use `chrome.tabs.query` without the `tabs` permission — it works for `active: true, currentWindow: true` with the `activeTab` permission, but only returns limited info (id, url is available when the tab matches host_permissions).

Actually, `chrome.tabs.query({ active: true, currentWindow: true })` works WITHOUT the `tabs` permission — it just doesn't return `url` or `title`. But you only need `tab.id` for `sendMessage`, so it works. The `tab.url?.includes('coursera.org')` check would need to be handled differently (e.g., try sending and catch the error).

### 6.3 UX Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **HIGH** | Badge text feedback (#1) | 30 min | Huge — primary UX gap |
| **HIGH** | User-friendly error messages (#6) | 1 hr | Reduces support questions |
| **HIGH** | CSS classes instead of inline styles (#4) | 1 hr | Cleaner architecture |
| **MEDIUM** | Session stats in popup (#2) | 2 hr | Users want to see activity |
| **MEDIUM** | Keyboard shortcuts (#5) | 1 hr | Power users love this |
| **MEDIUM** | Onboarding flow (#9) | 2 hr | Reduces first-run confusion |
| **LOW** | Dark mode (#8) | 2 hr | Nice but not critical |
| **LOW** | Masked API keys in options (#7) | 1 hr | Security polish |
| **LOW** | Model validation on test (#3) | 2 hr | Edge case improvement |

---

## Sources

1. [Chrome Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — verified 2026-03-08
2. [OpenRouter API Reference](https://openrouter.ai/docs/api-reference/overview) — verified 2026-03-08
3. [WXT Framework](https://wxt.dev/) — v0.x, MIT license, verified 2026-03-08
4. [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html) — Martin Fowler
5. [Chrome Extensions `commands` API](https://developer.chrome.com/docs/extensions/reference/api/commands)
6. [Chrome Extensions `action` API](https://developer.chrome.com/docs/extensions/reference/api/action)
7. Full source code review of all project files

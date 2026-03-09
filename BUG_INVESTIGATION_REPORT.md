# Bug Investigation & Feature Research Report

**Date**: March 9, 2026  
**Scope**: Bug 1 (batch chunking), Bug 2 (click revert), Feature (response-healing + structured outputs)

---

## Table of Contents

1. [Bug 1: First 10 Questions Fail When >10 Questions](#bug-1-first-10-questions-fail-when-10-questions)
2. [Bug 2: Multiple Choice Answers Get Selected Then Unselected](#bug-2-multiple-choice-answers-get-selected-then-unselected)
3. [Feature: OpenRouter Response-Healing Plugin](#feature-openrouter-response-healing-plugin)
4. [Feature: Structured Output Upgrade (json_schema)](#feature-structured-output-upgrade-json_schema)
5. [Implementation Plan](#implementation-plan)
6. [File Inventory](#file-inventory)

---

## Bug 1: First 10 Questions Fail When >10 Questions

### Confidence: HIGH

### Pipeline Overview

1. `QuestionDetector.scanPage()` finds all `div[data-testid^="part-Submission_"]` elements → calls `onDetect()` per element
2. `handleDetectedQuestion()` extracts data, pushes to `pendingQuestions[]`, resets an 800ms debounce timer
3. After 800ms idle, `processBatch()` drains all pending → splits into chunks of `BATCH_CHUNK_SIZE = 10` → processes each chunk sequentially via `await processChunk(chunk)`
4. `processChunk()` sends `SOLVE_BATCH` to background → background calls AI → response comes back → answers applied by UID match

### Root Causes

#### Factor A: 30-second timeout on 10-question batches (PRIMARY CAUSE)

| Constant | Value | File |
|----------|-------|------|
| `DEFAULT_REQUEST_TIMEOUT_MS` | 30,000ms | `src/utils/constants.ts:96` |
| `BATCH_CHUNK_SIZE` | 10 | `src/content/content.ts:57` |
| `AI_MAX_TOKENS` (single) | 1024 | `src/utils/constants.ts:93` |
| Batch `maxTokens` | 2048 | `src/services/base-provider.ts:138` (hardcoded in `solveBatch`) |

The batch `callAPI(messages, 2048)` call in `base-provider.ts:138` is still subject to `DEFAULT_REQUEST_TIMEOUT_MS = 30_000` via the `AbortController` in `fetchWithRetry` at `base-provider.ts:82`:

```ts
const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
```

For 10 complex questions (with math/LaTeX extracted from Coursera), the AI model must:
- Parse 10 question prompts with options
- Generate a JSON array with 10 complete answer objects
- Stay within 2048 max_tokens output

At 30s timeout, the first chunk (always exactly 10 questions) likely times out. The second chunk (the remainder, e.g., 5 questions) is smaller and faster, so it succeeds.

#### Factor B: Session storage wipe between chunks

At `background.ts:286-291`:

```ts
const sessionData = await chrome.storage.session.get(null);
const batchKeys = Object.keys(sessionData).filter((k) => k.startsWith('_batchResult_'));
if (batchKeys.length > 0) {
    await chrome.storage.session.remove(batchKeys);
}
```

Each `handleSolveBatch` call clears ALL `_batchResult_*` keys. When chunk 2 arrives, it wipes chunk 1's cached partial results. If the content script had fallen into the `catch` recovery path for chunk 1 (after a timeout/error), the recovery at `content.ts:234-262` would find zero partial results.

#### Factor C: Keepalive gap between chunks

```
Chunk 1: startKeepAlive() → AI processing (10-30s) → stopKeepAlive() → return
[GAP: keepalive OFF, SW idle timer restarted]
Chunk 2: startKeepAlive() → ...
```

Between `stopKeepAlive()` in chunk 1's `finally` block and chunk 2 starting, the service worker has no keepalive. If there's any async delay, the SW could be killed. `sendMessageWithRetry` has reconnection logic but adds latency.

#### Factor D: AI prompt complexity

`buildBatchPrompt` concatenates all questions with `\n---\n\n` separators. For 10 questions with math/LaTeX content (confirmed in `sample.html`), the prompt is extremely long. The `max_tokens: 2048` may not be enough for 10 answer objects.

### Recommended Fixes

1. **Reduce `BATCH_CHUNK_SIZE` from 10 to 5** — halves prompt and response size
2. **Scale timeout with batch size** — e.g., `timeoutMs * chunk.length` or a minimum of 60s for batches
3. **Scope the session storage clear to a batch ID** — add a UUID per `processBatch()` call, only clear matching keys
4. **Scale `max_tokens` with batch size** — `2048 + (questions.length * 200)` to ensure room
5. **Keep keepalive running across chunks** — move `startKeepAlive()`/`stopKeepAlive()` to the content script level or pass a flag to keep it alive between sequential chunk calls

---

## Bug 2: Multiple Choice Answers Get Selected Then Unselected

### Confidence: HIGH

### Coursera DOM Structure (from sample.html)

```html
<div class="rc-Option">
  <label class="_1l0faev5 cui-Checkbox cui-active">
    <span class="_1e7axzp">
      <svg><!-- RadioUnchecked SVG icon driven by React state --></svg>
    </span>
    <input class="_htmk7zm" type="radio" name="..." value="...">
    <!-- ^^^ HIDDEN (opacity:0, position:absolute) — visual state driven entirely by React -->
    <span class="_bc4egv p-x-1s font-weight-normal">
      <!-- Option text content -->
    </span>
  </label>
</div>
```

Key observations:
- `<input>` is hidden — class `_htmk7zm` applies `opacity: 0; position: absolute`
- Visual state is driven entirely by React — SVG icon and CSS classes controlled by React state
- The `<label>` wraps the `<input>` (no `for` attribute) — clicking label triggers input natively

### Current Click Simulation

`selector.ts` `simulateClick`:

```ts
private static simulateClick(target: HTMLElement): void {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new Event('input', { bubbles: true }));
}
```

`performClick` finds the `<input>` via `option.inputElement` and calls `simulateClick(input)`.

### Exact Failure Sequence

| Step | What Happens | Visible Effect |
|------|-------------|---------------|
| 1 | `simulateClick(input)` dispatches `click` on hidden `<input>` | Browser natively toggles `checked = true` |
| 2 | Click event bubbles up through DOM to React's root event delegation | React's synthetic `onChange` fires |
| 3 | Coursera's React state handler runs | State update enqueued |
| 4 | Visual feedback appears momentarily | User sees option "selected" |
| 5 | React re-renders the component | **React reconciliation sets `checked` back to match its internal state** |
| 6 | React state didn't properly update (controlled input) | **Selection reverts to `checked = false`** |

### Why This Happens

Coursera uses React's CDS (Coursera Design System). Their checkbox/radio components use **controlled inputs** — the `checked` prop is bound to React state:

```jsx
<input checked={selectedAnswer === optionValue} onChange={handleSelect} />
```

When we dispatch raw DOM events:
- The `click` event toggles `checked` natively
- React 18+ with automatic batching may not process synthetic events from programmatic dispatch the same way as real user interactions
- React's `onChange` for checkboxes/radios relies on `inputValueTracking` that compares React-tracked values with native values
- Our `dispatchEvent` bypasses React's event system setup

Additional problem: `change` and `input` events dispatched AFTER `click` may cause **double-processing** — React's handler fires twice, toggling the state back.

### MutationObserver Interaction

`QuestionDetector` watches `{ childList: true, subtree: true }` on `document.body`. React re-renders after click add new nodes (SVG icon changes, CSS class changes). This triggers `handleMutations` → debounced `scanPage()`. The UID dedup (`this.seen`) prevents re-processing, but unnecessary re-scanning occurs.

### Recommended Fix: React-Compatible Click

**Primary approach — Native property descriptor:**

```ts
private static simulateClick(target: HTMLElement): void {
    if (target instanceof HTMLInputElement &&
        (target.type === 'checkbox' || target.type === 'radio')) {
        // Use native setter to bypass React's inputValueTracking
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'checked'
        )?.set;
        if (nativeSetter) {
            const newValue = target.type === 'radio' ? true : !target.checked;
            nativeSetter.call(target, newValue);
            // React 16+ picks up these events via delegation
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
    }
    // Fallback for non-input elements
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
```

**Why it works**: `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked').set` writes to the DOM's native `checked` property without going through React's intercepted setter. The subsequent `input`/`change` events then inform React's event delegation, which reads the new native value and updates React state to match. This is the same technique used by React Testing Library.

**Fallback approach — React fiber:**

```ts
private static triggerReactChange(input: HTMLInputElement): boolean {
    const fiberKey = Object.keys(input).find(
        k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) return false;
    const fiber = (input as any)[fiberKey];
    const onChange = fiber?.memoizedProps?.onChange;
    if (typeof onChange === 'function') {
        onChange({ target: input, currentTarget: input });
        return true;
    }
    return false;
}
```

---

## Feature: OpenRouter Response-Healing Plugin

### Confidence: HIGH

### Where to Add

The API call body is in `openrouter.ts` `callAPI()`:

```ts
{
    model: this.model,
    messages,
    temperature: AI_TEMPERATURE,
    max_tokens: maxTokens,
    top_p: 0.95,
    response_format: { type: 'json_object' },
    plugins: [{ id: 'response-healing' }],  // ← ADD THIS
}
```

The `plugins` array is documented in OpenRouter's API:
```ts
type Plugin = {
    id: string; // 'web', 'file-parser', 'response-healing'
    enabled?: boolean;
    [key: string]: unknown;
};
```

Response-healing automatically repairs malformed JSON responses before returning them. Works with non-streaming requests using `response_format`.

Source: https://openrouter.ai/docs/api-reference/overview

---

## Feature: Structured Output Upgrade (json_schema)

### Current State

| Provider | Current `response_format` | Issues |
|----------|--------------------------|--------|
| OpenRouter | `{ type: 'json_object' }` | No schema enforcement — fields can be missing or wrong names |
| NVIDIA NIM | **None** | No JSON guarantee at all — pure prompt-based |

### Available Upgrade: `json_schema` Mode

Both OpenRouter and NVIDIA NIM support strict JSON Schema enforcement:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "quiz_answer",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "answer": {
            "type": "array",
            "items": { "type": "integer" },
            "description": "0-based indices of correct answer(s)"
          },
          "confidence": {
            "type": "number",
            "description": "Confidence score between 0.0 and 1.0"
          },
          "reasoning": {
            "type": "string",
            "description": "Brief explanation"
          }
        },
        "required": ["answer", "confidence", "reasoning"],
        "additionalProperties": false
      }
    }
  }
}
```

### Batch Schema

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "quiz_batch_answers",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "answers": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "uid": { "type": "string" },
              "answer": {
                "type": "array",
                "items": { "type": "integer" }
              },
              "confidence": { "type": "number" },
              "reasoning": { "type": "string" }
            },
            "required": ["uid", "answer", "confidence", "reasoning"],
            "additionalProperties": false
          }
        }
      },
      "required": ["answers"],
      "additionalProperties": false
    }
  }
}
```

**Note**: Root must be `object`, not `array`. Wrap batch answers in `{ "answers": [...] }`.

### Prompt Changes

**Current batch prompts** use letter labels `A) B) C) D)` then convert back in parser.
**Proposed**: Use 0-based numeric indices everywhere (single prompts already do this).

This eliminates the entire letter↔index conversion in `response-parser.ts`, removing a class of bugs.

### Provider Support

| Provider | `json_schema` Support | Confidence |
|----------|-----------------------|-----------|
| OpenRouter | YES — documented, widely supported | HIGH |
| NVIDIA NIM (integrate.api.nvidia.com) | Likely YES — `JsonSchemaResponseFormat` in OpenAPI spec | MEDIUM |

### Impact on Code

| File | Change |
|------|--------|
| `openrouter.ts` | Replace `json_object` with `json_schema` + add `plugins` |
| `nvidia-nim.ts` | Add `response_format` with `json_schema` |
| `base-provider.ts` | Add `responseFormat` parameter to `callAPI` signature |
| `prompt-engine.ts` | Update `BATCH_SYSTEM_PROMPT` for wrapper object + numeric indices |
| `response-parser.ts` | Update `parseBatchAIResponse` to handle `{ answers: [...] }` wrapper |
| `constants.ts` or new file | Define schema constants |
| `api.ts` | Add types for response format parameter |

Keep all existing regex fallback parsing as safety net for models that don't support `json_schema`.

---

## Implementation Plan

### Priority Order

| # | Task | Severity | Complexity | Files |
|---|------|----------|-----------|-------|
| 1 | Bug 2: React-compatible click | HIGH | Medium | `selector.ts` |
| 2 | Bug 1: Reduce chunk size + scale timeout | HIGH | Low | `content.ts`, `constants.ts`, `base-provider.ts` |
| 3 | Bug 1: Fix session storage wipe | MEDIUM | Low | `background.ts` |
| 4 | Feature: Add response-healing plugin | LOW | Trivial | `openrouter.ts` |
| 5 | Feature: Upgrade to json_schema | MEDIUM | Medium | `openrouter.ts`, `nvidia-nim.ts`, `base-provider.ts`, `prompt-engine.ts`, `response-parser.ts`, `constants.ts`, `api.ts` |

---

## File Inventory

### All Source Files Read (Verbatim)

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/content/content.ts` | ~280 | Batch orchestration, `BATCH_CHUNK_SIZE=10`, `processBatch`, `processChunk` |
| `src/content/selector.ts` | ~170 | `simulateClick`, `performClick`, confidence highlighting |
| `src/content/detector.ts` | ~170 | MutationObserver, FNV-1a UID, `scanPage`, `classifyType` |
| `src/content/extractor.ts` | ~110 | DOM extraction, math/LaTeX handling, honeypot filtering |
| `src/background/background.ts` | ~350 | Service worker, `handleSolveBatch`, keepalive, session storage |
| `src/background/router.ts` | ~50 | Message routing |
| `src/services/openrouter.ts` | ~45 | OpenRouter API call body construction |
| `src/services/nvidia-nim.ts` | ~50 | NVIDIA NIM API call body construction |
| `src/services/base-provider.ts` | ~250 | `fetchWithRetry`, `solveBatch`, message/schema building |
| `src/services/ai-provider.ts` | ~160 | Provider manager, fallback chain, circuit breaker routing |
| `src/services/prompt-engine.ts` | ~120 | System prompts, batch/single prompt builders |
| `src/services/response-parser.ts` | ~140 | JSON/regex/number fallback parsing |
| `src/services/image-pipeline.ts` | ~100 | CORS-aware image fetching |
| `src/types/messages.ts` | ~90 | Message types, payload types |
| `src/types/questions.ts` | ~50 | DetectedQuestion, ExtractedQuestion, AnswerOption |
| `src/types/settings.ts` | ~35 | AppSettings, DEFAULT_SETTINGS |
| `src/types/api.ts` | ~80 | AIRequest, AIResponse, AIBatchRequest, IAIProvider |
| `src/utils/constants.ts` | ~110 | Selectors, timeouts, error codes, thresholds |
| `src/utils/rate-limiter.ts` | ~65 | Token-bucket rate limiter |
| `src/utils/storage.ts` | ~110 | AES-256-GCM encrypted storage |
| `src/utils/circuit-breaker.ts` | ~60 | Circuit breaker state machine |
| `src/utils/logger.ts` | ~50 | Structured logger with key sanitization |
| `src/popup/popup.ts` | ~200 | Popup UI, status display, error banner |
| `src/options/options.ts` | ~200 | Options page, settings form |
| `manifest.json` | ~60 | MV3 manifest, content script injection, permissions |
| `assets/styles/inject.css` | ~75 | Confidence highlighting styles |
| `webpack.config.js` | ~55 | Build config |
| `sample.html` | ~1 (minified) | Real Coursera DOM structure |
| `tests/unit/selector.test.ts` | ~150 | Selector tests (radio guard, highlighting, confidence) |
| `tests/unit/detector.test.ts` | ~140 | Detector tests (UID, classifyType, selectors) |
| `tests/unit/response-parser.test.ts` | ~100 | Parser tests (JSON, letters, regex, fallback) |

### Key Constants

| Constant | Value | File | Impact |
|----------|-------|------|--------|
| `BATCH_CHUNK_SIZE` | 10 | `content.ts:57` | Bug 1: chunk boundary |
| `BATCH_DEBOUNCE_MS` | 800 | `content.ts:56` | Batching delay |
| `DEFAULT_REQUEST_TIMEOUT_MS` | 30,000 | `constants.ts:96` | Bug 1: AI timeout |
| `NVIDIA_NIM_TIMEOUT_MS` | 240,000 | `constants.ts:99` | NVIDIA has 4min timeout (not affected) |
| `MUTATION_DEBOUNCE_MS` | 300 | `constants.ts:87` | Bug 2: re-scan delay |
| `AI_MAX_TOKENS` | 1024 | `constants.ts:93` | Single question token limit |
| `MAX_RETRIES` | 2 | `constants.ts:90` | API retry count |
| `CONFIDENCE_HIGH` | 0.8 | `constants.ts:84` | Highlight threshold |
| `CONFIDENCE_MEDIUM` | 0.5 | `constants.ts:85` | Highlight threshold |

---

## Feature: Google Gemini 3.1 Flash-Lite Provider

### Confidence: HIGH

### Model Overview

| Property | Value |
|----------|-------|
| Model code | `gemini-3.1-flash-lite-preview` |
| Family | Gemini 3 (latest generation) |
| Inputs | Text, Image, Video, Audio, PDF |
| Output | Text |
| Input token limit | 1,048,576 (1M tokens!) |
| Output token limit | 65,536 (65K tokens) |
| Structured outputs | **Supported** |
| Thinking | Supported |
| Function calling | Supported |
| Knowledge cutoff | January 2025 |
| Latest update | March 2026 |
| Status | Preview (may change before stable) |

### Pricing — EXTREMELY COMPETITIVE

| | Free Tier | Paid Tier (per 1M tokens) |
|---|-----------|--------------------------|
| **Input** | **Free** | $0.25 (text/image/video), $0.50 (audio) |
| **Output** (incl. thinking) | **Free** | $1.50 |

**Comparison with existing providers:**

| Provider | Input Cost | Output Cost | Free Tier |
|----------|-----------|-------------|-----------|
| **Gemini 3.1 Flash-Lite** | **$0.25/M** | **$1.50/M** | **YES** |
| OpenRouter (varies by model) | $0.50-15/M | $1-60/M | No |
| NVIDIA NIM | $0.50-2/M | $3-12/M | Limited |

Gemini 3.1 Flash-Lite is **2-10x cheaper** than most OpenRouter models and has a **free tier** with no API key cost.

### Critical Discovery: OpenAI-Compatible API

Gemini has a **fully OpenAI-compatible endpoint**. This means we can reuse the entire `BaseAIProvider` architecture with minimal changes:

| Setting | Value |
|---------|-------|
| **Base URL** | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| **Endpoint** | `POST /chat/completions` (same as OpenAI) |
| **Auth** | `Authorization: Bearer <GEMINI_API_KEY>` |
| **Request format** | Same as OpenAI: `model`, `messages`, `temperature`, `max_tokens`, `response_format` |
| **Response format** | Same as OpenAI: `choices[0].message.content` |
| **Structured outputs** | `response_format: { type: 'json_schema', json_schema: { ... } }` works via OpenAI compat |

Key differences from OpenAI:
1. API key is a Gemini API key (free from [Google AI Studio](https://aistudio.google.com/apikey))
2. Base URL points to `generativelanguage.googleapis.com`
3. Model names use Gemini format: `gemini-3.1-flash-lite-preview`
4. **Temperature**: For Gemini 3 models, Google recommends keeping temperature at default 1.0 — lowering it below 1.0 may cause looping or degraded performance in reasoning tasks

### Implementation Plan — New Provider File

Since the API is OpenAI-compatible, the new `src/services/gemini.ts` would be very similar to existing providers:

```ts
/**
 * Google Gemini provider via OpenAI-compatible API.
 */
import type { APICompletionResponse, ChatMessage } from '../types/api';
import { AI_MAX_TOKENS, AI_TEMPERATURE, API_URLS } from '../utils/constants';
import { BaseAIProvider } from './base-provider';

export class GeminiProvider extends BaseAIProvider {
    constructor(apiKey: string, model: string) {
        super(apiKey, model, 60_000); // 60s timeout — Gemini is fast
    }

    protected async callAPI(
        messages: ChatMessage[],
        maxTokens: number = AI_MAX_TOKENS,
    ): Promise<APICompletionResponse> {
        return this.fetchWithRetry(
            `${API_URLS.GEMINI}/chat/completions`,
            {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            {
                model: this.model,
                messages,
                temperature: 1.0, // Google recommends 1.0 for Gemini 3 models
                max_tokens: maxTokens,
                top_p: 0.95,
                response_format: { type: 'json_object' },
            },
            'Gemini',
        );
    }
}
```

### Files That Need Changes

| File | Change | Complexity |
|------|--------|-----------|
| **NEW** `src/services/gemini.ts` | New provider class (~45 lines) | Low |
| `src/utils/constants.ts` | Add `API_URLS.GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai'` | Trivial |
| `src/types/settings.ts` | Add `geminiApiKey`, `geminiModel`, `'gemini'` to `primaryProvider` union | Low |
| `src/services/ai-provider.ts` | Add Gemini to provider creation/fallback chain | Low |
| `src/options/options.html` | Add Gemini API key input + model selector | Low |
| `src/options/options.ts` | Add Gemini key handling, model selection, test | Low |
| `src/popup/popup.ts` | Show Gemini status in provider info | Trivial |

### Available Model Options for Dropdown

| Model Code | Description | Price |
|------------|-------------|-------|
| `gemini-3.1-flash-lite-preview` | Latest, cheapest, fastest | Free / $0.25 in |
| `gemini-3-flash-preview` | Frontier intelligence, search/grounding | Free / $0.50 in |
| `gemini-2.5-flash` | Stable, 1M context, thinking | Free / $0.30 in |
| `gemini-2.5-flash-lite` | Stable budget option | Free / $0.10 in |
| `gemini-2.5-pro` | Most advanced, complex reasoning | Free / $1.25 in |

### Rate Limits

- Rate limits vary by tier (Free → Tier 1 → Tier 2 → Tier 3)
- Per-project limits (not per-key)
- Free tier has limited but usable rates
- Preview models have more restrictive rates
- Limits can be viewed at [AI Studio Rate Limits](https://aistudio.google.com/rate-limit)

### Structured Output via OpenAI Compat

Confirmed working via OpenAI compatibility:

```python
# From Gemini's own docs
completion = client.beta.chat.completions.parse(
    model="gemini-3-flash-preview",
    messages=[...],
    response_format=CalendarEvent,  # Pydantic schema → json_schema
)
```

This means the same `json_schema` response format we plan for OpenRouter and NVIDIA NIM will also work with Gemini through the OpenAI-compatible endpoint.

### Thinking (Reasoning) Mode

Gemini 3.1 Flash-Lite supports built-in thinking/reasoning. Via OpenAI compat:

```json
{
    "reasoning_effort": "low"  // "minimal" | "low" | "medium" | "high" | "none"
}
```

For quiz answering, `"low"` or `"medium"` thinking would improve accuracy at minimal cost (thinking tokens are included in the output price). This could be added as an optional setting.

### Key Advantages as a Third Provider

1. **FREE tier** — no API key purchase needed, just sign up at Google AI Studio
2. **1M token context** — can handle much larger batches without truncation
3. **65K output tokens** — vs 2048/4096 for current batch calls — room for verbose answers
4. **Structured output support** — schema-enforced JSON like OpenRouter
5. **OpenAI-compatible API** — minimal code to integrate (reuses `BaseAIProvider`)
6. **Fast inference** — "Flash-Lite" is optimized for speed and throughput
7. **Native thinking** — optional reasoning mode for higher accuracy

### Sources
1. [Gemini 3.1 Flash-Lite Preview model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-preview) — model specs, capabilities
2. [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) — base URL, auth, structured output via OpenAI compat
3. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) — JSON schema support, model compatibility table
4. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) — free tier + paid tier per-token costs
5. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) — tier system, per-project limits

---

## Bug: max_tokens Hardcoded and Insufficient for Batches

### Confidence: HIGH

### Current State

In `base-provider.ts:155`:

```ts
async solveBatch(batchRequest: AIBatchRequest): Promise<AIBatchResponse> {
    await this.rateLimiter.acquire();
    const messages = this.buildBatchMessages(batchRequest);
    const response = await this.callAPI(messages, 2048);  // ← HARDCODED
    ...
}
```

And in each provider's `callAPI`:
```ts
// openrouter.ts
callAPI(messages, maxTokens = AI_MAX_TOKENS) // AI_MAX_TOKENS = 1024

// nvidia-nim.ts
callAPI(messages, maxTokens = AI_MAX_TOKENS) // AI_MAX_TOKENS = 1024
```

### The Problem

For a **single question** (`solve()`): `callAPI(messages)` → 1024 tokens — adequate.

For a **batch of 10** (`solveBatch()`): `callAPI(messages, 2048)` → 2048 tokens.

Each batch answer object requires roughly:
- `uid`: ~10 chars → ~3-4 tokens
- `answer`: `[0, 2]` → ~5-10 tokens
- `confidence`: `0.85` → ~3 tokens
- `reasoning`: "The answer is X because Y" → ~30-60 tokens

**Per answer: ~50-80 tokens. For 10 answers: ~500-800 tokens.**

2048 seems sufficient for the answer data alone, BUT:
- With `json_object` mode (no schema), models often add verbose explanations, markdown formatting, or preamble
- Some models include thinking tokens in the output budget
- The JSON structure overhead (brackets, keys, quotes) adds ~20 tokens per answer
- Models may include a wrapper object or array with extra fields

**Total realistic token usage for 10 answers: 1200-2400 tokens.**

When the response is truncated at 2048 tokens, the JSON is broken mid-string, causing the parser to **fail the entire chunk**. This is a contributing factor to Bug 1.

### Token Limits by Provider

| Provider | Output Token Limit | Current max_tokens | Adequate? |
|----------|-------------------|-------------------|-----------|
| OpenRouter (varies) | 4096-16384+ | 2048 (batch) | Borderline |
| NVIDIA NIM | 4096-8192 | 2048 (batch) | Borderline |
| Gemini 3.1 Flash-Lite | **65,536** | N/A (new) | More than enough |

### Recommended Fix

**Scale `max_tokens` dynamically based on batch size:**

```ts
async solveBatch(batchRequest: AIBatchRequest): Promise<AIBatchResponse> {
    await this.rateLimiter.acquire();
    const messages = this.buildBatchMessages(batchRequest);
    // Scale: 512 base + 256 per question, capped at 4096
    const maxTokens = Math.min(4096, 512 + batchRequest.questions.length * 256);
    const response = await this.callAPI(messages, maxTokens);
    ...
}
```

| Batch Size | max_tokens | Headroom |
|-----------|------------|----------|
| 1 | 768 | Plenty |
| 3 | 1280 | Good |
| 5 | 1792 | Good |
| 10 | 3072 | Good |

**Also increase `AI_MAX_TOKENS` for single questions:**

Current `AI_MAX_TOKENS = 1024` is fine for simple answers, but with structured output and reasoning, 512 would suffice and save cost. However, keeping 1024 provides safety margin.

**For the Gemini provider specifically:** Since Gemini has 65K output tokens, we can be more generous — e.g., scale to `512 + questions.length * 384` for richer reasoning.

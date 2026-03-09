# MV3 Best Practices — Fix Report

> Generated 2026-03-08 · Scope: manifest.json, background.ts, content.ts, webpack.config.js

---

## Correction Notice

After full code review, two findings from the initial scan were revised:

- **Finding #1** downgraded from CRITICAL → MEDIUM. The code already re-initializes providers on every SW wake via module-level init. The real issue is a race condition between concurrent init paths.
- **Finding #5** replaced entirely. `onInstalled` and `onStartup` handlers **do** exist (background.ts L289, L305). The actual issue is the lack of a keepalive mechanism for long-running batch operations.

---

## Finding 1 — Provider Initialization Race Condition

| | |
|---|---|
| **File** | `src/background/background.ts` (lines 28–38, 289–325, 350–368) |
| **Severity** | MEDIUM |
| **Fix Complexity** | Low |
| **Breaking Change** | No |

### Problem

Three code paths call `initializeProviders()`:

1. Module-level top-of-file init (runs on every SW wake)
2. `chrome.runtime.onInstalled` handler
3. `chrome.runtime.onStartup` handler

All three mutate the shared module-level `providerManager` variable. When `onInstalled` fires, the module-level init is already in-flight. Both calls create a `new AIProviderManager()` and register providers on it, but only the second one's reference is kept. The first proceeds to register providers on a discarded instance.

### Fix

Replace the scattered init calls with a guarded singleton:

```typescript
let initPromise: Promise<void> | null = null;

function ensureProviders(): Promise<void> {
  if (!initPromise) {
    initPromise = getSettings()
      .then((s) => initializeProviders(s))
      .catch((err) => {
        logger.error('Provider init failed', err);
        providersReady = true;
      });
  }
  return initPromise;
}

async function reinitProviders(): Promise<void> {
  initPromise = null;
  providersReady = false;
  await ensureProviders();
}
```

- Every message handler: `await ensureProviders()`
- `onInstalled`, `onStartup`, `storage.onChanged`: call `reinitProviders()`
- Remove the module-level `getSettings().then(...)` — the first message or lifecycle event triggers init lazily

---

## Finding 2 — Overly Broad `tabs` Permission

| | |
|---|---|
| **File** | `manifest.json` (line 5) |
| **Severity** | HIGH |
| **Fix Complexity** | Trivial |
| **Breaking Change** | No |

### Problem

The `"tabs"` permission exposes every tab's URL, title, and favIconUrl to the extension. Chrome Web Store reviewers flag this. The only usage is in `src/popup/popup.ts` (lines 174, 202):

```typescript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.id && tab.url?.includes('coursera.org')) { ... }
```

### Why `tabs` Is Unnecessary

- `chrome.tabs.query({active: true, currentWindow: true})` works **without** the `tabs` permission — it returns `tab.id`.
- `tab.url` is populated when the tab matches a declared `host_permissions` pattern.
- `https://*.coursera.org/*` is already in `host_permissions`, so `tab.url` is available for Coursera tabs.
- For non-Coursera tabs, `tab.url` is `undefined`, and the existing `?.includes('coursera.org')` guard handles that.

### Fix

```jsonc
// manifest.json — remove "tabs"
"permissions": ["activeTab", "storage"],
```

No changes to popup.ts required.

---

## Finding 3 — History API Monkey-Patching

| | |
|---|---|
| **File** | `src/content/content.ts` (lines 109–130) |
| **Severity** | HIGH |
| **Fix Complexity** | Medium (~20 lines replaced) |
| **Breaking Change** | No |

### Problem

The content script overrides `history.pushState` and `history.replaceState` to detect SPA navigation:

```typescript
const origPushState = history.pushState.bind(history);
history.pushState = (...args) => { origPushState(...args); handleUrlChange(); };
```

This is fragile because:
- Other extensions doing the same thing will overwrite or be overwritten
- Coursera's framework may patch these methods (order-dependent conflict)
- It modifies the host page's global state, violating content script isolation

### Fix — Option A (Recommended): Navigation API

Chrome 105+ supports the Navigation API. Since MV3 requires Chrome 109+, this is safe:

```typescript
// Replace the entire monkey-patching block (lines 109–130) with:
let lastUrl = window.location.href;
const handleUrlChange = (): void => {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;
  logger.info(`SPA navigation detected: ${currentUrl}`);
  pendingQuestions.length = 0;
  if (batchTimeout) clearTimeout(batchTimeout);
  if (detector) detector.scan();
};

navigation.addEventListener('navigatesuccess', handleUrlChange);
window.addEventListener('popstate', handleUrlChange);
```

### Fix — Option B: Background-Driven Detection

If Navigation API presents issues (e.g., site overrides it):

```typescript
// background.ts — add:
chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    chrome.tabs.sendMessage(details.tabId, { type: 'URL_CHANGED', url: details.url });
  },
  { url: [{ hostSuffix: 'coursera.org' }] }
);
```

Requires adding `"webNavigation"` to permissions (lightweight, no CWS flags). Content script listens for `URL_CHANGED` instead of patching history.

**Recommendation:** Option A — no new permissions, no background involvement, no global mutation.

---

## Finding 4 — Dead CSP `connect-src` Directive

| | |
|---|---|
| **File** | `manifest.json` (lines 42–44) |
| **Severity** | MEDIUM |
| **Fix Complexity** | Trivial |
| **Breaking Change** | No |

### Problem

```jsonc
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' https://openrouter.ai/ https://integrate.api.nvidia.com/ https://ai.api.nvidia.com/ https://d3njjcbhbojbot.cloudfront.net/"
}
```

In MV3:
- **Service worker** fetch requests are governed by `host_permissions`, **not** CSP
- **Extension pages** (popup, options) don't make direct API calls — they message the background
- The `connect-src` directive has **zero effect** on actual network requests

This gives a false sense of security control.

### Fix

Either trim the CSP:

```jsonc
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

Or remove the block entirely — the default MV3 CSP is `script-src 'self'; object-src 'self'`, which is identical. Only declare CSP if you need to **loosen** it (e.g., `'wasm-unsafe-eval'`).

---

## Finding 5 — No Keepalive for Long Batch Operations

| | |
|---|---|
| **File** | `src/background/background.ts` (lines 207–275) |
| **Severity** | MEDIUM |
| **Fix Complexity** | Medium |
| **Breaking Change** | No (internal refactor) |

### Problem

`handleSolveBatch` processes images (fetching base64 per image) and makes AI API calls. Returning `true` from `onMessage` extends SW lifetime to **5 minutes**. However:

- Batch of 10 questions × image fetching × AI inference × retries can approach that limit
- No progress feedback to the content script during long batches
- If the SW terminates mid-batch, all queued questions are silently lost

### Fix — Option A (Recommended): Port-Based Messaging for Batches

Using `chrome.runtime.connect()` creates a long-lived port that keeps the SW alive for the entire connection duration (no 5-minute limit):

```typescript
// Content script — switch from sendMessage to port for batches:
const port = chrome.runtime.connect({ name: 'batch' });
port.postMessage({ type: 'SOLVE_BATCH', payload });
port.onMessage.addListener((response) => {
  // Handle response, support per-question progress updates
  if (response.type === 'BATCH_PROGRESS') {
    // Update UI per question
  } else if (response.type === 'SOLVE_BATCH') {
    port.disconnect();
  }
});

// Background — add port listener:
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'batch') {
    port.onMessage.addListener(async (message) => {
      const result = await handleSolveBatch(message.payload);
      port.postMessage(result);
    });
  }
});
```

### Fix — Option B (Lighter): Progress Heartbeat

If refactoring the message architecture is too invasive, add storage writes that keep the SW active:

```typescript
// In handleSolveBatch, between chunks:
for (let i = 0; i < batch.length; i += BATCH_CHUNK_SIZE) {
  await chrome.storage.session.set({ _batchProgress: `${i}/${batch.length}` });
  await processChunk(chunk);
}
```

**Recommendation:** Option A for production reliability. Option B as a quick interim fix.

---

## Summary

| # | Finding | Severity | Complexity | Action |
|---|---------|----------|-----------|--------|
| 1 | Provider init race condition | MEDIUM | Low | Refactor to guarded singleton |
| 2 | `tabs` permission unnecessary | HIGH | Trivial | Delete from manifest |
| 3 | History API monkey-patching | HIGH | Medium | Replace with Navigation API |
| 4 | Dead CSP `connect-src` | MEDIUM | Trivial | Remove or trim CSP block |
| 5 | No batch keepalive | MEDIUM | Medium | Switch to port-based messaging |

**Priority order:** #2 → #4 → #3 → #1 → #5 (trivial safe wins first, then impactful changes)

## Sources

1. [Chrome MV3 Service Worker Lifecycle & Timeouts](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
2. [Chrome `tabs` Permission Docs](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions)
3. [Navigation API — Chrome for Developers](https://developer.chrome.com/docs/web-platform/navigation-api)
4. [MV3 Content Security Policy](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security#update-csp)
5. [Long-Lived Connections (Ports)](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#connect)

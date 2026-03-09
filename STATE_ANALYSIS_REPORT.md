# State Management Deep Analysis

> Generated 2026-03-08 · Full trace of every state variable, storage key, and data flow

---

## State Architecture Overview

The extension maintains state across **four isolated contexts** that communicate via `chrome.storage` and `chrome.runtime.sendMessage`:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        State Storage Layer                          │
│                                                                     │
│  chrome.storage.local          │  chrome.storage.session            │
│  ─────────────────             │  ──────────────────────            │
│  enabled: boolean              │  _lastStatus: string               │
│  confidenceThreshold: number   │  _lastError: string                │
│  autoSelect: boolean           │  _lastProvider: string             │
│  openrouterApiKey: encrypted   │  _lastModel: string                │
│  nvidiaApiKey: encrypted       │  _lastConfidence: number | null    │
│  openrouterModel: string       │                                    │
│  nvidiaModel: string           │                                    │
│  primaryProvider: string       │                                    │
│  maxRetries: number            │                                    │
│  rateLimitRpm: number          │                                    │
└─────────────────────────────────────────────────────────────────────┘
         │                                     │
    ┌────┴────────────────────────────────┐    │
    │                                     │    │
    ▼                                     ▼    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Content Script│  │  Background  │  │    Popup     │
│ (content.ts) │  │  (SW)        │  │ (popup.ts)   │
│              │  │              │  │              │
│ Module state:│  │ Module state:│  │ Module state:│
│  isEnabled   │  │ providerMgr  │  │ (DOM refs)   │
│  detector    │  │ providersReady│ │              │
│  extractor   │  │ providerReady│  │              │
│  selector    │  │   Promise    │  │              │
│  pending[]   │  │ router       │  │              │
│  batchTimeout│  │              │  │              │
│  lastUrl     │  │              │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       │  ┌──────────────┐  ┌──────────────┐
       └──│  Options Page │  │              │
          │ (options.ts)  │  │              │
          │               │  │              │
          │ Module state: │  │              │
          │  (DOM refs)   │  │              │
          └───────────────┘  └──────────────┘
```

---

## Bug Inventory: Stale & Broken State Transitions

### BUG 1 — `_lastStatus: 'active'` Persists Indefinitely (CRITICAL)

**File:** `src/background/background.ts` lines 113-118

**Trace:**
1. Background solves a batch → `chrome.storage.session.set({ _lastStatus: 'active' })`
2. User navigates to a non-quiz page → NO status reset
3. User opens popup 10 minutes later → `loadStatus()` reads `_lastStatus: 'active'`
4. Popup shows "Active" with green dot — **misleading**, nothing is actually active

**Root cause:** Nothing resets `_lastStatus` from `'active'` back to `'idle'` after a successful solve. The only resets are:
- `onInstalled` → `'idle'`
- `onStartup` → `'idle'`  
- Error → `'error'`

**The `'active'` → `'idle'` transition does not exist.** Once active, it stays active until: an error occurs, the SW restarts, or the extension is reinstalled.

**Fix:**
```typescript
// background.ts — add a status timeout after successful solve:
await chrome.storage.session.set({ _lastStatus: 'active', ... });
// Reset to idle after 30 seconds of no new activity
setTimeout(async () => {
    const current = await chrome.storage.session.get({ _lastStatus: '' });
    if (current._lastStatus === 'active') {
        await chrome.storage.session.set({ _lastStatus: 'idle' });
    }
}, 30_000);
```

Or better — add an explicit `'idle'` transition in the content script after all answers are applied:
```typescript
// content.ts — after processBatch completes:
await chrome.storage.session.set({ _lastStatus: 'idle' });
```

---

### BUG 2 — No "Processing" State (HIGH)

**Files:** `src/background/background.ts`, `src/popup/popup.ts`

**Trace:**
1. Content script sends `SOLVE_BATCH` to background
2. Background starts processing (fetching images, calling AI) — takes 5-30 seconds
3. During this time, `_lastStatus` is still whatever it was BEFORE (likely `'idle'` or stale `'active'`)
4. User opens popup → sees "Idle" → thinks extension isn't working → clicks Retry

**Root cause:** Neither content script nor background writes a `'processing'` status at the START of a batch solve. The status only changes AFTER the solve completes.

**Fix:**
```typescript
// background.ts — at the START of handleSolveBatch:
async function handleSolveBatch(payload: unknown): Promise<Message> {
    await chrome.storage.session.set({
        _lastStatus: 'processing',
        _lastError: '',
    });
    
    // ... rest of solve logic ...
}
```

```typescript
// popup.ts — add processing state to updateStatusDisplay:
case 'processing':
    statusText.textContent = 'Processing...';
    statusDot.classList.add('processing');
    break;
```

```css
/* popup.css — add processing animation */
.status-dot.processing {
    background-color: #3b82f6;
    animation: pulse 1s ease-in-out infinite;
}
```

---

### BUG 3 — Enable Toggle Resets Status to 'Idle' Prematurely (MEDIUM)

**File:** `src/popup/popup.ts` line 100

**Code:**
```typescript
async function handleToggle(): Promise<void> {
    const enabled = enableToggle.checked;
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: enabled });
    updateStatusDisplay(enabled ? 'idle' : 'idle', enabled);  // ← always 'idle'
}
```

**Problem:** After toggling, the popup forces the status display to 'idle' regardless of actual state. If the user toggles ON while questions are being processed (from a previous toggle-on), the display jumps to 'Idle' even though a batch solve might be in progress.

**Fix:**
```typescript
async function handleToggle(): Promise<void> {
    const enabled = enableToggle.checked;
    await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: enabled });
    // Re-read actual state instead of assuming 'idle'
    await loadStatus();
}
```

---

### BUG 4 — Scan/Retry Silently Fails When Disabled (MEDIUM)

**File:** `src/content/content.ts` lines 61-82

**Code:**
```typescript
if (message.type === 'SCAN_PAGE') {
    pendingQuestions.length = 0;
    if (batchTimeout) clearTimeout(batchTimeout);
    if (detector) {
        detector.scan();           // detector exists → scan
    } else if (isEnabled) {
        startDetection();          // no detector, enabled → start + scan
    }
    // ← if detector is null AND isEnabled is false: NOTHING HAPPENS
    sendResponse({ success: true }); // ← returns success anyway!
}
```

**Problem:** If the extension is disabled (`isEnabled === false`) and no detector exists (`detector === null`), clicking "Scan Page" does nothing but returns `{ success: true }`. The popup shows `⏳...` for 1.5 seconds, then resets to `🔍 Scan Page` — the user thinks the scan succeeded.

**Fix:**
```typescript
if (message.type === 'SCAN_PAGE') {
    if (!isEnabled) {
        sendResponse({ success: false, reason: 'Extension is disabled' });
        return false;
    }
    // ... rest of scan logic ...
}
```

And in popup.ts, handle the response:
```typescript
const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
if (!response?.success) {
    statusText.textContent = response?.reason || 'Scan failed';
    statusDot.className = 'status-dot error';
}
```

---

### BUG 5 — SPA Navigation Doesn't Reset Session Status (MEDIUM)

**File:** `src/content/content.ts` lines 106-130

**Trace:**
1. User solves quiz A → `_lastStatus: 'active'`, `_lastProvider: 'openrouter'`, `_lastConfidence: 0.95`
2. User navigates to lecture B (SPA navigation) → `handleUrlChange()` clears pending questions and re-scans
3. `_lastStatus` remains `'active'`, `_lastProvider` remains `'openrouter'`, `_lastConfidence` remains `0.95`
4. User opens popup on lecture page → sees "Active, Provider: openrouter, Confidence: 0.95" — **stale data from a different page**

**Root cause:** `handleUrlChange()` only resets local content script state (`pendingQuestions`, `batchTimeout`) but doesn't clear session storage status.

**Fix:**
```typescript
const handleUrlChange = (): void => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    
    // Reset session status on navigation
    chrome.storage.session.set({
        _lastStatus: 'idle',
        _lastError: '',
        _lastConfidence: null,
    }).catch(() => {/* ignore storage errors */});
    
    pendingQuestions.length = 0;
    if (batchTimeout) clearTimeout(batchTimeout);
    if (detector) detector.scan();
};
```

---

### BUG 6 — Error State Never Auto-Clears (MEDIUM)

**Files:** `src/content/selector.ts`, `src/content/content.ts`

**Trace:**
1. Batch solve fails → all questions marked with `data-auto-coursera-error="true"` + red outline
2. User fixes their API key in settings
3. Extension re-initializes providers (background `onChanged` listener)
4. But questions on the page STILL show red error outlines
5. User must manually click "Retry" to re-process

**Problem:** Error state on DOM elements persists until explicit retry. There's no auto-retry mechanism when settings change. The `onChanged` listener in the content script only recreates the `AnswerSelector` — it doesn't re-run detection/solving.

**Fix:**
```typescript
// content.ts — in storage.onChanged listener, add auto-retry on relevant changes:
chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.enabled) { /* ... existing code ... */ }
    if (changes.confidenceThreshold || changes.autoSelect) { /* ... existing ... */ }
    
    // Auto-retry on API key/provider changes
    const retryKeys = ['openrouterApiKey', 'nvidiaApiKey', 'primaryProvider'];
    if (isEnabled && retryKeys.some(key => key in changes)) {
        logger.info('API settings changed, re-scanning questions');
        // Clear existing error states
        document.querySelectorAll('[data-auto-coursera-error="true"]').forEach(el => {
            AnswerSelector.clearProcessing(el as HTMLElement);
        });
        if (detector) detector.scan();
    }
});
```

---

### BUG 7 — Popup Shows Stale Session Data After SW Termination (LOW-MEDIUM)

**Trace:**
1. SW is alive, processes questions → sets `_lastStatus: 'active'`
2. 30 seconds of inactivity → SW terminates
3. `_lastStatus: 'active'` persists in session storage (session storage survives SW termination, it only clears on browser close)
4. User opens popup → reads `_lastStatus: 'active'` → shows "Active" with green dot
5. SW hasn't been alive for 30 seconds — nothing is "active"

**Root cause:** `chrome.storage.session` persists across SW lifetime cycles within a browser session. The `onStartup` handler resets it, but `onStartup` only fires once per browser session (not per SW wake).

**The fix is the same as Bug 1** — use an `idle` timeout or have the popup verify liveness:
```typescript
// popup.ts — in loadStatus(), add timestamp check:
const lastUpdate = sessionData._lastStatusTimestamp as number || 0;
const staleThreshold = 60_000; // 1 minute
if (Date.now() - lastUpdate > staleThreshold && sessionData._lastStatus === 'active') {
    // Status is stale — reset to idle
    await chrome.storage.session.set({ _lastStatus: 'idle' });
    updateStatusDisplay('idle', localData.enabled);
}
```

```typescript
// background.ts — set timestamp whenever status changes:
await chrome.storage.session.set({ 
    _lastStatus: 'active',
    _lastStatusTimestamp: Date.now(),
    // ...
});
```

---

### BUG 8 — Content Script `isEnabled` Can Desync From Storage (LOW)

**Trace:**
1. Content script loads → reads `enabled: false` from storage → `isEnabled = false`
2. SW writes `enabled: true` to storage
3. Content script's `onChanged` listener fires → sets `isEnabled = true`, calls `startDetection()`
4. If `onChanged` listener throws (any error in the handler) → `isEnabled` remains `false` while storage says `true`
5. On SPA navigation, `handleUrlChange` checks `if (detector)` and `if (isEnabled)` — both `false`, nothing happens

**Root cause:** No periodic sync between in-memory `isEnabled` and storage. The variable is set once on load and updated only via `onChanged`. If the listener silently fails, state drifts.

**This is LOW priority** — the `onChanged` listener is simple and unlikely to throw. But for robustness:
```typescript
// Re-read storage on SPA navigation as a sync point
const handleUrlChange = async (): Promise<void> => {
    const settings = await chrome.storage.local.get({ enabled: false });
    isEnabled = settings.enabled as boolean;
    // ... rest of navigation handler ...
};
```

---

### BUG 9 — Options Page "Test" Uses Real Solve (LOW)

**File:** `src/options/options.ts` lines 130-148

**Problem:** The "Test API Keys" button sends a `SOLVE_QUESTION` with `questionText: 'What is 2 + 2?'`. This:
- Consumes API credits on paid models
- Sets `_lastStatus: 'active'` in session storage → popup shows stale "Active" with test data
- Also sets `_lastProvider`, `_lastModel`, `_lastConfidence` from the test
- User goes to a Coursera page → popup shows provider/confidence from the test, not actual quiz work

**Fix:** Add a `TEST_PROVIDER` message type that makes a minimal API call (or just validates the key format) without setting session status, OR clear the session status after a test:
```typescript
// After test completes in background:
await chrome.storage.session.set({
    _lastStatus: 'idle',
    _lastProvider: '',
    _lastModel: '',
    _lastConfidence: null,
});
```

---

## State Lifecycle Diagram — Current (Broken)

```
 ┌────────┐                                        
 │ 'idle' │──── SW install/startup ────►┌────────┐ 
 └────┬───┘                             │ 'idle' │ 
      │                                 └────┬───┘ 
      │ solve success                        │     
      ▼                                      │     
 ┌─────────┐                                 │     
 │ 'active'│◄─── STUCK FOREVER ──────────────┘     
 └────┬────┘                                       
      │ solve failure                              
      ▼                                            
 ┌─────────┐                                       
 │ 'error' │◄─── STUCK UNTIL RETRY ──────────────  
 └─────────┘                                       
                                                    
 Missing transitions:                              
 ❌ 'active' → 'idle' (after timeout/navigation)   
 ❌ 'error' → 'idle' (after settings fix)          
 ❌ 'idle' → 'processing' (during batch solve)     
 ❌ Any → 'idle' (on page navigation)              
```

## State Lifecycle Diagram — Fixed

```
 ┌────────┐                                         
 │ 'idle' │──── SW install/startup ────►┌────────┐  
 └────┬───┘                             │ 'idle' │  
      │                                 └────┬───┘  
      │ batch received                       │      
      ▼                                      │      
 ┌────────────┐                              │      
 │'processing'│──── batch complete ──────────┘      
 └────┬───────┘                              │      
      │                                      │      
      ├─── solve success ──►┌─────────┐      │      
      │                     │ 'active'│──30s─┘      
      │                     └─────────┘             
      │                                             
      └─── solve failure ──►┌─────────┐             
                            │ 'error' │──settings──►idle
                            └─────────┘             
                                                    
 Global resets:                                     
 ✅ SPA navigation → 'idle'                         
 ✅ Settings change → re-solve → 'processing'       
 ✅ Status timestamp → stale detection              
```

---

## Summary — All State Bugs by Severity

| # | Bug | Severity | Root Cause | Fix Effort |
|---|-----|----------|-----------|------------|
| 1 | 'active' status persists indefinitely | **CRITICAL** | No `active → idle` transition | Low |
| 2 | No 'processing' status during batch solve | **HIGH** | Never writes status at solve start | Low |
| 3 | Toggle forces status to 'idle' regardless | **MEDIUM** | Hardcoded `'idle'` in handleToggle | Trivial |
| 4 | Scan/Retry silently fails when disabled | **MEDIUM** | Returns `success: true` unconditionally | Low |
| 5 | SPA navigation doesn't clear session status | **MEDIUM** | handleUrlChange only resets local state | Low |
| 6 | Error state never auto-clears after fix | **MEDIUM** | No auto-retry on settings change | Low |
| 7 | Stale session data after SW termination | **LOW-MED** | session storage outlives SW lifetime | Low |
| 8 | Content `isEnabled` can desync | **LOW** | Single-write with no periodic sync | Low |
| 9 | Test button pollutes session status | **LOW** | Uses real SOLVE_QUESTION path | Low |

**Total:** 9 state management bugs — 1 CRITICAL, 1 HIGH, 4 MEDIUM, 3 LOW

**Priority fix order:** Bug 1 → Bug 2 → Bug 5 → Bug 3 → Bug 4 → Bug 6 → Bug 7 → Bug 9 → Bug 8

All fixes are low effort (most are 3-10 line changes). The entire state management overhaul could be done in a single focused session.

---

## Sources

- `src/popup/popup.ts` — popup state reads/writes (lines 72-258)
- `src/background/background.ts` — session storage writes (lines 113-118, 131-137, 250-253)
- `src/content/content.ts` — content script state management (lines 35-130)
- `src/options/options.ts` — settings save and test flows
- `src/background/router.ts` — message routing error storage writes

### Confidence: HIGH
All bugs confirmed by code trace. State flow verified across all four contexts (content, background, popup, options). Each bug has a reproducible trace.

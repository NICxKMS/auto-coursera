# UX/UI Improvement Report

> Generated 2026-03-08 · Scope: Popup, Options Page, Content Script Overlay, Accessibility

---

## Executive Summary

The extension has a clean, functional UI with good foundations (toggle, error banner with copy, confidence display). The main gaps are: **no feedback loop during processing**, **poor first-run experience**, **accessibility barriers**, and **missing contextual information** at the point of action. These findings are ordered by user impact.

---

## Finding 1 — No Processing Feedback in Popup or Badge

| | |
|---|---|
| **Files** | `src/popup/popup.ts`, `src/popup/popup.html`, `src/background/background.ts` |
| **Severity** | HIGH |
| **Impact** | Users don't know if the extension is working |

### Problem

After enabling the extension and navigating to a quiz:

1. The popup shows "Active" or "Idle" — no "Processing 3/10 questions..." state
2. No badge count on the extension icon (e.g., "5" for 5 questions found)
3. No progress indicator between "Scan Page" click and results appearing
4. The content script's processing spinner is 16×16px at `top:4px; right:4px` — nearly invisible inside Coursera's question containers

### Suggested Fix

**A. Add badge count from background:**

```typescript
// background.ts — after receiving SOLVE_BATCH:
chrome.action.setBadgeText({ text: String(batchPayload.questions.length) });
chrome.action.setBadgeBackgroundColor({ color: '#0056d2' });
// After batch completes:
chrome.action.setBadgeText({ text: '✓' });
setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
```

**B. Add processing state to popup:**

```html
<!-- popup.html — add inside .status-section -->
<div class="progress-bar" id="progressBar" style="display: none;">
  <div class="progress-fill" id="progressFill"></div>
  <span class="progress-text" id="progressText">Processing...</span>
</div>
```

The popup should poll `chrome.storage.session` for `_batchProgress` (set by background during batch processing) and update the progress bar.

**C. Enlarge the content script spinner:**

```css
/* inject.css — make spinner more visible */
[data-auto-coursera-processing="true"]::after {
  width: 24px;
  height: 24px;
  border: 3px solid #0056d2;
  border-top-color: transparent;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
}
```

---

## Finding 2 — No Onboarding or Empty State Guidance

| | |
|---|---|
| **Files** | `src/popup/popup.html`, `src/options/options.html` |
| **Severity** | HIGH |
| **Impact** | New users don't know what to do after install |

### Problem

- First install opens the options page — but there's no guided setup flow, no indication of which fields are required, no "get started" section
- The popup shows "Idle" with `--` for provider and model — no prompt to configure API keys
- No help text explaining what OpenRouter or NVIDIA NIM are, or where to get API keys
- No link from popup error "No AI providers configured" to the settings page — the user must find the small "⚙️ Settings" link in the footer

### Suggested Fix

**A. Add empty-state card in popup when no API keys are configured:**

```html
<div class="empty-state" id="emptyState" style="display: none;">
  <p>🔑 No API keys configured</p>
  <p class="help-text">Add your OpenRouter or NVIDIA API key to get started.</p>
  <button class="action-btn primary" id="setupBtn">Open Settings</button>
</div>
```

Show this instead of the status section when no providers are configured. The popup should check `GET_STATUS` response and if provider is empty, show the empty state.

**B. Add helper text to options page:**

```html
<!-- Below each API key input -->
<p class="field-help">
  Get a free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>
</p>
```

**C. Add required field indicators:**

```css
.form-field label[data-required]::after {
  content: " *";
  color: #ef4444;
}
```

At least one API key should be marked as required with validation on save.

---

## Finding 3 — No Contextual Feedback on Selected Answers

| | |
|---|---|
| **Files** | `src/content/selector.ts`, `assets/styles/inject.css` |
| **Severity** | HIGH |
| **Impact** | Users can't understand or verify AI decisions |

### Problem

When the AI selects an answer, the user sees only a colored outline:
- **Green** = high confidence, **Yellow** = medium, **Orange** = low
- No explanation of WHY the answer was chosen (the AI returns `reasoning` but it's only logged, never displayed)
- No way to distinguish between "auto-clicked" (solid) and "suggestion-only" (dashed) without knowing the convention
- No undo mechanism — if the AI clicks a wrong radio button, the user must manually change it
- The dual highlight system (inject.css via data attributes + inline styles in selector.ts) means inject.css styles are often overridden

### Suggested Fix

**A. Add a tooltip showing reasoning on hover:**

```typescript
// selector.ts — in highlightOption():
const tooltip = document.createElement('div');
tooltip.className = 'auto-coursera-tooltip';
tooltip.textContent = `AI Confidence: ${(confidence * 100).toFixed(0)}% — ${reasoning}`;
el.style.position = 'relative';
el.appendChild(tooltip);
```

```css
/* inject.css */
.auto-coursera-tooltip {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #1e293b;
  color: white;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  max-width: 280px;
  z-index: 10000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
[data-auto-coursera-suggestion]:hover .auto-coursera-tooltip {
  display: block;
}
```

**B. Unify the highlight system — use only data attributes + CSS, remove inline styles:**

```typescript
// selector.ts — replace inline style setting with:
el.setAttribute('data-auto-coursera-confidence', 
  confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low');
el.setAttribute('data-auto-coursera-method', clicked ? 'clicked' : 'suggested');
```

```css
/* inject.css — confidence-based colors via attributes */
[data-auto-coursera-confidence="high"] { outline: 2px solid #22c55e !important; }
[data-auto-coursera-confidence="medium"] { outline: 2px solid #eab308 !important; }
[data-auto-coursera-confidence="low"] { outline: 2px solid #f97316 !important; }
[data-auto-coursera-method="suggested"] { outline-style: dashed !important; }
```

**C. Pass reasoning through to the selector** (currently only `answer`, `confidence` are used — `reasoning` is available in the batch response but not forwarded to `selector.select()`).

---

## Finding 4 — Accessibility Barriers

| | |
|---|---|
| **Files** | `src/popup/popup.html`, `src/options/options.html`, `assets/styles/inject.css` |
| **Severity** | HIGH |
| **Impact** | Extension is unusable for users with visual impairments or keyboard-only navigation |

### Problem

**A. Color-only status indicators:**
- The status dot (gray/green/red) conveys state through color alone — invisible to colorblind users
- Highlight colors (green/yellow/orange/red) on answers have no text or icon alternative

**B. Missing ARIA attributes:**
- Toggle switch in popup has no `role="switch"` or `aria-checked`
- Status text changes dynamically but has no `aria-live` region
- Error banner appears/disappears with no screen reader announcement

**C. No keyboard support:**
- Content script highlights are not focusable — keyboard users can't navigate to see which answers were selected
- No keyboard shortcut to enable/disable the extension

### Suggested Fix

**A. Add text labels alongside color indicators:**

```html
<!-- popup.html — status dot -->
<span class="status-dot" role="status" aria-label="Extension status"></span>
<span class="status-text" id="statusText" aria-live="polite">Idle</span>
```

**B. ARIA for toggle:**

```html
<label class="toggle" aria-label="Enable Auto-Coursera">
  <input type="checkbox" id="enableToggle" role="switch" aria-checked="false">
  <span class="slider" aria-hidden="true"></span>
</label>
```

Update `aria-checked` in popup.ts when toggle changes.

**C. Add `aria-live` to error banner:**

```html
<div class="error-banner" id="errorBanner" role="alert" aria-live="assertive" style="display: none;">
```

**D. Add keyboard shortcut via commands API:**

```jsonc
// manifest.json
"commands": {
  "_execute_action": {
    "suggested_key": { "default": "Ctrl+Shift+Q" },
    "description": "Open Auto-Coursera popup"
  },
  "toggle-enabled": {
    "suggested_key": { "default": "Alt+Shift+A" },
    "description": "Toggle Auto-Coursera on/off"
  }
}
```

---

## Finding 5 — Options Page: No Validation, No Unsaved Warning, Keys in Plaintext

| | |
|---|---|
| **Files** | `src/options/options.ts`, `src/options/options.html` |
| **Severity** | MEDIUM |
| **Impact** | Poor settings UX, potential key exposure |

### Problem

**A. API keys loaded as plaintext into password fields:**
`options.ts` line 72: `openrouterKeyInput.value = settings.openrouterApiKey` loads the decrypted key into the input. While `type="password"` masks the display, the value is in the DOM and accessible via DevTools. More importantly, if the user opens DevTools (common for extension dev), the key is trivially extractable via `$('#openrouterKey').value`.

**B. No input validation:**
- No format check on API key patterns (`sk-or-*` for OpenRouter, `nvapi-*` for NVIDIA)
- Confidence slider allows 0.0 (accept everything) and 1.0 (reject everything) without warning
- No validation that at least one API key is provided on save

**C. No unsaved changes detection:**
- User can modify settings, navigate away, and lose all changes with no warning
- No visual indicator of "modified" state (e.g., Save button color change)

**D. "Test API Keys" sends a real SOLVE_QUESTION:**
The test at `options.ts` line ~133 sends an actual inference request including `questionText: 'What is 2 + 2?'`. This consumes API credits on paid models. Should use a lighter health-check endpoint.

### Suggested Fix

**A. Don't load actual keys — show masked placeholder:**

```typescript
// options.ts — loadSettings():
openrouterKeyInput.value = '';
openrouterKeyInput.placeholder = settings.openrouterApiKey ? '••••••••••••••••' : 'sk-or-...';
openrouterKeyInput.dataset.hasKey = String(!!settings.openrouterApiKey);
```

Only save the key if the user actually typed a new value (non-empty, not the placeholder).

**B. Add inline validation:**

```typescript
openrouterKeyInput.addEventListener('blur', () => {
  const val = openrouterKeyInput.value.trim();
  if (val && !val.startsWith('sk-or-')) {
    showFieldError(openrouterKeyInput, 'Key should start with sk-or-');
  }
});
```

**C. Track dirty state:**

```typescript
let isDirty = false;
const formInputs = document.querySelectorAll('input, select');
formInputs.forEach(el => el.addEventListener('change', () => { isDirty = true; }));
window.addEventListener('beforeunload', (e) => {
  if (isDirty) e.preventDefault();
});
```

**D. Use a lightweight test:**
Instead of SOLVE_QUESTION, add a `TEST_PROVIDER` message type in the background that calls the provider's models endpoint or sends a minimal request (1 token).

---

## Finding 6 — No Dark Mode / System Theme Respect

| | |
|---|---|
| **Files** | `src/popup/popup.css`, `src/options/options.css` |
| **Severity** | LOW |
| **Impact** | Visual jarring for dark-mode users; inconsistent with Chrome's dark theme |

### Problem

Both the popup and options page are hardcoded to light backgrounds (`#f8f9fa`, `#f5f5f5`, `white`). Chrome supports dark mode and many users prefer it. The extension popup appears as a bright white rectangle in an otherwise dark browser.

### Suggested Fix

Add CSS custom properties with a `prefers-color-scheme` media query:

```css
:root {
  --bg-primary: #f8f9fa;
  --bg-card: #ffffff;
  --text-primary: #1a1a2e;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --brand-color: #0056d2;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1a1a2e;
    --bg-card: #2a2a3e;
    --text-primary: #e0e0e0;
    --text-secondary: #999;
    --border-color: #3a3a4e;
    --brand-color: #4d90fe;
  }
}

body { background: var(--bg-primary); color: var(--text-primary); }
```

Apply the same variables to both popup.css and options.css.

---

## Finding 7 — Dual Highlight System Creates Style Conflicts

| | |
|---|---|
| **Files** | `src/content/selector.ts` (lines 130–145), `assets/styles/inject.css` |
| **Severity** | MEDIUM |
| **Impact** | Visual inconsistency, harder to maintain |

### Problem

Two systems fight over answer highlight styles:

1. **inject.css** uses data-attribute selectors with `!important`:
   ```css
   [data-auto-coursera-suggestion="true"] { outline: 3px solid #f59e0b !important; }
   ```

2. **selector.ts** sets inline styles:
   ```typescript
   el.style.outline = `2px ${style} #22c55e`; // green
   ```

Inline styles are lower specificity than `!important`, so inject.css always wins — making the confidence-based color coding in selector.ts invisible. The yellow `#f59e0b` from inject.css overrides the green/yellow/orange from the TS.

### Suggested Fix

Remove all inline `el.style.outline` usage from selector.ts. Use only data attributes for state, and let inject.css handle all visual presentation:

```typescript
// selector.ts — set attributes instead of inline styles
el.setAttribute('data-auto-coursera-confidence', 
  confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low');
el.setAttribute('data-auto-coursera-method', clicked ? 'auto' : 'suggest');
```

```css
/* inject.css — single source of truth */
[data-auto-coursera-confidence="high"] { outline: 3px solid #22c55e !important; }
[data-auto-coursera-confidence="medium"] { outline: 3px solid #eab308 !important; }  
[data-auto-coursera-confidence="low"] { outline: 3px solid #f97316 !important; }
[data-auto-coursera-method="suggest"] { outline-style: dashed !important; }
```

---

## Summary — Priority Matrix

| # | Finding | Severity | Effort | User Impact |
|---|---------|----------|--------|-------------|
| 1 | No processing feedback / badge | HIGH | Medium | Users think extension is broken |
| 2 | No onboarding / empty state | HIGH | Low | New users abandon |
| 3 | No reasoning shown on answers | HIGH | Medium | Users can't verify AI decisions |
| 4 | Accessibility barriers | HIGH | Medium | Excludes users with disabilities |
| 5 | Options: no validation, keys exposed | MEDIUM | Low | Key leakage, bad settings UX |
| 6 | No dark mode | LOW | Low | Visual polish |
| 7 | Dual highlight system conflict | MEDIUM | Low | Bug: confidence colors invisible |

**Quick wins (do first):** #7, #5A (stop loading real keys), #2A (empty state in popup)
**High impact (do next):** #1 (badge + progress), #3 (reasoning tooltip), #4B (ARIA attributes)
**Polish (do later):** #6 (dark mode), #4D (keyboard shortcuts)

---

## Sources

1. [Chrome Extension UX Best Practices](https://developer.chrome.com/docs/extensions/develop/ui)
2. [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
3. [Chrome Commands API](https://developer.chrome.com/docs/extensions/reference/api/commands)
4. [Chrome Action Badge API](https://developer.chrome.com/docs/extensions/reference/api/action#badge)

### Confidence: HIGH
All findings verified against actual source code. Highlight conflict (Finding 7) confirmed by CSS specificity analysis — `!important` in inject.css beats inline styles from selector.ts.

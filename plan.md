# Plan: Auto-Coursera Complete UI Redesign

## Objective
Replace the current popup-centric UI with a floating in-page widget on Coursera pages, move settings into an in-page overlay, and slim the browser action popup to a minimal fallback — all in vanilla TypeScript with Shadow DOM isolation. Every decision is anchored in what the user sees, feels, and understands.

---

## The User's Journey (Before → After)

### Before (Current UX Pain Points)
1. **Context switching**: User is on a quiz → has to click the tiny extension icon in the toolbar → popup opens → they see status. Any interaction (toggle, scan, retry) requires this popup open.
2. **Settings nightmare**: Click "Settings" in popup → new tab opens → completely leaves Coursera → configures → closes tab → back to quiz → forgot what they were doing.
3. **Zero page presence**: On the Coursera page itself, the only visual feedback is outlines on questions. No controls, no status, no stats. The extension is invisible.
4. **Disconnected feedback**: Stats (solved/failed/tokens) live only in the popup. User never sees them unless they explicitly open the popup.

### After (Redesigned UX)
1. **Always present**: A small floating pill sits at the bottom-right of every Coursera page. At a glance, the user sees if the extension is active (green glow), processing (blue pulse), idle (gray), or errored (red).
2. **One click to controls**: Click the pill → a clean panel slides open with everything: toggle, status, stats, actions. No toolbar hunting.
3. **Settings in context**: Click the gear → a dimmed overlay appears over Coursera. Configure API keys, models, behavior — all without leaving the quiz page. Close overlay → you're exactly where you were.
4. **Real-time feedback**: Stats update live as questions are solved. The status bar changes. The FAB's ring animates. The user always knows what's happening.
5. **First-time warmth**: New users see a welcome tooltip on the FAB pointing them to settings. The overlay opens with onboarding guidance. No cold, empty state.

---

## Detailed UX Specifications

### 🔵 Minimized State (The FAB Pill)

**What the user sees:**
A floating pill (52×32px rounded capsule) at the bottom-right of the page:

```
┌──────────────────┐
│  🎓  Solving 3   │  ← brand icon + contextual status text
└──────────────────┘
```

**States the pill transitions through:**

| Extension State | Pill Appearance | Text | Animation |
|---|---|---|---|
| Disabled | Gray background, muted icon | "Off" | None |
| Idle (enabled, no activity) | Brand blue background, white icon | "Ready" | None |
| Processing | Brand blue + shimmer effect | "Solving 3..." (count of questions being processed) | Subtle left-to-right shimmer across the pill |
| Done | Green background, checkmark icon | "✓ 5 solved" | Brief green flash, then settles |
| Error | Red background, warning icon | "! Error" | Gentle pulse |

**Why a pill, not a circle:** A circle (48×48) is ambiguous — is it a chat widget? A feedback button? A pill with text gives instant context. The user *reads* the state without hovering or clicking.

**Micro-interactions:**
- Hover → slight elevation increase (shadow deepens), tooltip appears if text is truncated
- Click → panel slides up from the pill's position (the pill visually transforms into the panel header)
- Drag → pill follows cursor, slight rotation tilt (±2°) during drag for physicality, snaps to nearest edge on release
- First visit → a tooltip bubble appears: "👋 Click to get started" (dismisses on click or after 5 seconds)

### 🟦 Expanded State (The Panel)

**What the user sees when they click the pill:**

```
┌──────────────────────────────────┐
│  🎓 Auto-Coursera    ● Active  ─ │  ← header: brand, status badge, minimize (─)
├──────────────────────────────────┤
│  ┌────────────────────────────┐  │
│  │  ◉ Enabled                 │  │  ← toggle row (big, satisfying toggle)
│  └────────────────────────────┘  │
│                                  │
│  ⚠️ API key invalid — tap to    │  ← error banner (only when error exists)
│  copy error details              │
│                                  │
│  Provider    OpenRouter          │  ← status info
│  Model       Gemma 3 27B        │
│  Confidence  0.92                │
│                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐    │
│  │  ✓5  │ │  ✗1  │ │ 🪙312│    │
│  │solved│ │failed│ │tokens│    │  ← color-coded stats (green/red/blue)
│  └──────┘ └──────┘ └──────┘    │
│                                  │
│  [🔍 Scan Page]  [🔄 Retry]    │  ← action buttons
│                                  │
│  ───────────────────────────     │
│  ⚙️ Settings                     │  ← footer link → opens overlay
└──────────────────────────────────┘
```

**Width:** 320px | **Max height:** 480px (scrollable)
**Animation:** Panel slides up from FAB position + fades in (200ms ease-out)

**Smart behaviors:**
- Stats counters animate when values increment
- Error banner shows user-friendly messages (shared ERROR_PATTERNS)
- Processing → thin progress bar animates at top of header
- Buttons show ripple effect, disable during processing
- Panel remembers open/minimized state per session

### ⚙️ Settings Overlay

**What the user sees when they click the gear:**

The page dims (60% dark backdrop + blur). A centered card fades in (480px wide, 85vh max height):

```
┌──────────────────────────────────────────┐
│  Settings                            ✕   │
├──────────────────────────────────────────┤
│  ┌── API Keys ──────────────────────┐   │
│  │  OpenRouter    [••••••••sk-4f]   │   │
│  │  NVIDIA NIM    [Enter key...]    │   │
│  │  Gemini        [••••••••AIza]    │   │
│  │  Groq          [Enter key...]    │   │
│  │  Cerebras      [Enter key...]    │   │
│  └──────────────────────────────────┘   │
│  ┌── Model Selection ───────────────┐   │
│  │  OpenRouter  [▾ Gemma 3 27B...] │   │
│  │  NVIDIA      [▾ Kimi K2.5    ]  │   │
│  │  Gemini      [▾ Flash Lite   ]  │   │
│  │  Groq        [▾ Llama 3.3   ]  │   │
│  │  Cerebras    [▾ Llama 3.3   ]  │   │
│  └──────────────────────────────────┘   │
│  ┌── Primary Provider ──────────────┐   │
│  │  ◉ OpenRouter  ○ NVIDIA  ○ Gemini│  │
│  │  ○ Groq  ○ Cerebras              │  │
│  └──────────────────────────────────┘   │
│  ┌── Behavior ──────────────────────┐   │
│  │  Confidence: [=======|===] 0.70  │   │
│  │  ☑ Auto-select answers           │   │
│  │  ☑ Auto-start on page load       │   │
│  └──────────────────────────────────┘   │
│  [💾 Save Settings]  [🔌 Test Connection]│
│  ✅ Settings saved successfully!          │
└──────────────────────────────────────────┘
```

**Behaviors:** Escape/backdrop click closes. Focus trapped. Unsaved changes → confirm discard. Scrollable. Onboarding banner for new users.

---

## Strategic Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Popup fate** | Keep as minimal fallback | Users need interaction on non-Coursera tabs |
| **Minimized state** | Contextual pill (52×32px capsule) with icon + text | More informative than a plain circle |
| **Expanded state** | 320px floating card panel | Matches current popup density |
| **Settings** | Full in-page overlay + keep options.html as fallback | In-context was the core request |
| **Position** | Bottom-right, draggable, snap-to-edge, persisted | Standard floating widget UX |
| **Theme** | System `prefers-color-scheme` | Matches existing behavior |
| **Entry point** | Module imported by content.ts | Shared scope avoids message-passing overhead |
| **CSS** | CSS-in-TS template literals in Shadow DOM | No webpack changes, styles co-located |
| **Shadow DOM** | `mode: 'closed'` | Prevents Coursera scripts from accessing internals |

---

## Scope

### In Scope
- Floating widget (contextual pill + expandable panel) on Coursera pages
- Settings overlay with full options.html feature parity
- Slim popup redesign (minimal fallback)
- Dark/light theme via CSS custom properties
- Drag, snap-to-edge, position persistence
- Smooth animations (expand/collapse, overlay, stat counters)
- Accessibility (ARIA, keyboard nav, focus trap, reduced motion)
- First-time onboarding (FAB tooltip, settings banner)
- All existing functionality preserved

### Out of Scope
- Framework migration (stays vanilla TS)
- Backend/service worker changes
- New AI providers or features
- Mobile layouts
- Installer, website, workers changes
- New keyboard shortcuts

---

## New File Structure

```
extension/src/
  ui/                          ← NEW DIRECTORY
    widget-types.ts            ← UI interfaces and event types
    widget-state.ts            ← Reactive state store (EventTarget pub/sub)
    widget-styles.ts           ← All CSS as template literal exports
    widget-host.ts             ← Shadow DOM container, drag engine, lifecycle
    widget-fab.ts              ← Minimized contextual pill
    widget-panel.ts            ← Expanded panel with all sections
    settings-overlay.ts        ← Full settings modal with backdrop
```

---

## Tasks

### Phase 0: Foundation & State Management

#### Task 0.1: Create UI Type Definitions
- **Files**: `src/ui/widget-types.ts` (new)
- **Action**: Define interfaces:
  - `WidgetState` — `isExpanded`, `isEnabled`, `status` (idle|processing|active|error|disabled), `provider`, `model`, `confidence`, `solvedCount`, `failedCount`, `tokenCount`, `lastError`, `isSettingsOpen`, `processingCount`
  - `WidgetPosition` — `x: number`, `y: number`, `edge: 'left' | 'right'`
  - `PillState` — derived view-model for the FAB (text, color, icon, animation)
  - Event type union for store subscriptions
- **Acceptance criteria**: All types compile. No circular deps. Imported by all ui/ modules.
- **Dependencies**: None
- **Route to**: @kagutsuchi

#### Task 0.2: Build Reactive State Store
- **Files**: `src/ui/widget-state.ts` (new)
- **Action**: `WidgetStore` class extending `EventTarget`:
  - `get()` / `get(key)` / `set(partial)` / `subscribe(key, cb)` / `subscribeMany(keys[], cb)`
  - Granular CustomEvent dispatch per changed key
  - Bidirectional chrome.storage sync (local for settings, session for runtime state)
  - `chrome.storage.onChanged` listener for external mutations
  - Derived `pillState` that recomputes when underlying state changes
- **Acceptance criteria**: Granular subscriptions. External storage changes reflected. No polling. Unit-testable.
- **Dependencies**: Task 0.1
- **Route to**: @kagutsuchi

#### Task 0.3: Build CSS Style Module
- **Files**: `src/ui/widget-styles.ts` (new)
- **Action**: Export CSS as template literals:
  - `CUSTOM_PROPERTIES` (--ac-brand, --ac-bg, --ac-surface, --ac-text, etc.)
  - `FAB_STYLES`, `PANEL_STYLES`, `OVERLAY_STYLES`, `ANIMATION_STYLES`
  - `DARK_THEME` via @media (prefers-color-scheme: dark)
  - All animations wrapped in `@media (prefers-reduced-motion: no-preference)`
  - Export `getWidgetStyleSheet(): string`
- **Acceptance criteria**: Valid CSS. Custom properties everywhere. Dark mode. Reduced motion support.
- **Dependencies**: None
- **Route to**: @kagutsuchi

---

### Phase 1: Core Floating Widget

#### Task 1.1: Build WidgetHost (Shadow DOM + Drag Engine)
- **Files**: `src/ui/widget-host.ts` (new)
- **Action**: `WidgetHost` class:
  - Shadow DOM: `<div id="auto-coursera-root">` → `attachShadow({ mode: 'closed' })` → inject CSS
  - Lifecycle: `mount(contentBridge)` / `unmount()`
  - Drag engine: pointerdown/move/up, RAF, viewport constraint, snap-to-edge, position persistence in chrome.storage.local
  - Click vs drag threshold (4px)
  - State coordination: fab↔panel↔overlay transitions
  - `z-index: 2147483647`, `position: fixed`
  - Viewport resize handling
- **Acceptance criteria**: Shadow DOM isolated. Drag smooth (60fps). Position persists. Click vs drag works. Full cleanup on unmount.
- **Dependencies**: Task 0.2, Task 0.3
- **Route to**: @kagutsuchi

#### Task 1.2: Build FloatingFab (Contextual Pill)
- **Files**: `src/ui/widget-fab.ts` (new)
- **Action**: `FloatingFab` class:
  - 52×32px capsule `<button>` with brand icon + status text
  - Reactive updates from store's derived `pillState` (5 states: disabled, idle, processing, active, error)
  - Shimmer animation (processing), green flash (done), pulse (error)
  - First-visit tooltip ("👋 Click to get started", once)
  - Accessibility: role, aria-label, tabindex, keyboard activation
  - Methods: `render()`, `update(pillState)`, `destroy()`
- **Acceptance criteria**: All 5 states render. Animations run. Tooltip once. Keyboard accessible. Screen reader support.
- **Dependencies**: Task 0.2, Task 0.3
- **Route to**: @kagutsuchi

#### Task 1.3: Build WidgetPanel (Expanded Card)
- **Files**: `src/ui/widget-panel.ts` (new)
- **Action**: `WidgetPanel` class (320×480px card):
  - Header: brand, status badge, progress bar (processing), minimize (─), close (✕)
  - Toggle row (enable/disable → chrome.storage.local)
  - Error banner (user-friendly, click-to-copy)
  - Status section (provider, model, confidence)
  - Stats grid (solved/failed/tokens, animated counters)
  - Actions (scan, retry — via ContentBridge)
  - Footer (⚙️ Settings → overlay)
  - Show/hide animation (slide + fade)
  - Onboarding callout (no API keys)
- **Acceptance criteria**: Full popup feature parity. Toggle syncs. Scan/retry work. Error copies. Stats animate. Minimize→FAB. Close→hide. Progress bar.
- **Dependencies**: Task 0.2, Task 0.3, Task 1.1
- **Route to**: @kagutsuchi

---

### Phase 2: Settings Overlay

#### Task 2.1: Build SettingsOverlay Component
- **Files**: `src/ui/settings-overlay.ts` (new)
- **Action**: `SettingsOverlay` class inside Shadow DOM:
  - Backdrop: full viewport, blur+dim, click-to-close
  - Card: 480px max-width, 85vh max-height, scrollable
  - Header: "Settings" + close ✕
  - API Keys: 5 password inputs with mask (last 4 chars)
  - Models: 5 dropdowns (OpenRouter with optgroups, others from constants)
  - Provider Priority: 5 radio buttons
  - Behavior: confidence slider, auto-select, auto-start checkboxes
  - Buttons: Save (→ saveSettings()) + Test Connection (→ background message)
  - Status message (success/error, auto-dismiss)
  - Onboarding banner (first time, no keys)
  - Focus trap, Escape close, unsaved changes detection
  - Open/close animation (backdrop fade + card scale)
- **Acceptance criteria**: All options.html features. Keys save correctly. Dropdowns populated. Focus trapped. Unsaved changes prompt. Scrollable.
- **Dependencies**: Task 0.2, Task 0.3, Task 1.1
- **Route to**: @kagutsuchi

---

### Phase 3: Integration

#### Task 3.1: Wire Widget into content.ts
- **Files**: `src/content/content.ts` (modify)
- **Action**:
  - ContentBridge interface: `{ scan(), retry(), refresh() }`
  - Create WidgetStore + WidgetHost in init()
  - Feed state: isEnabled, processing (with count), active, error
  - SPA nav: reset state, don't remount widget
- **Acceptance criteria**: Widget on Coursera pages. Real-time state. Actions work. Toggle syncs. No duplicate widgets on SPA nav.
- **Dependencies**: Phase 1, Phase 2
- **Route to**: @kagutsuchi

#### Task 3.2: Extract Shared Utilities
- **Files**: `src/utils/error-messages.ts` (new), `src/popup/popup.ts` (modify), `src/ui/widget-panel.ts` (modify)
- **Action**: Move ERROR_PATTERNS + getUserFriendlyError() to shared module.
- **Acceptance criteria**: No duplication. Both consumers import same source.
- **Dependencies**: Task 1.3
- **Route to**: @ariadne

#### Task 3.3: Verify Message Flow Compatibility
- **Files**: All (read-only)
- **Action**: Verify popup→content, background→storage→store, keyboard shortcuts, test-connection from overlay.
- **Acceptance criteria**: All paths working. No regressions.
- **Dependencies**: Task 3.1
- **Route to**: @durga

---

### Phase 4: Popup Redesign

#### Task 4.1: Slim Down Popup
- **Files**: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.ts` (all modify)
- **Action**: Header + toggle. Context-aware body (Coursera → stats + actions; non-Coursera → navigate message). Footer → settings. New design language. ≤200px.
- **Acceptance criteria**: Works on all tabs. Context detection. Matches design. Compact.
- **Dependencies**: Task 0.3
- **Route to**: @kagutsuchi

---

### Phase 5: Build Configuration

#### Task 5.1: Update Webpack & Manifest
- **Files**: `webpack.config.js` (if needed), `manifest.json` (if needed)
- **Action**: Verify path resolution. Check web_accessible_resources. Bundle size (<150KB, else dynamic import). Build verification.
- **Acceptance criteria**: Build succeeds. Output correct. Size acceptable.
- **Dependencies**: Phase 3
- **Route to**: @kagutsuchi

---

### Phase 6: Quality Assurance

#### Task 6.1: Visual QA — Themes & Isolation
- All states × both themes × multiple page types. Zero style leakage. Reduced motion.
- **Route to**: @durga

#### Task 6.2: Functional QA — Full Feature Parity
- 23-item checklist: toggle, scan, retry, refresh, error, stats, settings (all fields), onboarding, shortcuts, SPA nav, widget-popup sync.
- **Route to**: @durga

#### Task 6.3: Interaction QA — Drag, Position, Accessibility
- Drag/snap/persist. Click vs drag. Keyboard. Screen reader. Focus trap. Reduced motion.
- **Route to**: @durga

#### Task 6.4: Unit Tests
- **Files**: `tests/unit/widget-state.test.ts`, `tests/unit/error-messages.test.ts` (both new)
- WidgetStore tests (≥8 cases). Error message tests (≥6 cases). All existing pass.
- **Route to**: @kagutsuchi

---

### Phase 7: Documentation

#### Task 7.1: Extension CHANGELOG.md — Added/Changed/Deprecated sections
- **Route to**: @bragi

#### Task 7.2: Extension README.md — Feature descriptions, widget docs
- **Route to**: @bragi

#### Task 7.3: docs/ARCHITECTURE.md — ui/ module, Shadow DOM, WidgetStore, ContentBridge
- **Route to**: @bragi

---

## Dependency Graph

```
Phase 0 ──────────────────────────────────────────
  T0.1 Types ──┐
  T0.2 State ──┼──┐
  T0.3 Styles ─┘  │
                   │
Phase 1            │   Phase 2          Phase 4
  T1.1 Host ◄─────┤   T2.1 Overlay     T4.1 Popup ◄── T0.3
  T1.2 FAB  ◄─────┤
  T1.3 Panel ◄────┘
       │
Phase 3
  T3.1 Wire ◄── Phase 1 + Phase 2
  T3.2 Shared utils ◄── T1.3
  T3.3 Verify ◄── T3.1

Phase 5 ◄── Phase 3

Phase 6 ◄── Phase 5 (all parallel: T6.1–T6.4)

Phase 7 ◄── Phase 6 (all parallel: T7.1–T7.3)
```

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Shadow DOM event leakage | High | Medium | `mode: 'closed'`, no `composed: true` on widget events |
| Content.js bundle bloat | Medium | High | Target <150KB. Dynamic import() for panel+overlay if exceeded |
| z-index wars with Coursera | Medium | Medium | Max z-index + Shadow DOM stacking context |
| Drag conflicts with scroll | Low | Medium | `touch-action: none` + `preventDefault()` during drag |
| Options.html + overlay desync | Medium | Low | Both use chrome.storage + onChanged listener |
| SPA nav orphans widget | High | Medium | Widget persists, only state resets |
| Model dropdown data duplication | Medium | Certain | Extract to constants.ts or build programmatically |

---

## Estimated Effort

| Component | Lines |
|-----------|-------|
| New TypeScript (7 ui/ files + 1 shared util) | ~1,690 |
| Modified files (content.ts, popup.*, webpack, manifest) | ~210 |
| New tests | ~100 |
| **Total** | **~2,000 lines** |

---

## Agent Routing

| Agent | Tasks |
|-------|-------|
| **@kagutsuchi** | T0.1–T0.3, T1.1–T1.3, T2.1, T3.1, T4.1, T5.1, T6.4 |
| **@ariadne** | T3.2 |
| **@durga** | T3.3, T6.1–T6.3 |
| **@bragi** | T7.1–T7.3 |

---

## Execution Recommendation

**Use `@odin`** to orchestrate the full plan, or **`@vishnu`** for Phases 0–5 (deep implementation), then `@durga` for Phase 6, `@bragi` for Phase 7.

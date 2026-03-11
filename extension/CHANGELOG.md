# Changelog — Auto-Coursera Extension

All notable changes to the browser extension are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.9.1] — 2026-03-11

### Changed
- **Release metadata alignment** — `manifest.json` and package versioning now advance to `1.9.1` so the published extension artifact stays in lockstep with the canonical release line used by the website update manifest and installer distribution surfaces

## [1.8.0] — 2026-03-10


### Added
- **Settings overlay wiring** — popup Settings link now opens the in-page settings overlay on Coursera tabs via `OPEN_SETTINGS` Chrome message, with fallback to legacy options page on non-Coursera tabs or when the content script isn't loaded
- **Scoped runtime-state message flow** — `REGISTER_PAGE_CONTEXT`, `CANCEL_PAGE_WORK`, `REPORT_APPLY_OUTCOME`, `REPORT_PAGE_ERROR`, and `TEST_CONNECTION` are now wired end to end for the extension runtime lifecycle
- **UI foundation files** (`src/ui/`) — Phase 0 of the floating widget redesign:
  - `widget-types.ts` — Type definitions for widget state, derived pill view-model, position persistence, and content bridge interface
  - `widget-state.ts` — Reactive state store (`WidgetStore`) built on `EventTarget` with granular pub/sub, chrome.storage bidirectional sync, derived `PillState`, and position persistence
  - `widget-styles.ts` — Complete CSS-in-TS stylesheet for Shadow DOM injection: design tokens, light/dark theming via `prefers-color-scheme`, FAB pill (5 state variants), expandable panel, settings overlay, animations gated by `prefers-reduced-motion`, and utility classes
- **Floating widget components** (`src/ui/`) — Phases 1 & 2 of the widget redesign:
  - `widget-fab.ts` — Contextual pill FAB with 5 reactive visual states (disabled/idle/processing/active/error), first-visit tooltip ("👋 Click to get started"), and ARIA accessibility
  - `widget-panel.ts` — Expanded 320×480px panel with toggle, error banner (user-friendly error pattern mapping), onboarding banner, status info, animated stat counters, Scan/Retry action buttons via ContentBridge, and Settings footer link
  - `settings-overlay.ts` — Full settings modal with API key inputs (masked values, last-4-char reveal), model dropdowns (OpenRouter & NVIDIA with exact optgroup replicas from options.html, Gemini/Groq/Cerebras from constants), provider priority radios, behavior controls (confidence slider, auto-select, auto-start), Save/Test Connection, focus trap, Escape close, and unsaved changes detection
  - `widget-host.ts` — Shadow DOM container (`mode: 'closed'`) with drag engine (4px click-vs-drag threshold, RAF-based 60fps, viewport constraining, snap-to-nearest-edge with animation, position persistence), state transitions (FAB↔Panel↔Overlay), keyboard navigation, and viewport resize handling
- **Shared error message utility** (`src/utils/error-messages.ts`) — extracted `getUserFriendlyError()` and `ERROR_PATTERNS` into a shared module, replacing duplicate implementations in popup and widget panel

### Changed
- **Scoped-only runtime UI readers** — the popup now reads active-tab scoped runtime state directly, and the floating widget binds to the current page scope instead of legacy flattened session summary keys
- **Background-owned runtime state** — the service worker now owns per-tab/page runtime scopes, persists runtime truth only in scoped session maps, and requires `runtimeContext` on `SOLVE_BATCH` requests while returning the originating `requestId`
- **Dedicated connection tests** — the settings overlay and options page now use `TEST_CONNECTION` with staged form values instead of piggybacking on `SOLVE_QUESTION`
- **Shared settings-domain ownership** — provider metadata/catalogs, masked-key resolution, staged save/test payload assembly, and onboarding semantics now live in `src/settings/domain.ts`; the in-page overlay and fallback options page act as thin hosts around that shared logic
- **Fallback options page is now a thin shell** — `options.html` no longer hardcodes provider/model catalogs or provider-priority radios; `options.ts` renders them from shared settings metadata at runtime
- **Unified onboarding semantics** — the settings overlay, fallback options page, and widget panel now all treat onboarding as complete when any API key is configured, replacing the previous split between `onboarded` storage state and raw key presence
- **Centralized scattered constants** — moved 20+ magic values from individual source files into `utils/constants.ts` with clear section grouping (image pipeline, content script, service worker lifecycle, prompt engine, AI parameters, circuit breaker, response parser, color palette, click verification)
- **Shared provider key mapping** — added `PROVIDER_KEY_MAP` to `types/settings.ts`, replacing duplicate provider-to-key mappings in `popup.ts` and `background.ts`
- **Replaced hardcoded settings defaults** — `content.ts` and `selector.ts` now reference `DEFAULT_SETTINGS` from `types/settings.ts` instead of inline magic numbers
- **Unified color palette** — consolidated six color hex values into `COLORS` constant, used across `selector.ts`, `background.ts`, and `popup.ts`
- **Content script wired to floating widget** (`src/content/content.ts`) — creates `ContentBridge` (scan/retry/refresh) and mounts `WidgetHost` in a try/catch after existing initialization; existing popup→content message flow preserved
- **Widget panel uses shared error utility** (`src/ui/widget-panel.ts`) — replaced local `ERROR_PATTERNS` and `getUserFriendlyError` with import from `src/utils/error-messages.ts`
- **Popup redesigned as slim fallback** (`src/popup/`) — context-aware view: shows status, stats, and scan/retry on Coursera pages; shows guidance message on non-Coursera pages; removed provider/model/confidence display (now in floating widget panel); removed Refresh button and onboarding hint (replaced by widget panel); narrowed to 300px; compact horizontal stats with color-coded icons
- **Release-status documentation** — the extension changelog and README now describe the `v1.8.0` release line, including the floating widget, slim popup fallback, and scoped runtime-state model shipped in this release

### Architecture
- New `src/ui/` module with 7 files: `widget-types`, `widget-state`, `widget-styles`, `widget-host`, `widget-fab`, `widget-panel`, `settings-overlay`
- CSS-in-TypeScript approach for Shadow DOM style injection — styles co-located with components, injected at mount time
- ContentBridge pattern for widget ↔ content script communication — scan, retry, and refresh actions delegated without message-passing overhead
- Closed Shadow DOM (`mode: 'closed'`) prevents Coursera page scripts from accessing extension internals
- Content.js bundle: 80.4 KiB (from ~25 KiB) — includes full UI system with zero new dependencies
- All 196 existing tests pass; full accessibility with 26 ARIA attributes, focus trap, and reduced motion support

### Fixed
- **Obsolete runtime tombstone cleanup removed** — `RuntimeStateManager` no longer performs write-time deletion of legacy `_last*` / aggregate session keys now that no product code reads them; scoped runtime maps remain the sole runtime source of truth
- **Widget onboarding normalization parity** — the floating widget now reads onboarding state through the shared normalized settings-domain view, so corrupt or non-decryptable encrypted API key blobs no longer count as configured keys
- Widget FAB not appearing on page load when storage sync fails
- `derivePillState` crash on unexpected runtime status values
- Session storage failure crashing widget initialization chain
- Enabled extension showing "Off" state after session restart
- Popup Settings link ignoring overlay failure response
- URL detection mismatch between popup and manifest content script patterns
- Widget host reference set before successful mount completion
- **Solve runtimeContext validation hardening** — `SOLVE_BATCH` now rejects malformed `pageInstanceId`/`pageUrl` values before scope resolution, and `SOLVE_QUESTION` rejects malformed optional `runtimeContext` instead of creating garbage scoped state
- **OpenRouter URL inconsistency (C4)** — `callAPI()` override hardcoded URL via `` `${API_URLS.OPENROUTER}/chat/completions` `` instead of using `this.apiUrl` like every other provider; now sets `protected apiUrl` and `displayName` fields consistent with Cerebras, Groq, Gemini, and NVIDIA NIM patterns
- **Scoped runtime follow-up hardening** — removed non-background `_lastStatus` writers, added closed-tab scope cleanup, added timed recovery for solved batches that never report apply outcome, closed the disable-time batch-apply race in the content script, and added direct `SOLVE_BATCH` runtime contract tests (requestId echo, invalid scope rejection, and cancellation path)
- **README metadata alignment** — removed remaining `v1.8.0` pre-release wording and corrected the public README's license and Biome lint references

### Removed
- **Legacy runtime bridge projection** — background runtime persistence no longer writes flattened `_last*` or aggregate counter keys into `chrome.storage.session`; scoped runtime maps are now the only product runtime truth
- **Dead single-question/status contracts** — removed unused `GET_STATUS`, `SOLVE_QUESTION`, and `SOLVE_IMAGE_QUESTION` message contracts and the orphaned single-question solve path from product code
- **Dead settings fetch contract** — removed unused `GET_SETTINGS` message plumbing after both first-party settings surfaces were consolidated onto the shared settings-domain module

---

## [1.7.5] — 2026-03-09

### Added
- **Multi-provider AI support** — OpenRouter, NVIDIA NIM, Gemini, Groq, Cerebras
- Base provider abstraction (`base-provider.ts`) for unified AI interaction
- AI provider factory (`ai-provider.ts`) with automatic provider selection
- **Prompt engine** (`prompt-engine.ts`) — question-type-aware prompt construction
- **Response parser** (`response-parser.ts`) — structured answer extraction from LLM output
- **Image pipeline** (`image-pipeline.ts`) — captures and encodes question images for vision models
- **Content detection** — automatic quiz/assignment page detection on Coursera
- **Question extractor** — parses MCQ, checkbox, text, and dropdown question formats
- **Answer selector** (`selector.ts`) — programmatic answer selection in page DOM
- **Circuit breaker** (`circuit-breaker.ts`) — fault tolerance for API calls
- **Rate limiter** (`rate-limiter.ts`) — per-provider request throttling
- Background service worker with message router (`background.ts`, `router.ts`)
- Popup UI with provider status, scan controls, and keyboard shortcut hints
- Options page for API key configuration and provider selection
- Injected CSS for answer highlight styling (`inject.css`)
- Keyboard shortcuts: `Alt+Shift+C` (popup), `Alt+Shift+S` (scan page)
- Chrome storage wrapper (`storage.ts`) with typed settings
- Structured logging utility (`logger.ts`)
- Full unit test suite (16 test files) with Vitest
- Chrome mock setup for test environment (`tests/mocks/chrome.ts`)

### Technical
- Chrome Manifest V3 with service worker architecture
- TypeScript strict mode, Webpack bundling
- Biome for formatting, ESLint for linting
- Supports `coursera.org` host with CloudFront CDN image access

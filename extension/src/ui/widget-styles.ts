/**
 * Widget CSS styles — exported as template literal strings for injection
 * into the Shadow DOM. Each section is exported individually for testing
 * and combined via getWidgetStyleSheet() for production use.
 *
 * Design principles:
 *   - CSS custom properties on :host for theming
 *   - Light theme default, dark via prefers-color-scheme
 *   - All animations gated by prefers-reduced-motion
 *   - No external dependencies — self-contained in Shadow DOM
 *   - BEM-ish naming: .ac-{component}--{modifier}
 */

// ── Reset ───────────────────────────────────────────────────────

/** Minimal CSS reset scoped to the Shadow DOM */
export const RESET_STYLES = /* css */ `
*,
*::before,
*::after {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

:host {
	all: initial;
	display: block;
	font-family: var(--ac-font);
	font-size: 14px;
	line-height: 1.5;
	color: var(--ac-text);
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

button {
	font-family: inherit;
	font-size: inherit;
	cursor: pointer;
	border: none;
	background: none;
	color: inherit;
	outline: none;
}

input,
select {
	font-family: inherit;
	font-size: inherit;
	color: inherit;
}

a {
	color: var(--ac-brand);
	text-decoration: none;
}
`;

// ── Custom Properties ───────────────────────────────────────────

/** Design tokens as CSS custom properties on :host — light theme default */
export const CUSTOM_PROPERTIES = /* css */ `
:host {
	--ac-brand: #0056d2;
	--ac-brand-hover: #004bb5;
	--ac-brand-light: rgba(0, 86, 210, 0.1);
	--ac-bg: #ffffff;
	--ac-surface: #f8f9fa;
	--ac-surface-hover: #f0f1f2;
	--ac-text: #1a1a2e;
	--ac-text-secondary: #666666;
	--ac-text-muted: #999999;
	--ac-border: #e0e0e0;
	--ac-success: #22c55e;
	--ac-success-light: rgba(34, 197, 94, 0.1);
	--ac-warning: #eab308;
	--ac-warning-light: rgba(234, 179, 8, 0.1);
	--ac-error: #ef4444;
	--ac-error-light: rgba(239, 68, 68, 0.1);
	--ac-processing: #94a3b8;
	--ac-processing-light: rgba(148, 163, 184, 0.1);
	--ac-radius: 12px;
	--ac-radius-sm: 8px;
	--ac-radius-xs: 4px;
	--ac-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
	--ac-shadow-lg: 0 8px 48px rgba(0, 0, 0, 0.16);
	--ac-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08);
	--ac-transition: 200ms ease;
	--ac-transition-slow: 300ms ease;
	--ac-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
		"Helvetica Neue", Arial, sans-serif;
	--ac-z-fab: 2147483647;
	--ac-z-panel: 2147483646;
	--ac-z-overlay: 2147483647;
}

@media (prefers-color-scheme: dark) {
	:host {
		--ac-brand: #6d9eeb;
		--ac-brand-hover: #5b8dd9;
		--ac-brand-light: rgba(109, 158, 235, 0.15);
		--ac-bg: #1a1a2e;
		--ac-surface: #2d2d44;
		--ac-surface-hover: #363652;
		--ac-text: #e0e0e0;
		--ac-text-secondary: #a0a0b0;
		--ac-text-muted: #707080;
		--ac-border: #404060;
		--ac-success-light: rgba(34, 197, 94, 0.15);
		--ac-warning-light: rgba(234, 179, 8, 0.15);
		--ac-error-light: rgba(239, 68, 68, 0.15);
		--ac-processing-light: rgba(148, 163, 184, 0.15);
		--ac-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
		--ac-shadow-lg: 0 8px 48px rgba(0, 0, 0, 0.4);
		--ac-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
	}
}
`;

// ── FAB Styles ──────────────────────────────────────────────────

/** Floating pill button — the minimized widget state */
export const FAB_STYLES = /* css */ `
.ac-fab {
	position: fixed;
	z-index: var(--ac-z-fab);
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 52px;
	height: 32px;
	padding: 0 12px;
	border: none;
	border-radius: 16px;
	cursor: pointer;
	user-select: none;
	white-space: nowrap;
	font-size: 13px;
	font-weight: 600;
	font-family: var(--ac-font);
	line-height: 1;
	color: #ffffff;
	box-shadow: var(--ac-shadow);
	transition:
		transform var(--ac-transition),
		box-shadow var(--ac-transition),
		background-color var(--ac-transition),
		opacity var(--ac-transition);
	touch-action: none;
}

.ac-fab:hover {
	transform: translateY(-1px);
	box-shadow: var(--ac-shadow-lg);
}

.ac-fab:active {
	transform: translateY(0) scale(0.97);
}

.ac-fab:focus-visible {
	outline: 2px solid var(--ac-brand);
	outline-offset: 2px;
}

.ac-fab__icon {
	font-size: 16px;
	line-height: 1;
	flex-shrink: 0;
}

.ac-fab__text {
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.01em;
}

/* ── FAB State Variants ────────────────────────────────── */

.ac-fab--disabled {
	background: var(--ac-processing);
	opacity: 0.7;
}

.ac-fab--idle {
	background: var(--ac-brand);
}

.ac-fab--processing {
	background: var(--ac-brand);
	position: relative;
	overflow: hidden;
}

.ac-fab--active {
	background: var(--ac-success);
}

.ac-fab--error {
	background: var(--ac-error);
}

/* ── Drag State ────────────────────────────────────────── */

.ac-fab--dragging {
	cursor: grabbing;
	opacity: 0.9;
	box-shadow: var(--ac-shadow-lg);
}

.ac-fab--dragging:hover {
	transform: none;
}

/* ── First-Visit Tooltip ───────────────────────────────── */

.ac-fab-tooltip {
	position: absolute;
	bottom: calc(100% + 8px);
	right: 0;
	background: var(--ac-bg);
	color: var(--ac-text);
	padding: 8px 12px;
	border-radius: var(--ac-radius-sm);
	box-shadow: var(--ac-shadow);
	font-size: 13px;
	font-weight: 500;
	white-space: nowrap;
	pointer-events: none;
	opacity: 0;
	transform: translateY(4px);
	transition:
		opacity var(--ac-transition),
		transform var(--ac-transition);
}

.ac-fab-tooltip--visible {
	opacity: 1;
	transform: translateY(0);
	pointer-events: auto;
}

.ac-fab-tooltip::after {
	content: '';
	position: absolute;
	top: 100%;
	right: 16px;
	border: 6px solid transparent;
	border-top-color: var(--ac-bg);
}
`;

// ── Panel Styles ────────────────────────────────────────────────

/** Expanded panel card — 320px wide, anchored to FAB position */
export const PANEL_STYLES = /* css */ `
.ac-panel {
	position: fixed;
	z-index: var(--ac-z-panel);
	width: 320px;
	max-height: 480px;
	background: var(--ac-bg);
	border: 1px solid var(--ac-border);
	border-radius: var(--ac-radius);
	box-shadow: var(--ac-shadow-lg);
	overflow: hidden;
	display: flex;
	flex-direction: column;
	opacity: 0;
	transform: translateY(8px) scale(0.96);
	transition:
		opacity var(--ac-transition),
		transform var(--ac-transition);
	pointer-events: none;
}

.ac-panel--open {
	opacity: 1;
	transform: translateY(0) scale(1);
	pointer-events: auto;
}

/* ── Panel Header ──────────────────────────────────────── */

.ac-panel__header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px 16px;
	border-bottom: 1px solid var(--ac-border);
	background: var(--ac-surface);
	position: relative;
}

.ac-panel__brand {
	font-size: 16px;
	line-height: 1;
}

.ac-panel__title {
	font-size: 14px;
	font-weight: 700;
	color: var(--ac-text);
	flex: 1;
}

.ac-panel__status-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 8px;
	border-radius: 10px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.ac-panel__status-badge--active {
	background: var(--ac-success-light);
	color: var(--ac-success);
}

.ac-panel__status-badge--idle {
	background: var(--ac-processing-light);
	color: var(--ac-processing);
}

.ac-panel__status-badge--processing {
	background: var(--ac-brand-light);
	color: var(--ac-brand);
}

.ac-panel__status-badge--error {
	background: var(--ac-error-light);
	color: var(--ac-error);
}

.ac-panel__status-badge--disabled {
	background: var(--ac-processing-light);
	color: var(--ac-text-muted);
}

.ac-panel__status-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}

.ac-panel__minimize {
	width: 28px;
	height: 28px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--ac-radius-xs);
	color: var(--ac-text-secondary);
	transition: background var(--ac-transition);
}

.ac-panel__minimize:hover {
	background: var(--ac-surface-hover);
}

/* ── Progress Bar ──────────────────────────────────────── */

.ac-panel__progress {
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 2px;
	background: var(--ac-border);
	overflow: hidden;
}

.ac-panel__progress-bar {
	height: 100%;
	width: 30%;
	background: var(--ac-brand);
	border-radius: 1px;
}

/* ── Panel Body ────────────────────────────────────────── */

.ac-panel__body {
	flex: 1;
	overflow-y: auto;
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.ac-panel__body::-webkit-scrollbar {
	width: 4px;
}

.ac-panel__body::-webkit-scrollbar-track {
	background: transparent;
}

.ac-panel__body::-webkit-scrollbar-thumb {
	background: var(--ac-border);
	border-radius: 2px;
}

/* ── Toggle Row ────────────────────────────────────────── */

.ac-toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	background: var(--ac-surface);
	border-radius: var(--ac-radius-sm);
}

.ac-toggle-row__label {
	font-size: 14px;
	font-weight: 600;
	color: var(--ac-text);
}

.ac-toggle {
	position: relative;
	width: 44px;
	height: 24px;
	background: var(--ac-border);
	border-radius: 12px;
	cursor: pointer;
	transition: background var(--ac-transition);
}

.ac-toggle--on {
	background: var(--ac-brand);
}

.ac-toggle__thumb {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 20px;
	height: 20px;
	background: #ffffff;
	border-radius: 50%;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	transition: transform var(--ac-transition);
}

.ac-toggle--on .ac-toggle__thumb {
	transform: translateX(20px);
}

/* ── Error Banner ──────────────────────────────────────── */

.ac-error-banner {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 10px 12px;
	background: var(--ac-error-light);
	border: 1px solid var(--ac-error);
	border-radius: var(--ac-radius-sm);
	cursor: pointer;
	transition: background var(--ac-transition);
}

.ac-error-banner:hover {
	background: rgba(239, 68, 68, 0.15);
}

.ac-error-banner__icon {
	font-size: 14px;
	flex-shrink: 0;
	line-height: 1.4;
}

.ac-error-banner__text {
	font-size: 12px;
	color: var(--ac-error);
	line-height: 1.4;
	word-break: break-word;
}

.ac-error-banner__hint {
	font-size: 11px;
	color: var(--ac-text-secondary);
	margin-top: 2px;
}

/* ── Status Section ────────────────────────────────────── */

.ac-status {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.ac-status__row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 13px;
}

.ac-status__label {
	color: var(--ac-text-secondary);
	font-weight: 500;
}

.ac-status__value {
	color: var(--ac-text);
	font-weight: 600;
	text-align: right;
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* ── Stats Grid ────────────────────────────────────────── */

.ac-stats {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
}

.ac-stat {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	padding: 10px 4px;
	background: var(--ac-surface);
	border-radius: var(--ac-radius-sm);
	text-align: center;
}

.ac-stat__value {
	font-size: 20px;
	font-weight: 700;
	line-height: 1;
	font-variant-numeric: tabular-nums;
}

.ac-stat__value--success {
	color: var(--ac-success);
}

.ac-stat__value--error {
	color: var(--ac-error);
}

.ac-stat__value--info {
	color: var(--ac-brand);
}

.ac-stat__label {
	font-size: 11px;
	color: var(--ac-text-secondary);
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

/* ── Action Buttons ────────────────────────────────────── */

.ac-actions {
	display: flex;
	gap: 8px;
}

.ac-btn {
	flex: 1;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 8px 12px;
	border-radius: var(--ac-radius-sm);
	font-size: 13px;
	font-weight: 600;
	transition:
		background var(--ac-transition),
		transform var(--ac-transition),
		opacity var(--ac-transition);
}

.ac-btn:active {
	transform: scale(0.97);
}

.ac-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.ac-btn:disabled:active {
	transform: none;
}

.ac-btn--primary {
	background: var(--ac-brand);
	color: #ffffff;
}

.ac-btn--primary:hover:not(:disabled) {
	background: var(--ac-brand-hover);
}

.ac-btn--secondary {
	background: var(--ac-surface);
	color: var(--ac-text);
	border: 1px solid var(--ac-border);
}

.ac-btn--secondary:hover:not(:disabled) {
	background: var(--ac-surface-hover);
}

.ac-btn__icon {
	font-size: 14px;
	line-height: 1;
}

/* ── Panel Footer ──────────────────────────────────────── */

.ac-panel__footer {
	padding: 10px 16px;
	border-top: 1px solid var(--ac-border);
	display: flex;
	align-items: center;
}

.ac-panel__settings-link {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 500;
	color: var(--ac-text-secondary);
	cursor: pointer;
	padding: 4px 0;
	transition: color var(--ac-transition);
}

.ac-panel__settings-link:hover {
	color: var(--ac-brand);
}

.ac-panel__settings-link__icon {
	font-size: 14px;
}

/* ── Onboarding Callout ────────────────────────────────── */

.ac-onboarding {
	padding: 12px;
	background: var(--ac-brand-light);
	border: 1px solid var(--ac-brand);
	border-radius: var(--ac-radius-sm);
	text-align: center;
}

.ac-onboarding__text {
	font-size: 13px;
	color: var(--ac-text);
	line-height: 1.5;
}

.ac-onboarding__cta {
	display: inline-block;
	margin-top: 8px;
	padding: 6px 16px;
	background: var(--ac-brand);
	color: #ffffff;
	border-radius: var(--ac-radius-sm);
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: background var(--ac-transition);
}

.ac-onboarding__cta:hover {
	background: var(--ac-brand-hover);
}
`;

// ── Overlay Styles ──────────────────────────────────────────────

/** Full-viewport settings overlay with backdrop */
export const OVERLAY_STYLES = /* css */ `

/* ── Backdrop ──────────────────────────────────────────── */

.ac-overlay {
	position: fixed;
	inset: 0;
	z-index: var(--ac-z-overlay);
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(4px);
	-webkit-backdrop-filter: blur(4px);
	opacity: 0;
	transition: opacity var(--ac-transition-slow);
	pointer-events: none;
}

.ac-overlay--open {
	opacity: 1;
	pointer-events: auto;
}

/* ── Overlay Card ──────────────────────────────────────── */

.ac-overlay__card {
	width: 480px;
	max-width: calc(100vw - 32px);
	max-height: 85vh;
	background: var(--ac-bg);
	border: 1px solid var(--ac-border);
	border-radius: var(--ac-radius);
	box-shadow: var(--ac-shadow-lg);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	transform: scale(0.95);
	transition: transform var(--ac-transition-slow);
}

.ac-overlay--open .ac-overlay__card {
	transform: scale(1);
}

/* ── Overlay Header ────────────────────────────────────── */

.ac-overlay__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 16px 20px;
	border-bottom: 1px solid var(--ac-border);
	background: var(--ac-surface);
}

.ac-overlay__title {
	font-size: 18px;
	font-weight: 700;
	color: var(--ac-text);
}

.ac-overlay__close {
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: var(--ac-radius-xs);
	font-size: 18px;
	color: var(--ac-text-secondary);
	transition:
		background var(--ac-transition),
		color var(--ac-transition);
}

.ac-overlay__close:hover {
	background: var(--ac-surface-hover);
	color: var(--ac-text);
}

/* ── Overlay Body ──────────────────────────────────────── */

.ac-overlay__body {
	flex: 1;
	overflow-y: auto;
	padding: 20px;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.ac-overlay__body::-webkit-scrollbar {
	width: 6px;
}

.ac-overlay__body::-webkit-scrollbar-track {
	background: transparent;
}

.ac-overlay__body::-webkit-scrollbar-thumb {
	background: var(--ac-border);
	border-radius: 3px;
}

/* ── Settings Sections ─────────────────────────────────── */

.ac-section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.ac-section__title {
	font-size: 13px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: var(--ac-text-secondary);
	padding-bottom: 4px;
	border-bottom: 1px solid var(--ac-border);
}

/* ── Form Fields ───────────────────────────────────────── */

.ac-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.ac-field--row {
	flex-direction: row;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.ac-field__label {
	font-size: 13px;
	font-weight: 600;
	color: var(--ac-text);
}

.ac-field__hint {
	font-size: 11px;
	color: var(--ac-text-muted);
}

.ac-input {
	width: 100%;
	padding: 8px 12px;
	background: var(--ac-surface);
	border: 1px solid var(--ac-border);
	border-radius: var(--ac-radius-sm);
	font-size: 13px;
	color: var(--ac-text);
	transition:
		border-color var(--ac-transition),
		box-shadow var(--ac-transition);
}

.ac-input:focus {
	border-color: var(--ac-brand);
	box-shadow: 0 0 0 3px var(--ac-brand-light);
	outline: none;
}

.ac-input::placeholder {
	color: var(--ac-text-muted);
}

.ac-select {
	width: 100%;
	padding: 8px 12px;
	background: var(--ac-surface);
	border: 1px solid var(--ac-border);
	border-radius: var(--ac-radius-sm);
	font-size: 13px;
	color: var(--ac-text);
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 10px center;
	padding-right: 30px;
	transition:
		border-color var(--ac-transition),
		box-shadow var(--ac-transition);
}

.ac-select:focus {
	border-color: var(--ac-brand);
	box-shadow: 0 0 0 3px var(--ac-brand-light);
	outline: none;
}

/* ── Radio Group (Provider Priority) ───────────────────── */

.ac-radio-group {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ac-radio {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	background: var(--ac-surface);
	border: 1px solid var(--ac-border);
	border-radius: var(--ac-radius-sm);
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	transition:
		background var(--ac-transition),
		border-color var(--ac-transition);
}

.ac-radio:hover {
	background: var(--ac-surface-hover);
}

.ac-radio--selected {
	background: var(--ac-brand-light);
	border-color: var(--ac-brand);
	color: var(--ac-brand);
}

.ac-radio__dot {
	width: 14px;
	height: 14px;
	border: 2px solid var(--ac-border);
	border-radius: 50%;
	position: relative;
	transition: border-color var(--ac-transition);
}

.ac-radio--selected .ac-radio__dot {
	border-color: var(--ac-brand);
}

.ac-radio--selected .ac-radio__dot::after {
	content: '';
	position: absolute;
	inset: 2px;
	background: var(--ac-brand);
	border-radius: 50%;
}

/* ── Checkbox ──────────────────────────────────────────── */

.ac-checkbox {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	padding: 4px 0;
}

.ac-checkbox__box {
	width: 18px;
	height: 18px;
	border: 2px solid var(--ac-border);
	border-radius: var(--ac-radius-xs);
	display: flex;
	align-items: center;
	justify-content: center;
	transition:
		background var(--ac-transition),
		border-color var(--ac-transition);
	flex-shrink: 0;
}

.ac-checkbox--checked .ac-checkbox__box {
	background: var(--ac-brand);
	border-color: var(--ac-brand);
}

.ac-checkbox--checked .ac-checkbox__box::after {
	content: '';
	width: 5px;
	height: 9px;
	border: 2px solid #ffffff;
	border-top: none;
	border-left: none;
	transform: rotate(45deg) translateY(-1px);
}

/* ── Slider (Confidence Threshold) ─────────────────────── */

.ac-slider {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.ac-slider__header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.ac-slider__label {
	font-size: 13px;
	font-weight: 600;
	color: var(--ac-text);
}

.ac-slider__value {
	font-size: 13px;
	font-weight: 700;
	color: var(--ac-brand);
	font-variant-numeric: tabular-nums;
}

.ac-slider__input {
	-webkit-appearance: none;
	appearance: none;
	width: 100%;
	height: 6px;
	background: var(--ac-border);
	border-radius: 3px;
	outline: none;
	cursor: pointer;
}

.ac-slider__input::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 18px;
	height: 18px;
	background: var(--ac-brand);
	border-radius: 50%;
	border: 2px solid #ffffff;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	cursor: pointer;
	transition: transform var(--ac-transition);
}

.ac-slider__input::-webkit-slider-thumb:hover {
	transform: scale(1.15);
}

.ac-slider__input::-moz-range-thumb {
	width: 18px;
	height: 18px;
	background: var(--ac-brand);
	border-radius: 50%;
	border: 2px solid #ffffff;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	cursor: pointer;
}

/* ── Overlay Footer ────────────────────────────────────── */

.ac-overlay__footer {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 16px 20px;
	border-top: 1px solid var(--ac-border);
	background: var(--ac-surface);
}

.ac-overlay__footer .ac-btn {
	flex: 0 0 auto;
}

/* ── Status Message (save success/error) ───────────────── */

.ac-status-msg {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	border-radius: var(--ac-radius-sm);
	font-size: 12px;
	font-weight: 600;
	opacity: 0;
	transform: translateY(4px);
	transition:
		opacity var(--ac-transition),
		transform var(--ac-transition);
}

.ac-status-msg--visible {
	opacity: 1;
	transform: translateY(0);
}

.ac-status-msg--success {
	background: var(--ac-success-light);
	color: var(--ac-success);
}

.ac-status-msg--error {
	background: var(--ac-error-light);
	color: var(--ac-error);
}

/* ── Onboarding Banner ─────────────────────────────────── */

.ac-overlay-onboarding {
	padding: 14px 16px;
	background: var(--ac-brand-light);
	border: 1px solid var(--ac-brand);
	border-radius: var(--ac-radius-sm);
}

.ac-overlay-onboarding__title {
	font-size: 14px;
	font-weight: 700;
	color: var(--ac-brand);
	margin-bottom: 4px;
}

.ac-overlay-onboarding__text {
	font-size: 13px;
	color: var(--ac-text-secondary);
	line-height: 1.5;
}
`;

// ── Animation Styles ────────────────────────────────────────────

/** All animations — gated behind prefers-reduced-motion */
export const ANIMATION_STYLES = /* css */ `
@media (prefers-reduced-motion: no-preference) {

	/* ── Shimmer (processing pill) ──────────────────────── */

	@keyframes ac-shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	.ac-fab--processing::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.2) 50%,
			transparent 100%
		);
		animation: ac-shimmer 1.5s ease-in-out infinite;
	}

	/* ── Pulse (error state) ───────────────────────────── */

	@keyframes ac-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.ac-fab--error {
		animation: ac-pulse 2s ease-in-out infinite;
	}

	/* ── Flash Green (success) ─────────────────────────── */

	@keyframes ac-flash-green {
		0% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
		}
		70% {
			box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
		}
	}

	.ac-fab--active {
		animation: ac-flash-green 1s ease-out;
	}

	/* ── Fade In ───────────────────────────────────────── */

	@keyframes ac-fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* ── Slide Up ──────────────────────────────────────── */

	@keyframes ac-slideUp {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Scale In ──────────────────────────────────────── */

	@keyframes ac-scaleIn {
		from {
			opacity: 0;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ── Spin ──────────────────────────────────────────── */

	@keyframes ac-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.ac-spin {
		animation: ac-spin 1s linear infinite;
	}

	/* ── Counter Increment ─────────────────────────────── */

	@keyframes ac-counter-pop {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	.ac-stat__value--animate {
		animation: ac-counter-pop 300ms ease-out;
	}

	/* ── Progress Bar Indeterminate ────────────────────── */

	@keyframes ac-progress-indeterminate {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	.ac-panel__progress-bar--indeterminate {
		animation: ac-progress-indeterminate 1.5s ease-in-out infinite;
	}

	/* ── Panel Enter ───────────────────────────────────── */

	.ac-panel--open {
		animation: ac-slideUp 200ms ease-out;
	}

	/* ── Overlay Enter ─────────────────────────────────── */

	.ac-overlay--open .ac-overlay__card {
		animation: ac-scaleIn 300ms ease-out;
	}
}

/* ── Reduced Motion Overrides ──────────────────────────── */

@media (prefers-reduced-motion: reduce) {
	.ac-fab,
	.ac-panel,
	.ac-overlay,
	.ac-overlay__card,
	.ac-toggle__thumb,
	.ac-status-msg {
		transition-duration: 0ms !important;
		animation: none !important;
	}
}
`;

// ── Utility Styles ──────────────────────────────────────────────

/** Shared utility classes */
const UTILITY_STYLES = /* css */ `
.ac-sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border-width: 0;
}

.ac-hidden {
	display: none !important;
}

.ac-truncate {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
`;

// ── Combined Export ──────────────────────────────────────────────

/**
 * Returns the complete widget stylesheet as a single CSS string.
 * Inject this into the Shadow DOM's adoptedStyleSheets or a <style> tag.
 */
export function getWidgetStyleSheet(): string {
	return [
		RESET_STYLES,
		CUSTOM_PROPERTIES,
		FAB_STYLES,
		PANEL_STYLES,
		OVERLAY_STYLES,
		ANIMATION_STYLES,
		UTILITY_STYLES,
	].join('\n');
}

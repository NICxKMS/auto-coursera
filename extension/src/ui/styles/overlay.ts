/**
 * Overlay styles — full-viewport settings modal.
 * Injected into the Shadow DOM as part of the combined widget stylesheet.
 *
 * Contains:
 *   - Backdrop with blur
 *   - Overlay card layout, header, body, footer
 *   - Settings sections and form fields
 *   - Input, select, radio group, checkbox, slider controls
 *   - Status messages and onboarding banner
 */

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

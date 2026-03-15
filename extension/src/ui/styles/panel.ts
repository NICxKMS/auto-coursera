/**
 * Panel styles — expanded widget panel (320×480px).
 * Injected into the Shadow DOM as part of the combined widget stylesheet.
 *
 * Contains:
 *   - Panel layout, open/close transitions
 *   - Header with brand, title, status badge, minimize button
 *   - Progress bar
 *   - Body with scrollbar styling
 *   - Toggle row, error banner, status section, stats grid
 *   - Action buttons (primary, secondary)
 *   - Footer with settings link
 *   - Onboarding callout
 */

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

/**
 * FAB styles — floating pill button (minimized widget state).
 * Injected into the Shadow DOM as part of the combined widget stylesheet.
 *
 * Contains:
 *   - Base FAB layout and typography
 *   - State variants (disabled, idle, processing, active, error)
 *   - Drag state
 *   - First-visit tooltip
 */

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

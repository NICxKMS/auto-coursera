/**
 * Base styles — CSS reset, design tokens, utilities.
 * Injected into the Shadow DOM as part of the combined widget stylesheet.
 *
 * Contains:
 *   - Minimal CSS reset scoped to Shadow DOM
 *   - Design tokens as CSS custom properties (light + dark themes)
 *   - Shared utility classes (.ac-sr-only, .ac-hidden, .ac-truncate)
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

// ── Utility Styles ──────────────────────────────────────────────

/** Shared utility classes */
export const UTILITY_STYLES = /* css */ `
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

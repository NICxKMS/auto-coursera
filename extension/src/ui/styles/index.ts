/**
 * Widget stylesheet composition — barrel index for modular style files.
 * Re-exports individual style constants and provides getWidgetStyleSheet()
 * to combine them into a single CSS string for Shadow DOM injection.
 *
 * Module structure:
 *   - base.ts       — CSS reset, design tokens (light + dark), utility classes
 *   - fab.ts        — FAB pill button, state variants, drag, tooltip
 *   - panel.ts      — Panel layout, header, body, controls, footer
 *   - overlay.ts    — Settings overlay, form elements, radio/checkbox/slider
 *   - animations.ts — Keyframe animations, reduced-motion overrides
 */

export { ANIMATION_STYLES } from './animations';
export { CUSTOM_PROPERTIES, RESET_STYLES, UTILITY_STYLES } from './base';
export { FAB_STYLES } from './fab';
export { OVERLAY_STYLES } from './overlay';
export { PANEL_STYLES } from './panel';

// ── Local imports for composition ───────────────────────────────

import { ANIMATION_STYLES } from './animations';
import { CUSTOM_PROPERTIES, RESET_STYLES, UTILITY_STYLES } from './base';
import { FAB_STYLES } from './fab';
import { OVERLAY_STYLES } from './overlay';
import { PANEL_STYLES } from './panel';

// ── Combined Export ─────────────────────────────────────────────

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

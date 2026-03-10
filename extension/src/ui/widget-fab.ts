/**
 * Floating Action Button — the contextual pill showing extension status.
 * Subscribes to WidgetStore for reactive updates across 5 visual states:
 * disabled (gray), idle (blue), processing (shimmer), active (green), error (red pulse).
 *
 * The FAB is a <button> element with an icon <span> and text <span>.
 * WidgetHost owns click/drag behavior; this class just renders state.
 *
 * Dependencies:
 *   - widget-state.ts  (WidgetStore, PillState derivation)
 *   - widget-styles.ts (FAB_STYLES — .ac-fab, .ac-fab-tooltip CSS classes)
 */

import type { WidgetStore } from './widget-state';

// ── Constants ───────────────────────────────────────────────────

/** Auto-dismiss timeout for first-visit tooltip (ms) */
const TOOLTIP_DISMISS_MS = 5000;

/** Chrome storage key for tooltip-shown flag */
const TOOLTIP_SHOWN_KEY = '_fabTooltipShown';

// ── FloatingFab ─────────────────────────────────────────────────

export class FloatingFab {
	private readonly el: HTMLButtonElement;
	private readonly iconSpan: HTMLSpanElement;
	private readonly textSpan: HTMLSpanElement;
	private tooltip: HTMLDivElement | null = null;
	private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
	private isHidden = true;
	private readonly unsubscribe: () => void;

	constructor(private readonly store: WidgetStore) {
		// ── Build DOM ──────────────────────────────────────────
		this.el = document.createElement('button');
		this.el.className = 'ac-fab ac-fab--disabled ac-hidden';
		this.el.setAttribute('role', 'button');
		this.el.setAttribute('aria-label', 'Auto-Coursera — Off');
		this.el.setAttribute('tabindex', '0');

		this.iconSpan = document.createElement('span');
		this.iconSpan.className = 'ac-fab__icon';
		this.iconSpan.textContent = '🎓';
		this.iconSpan.setAttribute('aria-hidden', 'true');

		this.textSpan = document.createElement('span');
		this.textSpan.className = 'ac-fab__text';
		this.textSpan.textContent = 'Off';

		this.el.appendChild(this.iconSpan);
		this.el.appendChild(this.textSpan);

		// ── Subscribe to store for reactive PillState updates ──
		this.unsubscribe = store.subscribeMany(['status', 'solvedCount', 'processingCount'], () =>
			this.render(),
		);

		// Initial render
		this.render();

		// First-visit tooltip (async, non-blocking)
		this.initTooltip();
	}

	// ── Rendering ─────────────────────────────────────────────

	/** Re-render the FAB from the store-derived PillState */
	private render(): void {
		const pill = this.store.getPillState();
		// Replace className entirely, then re-apply hidden if needed
		this.el.className = `ac-fab ${pill.bgClass}`;
		if (this.isHidden) this.el.classList.add('ac-hidden');
		this.iconSpan.textContent = pill.icon;
		this.textSpan.textContent = pill.text;
		this.el.setAttribute('aria-label', `Auto-Coursera — ${pill.text}`);
	}

	// ── First-Visit Tooltip ───────────────────────────────────

	/** Check chrome.storage and show tooltip if this is the very first visit */
	private async initTooltip(): Promise<void> {
		try {
			const data = await chrome.storage.local.get({ [TOOLTIP_SHOWN_KEY]: false });
			if (!data[TOOLTIP_SHOWN_KEY]) {
				this.showTooltip();
				await chrome.storage.local.set({ [TOOLTIP_SHOWN_KEY]: true });
			}
		} catch {
			// Storage unavailable — skip tooltip silently
		}
	}

	/** Create and animate in the tooltip bubble */
	private showTooltip(): void {
		this.tooltip = document.createElement('div');
		this.tooltip.className = 'ac-fab-tooltip';
		this.tooltip.textContent = '👋 Click to get started';
		this.tooltip.setAttribute('role', 'tooltip');
		this.tooltip.id = 'ac-fab-tooltip';
		this.el.setAttribute('aria-describedby', 'ac-fab-tooltip');
		this.el.appendChild(this.tooltip);

		// Two rAFs: first forces style recalc, second triggers CSS transition
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				this.tooltip?.classList.add('ac-fab-tooltip--visible');
			});
		});

		// Auto-dismiss after timeout
		this.tooltipTimer = setTimeout(() => this.dismissTooltip(), TOOLTIP_DISMISS_MS);
	}

	/** Dismiss and clean up the tooltip (idempotent) */
	dismissTooltip(): void {
		if (this.tooltipTimer) {
			clearTimeout(this.tooltipTimer);
			this.tooltipTimer = null;
		}
		if (this.tooltip) {
			this.tooltip.classList.remove('ac-fab-tooltip--visible');
			const ref = this.tooltip;
			this.tooltip = null;
			this.el.removeAttribute('aria-describedby');
			// Remove DOM after fade-out transition completes
			setTimeout(() => ref.remove(), 200);
		}
	}

	// ── Public API ────────────────────────────────────────────

	/** Make the FAB visible */
	show(): void {
		this.isHidden = false;
		this.el.classList.remove('ac-hidden');
	}

	/** Hide the FAB (display: none via .ac-hidden) */
	hide(): void {
		this.isHidden = true;
		this.el.classList.add('ac-hidden');
	}

	/** Return the root <button> element for appending to the Shadow DOM */
	getElement(): HTMLButtonElement {
		return this.el;
	}

	/** Full cleanup — unsubscribe store, remove tooltip, remove element */
	destroy(): void {
		this.unsubscribe();
		this.dismissTooltip();
		this.el.remove();
	}
}

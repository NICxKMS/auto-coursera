/**
 * Shared tab utility module for the Auto-Coursera website.
 *
 * Provides generic tab initialization with keyboard navigation,
 * unified hash navigation (for both `<details>` and tab panels),
 * and Astro-aware event listener wiring.
 *
 * ## DOM Structure Contract
 *
 * The `[data-tab-group]` element acts as the tablist. Tab panels are
 * **siblings** of the tablist — never children. This means
 * `panel.parentElement.querySelector('[data-tab-group]')` always finds
 * a sibling tablist, not the panel itself.
 *
 * ```html
 * <div class="some-wrapper">
 *   <div data-tab-group="provider" role="tablist">
 *     <button role="tab" data-tab="openrouter" aria-controls="panel-openrouter"
 *             aria-selected="true" tabindex="0">OpenRouter</button>
 *     <button role="tab" data-tab="gemini" aria-controls="panel-gemini"
 *             aria-selected="false" tabindex="-1">Gemini</button>
 *   </div>
 *   <div id="panel-openrouter" role="tabpanel" data-tab="openrouter">...</div>
 *   <div id="panel-gemini" role="tabpanel" data-tab="gemini" hidden>...</div>
 * </div>
 * ```
 *
 * Tab buttons use `data-tab` to identify which panel they control.
 * Panels use matching `data-tab` values. Panels also have unique `id`
 * attributes so `aria-controls` on the tab buttons can reference them,
 * and so hash navigation (`#panel-gemini`) can target them directly.
 *
 * @module
 */

/**
 * Configuration for a single tab group.
 */
export interface TabGroupConfig {
	/** Matches the `data-tab-group` attribute value on the tablist element. */
	group: string;
	/**
	 * The default tab's `data-tab` value, or a function that returns one.
	 * Use a function for dynamic defaults (e.g. OS detection).
	 */
	defaultTab: string | (() => string);
}

/**
 * Initialize one or more tab groups on the page.
 *
 * For each config entry, finds the `[data-tab-group="<group>"]` element,
 * wires click and keyboard handlers on its `[role="tab"]` buttons, and
 * activates the default tab.
 *
 * **Idempotency:** Sets `data-tabs-initialized` on each tab-group element.
 * If already set, that group is skipped — safe to call multiple times.
 *
 * @param configs - Array of tab group configurations to initialize.
 */
export function initTabs(configs: TabGroupConfig[]): void {
	for (const config of configs) {
		const container = document.querySelector<HTMLElement>(`[data-tab-group="${config.group}"]`);
		if (!container) continue;

		// Idempotency guard — skip if already initialized
		if (container.hasAttribute('data-tabs-initialized')) continue;
		container.setAttribute('data-tabs-initialized', '');

		const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		const parent = container.parentElement;
		if (!parent || !tabs.length) continue;

		// Panels are siblings of the tablist container, not children
		const panels = parent.querySelectorAll<HTMLElement>(`:scope > [role="tabpanel"]`);

		/** Activate a tab by its `data-tab` value. */
		const activateTab = (tabValue: string): void => {
			tabs.forEach((tab) => {
				const isActive = tab.dataset.tab === tabValue;
				tab.setAttribute('aria-selected', String(isActive));
				tab.tabIndex = isActive ? 0 : -1;
			});
			panels.forEach((panel) => {
				const isActive = panel.dataset.tab === tabValue;
				panel.hidden = !isActive;
			});
		};

		// Resolve default tab value
		const defaultTab =
			typeof config.defaultTab === 'function' ? config.defaultTab() : config.defaultTab;
		activateTab(defaultTab);

		// Click handlers
		tabs.forEach((tab) => {
			tab.addEventListener('click', () => {
				const tabValue = tab.dataset.tab;
				if (tabValue) activateTab(tabValue);
			});
		});

		// Keyboard navigation: Arrow keys, Home, End
		container.addEventListener('keydown', (e: KeyboardEvent) => {
			const tabArray = Array.from(tabs);
			const current = container.querySelector<HTMLButtonElement>(
				'[role="tab"][aria-selected="true"]',
			);
			if (!current) return;

			const currentIndex = tabArray.indexOf(current);
			let nextIndex = -1;

			if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
				e.preventDefault();
				nextIndex = (currentIndex + 1) % tabArray.length;
			} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
				e.preventDefault();
				nextIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
			} else if (e.key === 'Home') {
				e.preventDefault();
				nextIndex = 0;
			} else if (e.key === 'End') {
				e.preventDefault();
				nextIndex = tabArray.length - 1;
			}

			if (nextIndex >= 0) {
				const nextTab = tabArray[nextIndex];
				const nextTabValue = nextTab?.dataset.tab;
				if (nextTabValue) {
					activateTab(nextTabValue);
					nextTab.focus();
				}
			}
		});
	}
}

/**
 * Unified hash navigation that handles both `<details>` and tab panels.
 *
 * **Algorithm:**
 * 1. Read `location.hash` — if empty, return.
 * 2. Find the target element by ID — if not found, return.
 * 3. **Tab handling:** If the target is inside a `[role="tabpanel"]`,
 *    find the sibling `[data-tab-group]` tablist and activate the
 *    matching tab. (See DOM Structure Contract above for why
 *    `panel.parentElement.querySelector('[data-tab-group]')` is safe.)
 * 4. **Details handling:** Walk up from the target and open any closed
 *    `<details>` ancestors (handles nested `<details>` via loop).
 * 5. Scroll the target into view after all reveals complete.
 */
export function navigateToHash(): void {
	const hash = location.hash;
	if (!hash) return;

	const target = document.querySelector<HTMLElement>(hash);
	if (!target) return;

	// --- Tab handling ---
	// Check if the target (or an ancestor) is inside a tab panel
	const panel = target.closest<HTMLElement>('[role="tabpanel"]');
	if (panel) {
		const panelParent = panel.parentElement;
		if (panelParent) {
			// The tablist is a sibling of the panel (see DOM Structure Contract)
			const tabGroup = panelParent.querySelector<HTMLElement>('[data-tab-group]');
			if (tabGroup) {
				const panelId = panel.id;
				// Find the tab that controls this panel via aria-controls
				const matchingTab = panelId
					? tabGroup.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="${panelId}"]`)
					: null;

				// Fall back to data-tab matching if aria-controls isn't set
				const tabValue = matchingTab?.dataset.tab ?? panel.dataset.tab;

				if (tabValue) {
					// Activate this tab and deactivate siblings
					const allTabs = tabGroup.querySelectorAll<HTMLButtonElement>('[role="tab"]');
					allTabs.forEach((tab) => {
						const isActive = tab.dataset.tab === tabValue;
						tab.setAttribute('aria-selected', String(isActive));
						tab.tabIndex = isActive ? 0 : -1;
					});

					const allPanels = panelParent.querySelectorAll<HTMLElement>(`:scope > [role="tabpanel"]`);
					allPanels.forEach((p) => {
						p.hidden = p.dataset.tab !== tabValue;
					});
				}
			}
		}
	}

	// --- Details handling ---
	// Walk up from the target, opening any closed <details> ancestors
	let el: Element | null = target;
	while (el) {
		if (el instanceof HTMLDetailsElement && !el.open) {
			el.open = true;
		}
		el = el.parentElement;
	}

	// If the target itself is a <details>, open it
	if (target instanceof HTMLDetailsElement && !target.open) {
		target.open = true;
	}

	// Scroll into view after reveals complete
	requestAnimationFrame(() => {
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
}

/**
 * Wire {@link navigateToHash} to browser and Astro lifecycle events.
 *
 * Listens on:
 * - `DOMContentLoaded` — initial page load
 * - `hashchange` — in-page hash changes (does NOT re-run `initTabs`)
 * - `astro:after-swap` — Astro View Transitions page swaps
 */
export function setupHashListeners(): void {
	document.addEventListener('DOMContentLoaded', () => {
		navigateToHash();
	});
	window.addEventListener('hashchange', () => {
		navigateToHash();
	});
	document.addEventListener('astro:after-swap', () => {
		navigateToHash();
	});
}

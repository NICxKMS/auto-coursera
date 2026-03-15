/**
 * Widget Host — Shadow DOM container, drag engine, and lifecycle orchestrator.
 * Creates and wires all widget components (FAB, Panel, SettingsOverlay)
 * within a closed Shadow DOM attached to the document body.
 *
 * Responsibilities:
 *   - Mount/unmount lifecycle for the entire widget tree
 *   - Drag engine with click-vs-drag detection (4px threshold)
 *   - Snap-to-nearest-edge on drag release
 *   - Position persistence via WidgetStore
 *   - State transitions: FAB ↔ Panel ↔ SettingsOverlay
 *   - Viewport resize handling
 *
 * Dependencies:
 *   - widget-types.ts      (ContentBridge, WidgetPosition)
 *   - widget-state.ts      (WidgetStore)
 *   - styles/             (getWidgetStyleSheet — modular CSS-in-TS)
 *   - widget-fab.ts        (FloatingFab)
 *   - widget-panel.ts      (WidgetPanel)
 *   - settings-overlay.ts  (SettingsOverlay)
 */

import type { RuntimeStateView } from '../types/runtime';
import { SettingsOverlay } from './settings-overlay';
import { getWidgetStyleSheet } from './styles';
import { FloatingFab } from './widget-fab';
import { WidgetPanel } from './widget-panel';
import { WidgetStore } from './widget-state';
import type { ContentBridge } from './widget-types';

// ── Constants ───────────────────────────────────────────────────

/** Minimum pointer movement (px) to distinguish drag from click */
const DRAG_THRESHOLD = 4;

/** Margin from viewport edges for positioning and snapping (px) */
const EDGE_MARGIN = 16;

/** FAB height — matches CSS min-height of .ac-fab (px) */
const FAB_HEIGHT = 32;

/** Approximate FAB width for positioning before the element is measured */
const FAB_APPROX_WIDTH = 80;

/** Gap between FAB and panel (px) */
const PANEL_GAP = 8;

/** Duration of snap-to-edge animation (ms) */
const SNAP_DURATION = 200;

// ── WidgetHost ──────────────────────────────────────────────────

export class WidgetHost {
	// DOM
	private root: HTMLDivElement | null = null;
	private shadow: ShadowRoot | null = null;

	// Components
	private store: WidgetStore | null = null;
	private fab: FloatingFab | null = null;
	private panel: WidgetPanel | null = null;
	private overlay: SettingsOverlay | null = null;
	private bridge: ContentBridge | null = null;

	// Drag state
	private isDragging = false;
	private hasDragExceededThreshold = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private fabStartX = 0;
	private fabStartY = 0;
	private currentX = 0;
	private currentY = 0;
	private rafId = 0;

	/** Measured FAB width — updated during drag, used for positioning */
	private fabWidth = FAB_APPROX_WIDTH;

	// Cleanup
	private cleanupFns: Array<() => void> = [];

	// ── Lifecycle ─────────────────────────────────────────────

	/**
	 * Mount the widget into the document.
	 * Creates Shadow DOM, injects CSS, instantiates all components,
	 * and syncs initial state from chrome.storage.
	 *
	 * @returns The WidgetStore instance — use this to push state from content.ts
	 */
	mount(bridge: ContentBridge, initialRuntime?: RuntimeStateView): WidgetStore {
		if (this.root) throw new Error('WidgetHost is already mounted');

		this.bridge = bridge;

		// ── Root element ───────────────────────────────────────
		this.root = document.createElement('div');
		this.root.id = 'auto-coursera-root';

		// ── Closed Shadow DOM ──────────────────────────────────
		this.shadow = this.root.attachShadow({ mode: 'closed' });

		// ── Inject CSS ─────────────────────────────────────────
		const style = document.createElement('style');
		style.textContent = getWidgetStyleSheet();
		this.shadow.appendChild(style);

		// ── Create store ───────────────────────────────────────
		this.store = new WidgetStore();
		if (initialRuntime) {
			this.store.setRuntimeState(initialRuntime);
		}

		// ── Create components ──────────────────────────────────
		this.fab = new FloatingFab(this.store);
		this.panel = new WidgetPanel(this.store, bridge);
		this.overlay = new SettingsOverlay(this.store);

		// ── Wire callbacks ─────────────────────────────────────
		this.panel.onMinimize = () => this.collapse();
		this.panel.onSettingsClick = () => this.openSettings();
		this.overlay.onClose = () => this.closeSettings();

		// ── Append to Shadow DOM ───────────────────────────────
		this.shadow.appendChild(this.fab.getElement());
		this.shadow.appendChild(this.panel.getElement());
		this.shadow.appendChild(this.overlay.getElement());

		// ── Setup engines ──────────────────────────────────────
		this.setupDragEngine();
		this.setupKeyboardHandler();
		this.setupResizeHandler();

		// ── Initial state sync ─────────────────────────────────
		this.store
			.syncFromStorage()
			.then(() => this.applyPosition())
			.catch(() => {
				// Storage sync failed — apply default position
				this.applyPosition();
			})
			.finally(() => {
				this.fab!.show();
			});

		// ── Insert into page ───────────────────────────────────
		document.body.appendChild(this.root);

		return this.store;
	}

	setRuntimeState(runtimeState: RuntimeStateView | null): void {
		this.store?.setRuntimeState(runtimeState);
	}

	/**
	 * Fully tear down the widget — destroy components, remove DOM,
	 * detach all listeners.
	 */
	unmount(): void {
		// Cancel pending animation frame
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}

		// Run all cleanup functions (event listeners)
		for (const fn of this.cleanupFns) fn();
		this.cleanupFns = [];

		// Destroy components
		this.fab?.destroy();
		this.panel?.destroy();
		this.overlay?.destroy();
		this.store?.destroy();

		// Remove root from DOM
		this.root?.remove();

		// Null references
		this.root = null;
		this.shadow = null;
		this.store = null;
		this.fab = null;
		this.panel = null;
		this.overlay = null;
		this.bridge = null;
	}

	// ── State Transitions ─────────────────────────────────────

	/** Expand: hide FAB → position panel → show panel */
	expand(): void {
		if (!this.fab || !this.panel || !this.store) return;
		this.store.set({ isExpanded: true });
		// Capture FAB width while it's still visible (for panel positioning)
		this.fabWidth = this.fab.getElement().offsetWidth || FAB_APPROX_WIDTH;
		this.positionPanel();
		this.fab.hide();
		this.panel.show();
	}

	/** Collapse: hide panel → show FAB */
	collapse(): void {
		if (!this.fab || !this.panel || !this.store) return;
		this.store.set({ isExpanded: false });
		this.panel.hide();
		this.fab.show();
	}

	/** Open settings: hide panel + FAB → show overlay */
	openSettings(): void {
		if (!this.store || !this.panel || !this.fab || !this.overlay) return;
		this.store.set({ isSettingsOpen: true, isExpanded: false });
		this.panel.hide();
		this.fab.hide();
		this.overlay.open();
	}

	/** Close settings: hide overlay → return to expanded panel */
	closeSettings(): void {
		if (!this.store) return;
		this.store.set({ isSettingsOpen: false });
		// Always return to expanded panel (settings is opened from panel)
		this.expand();
	}

	// ── Drag Engine ───────────────────────────────────────────

	/**
	 * Attach pointer events to the FAB for drag-to-reposition.
	 * Uses setPointerCapture for reliable tracking outside the element.
	 * Click vs drag distinguished by 4px movement threshold.
	 */
	private setupDragEngine(): void {
		const fabEl = this.fab!.getElement();

		const onPointerDown = (e: PointerEvent) => {
			// Only primary button
			if (e.button !== 0) return;

			this.isDragging = true;
			this.hasDragExceededThreshold = false;
			this.dragStartX = e.clientX;
			this.dragStartY = e.clientY;

			const rect = fabEl.getBoundingClientRect();
			this.fabStartX = rect.left;
			this.fabStartY = rect.top;
			this.currentX = this.fabStartX;
			this.currentY = this.fabStartY;
			this.fabWidth = rect.width || FAB_APPROX_WIDTH;

			fabEl.setPointerCapture(e.pointerId);
			e.preventDefault();
		};

		const onPointerMove = (e: PointerEvent) => {
			if (!this.isDragging) return;

			const dx = e.clientX - this.dragStartX;
			const dy = e.clientY - this.dragStartY;
			const dist = Math.sqrt(dx * dx + dy * dy);

			// Check threshold
			if (!this.hasDragExceededThreshold) {
				if (dist < DRAG_THRESHOLD) return;
				this.hasDragExceededThreshold = true;
				fabEl.classList.add('ac-fab--dragging');
				this.fab!.dismissTooltip();
			}

			// Calculate new position
			this.currentX = this.fabStartX + dx;
			this.currentY = this.fabStartY + dy;

			// Viewport constrain
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			this.currentX = Math.max(0, Math.min(this.currentX, vw - this.fabWidth));
			this.currentY = Math.max(0, Math.min(this.currentY, vh - FAB_HEIGHT));

			// RAF for smooth 60fps updates
			if (!this.rafId) {
				this.rafId = requestAnimationFrame(() => {
					fabEl.style.left = `${this.currentX}px`;
					fabEl.style.top = `${this.currentY}px`;
					this.rafId = 0;
				});
			}
		};

		const onPointerUp = (_e: PointerEvent) => {
			if (!this.isDragging) return;
			this.isDragging = false;
			fabEl.classList.remove('ac-fab--dragging');

			if (this.hasDragExceededThreshold) {
				this.snapToEdge();
			} else {
				this.handleFabClick();
			}

			this.hasDragExceededThreshold = false;
		};

		fabEl.addEventListener('pointerdown', onPointerDown);
		fabEl.addEventListener('pointermove', onPointerMove);
		fabEl.addEventListener('pointerup', onPointerUp);

		this.cleanupFns.push(() => {
			fabEl.removeEventListener('pointerdown', onPointerDown);
			fabEl.removeEventListener('pointermove', onPointerMove);
			fabEl.removeEventListener('pointerup', onPointerUp);
		});
	}

	/** Handle FAB keyboard activation (Enter / Space → expand) */
	private setupKeyboardHandler(): void {
		const fabEl = this.fab!.getElement();

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.handleFabClick();
			}
		};

		fabEl.addEventListener('keydown', onKeyDown);
		this.cleanupFns.push(() => fabEl.removeEventListener('keydown', onKeyDown));
	}

	/** Constrain FAB position and reposition panel on viewport resize */
	private setupResizeHandler(): void {
		const onResize = () => {
			this.constrainPosition();
			if (this.store?.get('isExpanded')) {
				this.positionPanel();
			}
		};

		window.addEventListener('resize', onResize);
		this.cleanupFns.push(() => window.removeEventListener('resize', onResize));
	}

	// ── Position Management ───────────────────────────────────

	/**
	 * Apply the stored (or default) position to the FAB element.
	 * Called once during mount after storage sync completes.
	 */
	private applyPosition(): void {
		if (!this.fab || !this.store) return;
		const fabEl = this.fab.getElement();
		const pos = this.store.get('position');
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let x = pos.x;
		let y = pos.y;

		// Default position: bottom-right with margin
		if (x === -1 && y === -1) {
			x = vw - this.fabWidth - EDGE_MARGIN;
			y = vh - FAB_HEIGHT - EDGE_MARGIN;
		}

		// Constrain to viewport
		x = Math.max(EDGE_MARGIN, Math.min(x, vw - this.fabWidth - EDGE_MARGIN));
		y = Math.max(EDGE_MARGIN, Math.min(y, vh - FAB_HEIGHT - EDGE_MARGIN));

		fabEl.style.left = `${x}px`;
		fabEl.style.top = `${y}px`;
	}

	/**
	 * Snap FAB to the nearest horizontal edge after a drag release.
	 * Animates the X movement, persists the final position.
	 */
	private snapToEdge(): void {
		if (!this.fab || !this.store) return;
		const fabEl = this.fab.getElement();
		const vw = window.innerWidth;
		const centerX = this.currentX + this.fabWidth / 2;

		const edge: 'left' | 'right' = centerX < vw / 2 ? 'left' : 'right';
		const targetX = edge === 'left' ? EDGE_MARGIN : vw - this.fabWidth - EDGE_MARGIN;

		// Animate snap with CSS transition
		fabEl.style.transition = `left ${SNAP_DURATION}ms ease, top ${SNAP_DURATION}ms ease`;
		fabEl.style.left = `${targetX}px`;

		// Clean up transition style after animation
		const cleanup = () => {
			fabEl.style.transition = '';
			fabEl.removeEventListener('transitionend', cleanup);
		};
		fabEl.addEventListener('transitionend', cleanup);
		// Fallback cleanup if transitionend doesn't fire (element hidden, etc.)
		setTimeout(() => {
			fabEl.style.transition = '';
		}, SNAP_DURATION + 50);

		// Persist position
		this.store.savePosition({ x: targetX, y: this.currentY, edge });
	}

	/**
	 * Constrain FAB position within the current viewport.
	 * Called on window resize to prevent the FAB from going offscreen.
	 */
	private constrainPosition(): void {
		if (!this.fab || !this.store) return;
		const fabEl = this.fab.getElement();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const rect = fabEl.getBoundingClientRect();
		const w = rect.width || this.fabWidth;

		let x = rect.left;
		let y = rect.top;
		let changed = false;

		if (x + w > vw - EDGE_MARGIN) {
			x = vw - w - EDGE_MARGIN;
			changed = true;
		}
		if (y + FAB_HEIGHT > vh - EDGE_MARGIN) {
			y = vh - FAB_HEIGHT - EDGE_MARGIN;
			changed = true;
		}
		if (x < EDGE_MARGIN) {
			x = EDGE_MARGIN;
			changed = true;
		}
		if (y < EDGE_MARGIN) {
			y = EDGE_MARGIN;
			changed = true;
		}

		if (changed) {
			fabEl.style.left = `${x}px`;
			fabEl.style.top = `${y}px`;
			const edge: 'left' | 'right' = x + w / 2 < vw / 2 ? 'left' : 'right';
			this.store.savePosition({ x, y, edge });
		}
	}

	/**
	 * Position the panel relative to the FAB's stored position.
	 * Prefers showing above the FAB; falls back to below if not enough room.
	 */
	private positionPanel(): void {
		if (!this.panel || !this.store) return;
		const panelEl = this.panel.getElement();
		const pos = this.store.get('position');
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let fabX = pos.x;
		let fabY = pos.y;
		if (fabX === -1 && fabY === -1) {
			fabX = vw - this.fabWidth - EDGE_MARGIN;
			fabY = vh - FAB_HEIGHT - EDGE_MARGIN;
		}

		// ── Horizontal alignment ───────────────────────────────
		if (pos.edge === 'right' || fabX + this.fabWidth / 2 >= vw / 2) {
			// Align panel right edge near FAB right edge
			const rightOffset = Math.max(EDGE_MARGIN, vw - fabX - this.fabWidth);
			panelEl.style.right = `${rightOffset}px`;
			panelEl.style.left = 'auto';
		} else {
			// Align panel left edge with FAB left edge
			panelEl.style.left = `${Math.max(EDGE_MARGIN, fabX)}px`;
			panelEl.style.right = 'auto';
		}

		// ── Vertical alignment (prefer above) ──────────────────
		const spaceAbove = fabY;
		if (spaceAbove >= 200) {
			// Show above the FAB
			panelEl.style.bottom = `${vh - fabY + PANEL_GAP}px`;
			panelEl.style.top = 'auto';
		} else {
			// Not enough room above — show below
			panelEl.style.top = `${fabY + FAB_HEIGHT + PANEL_GAP}px`;
			panelEl.style.bottom = 'auto';
		}
	}

	// ── FAB Click Handler ─────────────────────────────────────

	/** Called when FAB is clicked (not dragged) or activated via keyboard */
	private handleFabClick(): void {
		this.fab?.dismissTooltip();
		this.expand();
	}
}

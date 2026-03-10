/**
 * UI type definitions for the floating widget system.
 * These types define the shape of widget state, derived view-models,
 * and the bridge interface between the widget and the content script.
 *
 * Compatible with:
 *   - src/types/settings.ts (AppSettings, ProviderName)
 *   - src/types/runtime.ts (RuntimeScopeDescriptor, RuntimeStateView)
 *   - src/utils/constants.ts (COLORS)
 */

import type { RuntimeScopeDescriptor, RuntimeStateView } from '../types/runtime';

// ── Widget Status ───────────────────────────────────────────────

/** Widget status mirrors the extension's runtime state */
export type WidgetStatus = 'idle' | 'processing' | 'active' | 'error' | 'disabled';

// ── Position ────────────────────────────────────────────────────

/** Widget position persisted to chrome.storage.local */
export interface WidgetPosition {
	x: number;
	y: number;
	edge: 'left' | 'right';
}

// ── Full Widget State ───────────────────────────────────────────

/** Full widget state — single source of truth for the UI layer */
export interface WidgetState {
	// Extension state (synced from chrome.storage)
	isEnabled: boolean;
	status: WidgetStatus;
	provider: string;
	model: string;
	confidence: number | null;
	lastError: string;

	// Session stats
	solvedCount: number;
	failedCount: number;
	tokenCount: number;

	// UI state (local only — not persisted)
	isExpanded: boolean;
	isSettingsOpen: boolean;
	processingCount: number;

	// Position (persisted to chrome.storage.local)
	position: WidgetPosition;
}

// ── Derived View-Models ─────────────────────────────────────────

/** Derived view-model for the FAB pill — computed from WidgetState */
export interface PillState {
	text: string;
	icon: string;
	bgClass: string;
	animation: 'none' | 'shimmer' | 'pulse' | 'flash';
}

// ── Store Events ────────────────────────────────────────────────

/** Keys that can trigger change events from WidgetStore */
export type WidgetStateKey = keyof WidgetState;

// ── Content Bridge ──────────────────────────────────────────────

/** Actions the widget can trigger on the content script */
export interface ContentBridge {
	/** Re-scan the page for questions */
	scan(): void;
	/** Retry failed questions */
	retry(): void;
	/** Full page refresh and re-detect */
	refresh(): void;
}

export interface WidgetRuntimeBinding {
	scope: RuntimeScopeDescriptor;
	state: RuntimeStateView;
}

// ── Defaults ────────────────────────────────────────────────────

/** Default widget state — used on first load and for resetting */
export const DEFAULT_WIDGET_STATE: WidgetState = {
	isEnabled: false,
	status: 'disabled',
	provider: '--',
	model: '--',
	confidence: null,
	lastError: '',
	solvedCount: 0,
	failedCount: 0,
	tokenCount: 0,
	isExpanded: false,
	isSettingsOpen: false,
	processingCount: 0,
	position: { x: -1, y: -1, edge: 'right' },
};

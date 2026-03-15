/**
 * Reactive state store for the floating widget.
 * Uses EventTarget for granular pub/sub — each state key dispatches
 * its own CustomEvent so subscribers only wake for fields they care about.
 *
 * Storage sync strategy:
 *   - chrome.storage.local  → settings (enabled, provider keys, models)
 *   - chrome.storage.session → scoped runtime state for the current page/tab
 *   - chrome.storage.local  → widget position (persisted across sessions)
 *
 * External mutations (popup, background) flow in via chrome.storage.onChanged.
 */

import {
	projectRuntimeReadModel,
	type RuntimeReadModel,
	resolveRuntimeStateForScope,
} from '../runtime/projection';
import type { RuntimeScopeMap, RuntimeStateView } from '../types/runtime';
import { SESSION_RUNTIME_SCOPES_KEY } from '../types/runtime';
import type { PillState, WidgetPosition, WidgetState, WidgetStateKey } from './widget-types';
import { DEFAULT_WIDGET_STATE } from './widget-types';

// ── Storage Key Maps ────────────────────────────────────────────

/** Maps chrome.storage.local keys → WidgetState fields */
const LOCAL_KEY_MAP: Record<string, WidgetStateKey> = {
	enabled: 'isEnabled',
};

/** Chrome storage key for persisted widget position */
const POSITION_STORAGE_KEY = '_widgetPosition';

function createScopedRuntimePatch(readModel: RuntimeReadModel): Partial<WidgetState> {
	return {
		status: readModel.status,
		provider: readModel.provider,
		model: readModel.model,
		confidence: readModel.confidence,
		lastError: readModel.lastError,
		solvedCount: readModel.solvedCount,
		failedCount: readModel.failedCount,
		tokenCount: readModel.tokenCount,
		processingCount: readModel.processingCount,
	};
}

// ── Pill State Derivation ───────────────────────────────────────

/** Compute the derived PillState from current widget status + stats */
function derivePillState(state: WidgetState): PillState {
	switch (state.status) {
		case 'disabled':
			return { text: 'Off', icon: '🎓', bgClass: 'ac-fab--disabled' };
		case 'idle':
			return { text: 'Ready', icon: '🎓', bgClass: 'ac-fab--idle' };
		case 'processing':
			return {
				text: `Solving ${state.processingCount}...`,
				icon: '🎓',
				bgClass: 'ac-fab--processing',
			};
		case 'active':
			return {
				text: `✓ ${state.solvedCount} solved`,
				icon: '🎓',
				bgClass: 'ac-fab--active',
			};
		case 'error':
			return { text: '! Error', icon: '⚠️', bgClass: 'ac-fab--error' };
		default:
			return { text: 'Ready', icon: '🎓', bgClass: 'ac-fab--idle' };
	}
}

// ── WidgetStore ─────────────────────────────────────────────────

export class WidgetStore extends EventTarget {
	private state: WidgetState;
	private runtimeScopeId: string | null = null;
	private runtimeState: RuntimeStateView | null = null;
	private storageListener:
		| ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
		| null = null;

	constructor() {
		super();
		this.state = { ...DEFAULT_WIDGET_STATE };
		this.attachStorageListener();
	}

	// ── Getters ───────────────────────────────────────────────────

	/** Return the full state snapshot */
	get(): WidgetState;
	/** Return a single field's value */
	get<K extends WidgetStateKey>(key: K): WidgetState[K];
	get<K extends WidgetStateKey>(key?: K): WidgetState | WidgetState[K] {
		if (key === undefined) {
			return { ...this.state };
		}
		return this.state[key];
	}

	// ── Setter ────────────────────────────────────────────────────

	/**
	 * Merge a partial update into state.
	 * Dispatches a CustomEvent for every key whose value actually changed.
	 */
	set(partial: Partial<WidgetState>): void {
		const changedKeys: WidgetStateKey[] = [];

		for (const key of Object.keys(partial) as WidgetStateKey[]) {
			const incoming = partial[key];
			const current = this.state[key];

			// Deep-compare position objects; shallow compare everything else
			if (key === 'position') {
				const a = current as WidgetPosition;
				const b = incoming as WidgetPosition;
				if (a.x !== b.x || a.y !== b.y || a.edge !== b.edge) {
					(this.state as unknown as Record<string, unknown>)[key] = incoming;
					changedKeys.push(key);
				}
			} else if (current !== incoming) {
				(this.state as unknown as Record<string, unknown>)[key] = incoming;
				changedKeys.push(key);
			}
		}

		for (const key of changedKeys) {
			this.dispatchEvent(new CustomEvent(key, { detail: this.state[key] }));
		}
	}

	// ── Subscriptions ─────────────────────────────────────────────

	/**
	 * Subscribe to changes for a single state key.
	 * Returns an unsubscribe function.
	 */
	subscribe<K extends WidgetStateKey>(
		key: K,
		callback: (value: WidgetState[K]) => void,
	): () => void {
		const handler = (e: Event) => {
			callback((e as CustomEvent).detail as WidgetState[K]);
		};
		this.addEventListener(key, handler);
		return () => this.removeEventListener(key, handler);
	}

	/**
	 * Subscribe to changes for any of the listed keys.
	 * Callback receives the full state snapshot.
	 * Returns an unsubscribe function.
	 */
	subscribeMany(keys: WidgetStateKey[], callback: (state: WidgetState) => void): () => void {
		const handler = () => {
			callback(this.get());
		};
		for (const key of keys) {
			this.addEventListener(key, handler);
		}
		return () => {
			for (const key of keys) {
				this.removeEventListener(key, handler);
			}
		};
	}

	// ── Derived State ─────────────────────────────────────────────

	/** Compute the current PillState from live widget state */
	getPillState(): PillState {
		return derivePillState(this.state);
	}

	setRuntimeState(runtimeState: RuntimeStateView | null): void {
		this.runtimeScopeId = runtimeState?.scopeId ?? null;
		this.runtimeState = runtimeState;
		this.set(
			createScopedRuntimePatch(
				projectRuntimeReadModel({
					enabled: this.state.isEnabled,
					runtimeState: this.runtimeState,
				}),
			),
		);
	}

	// ── Chrome Storage Sync ─────────────────────────────────────

	/**
	 * One-time initialization: read persisted state from chrome.storage
	 * and merge into the local state.
	 */
	async syncFromStorage(): Promise<void> {
		// 1. Read settings from chrome.storage.local
		const localData = await chrome.storage.local.get(['enabled', POSITION_STORAGE_KEY]);

		const localPatch: Partial<WidgetState> = {};
		let enabled = this.state.isEnabled;

		if (typeof localData.enabled === 'boolean') {
			localPatch.isEnabled = localData.enabled;
			enabled = localData.enabled;
		}

		if (localData[POSITION_STORAGE_KEY]) {
			const pos = localData[POSITION_STORAGE_KEY] as WidgetPosition;
			if (
				typeof pos.x === 'number' &&
				typeof pos.y === 'number' &&
				(pos.edge === 'left' || pos.edge === 'right')
			) {
				localPatch.position = pos;
			}
		}

		// 2. Read runtime state from chrome.storage.session
		let sessionData: Record<string, unknown> = {};
		try {
			sessionData = await chrome.storage.session.get({
				[SESSION_RUNTIME_SCOPES_KEY]: {},
			});
		} catch {
			// Session storage may be unavailable (extension reloading, SW restart)
		}

		this.runtimeState = resolveRuntimeStateForScope(
			sessionData[SESSION_RUNTIME_SCOPES_KEY] as RuntimeScopeMap | undefined,
			this.runtimeScopeId,
		);

		const sessionPatch = createScopedRuntimePatch(
			projectRuntimeReadModel({ enabled, runtimeState: this.runtimeState }),
		);

		// 3. Merge both patches
		this.set({ ...localPatch, ...sessionPatch });
	}

	/**
	 * Persist widget position to chrome.storage.local.
	 */
	async savePosition(pos: WidgetPosition): Promise<void> {
		this.set({ position: pos });
		await chrome.storage.local.set({ [POSITION_STORAGE_KEY]: pos });
	}

	// ── Storage Listener ────────────────────────────────────────

	/**
	 * Attach a listener to chrome.storage.onChanged so external mutations
	 * (popup toggle, background status updates) flow into widget state.
	 */
	private attachStorageListener(): void {
		this.storageListener = (
			changes: Record<string, chrome.storage.StorageChange>,
			area: string,
		) => {
			const patch: Partial<WidgetState> = {};
			let hasChanges = false;
			let nextEnabled = this.state.isEnabled;

			if (area === 'session') {
				if (SESSION_RUNTIME_SCOPES_KEY in changes) {
					this.runtimeState = resolveRuntimeStateForScope(
						changes[SESSION_RUNTIME_SCOPES_KEY].newValue,
						this.runtimeScopeId,
					);
					hasChanges = true;
				}
			}

			if (area === 'local') {
				for (const [storageKey, stateKey] of Object.entries(LOCAL_KEY_MAP)) {
					if (storageKey in changes) {
						(patch as Record<string, unknown>)[stateKey] = changes[storageKey].newValue;
						if (storageKey === 'enabled' && typeof changes[storageKey].newValue === 'boolean') {
							nextEnabled = changes[storageKey].newValue as boolean;
						}
						hasChanges = true;
					}
				}
			}

			if (hasChanges) {
				this.set({
					...patch,
					...createScopedRuntimePatch(
						projectRuntimeReadModel({
							enabled: nextEnabled,
							runtimeState: this.runtimeState,
						}),
					),
				});
			}
		};

		chrome.storage.onChanged.addListener(this.storageListener);
	}

	// ── Cleanup ─────────────────────────────────────────────────

	/**
	 * Remove all event listeners and detach from chrome.storage.
	 * Call this before discarding the store instance.
	 */
	destroy(): void {
		if (this.storageListener) {
			chrome.storage.onChanged.removeListener(this.storageListener);
			this.storageListener = null;
		}
	}
}

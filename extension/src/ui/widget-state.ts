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

import type { RuntimeScopeDescriptor, RuntimeScopeMap, RuntimeStateView } from '../types/runtime';
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

function createScopedRuntimePatch(runtimeState: RuntimeStateView | null): Partial<WidgetState> {
	return {
		status: runtimeState?.status ?? 'idle',
		provider: runtimeState?.provider ?? '',
		model: runtimeState?.model ?? '',
		confidence: runtimeState?.confidence ?? null,
		lastError: runtimeState?.lastError ?? '',
		solvedCount: runtimeState?.solvedCount ?? 0,
		failedCount: runtimeState?.failedCount ?? 0,
		tokenCount: runtimeState?.tokenCount ?? 0,
		processingCount: runtimeState?.processingCount ?? 0,
	};
}

function resolveRuntimeStateForScope(
	rawScopes: unknown,
	scopeId: string | null,
): RuntimeStateView | null {
	if (!scopeId || !rawScopes || typeof rawScopes !== 'object' || Array.isArray(rawScopes)) {
		return null;
	}

	const scopes = rawScopes as RuntimeScopeMap;
	return scopes[scopeId] ?? null;
}

// ── Pill State Derivation ───────────────────────────────────────

/** Compute the derived PillState from current widget status + stats */
function derivePillState(state: WidgetState): PillState {
	switch (state.status) {
		case 'disabled':
			return {
				text: 'Off',
				icon: '🎓',
				bgClass: 'ac-fab--disabled',
				animation: 'none',
			};
		case 'idle':
			return {
				text: 'Ready',
				icon: '🎓',
				bgClass: 'ac-fab--idle',
				animation: 'none',
			};
		case 'processing':
			return {
				text: `Solving ${state.processingCount}...`,
				icon: '🎓',
				bgClass: 'ac-fab--processing',
				animation: 'shimmer',
			};
		case 'active':
			return {
				text: `✓ ${state.solvedCount} solved`,
				icon: '🎓',
				bgClass: 'ac-fab--active',
				animation: 'flash',
			};
		case 'error':
			return {
				text: '! Error',
				icon: '⚠️',
				bgClass: 'ac-fab--error',
				animation: 'pulse',
			};
		default:
			return {
				text: 'Ready',
				icon: '🎓',
				bgClass: 'ac-fab--idle',
				animation: 'none',
			};
	}
}

// ── WidgetStore ─────────────────────────────────────────────────

export class WidgetStore extends EventTarget {
	private state: WidgetState;
	private runtimeScopeId: string | null = null;
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

	setRuntimeScope(
		scope: RuntimeScopeDescriptor | null,
		runtimeState?: RuntimeStateView | null,
	): void {
		this.runtimeScopeId = scope?.scopeId ?? null;
		const patch = createScopedRuntimePatch(runtimeState ?? null);
		if (!this.state.isEnabled) {
			patch.status = 'disabled';
		}
		this.set(patch);
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

		if (typeof localData.enabled === 'boolean') {
			localPatch.isEnabled = localData.enabled;
			if (!localData.enabled) {
				localPatch.status = 'disabled';
			} else {
				localPatch.status = 'idle';
			}
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

		const sessionPatch = createScopedRuntimePatch(
			resolveRuntimeStateForScope(sessionData[SESSION_RUNTIME_SCOPES_KEY], this.runtimeScopeId),
		);

		// If extension is disabled, override status regardless of session
		if (localPatch.isEnabled === false) {
			sessionPatch.status = 'disabled';
		}

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

			if (area === 'session') {
				if (SESSION_RUNTIME_SCOPES_KEY in changes) {
					Object.assign(
						patch,
						createScopedRuntimePatch(
							resolveRuntimeStateForScope(
								changes[SESSION_RUNTIME_SCOPES_KEY].newValue,
								this.runtimeScopeId,
							),
						),
					);
					hasChanges = true;
				}
			}

			if (area === 'local') {
				for (const [storageKey, stateKey] of Object.entries(LOCAL_KEY_MAP)) {
					if (storageKey in changes) {
						(patch as Record<string, unknown>)[stateKey] = changes[storageKey].newValue;
						hasChanges = true;
					}
				}

				// When extension is toggled off, force disabled status
				if ('enabled' in changes && changes.enabled.newValue === false) {
					patch.status = 'disabled';
				}
				// When toggled on, set idle (background will push actual status)
				if ('enabled' in changes && changes.enabled.newValue === true) {
					patch.status = 'idle';
				}
			}

			if (hasChanges) {
				this.set(patch);
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

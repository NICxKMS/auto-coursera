import { vi } from 'vitest';

function createStorageArea() {
	let store: Record<string, unknown> = {};
	return {
		get: vi.fn(async (keys?: Record<string, unknown> | string[] | string) => {
			if (typeof keys === 'string') {
				return { [keys]: store[keys] };
			}
			if (Array.isArray(keys)) {
				const result: Record<string, unknown> = {};
				for (const k of keys) result[k] = store[k];
				return result;
			}
			if (keys && typeof keys === 'object') {
				const result: Record<string, unknown> = {};
				for (const [k, defaultVal] of Object.entries(keys)) {
					result[k] = store[k] !== undefined ? store[k] : defaultVal;
				}
				return result;
			}
			return { ...store };
		}),
		set: vi.fn(async (items: Record<string, unknown>) => {
			Object.assign(store, items);
		}),
		remove: vi.fn(async (keys: string | string[]) => {
			const arr = Array.isArray(keys) ? keys : [keys];
			for (const k of arr) delete store[k];
		}),
		clear: vi.fn(async () => {
			store = {};
		}),
		_getStore: () => store,
		_setStore: (s: Record<string, unknown>) => {
			store = s;
		},
	};
}

export const chromeMock = {
	runtime: {
		id: 'mock-extension-id-12345',
		getURL: vi.fn((path: string) => `chrome-extension://mock-extension-id-12345/${path}`),
		getManifest: vi.fn(() => ({ version: '1.9.1' })),
		reload: vi.fn(),
		sendMessage: vi.fn(),
		onMessage: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
		onInstalled: {
			addListener: vi.fn(),
		},
		onStartup: {
			addListener: vi.fn(),
		},
		openOptionsPage: vi.fn(),
	},
	storage: {
		local: createStorageArea(),
		session: createStorageArea(),
		sync: createStorageArea(),
		onChanged: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
	},
	tabs: {
		create: vi.fn(async () => ({ id: 1 })),
		query: vi.fn(async () => []),
		sendMessage: vi.fn(),
		onRemoved: {
			addListener: vi.fn(),
		},
	},
	action: {
		setBadgeText: vi.fn(),
		setBadgeBackgroundColor: vi.fn(),
	},
	alarms: {
		create: vi.fn(),
		clear: vi.fn(),
		get: vi.fn(async () => null),
		onAlarm: {
			addListener: vi.fn(),
		},
	},
	commands: {
		onCommand: {
			addListener: vi.fn(),
		},
	},
};

export function installChromeMock() {
	vi.stubGlobal('chrome', chromeMock);
}

export function resetChromeMock() {
	chromeMock.storage.local._setStore({});
	chromeMock.storage.session._setStore({});
	chromeMock.storage.sync._setStore({});
	vi.clearAllMocks();
}

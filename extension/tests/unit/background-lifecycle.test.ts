import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BackgroundLifecycle,
	hasProviderSettingsChange,
	STORAGE_KEY_LAST_UPDATE_ATTEMPT,
	UPDATE_CHECK_ALARM,
} from '../../src/background/lifecycle';
import type { ProviderService } from '../../src/background/provider-service';
import { RuntimeStateManager } from '../../src/background/runtime-state';
import { Logger } from '../../src/utils/logger';
import { chromeMock, resetChromeMock } from '../mocks/chrome';

function createLifecycle() {
	const runtimeStateManager = new RuntimeStateManager();
	const providerService = {
		reloadFromStorage: vi.fn(async () => {}),
		resetForTests: vi.fn(async () => {}),
	} as unknown as ProviderService;

	return {
		runtimeStateManager,
		providerService,
		lifecycle: new BackgroundLifecycle({
			logger: new Logger('ServiceWorker'),
			runtimeStateManager,
			providerService,
		}),
	};
}

describe('BackgroundLifecycle', () => {
	beforeEach(() => {
		resetChromeMock();
		vi.clearAllMocks();
	});

	it('sends SCAN_PAGE to the active tab for the scan-page command', async () => {
		(chromeMock.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 42 }]);
		const { lifecycle } = createLifecycle();

		await lifecycle.handleCommand('scan-page');

		expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
		expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { type: 'SCAN_PAGE' });
	});

	it('toggles enabled state and updates scoped runtime status', async () => {
		const { lifecycle, runtimeStateManager } = createLifecycle();
		await chrome.storage.local.set({ enabled: true });
		await runtimeStateManager.registerScope({
			tabId: 7,
			pageInstanceId: 'page-1',
			pageUrl: 'https://www.coursera.org/learn/test',
			enabled: true,
		});

		await lifecycle.handleCommand('toggle-enabled');

		expect(chromeMock.storage.local._getStore().enabled).toBe(false);
		expect((await runtimeStateManager.getStateForTab(7))?.status).toBe('disabled');
	});

	it('registers update alarm on install', async () => {
		const { lifecycle } = createLifecycle();

		await lifecycle.handleInstalled({ reason: 'install' } as chrome.runtime.InstalledDetails);

		expect(chromeMock.alarms.create).toHaveBeenCalledWith(
			UPDATE_CHECK_ALARM,
			expect.objectContaining({ periodInMinutes: expect.any(Number) }),
		);
	});

	it('stores installed version on install', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
			version: '2.0.0',
		});

		await lifecycle.handleInstalled({ reason: 'update' } as chrome.runtime.InstalledDetails);

		expect(chromeMock.storage.local._getStore().acra_installedVersion).toBe('2.0.0');
	});

	it('ensures update alarm exists on startup', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.alarms.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

		await lifecycle.handleStartup();

		expect(chromeMock.alarms.get).toHaveBeenCalledWith(UPDATE_CHECK_ALARM);
		expect(chromeMock.alarms.create).toHaveBeenCalledWith(
			UPDATE_CHECK_ALARM,
			expect.objectContaining({ periodInMinutes: expect.any(Number) }),
		);
	});

	it('does not re-register update alarm if already present on startup', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.alarms.get as ReturnType<typeof vi.fn>).mockResolvedValue({
			name: UPDATE_CHECK_ALARM,
		});

		await lifecycle.handleStartup();

		expect(chromeMock.alarms.create).not.toHaveBeenCalledWith(
			UPDATE_CHECK_ALARM,
			expect.anything(),
		);
	});

	it('dispatches update check alarm to checkForUpdate', async () => {
		const { lifecycle } = createLifecycle();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: '1.9.1' }),
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = fetchMock;

		await lifecycle.handleAlarm({ name: UPDATE_CHECK_ALARM } as chrome.alarms.Alarm);

		expect(fetchMock).toHaveBeenCalled();
		globalThis.fetch = originalFetch;
	});
});

describe('checkForUpdate', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		resetChromeMock();
		vi.clearAllMocks();
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('returns up-to-date when remote matches manifest', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
			version: '1.9.1',
		});
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: '1.9.1' }),
		});

		const result = await lifecycle.checkForUpdate();

		expect(result).toEqual({ reloading: false, reason: 'up-to-date' });
		expect(chromeMock.runtime.reload).not.toHaveBeenCalled();
	});

	it('reloads when remote version is newer', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
			version: '1.9.0',
		});
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: '1.9.1' }),
		});

		const result = await lifecycle.checkForUpdate();

		expect(result).toEqual({ reloading: true, reason: 'update-applied' });
		expect(chromeMock.runtime.reload).toHaveBeenCalledOnce();
		expect(chromeMock.storage.local._getStore()[STORAGE_KEY_LAST_UPDATE_ATTEMPT]).toBe('1.9.1');
	});

	it('skips reload if already attempted for same remote version (CRX loop prevention)', async () => {
		const { lifecycle } = createLifecycle();
		(chromeMock.runtime.getManifest as ReturnType<typeof vi.fn>).mockReturnValue({
			version: '1.9.0',
		});
		await chromeMock.storage.local.set({ [STORAGE_KEY_LAST_UPDATE_ATTEMPT]: '1.9.1' });
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ version: '1.9.1' }),
		});

		const result = await lifecycle.checkForUpdate();

		expect(result).toEqual({ reloading: false, reason: 'already-attempted' });
		expect(chromeMock.runtime.reload).not.toHaveBeenCalled();
	});

	it('handles HTTP errors gracefully', async () => {
		const { lifecycle } = createLifecycle();
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

		const result = await lifecycle.checkForUpdate();

		expect(result.reloading).toBe(false);
		expect(result.reason).toContain('500');
	});

	it('handles network errors gracefully', async () => {
		const { lifecycle } = createLifecycle();
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await lifecycle.checkForUpdate();

		expect(result.reloading).toBe(false);
		expect(result.reason).toContain('Network error');
	});

	it('handles invalid version.json format', async () => {
		const { lifecycle } = createLifecycle();
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ name: 'oops' }),
		});

		const result = await lifecycle.checkForUpdate();

		expect(result.reloading).toBe(false);
		expect(result.reason).toContain('Invalid version.json');
	});
});

describe('hasProviderSettingsChange', () => {
	it('returns true for provider-related settings and false for unrelated changes', () => {
		expect(
			hasProviderSettingsChange({
				primaryProvider: {
					oldValue: 'openrouter',
					newValue: 'groq',
				} as chrome.storage.StorageChange,
			}),
		).toBe(true);

		expect(
			hasProviderSettingsChange({
				confidenceThreshold: {
					oldValue: 0.7,
					newValue: 0.8,
				} as chrome.storage.StorageChange,
			}),
		).toBe(false);
	});
});

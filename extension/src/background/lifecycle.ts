import type { Logger } from '../utils/logger';
import type { ProviderService } from './provider-service';
import { PROVIDER_SETTINGS_KEYS } from './provider-service';
import { PROCESSING_RECOVERY_ALARM_PREFIX, RuntimeStateManager } from './runtime-state';

/** Keep-alive alarm period in minutes (24s, under 30s idle limit) */
const KEEPALIVE_PERIOD_MINUTES = 0.4;

/** Idle reset delay in minutes (30s) */
const IDLE_RESET_DELAY_MINUTES = 0.5;

const KEEPALIVE_ALARM = 'sw-keepalive';
const IDLE_RESET_ALARM = 'sw-idle-reset';

/** Auto-update check alarm — fires every UPDATE_CHECK_INTERVAL_HOURS */
export const UPDATE_CHECK_ALARM = 'autocra-update-check';
const UPDATE_CHECK_INTERVAL_HOURS = 6;
const UPDATE_CHECK_FIRST_DELAY_MINUTES = 1;
const UPDATE_CHECK_TIMEOUT_MS = 10_000;

const VERSION_URL = 'https://autocr.nicx.me/version.json';

/**
 * Storage keys for the auto-update mechanism.
 * - installedVersion: the version that was loaded after last install/reload
 * - lastUpdateAttemptVersion: prevents reload loops for CRX-installed extensions
 *   where disk files don't change on reload
 */
export const STORAGE_KEY_INSTALLED_VERSION = 'acra_installedVersion';
export const STORAGE_KEY_LAST_UPDATE_ATTEMPT = 'acra_lastUpdateAttemptVersion';

interface BackgroundLifecycleDeps {
	logger: Logger;
	runtimeStateManager: RuntimeStateManager;
	providerService: ProviderService;
}

export function hasProviderSettingsChange(
	changes: Record<string, chrome.storage.StorageChange>,
): boolean {
	return PROVIDER_SETTINGS_KEYS.some((key) => key in changes);
}

export class BackgroundLifecycle {
	private idleResetTimestamp = 0;

	constructor(private readonly deps: BackgroundLifecycleDeps) {}

	withKeepAlive = async <T>(execute: () => Promise<T>): Promise<T> => {
		this.startKeepAlive();
		try {
			return await execute();
		} finally {
			this.stopKeepAlive();
		}
	};

	scheduleIdleReset(): void {
		this.idleResetTimestamp = Date.now();
		chrome.alarms.create(IDLE_RESET_ALARM, { delayInMinutes: IDLE_RESET_DELAY_MINUTES });
	}

	handleAlarm = async (alarm: chrome.alarms.Alarm): Promise<void> => {
		if (alarm.name === KEEPALIVE_ALARM) {
			this.deps.logger.debug('Keep-alive ping');
			return;
		}

		if (alarm.name === IDLE_RESET_ALARM) {
			await this.handleIdleReset();
			return;
		}

		if (alarm.name === UPDATE_CHECK_ALARM) {
			await this.checkForUpdate();
			return;
		}

		if (alarm.name.startsWith(PROCESSING_RECOVERY_ALARM_PREFIX)) {
			const scopeId = alarm.name.slice(PROCESSING_RECOVERY_ALARM_PREFIX.length);
			await this.deps.runtimeStateManager.recoverStaleProcessingScope(scopeId);
		}
	};

	handleTabRemoved = async (tabId: number): Promise<void> => {
		await this.deps.runtimeStateManager.removeTabScope(tabId);
	};

	handleCommand = async (command: string): Promise<void> => {
		if (command === 'scan-page') {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (tab?.id) {
				chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
			}
			return;
		}

		if (command === 'toggle-enabled') {
			const { enabled } = await chrome.storage.local.get({ enabled: false });
			await chrome.storage.local.set({ enabled: !enabled });
			await this.deps.runtimeStateManager.setEnabled(!enabled);
		}
	};

	resetAndReinitialize = async (): Promise<void> => {
		this.stopKeepAlive();
		chrome.alarms.clear(IDLE_RESET_ALARM);
		this.idleResetTimestamp = 0;
		await this.deps.runtimeStateManager.resetAll();
		await this.deps.providerService.reloadFromStorage();
	};

	handleInstalled = async (details: chrome.runtime.InstalledDetails): Promise<void> => {
		try {
			if (details.reason === 'install') {
				chrome.tabs.create({ url: 'https://www.coursera.org/' });
			}
			await this.resetAndReinitialize();
			await this.storeInstalledVersion();
			await this.registerUpdateAlarm();
			this.deps.logger.info('Extension installed/updated');
		} catch (error) {
			this.deps.logger.error('onInstalled handler failed', error);
		}
	};

	handleStartup = async (): Promise<void> => {
		try {
			this.deps.logger.info('Service worker startup');
			await this.resetAndReinitialize();
			await this.ensureUpdateAlarm();
		} catch (error) {
			this.deps.logger.error('onStartup handler failed', error);
		}
	};

	handleStorageChanged = async (
		changes: Record<string, chrome.storage.StorageChange>,
		areaName: string,
	): Promise<void> => {
		if (areaName !== 'local' || !hasProviderSettingsChange(changes)) {
			return;
		}

		this.deps.logger.info('Settings changed, re-initializing providers');
		await this.deps.providerService.reloadFromStorage();
	};

	/**
	 * Polls version.json and reloads the extension if the Task Scheduler
	 * updater has swapped files on disk with a newer version.
	 *
	 * To prevent reload loops on CRX-installed extensions (where disk files
	 * don't change on reload), we track `lastUpdateAttemptVersion` and only
	 * attempt one reload per remote version.
	 */
	checkForUpdate = async (): Promise<{ reloading: boolean; reason: string }> => {
		try {
			const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
				cache: 'no-store',
				signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
			});

			if (!res.ok) {
				const reason = `Version check HTTP ${res.status}`;
				this.deps.logger.warn(reason);
				return { reloading: false, reason };
			}

			const data: unknown = await res.json();
			if (!data || typeof data !== 'object' || !('version' in data)) {
				return { reloading: false, reason: 'Invalid version.json format' };
			}
			const remoteVersion = (data as { version: string }).version;
			if (!remoteVersion || typeof remoteVersion !== 'string') {
				return { reloading: false, reason: 'Missing version field' };
			}

			const manifestVersion = chrome.runtime.getManifest().version;
			if (remoteVersion === manifestVersion) {
				this.deps.logger.debug(`Up to date (${manifestVersion})`);
				return { reloading: false, reason: 'up-to-date' };
			}

			const stored = await chrome.storage.local.get(STORAGE_KEY_LAST_UPDATE_ATTEMPT);
			const lastAttempt = stored[STORAGE_KEY_LAST_UPDATE_ATTEMPT] as string | undefined;
			if (lastAttempt === remoteVersion) {
				this.deps.logger.debug(
					`Already attempted reload for ${remoteVersion} — skipping (likely CRX-installed)`,
				);
				return { reloading: false, reason: 'already-attempted' };
			}

			this.deps.logger.info(
				`Update available: ${manifestVersion} → ${remoteVersion}. Reloading...`,
			);
			await chrome.storage.local.set({ [STORAGE_KEY_LAST_UPDATE_ATTEMPT]: remoteVersion });
			chrome.runtime.reload();
			return { reloading: true, reason: 'update-applied' };
		} catch (error) {
			const reason =
				error instanceof Error && error.name === 'TimeoutError'
					? 'Version check timed out'
					: `Update check failed: ${error instanceof Error ? error.message : String(error)}`;
			this.deps.logger.warn(reason);
			return { reloading: false, reason };
		}
	};

	reloadProvidersFromStorage = async (): Promise<void> => {
		await this.deps.providerService.reloadFromStorage();
	};

	resetForTests = async (): Promise<void> => {
		this.stopKeepAlive();
		chrome.alarms.clear(IDLE_RESET_ALARM);
		chrome.alarms.clear(UPDATE_CHECK_ALARM);
		this.idleResetTimestamp = 0;
		await this.deps.providerService.resetForTests();
		await this.deps.runtimeStateManager.resetAll();
	};

	private async storeInstalledVersion(): Promise<void> {
		const version = chrome.runtime.getManifest().version;
		await chrome.storage.local.set({ [STORAGE_KEY_INSTALLED_VERSION]: version });
	}

	private async registerUpdateAlarm(): Promise<void> {
		await chrome.alarms.create(UPDATE_CHECK_ALARM, {
			delayInMinutes: UPDATE_CHECK_FIRST_DELAY_MINUTES,
			periodInMinutes: UPDATE_CHECK_INTERVAL_HOURS * 60,
		});
		this.deps.logger.info(`Update check alarm registered (every ${UPDATE_CHECK_INTERVAL_HOURS}h)`);
	}

	private async ensureUpdateAlarm(): Promise<void> {
		const existing = await chrome.alarms.get(UPDATE_CHECK_ALARM);
		if (!existing) {
			await this.registerUpdateAlarm();
		}
	}

	private startKeepAlive(): void {
		chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: KEEPALIVE_PERIOD_MINUTES });
	}

	private stopKeepAlive(): void {
		chrome.alarms.clear(KEEPALIVE_ALARM);
	}

	private async handleIdleReset(): Promise<void> {
		try {
			await this.deps.runtimeStateManager.idleActiveScopesUpdatedBefore(this.idleResetTimestamp);
		} catch {
			/* service worker context may have been invalidated */
		}
	}
}

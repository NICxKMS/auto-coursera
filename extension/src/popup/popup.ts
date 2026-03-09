/**
 * Popup UI logic — toggle, status, error display with copy, action buttons.
 * REQ: REQ-012
 */

import { Logger } from '../utils/logger';

const logger = new Logger('Popup');

/** Maps primaryProvider value to its model settings key */
const PROVIDER_MODEL_KEY: Record<string, string> = {
	openrouter: 'openrouterModel',
	'nvidia-nim': 'nvidiaModel',
	gemini: 'geminiModel',
	groq: 'groqModel',
	cerebras: 'cerebrasModel',
};

const SETTINGS_DISPLAY_KEYS = ['primaryProvider', ...Object.values(PROVIDER_MODEL_KEY)];

function getElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

// DOM elements
let enableToggle: HTMLInputElement;
let statusText: HTMLElement;
let statusDot: HTMLElement;
let providerName: HTMLElement;
let modelName: HTMLElement;
let confidenceValue: HTMLElement;
let openOptionsLink: HTMLElement;
let errorBanner: HTMLElement;
let errorText: HTMLElement;
let errorCopyBtn: HTMLButtonElement;
let retryBtn: HTMLButtonElement;
let scanBtn: HTMLButtonElement;
let refreshBtn: HTMLButtonElement;
let copyResetTimeout: ReturnType<typeof setTimeout> | null = null;

async function init(): Promise<void> {
	// Get DOM references
	enableToggle = getElement<HTMLInputElement>('enableToggle');
	statusText = getElement<HTMLElement>('statusText');
	const dot = document.querySelector('.status-dot');
	if (!dot) throw new Error('Element .status-dot not found');
	statusDot = dot as HTMLElement;
	providerName = getElement<HTMLElement>('providerName');
	modelName = getElement<HTMLElement>('modelName');
	confidenceValue = getElement<HTMLElement>('confidenceValue');
	openOptionsLink = getElement<HTMLElement>('openOptions');
	errorBanner = getElement<HTMLElement>('errorBanner');
	errorText = getElement<HTMLElement>('errorText');
	errorCopyBtn = getElement<HTMLButtonElement>('errorCopyBtn');
	retryBtn = getElement<HTMLButtonElement>('retryBtn');
	scanBtn = getElement<HTMLButtonElement>('scanBtn');
	refreshBtn = getElement<HTMLButtonElement>('refreshBtn');

	// Load current state
	await loadStatus();
	await loadSessionStats();

	// Event listeners
	enableToggle.addEventListener('change', handleToggle);
	openOptionsLink.addEventListener('click', (e) => {
		e.preventDefault();
		chrome.runtime.openOptionsPage();
	});

	// Clicking anywhere on banner (including copy button) copies error
	errorBanner.addEventListener('click', handleCopyError);

	// Action buttons
	retryBtn.addEventListener('click', handleRetry);
	scanBtn.addEventListener('click', handleScanPage);
	refreshBtn.addEventListener('click', handleRefresh);

	// Listen for storage changes to update in real-time
	chrome.storage.onChanged.addListener(handleStorageChange);

	logger.info('Popup initialized');
}

async function loadStatus(): Promise<void> {
	// Clean up any previous onboarding hint to restore status elements
	const oldHint = document.getElementById('onboardingHint');
	if (oldHint) {
		oldHint.remove();
		statusDot.style.display = '';
		statusText.style.display = '';
	}

	const [localData, sessionData] = await Promise.all([
		chrome.storage.local.get({
			enabled: false,
			openrouterApiKey: '',
			nvidiaApiKey: '',
			geminiApiKey: '',
			groqApiKey: '',
			cerebrasApiKey: '',
			primaryProvider: 'openrouter',
			openrouterModel: '',
			nvidiaModel: '',
			geminiModel: '',
			groqModel: '',
			cerebrasModel: '',
		}),
		chrome.storage.session.get({
			_lastProvider: '--',
			_lastModel: '--',
			_lastConfidence: null,
			_lastStatus: 'idle',
			_lastError: '',
			_lastStatusTimestamp: 0,
		}),
	]);

	// Detect stale 'active' status (e.g. SW terminated while active)
	let status = sessionData._lastStatus as string;
	const timestamp = sessionData._lastStatusTimestamp as number;
	if (status === 'active' && timestamp > 0 && Date.now() - timestamp > 60_000) {
		status = 'idle';
		chrome.storage.session.set({ _lastStatus: 'idle' }).catch(() => {});
	}

	enableToggle.checked = localData.enabled as boolean;
	updateStatusDisplay(status, localData.enabled as boolean);
	updateButtonState(localData.enabled as boolean);
	// Show last-used provider/model if available, otherwise show configured settings
	const sessionProvider = sessionData._lastProvider as string;
	const sessionModel = sessionData._lastModel as string;
	const configuredProvider = localData.primaryProvider as string;
	const modelKey = PROVIDER_MODEL_KEY[configuredProvider];
	const configuredModel = modelKey ? (localData[modelKey] as string) : '';

	providerName.textContent =
		sessionProvider && sessionProvider !== '--' ? sessionProvider : configuredProvider || '--';
	modelName.textContent =
		sessionModel && sessionModel !== '--' ? sessionModel : configuredModel || '--';
	confidenceValue.textContent =
		sessionData._lastConfidence !== null
			? (sessionData._lastConfidence as number).toFixed(2)
			: '--';

	updateErrorBanner(sessionData._lastError as string, sessionData._lastStatus as string);

	// H-3: Onboarding — check if API keys are configured
	if (!sessionData._lastProvider || status === 'idle') {
		if (
			!localData.openrouterApiKey &&
			!localData.nvidiaApiKey &&
			!localData.geminiApiKey &&
			!localData.groqApiKey &&
			!localData.cerebrasApiKey
		) {
			const statusDiv = document.getElementById('statusIndicator');
			if (statusDiv && !document.getElementById('onboardingHint')) {
				// Hide status elements without destroying them
				statusDot.style.display = 'none';
				statusText.style.display = 'none';
				const span = document.createElement('span');
				span.id = 'onboardingHint';
				span.style.color = '#eab308';
				span.append('\u2699\uFE0F Setup needed \u2014 ');
				const link = document.createElement('a');
				link.href = '#';
				link.textContent = 'Configure API keys';
				link.addEventListener('click', (e) => {
					e.preventDefault();
					chrome.runtime.openOptionsPage();
				});
				span.appendChild(link);
				span.append(' to get started');
				statusDiv.appendChild(span);
			}
		}
	}
}

// Issue 6: Error pattern → user-friendly message
const ERROR_PATTERNS: [RegExp, string][] = [
	[/NO_API_KEY/i, 'Please add an API key in Settings to get started.'],
	[/RATE_LIMITED|429|rate.?limit/i, 'Too many requests \u2014 please wait a moment and try again.'],
	[/AUTH_FAILED|40[13]/i, 'Your API key is invalid or expired. Check Settings.'],
	[
		/ALL_PROVIDERS_FAILED/i,
		'Could not connect to any AI provider. Check your internet and API keys.',
	],
	[/SOLVE_FAILED/i, 'Failed to solve this question. Try again or check Settings.'],
];

function getUserFriendlyError(rawError: string): string {
	return (
		ERROR_PATTERNS.find(([p]) => p.test(rawError))?.[1] ??
		'Something went wrong. Check the popup for details.'
	);
}

async function loadSessionStats(): Promise<void> {
	const data = await chrome.storage.session.get({ solvedCount: 0, failedCount: 0, tokenCount: 0 });
	const solved = document.getElementById('solvedCount');
	const failed = document.getElementById('failedCount');
	const tokens = document.getElementById('tokenCount');
	if (solved) solved.textContent = String(data.solvedCount);
	if (failed) failed.textContent = String(data.failedCount);
	if (tokens) tokens.textContent = String(data.tokenCount);
}

async function handleToggle(): Promise<void> {
	const enabled = enableToggle.checked;
	try {
		await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: enabled });
		await loadStatus();
		updateButtonState(enabled);
	} catch (err) {
		// Revert toggle to match actual stored state
		logger.error('Toggle failed', err);
		enableToggle.checked = !enabled;
	}
}

const STATUS_MAP: Record<string, [string, string?]> = {
	active: ['Done', 'active'],
	processing: ['Processing...', 'active'],
	error: ['Error', 'error'],
};

function updateStatusDisplay(status: string, enabled: boolean): void {
	statusDot.className = 'status-dot';
	if (!enabled) {
		statusText.textContent = 'Disabled';
		return;
	}
	const [text, dotClass] = STATUS_MAP[status] ?? ['Idle'];
	statusText.textContent = text;
	if (dotClass) statusDot.classList.add(dotClass);
}

function updateButtonState(enabled: boolean): void {
	retryBtn.disabled = !enabled;
	scanBtn.disabled = !enabled;
}

function updateErrorBanner(error: string, status: string): void {
	if (status === 'error') {
		errorBanner.style.display = 'flex';
		errorText.textContent = error
			? getUserFriendlyError(error)
			: 'An error occurred. Check settings or refresh the Coursera page.';
	} else {
		errorBanner.style.display = 'none';
		errorText.textContent = '';
	}
}

async function handleCopyError(): Promise<void> {
	const fullError = errorText.textContent ?? 'Unknown error';
	try {
		await navigator.clipboard.writeText(fullError);
	} catch {
		// Fallback for clipboard API not available
		const textarea = document.createElement('textarea');
		textarea.value = fullError;
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		document.body.removeChild(textarea);
	}
	errorCopyBtn.textContent = '✅ Copied!';
	errorCopyBtn.classList.add('copied');
	if (copyResetTimeout) clearTimeout(copyResetTimeout);
	copyResetTimeout = setTimeout(() => {
		errorCopyBtn.textContent = '📋 Copy Error';
		errorCopyBtn.classList.remove('copied');
		copyResetTimeout = null;
	}, 2000);
}

async function sendTabAction(
	btn: HTMLButtonElement,
	messageType: 'SCAN_PAGE' | 'RETRY_QUESTIONS',
	resetLabel: string,
): Promise<void> {
	btn.textContent = '⏳...';
	btn.disabled = true;
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		if (tab?.id && tab.url?.includes('coursera.org')) {
			await chrome.tabs.sendMessage(tab.id, { type: messageType });
		} else {
			logger.warn('Not on a Coursera page');
			statusText.textContent = 'Not on Coursera page';
			statusDot.className = 'status-dot error';
		}
	} catch {
		logger.warn('Content script not loaded. Refresh the Coursera page.');
		if (statusText) statusText.textContent = 'Refresh the Coursera page first';
	}
	setTimeout(() => {
		btn.textContent = resetLabel;
		// Only re-enable if the extension is still enabled
		btn.disabled = !enableToggle.checked;
	}, 1500);
}

const handleRetry = () => sendTabAction(retryBtn, 'RETRY_QUESTIONS', '🔄 Retry');
const handleScanPage = () => sendTabAction(scanBtn, 'SCAN_PAGE', '🔍 Scan Page');

async function handleRefresh(): Promise<void> {
	refreshBtn.textContent = '⏳...';
	refreshBtn.disabled = true;
	try {
		const response = await chrome.runtime.sendMessage({ type: 'RESET_EXTENSION' });
		if (response?.type === 'ERROR') {
			logger.error('Reset failed', response.payload);
		} else {
			await loadStatus();
			await loadSessionStats();
		}
	} catch (err) {
		logger.error('Reset message failed', err);
	}
	setTimeout(() => {
		refreshBtn.textContent = '🔃 Refresh';
		refreshBtn.disabled = false;
	}, 1500);
}

function handleStorageChange(
	changes: { [key: string]: chrome.storage.StorageChange },
	areaName: string,
): void {
	if (areaName === 'local') {
		if (changes.enabled) {
			const newEnabled = changes.enabled.newValue as boolean;
			enableToggle.checked = newEnabled;
			updateButtonState(newEnabled);
			// Full reload to sync status display with actual session state
			loadStatus().catch((err) => logger.error('Enabled change refresh failed', err));
		}
		// When provider/model settings change, refresh the display
		if (SETTINGS_DISPLAY_KEYS.some((key) => key in changes)) {
			loadStatus().catch((err) => logger.error('Settings refresh failed', err));
			return;
		}
	}
	// Status fields are in session storage
	if (areaName === 'session') {
		if (changes._lastProvider) {
			providerName.textContent = (changes._lastProvider.newValue as string) || '--';
		}
		if (changes._lastModel) {
			modelName.textContent = (changes._lastModel.newValue as string) || '--';
		}
		if (changes._lastConfidence) {
			const conf = changes._lastConfidence.newValue as number | null;
			confidenceValue.textContent = conf !== null ? conf.toFixed(2) : '--';
		}
		// Update session stats on change
		if (changes.solvedCount || changes.failedCount || changes.tokenCount) {
			loadSessionStats().catch((err) => logger.error('Session stats update failed', err));
		}
		if (changes._lastStatus || changes._lastError) {
			Promise.all([
				chrome.storage.local.get({ enabled: false }),
				chrome.storage.session.get({ _lastStatus: 'idle', _lastError: '' }),
			])
				.then(([localData, sessionData]) => {
					updateStatusDisplay(sessionData._lastStatus as string, localData.enabled as boolean);
					updateButtonState(localData.enabled as boolean);
					updateErrorBanner(sessionData._lastError as string, sessionData._lastStatus as string);
				})
				.catch((err) => logger.error('Status update failed', err));
		}
	}
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
	init().catch((err) => logger.error('Popup init failed', err));
});

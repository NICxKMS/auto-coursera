/**
 * Popup UI logic — slim fallback for non-Coursera pages and quick access.
 * On Coursera pages, shows status, stats, and action buttons.
 * On non-Coursera pages, shows a guidance message.
 * REQ: REQ-012
 */

import {
	getRuntimeStateForTab,
	readRuntimeSessionSnapshot,
	SESSION_RUNTIME_SCOPES_KEY,
	SESSION_RUNTIME_TAB_SCOPES_KEY,
} from '../types/runtime';
import { getUserFriendlyError } from '../utils/error-messages';
import { Logger } from '../utils/logger';

const logger = new Logger('Popup');
const STALE_ACTIVE_STATE_MS = 60_000;

export interface PopupRuntimeSnapshot {
	status: string;
	lastError: string;
	solvedCount: number;
	failedCount: number;
	tokenCount: number;
}

function getElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

// DOM elements
let enableToggle: HTMLInputElement;
let statusText: HTMLElement;
let statusDot: HTMLElement;
let courseraContext: HTMLElement;
let nonCourseraContext: HTMLElement;
let errorBanner: HTMLElement;
let errorText: HTMLElement;
let errorCopyBtn: HTMLButtonElement;
let retryBtn: HTMLButtonElement;
let scanBtn: HTMLButtonElement;
let openOptionsLink: HTMLElement;
let copyResetTimeout: ReturnType<typeof setTimeout> | null = null;

/** Whether the active tab is a Coursera page */
let isOnCoursera = false;
let activeTabId: number | null = null;

export function getPopupRuntimeSnapshot(
	sessionData: Record<string, unknown>,
	tabId: number | null,
	enabled: boolean,
): PopupRuntimeSnapshot {
	if (!enabled) {
		return {
			status: 'disabled',
			lastError: '',
			solvedCount: 0,
			failedCount: 0,
			tokenCount: 0,
		};
	}

	if (tabId === null) {
		return {
			status: 'idle',
			lastError: '',
			solvedCount: 0,
			failedCount: 0,
			tokenCount: 0,
		};
	}

	const snapshot = readRuntimeSessionSnapshot(sessionData);
	const runtimeState = getRuntimeStateForTab(snapshot, tabId);
	if (!runtimeState) {
		return {
			status: 'idle',
			lastError: '',
			solvedCount: 0,
			failedCount: 0,
			tokenCount: 0,
		};
	}

	const status =
		runtimeState.status === 'active' &&
		runtimeState.updatedAt > 0 &&
		Date.now() - runtimeState.updatedAt > STALE_ACTIVE_STATE_MS
			? 'idle'
			: runtimeState.status;

	return {
		status,
		lastError: runtimeState.lastError,
		solvedCount: runtimeState.solvedCount,
		failedCount: runtimeState.failedCount,
		tokenCount: runtimeState.tokenCount,
	};
}

async function init(): Promise<void> {
	// Get DOM references
	enableToggle = getElement<HTMLInputElement>('enableToggle');
	statusText = getElement<HTMLElement>('statusText');
	const dot = document.querySelector('.status-dot');
	if (!dot) throw new Error('Element .status-dot not found');
	statusDot = dot as HTMLElement;
	courseraContext = getElement<HTMLElement>('courseraContext');
	nonCourseraContext = getElement<HTMLElement>('nonCourseraContext');
	errorBanner = getElement<HTMLElement>('errorBanner');
	errorText = getElement<HTMLElement>('errorText');
	errorCopyBtn = getElement<HTMLButtonElement>('errorCopyBtn');
	retryBtn = getElement<HTMLButtonElement>('retryBtn');
	scanBtn = getElement<HTMLButtonElement>('scanBtn');
	openOptionsLink = getElement<HTMLElement>('openOptions');

	// Detect context — is the user on a Coursera page?
	await detectContext();

	// Load current state
	await refreshPopupRuntime();

	// Event listeners
	enableToggle.addEventListener('change', handleToggle);
	openOptionsLink.addEventListener('click', async (e) => {
		e.preventDefault();
		if (isOnCoursera) {
			try {
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (tab?.id) {
					const response = await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SETTINGS' });
					if (response?.success) {
						window.close();
					} else {
						chrome.runtime.openOptionsPage();
					}
				}
			} catch {
				chrome.runtime.openOptionsPage();
			}
		} else {
			chrome.runtime.openOptionsPage();
		}
	});

	// Clicking anywhere on banner (including copy button) copies error
	errorBanner.addEventListener('click', handleCopyError);

	// Action buttons
	retryBtn.addEventListener('click', handleRetry);
	scanBtn.addEventListener('click', handleScanPage);

	// Listen for storage changes to update in real-time
	chrome.storage.onChanged.addListener(handleStorageChange);

	logger.info('Popup initialized');
}

/** Detect whether the active tab is on coursera.org and show the appropriate context */
async function detectContext(): Promise<void> {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		activeTabId = typeof tab?.id === 'number' ? tab.id : null;
		isOnCoursera = /^https:\/\/www\.coursera\.org\//.test(tab?.url ?? '');
	} catch {
		activeTabId = null;
		isOnCoursera = false;
	}
	courseraContext.style.display = isOnCoursera ? 'block' : 'none';
	nonCourseraContext.style.display = isOnCoursera ? 'none' : 'block';
}

function renderSessionStats(data: PopupRuntimeSnapshot): void {
	const solved = document.getElementById('solvedCount');
	const failed = document.getElementById('failedCount');
	const tokens = document.getElementById('tokenCount');
	if (solved) solved.textContent = String(data.solvedCount);
	if (failed) failed.textContent = String(data.failedCount);
	if (tokens) tokens.textContent = String(data.tokenCount);
}

async function refreshPopupRuntime(): Promise<void> {
	const [localData, sessionData] = await Promise.all([
		chrome.storage.local.get({ enabled: false }),
		chrome.storage.session.get({
			[SESSION_RUNTIME_SCOPES_KEY]: {},
			[SESSION_RUNTIME_TAB_SCOPES_KEY]: {},
		}),
	]);

	const enabled = localData.enabled as boolean;
	const runtime = getPopupRuntimeSnapshot(
		sessionData as Record<string, unknown>,
		activeTabId,
		enabled,
	);

	enableToggle.checked = enabled;
	updateStatusDisplay(runtime.status, enabled);
	updateButtonState(enabled);
	updateErrorBanner(runtime.lastError, runtime.status);
	renderSessionStats(runtime);
}

async function handleToggle(): Promise<void> {
	const enabled = enableToggle.checked;
	try {
		await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: enabled });
		await refreshPopupRuntime();
	} catch (err) {
		// Revert toggle to match actual stored state
		logger.error('Toggle failed', err);
		enableToggle.checked = !enabled;
	}
}

const STATUS_MAP: Record<string, [string, string?]> = {
	active: ['Done', 'active'],
	processing: ['Processing...', 'processing'],
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
		errorCopyBtn.textContent = '📋 Copy';
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
const handleScanPage = () => sendTabAction(scanBtn, 'SCAN_PAGE', '🔍 Scan');

function handleStorageChange(
	changes: { [key: string]: chrome.storage.StorageChange },
	areaName: string,
): void {
	if (areaName === 'local') {
		if (changes.enabled) {
			const newEnabled = changes.enabled.newValue as boolean;
			enableToggle.checked = newEnabled;
			updateButtonState(newEnabled);
			refreshPopupRuntime().catch((err) => logger.error('Enabled change refresh failed', err));
		}
	}
	if (areaName === 'session') {
		if (changes[SESSION_RUNTIME_SCOPES_KEY] || changes[SESSION_RUNTIME_TAB_SCOPES_KEY]) {
			refreshPopupRuntime().catch((err) => logger.error('Runtime update failed', err));
		}
	}
}

// Bootstrap
if (typeof document !== 'undefined') {
	document.addEventListener('DOMContentLoaded', () => {
		init().catch((err) => logger.error('Popup init failed', err));
	});
}

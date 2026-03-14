/**
 * Content script — entry point for Coursera question solving.
 * Thin bootstrap: initialization, event wiring, and widget mounting.
 */

import type { Message } from '../types/messages';
import type { PageRuntimeScope, RuntimeStateView } from '../types/runtime';
import { DEFAULT_SETTINGS } from '../types/settings';
import { WidgetHost } from '../ui/widget-host';
import type { ContentBridge } from '../ui/widget-types';
import { Logger } from '../utils/logger';
import { cancelPageWork, registerPageContext } from './bridge';
import { createContentId, DATA_ATTRIBUTES } from './constants';
import { QuestionDetector } from './detector';
import { handleDetectedQuestion, initOrchestrator, resetBatchState } from './orchestrator';
import { AnswerSelector, clearProcessing } from './selector';

const logger = new Logger('ContentScript');

// ── Module State ────────────────────────────────────────────────

let detector: QuestionDetector | null = null;
let selector: AnswerSelector;
let isEnabled = false;
let widgetHost: WidgetHost | null = null;
let pageContext: PageRuntimeScope = createPageContextScope(window.location.href);

function createPageContextScope(pageUrl: string): PageRuntimeScope {
	return {
		pageInstanceId: createContentId('page'),
		pageUrl,
	};
}

// ── Widget Helpers ──────────────────────────────────────────────

function applyWidgetRuntimeState(runtimeState: RuntimeStateView | null): void {
	widgetHost?.setRuntimeState(runtimeState);
}

function clearVisibleErrors(): void {
	document
		.querySelectorAll(`[${DATA_ATTRIBUTES.ERROR}="true"]`)
		.forEach((el) => clearProcessing(el as HTMLElement));
}

// ── Page Lifecycle ──────────────────────────────────────────────

async function rescanCurrentPage(reason: 'rescan' | 'retry'): Promise<void> {
	await cancelPageWork(reason, pageContext);
	resetBatchState();
	clearVisibleErrors();
	const runtimeState = await registerPageContext(pageContext);
	applyWidgetRuntimeState(runtimeState);
	if (detector) {
		detector.scan();
	} else {
		startDetection();
	}
}

async function handleNavigation(
	currentUrl: string,
	previousScope: PageRuntimeScope,
): Promise<void> {
	logger.info(`SPA navigation detected: ${currentUrl}`);

	try {
		const { enabled } = await chrome.storage.local.get({ enabled: false });
		isEnabled = enabled as boolean;
	} catch {
		/* keep previous enabled state */
	}

	pageContext = createPageContextScope(currentUrl);
	applyWidgetRuntimeState(null);
	await cancelPageWork('navigation', previousScope);
	resetBatchState();

	if (isEnabled) {
		const runtimeState = await registerPageContext(pageContext);
		applyWidgetRuntimeState(runtimeState);
		if (detector) {
			detector.scan();
		}
	}
}

// ── Detection ───────────────────────────────────────────────────

function startDetection(): void {
	if (detector) return;
	detector = new QuestionDetector(handleDetectedQuestion);
	detector.start();
	logger.info('Detection started');
}

function stopDetection(): void {
	if (detector) {
		detector.stop();
		detector = null;
	}
	resetBatchState();
	clearVisibleErrors();
	logger.info('Detection stopped');
}

// ── Initialization ──────────────────────────────────────────────

async function init(): Promise<void> {
	logger.info(`Content script loaded on: ${window.location.href}`);
	logger.info('Content script initializing');

	const settings = await chrome.storage.local.get({
		enabled: DEFAULT_SETTINGS.enabled,
		confidenceThreshold: DEFAULT_SETTINGS.confidenceThreshold,
		autoSelect: DEFAULT_SETTINGS.autoSelect,
		autoStartOnPageLoad: DEFAULT_SETTINGS.autoStartOnPageLoad,
	});
	isEnabled = settings.enabled as boolean;

	selector = new AnswerSelector(
		settings.confidenceThreshold as number,
		settings.autoSelect as boolean,
	);

	initOrchestrator({
		isEnabled: () => isEnabled,
		pageContext: () => pageContext,
		select: (options, indices, confidence) => selector.select(options, indices, confidence),
		fillInput: (inputElement, questionElement, value, confidence) =>
			selector.fillInput(inputElement, questionElement, value, confidence),
	});

	const initialRuntimeState = await registerPageContext(pageContext);

	if (isEnabled && settings.autoStartOnPageLoad) {
		startDetection();
	}

	// Message listener
	chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
		if (message.type === 'OPEN_SETTINGS') {
			if (widgetHost) {
				widgetHost.openSettings();
				sendResponse({ success: true });
			} else {
				sendResponse({ success: false, reason: 'Widget not mounted' });
			}
			return false;
		}

		if (message.type === 'SCAN_PAGE' || message.type === 'RETRY_QUESTIONS') {
			if (!isEnabled) {
				sendResponse({ success: false, reason: 'Extension is disabled' });
				return false;
			}

			void rescanCurrentPage(message.type === 'SCAN_PAGE' ? 'rescan' : 'retry')
				.then(() => sendResponse({ success: true }))
				.catch((error) => {
					logger.error('Rescan request failed', error);
					sendResponse({ success: false, reason: 'Rescan failed' });
				});
			return true;
		}

		return false;
	});

	// Storage change listener
	chrome.storage.onChanged.addListener(async (changes, areaName) => {
		if (areaName !== 'local') return;

		if (changes.enabled) {
			isEnabled = changes.enabled.newValue as boolean;
			if (isEnabled) {
				const runtimeState = await registerPageContext(pageContext);
				applyWidgetRuntimeState(runtimeState);
				startDetection();
			} else {
				stopDetection();
				await cancelPageWork('disable', pageContext);
			}
		}

		if (changes.confidenceThreshold || changes.autoSelect) {
			const current = await chrome.storage.local.get({
				confidenceThreshold: DEFAULT_SETTINGS.confidenceThreshold,
				autoSelect: DEFAULT_SETTINGS.autoSelect,
			});
			selector = new AnswerSelector(
				(changes.confidenceThreshold?.newValue ?? current.confidenceThreshold) as number,
				(changes.autoSelect?.newValue ?? current.autoSelect) as boolean,
			);
		}

		const retryKeys = [
			'openrouterApiKey',
			'nvidiaApiKey',
			'geminiApiKey',
			'groqApiKey',
			'cerebrasApiKey',
			'primaryProvider',
		];
		if (isEnabled && retryKeys.some((key) => key in changes)) {
			logger.info('API settings changed, clearing errors and re-scanning');
			await rescanCurrentPage('retry');
		}
	});

	// SPA navigation detection
	let lastUrl = window.location.href;
	const handleUrlChange = (): void => {
		const currentUrl = window.location.href;
		if (currentUrl === lastUrl) return;
		const previousScope = pageContext;
		lastUrl = currentUrl;
		void handleNavigation(currentUrl, previousScope);
	};
	const origPushState = history.pushState.bind(history);
	const origReplaceState = history.replaceState.bind(history);
	history.pushState = (...args: Parameters<typeof history.pushState>) => {
		origPushState(...args);
		handleUrlChange();
	};
	history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
		origReplaceState(...args);
		handleUrlChange();
	};
	window.addEventListener('popstate', handleUrlChange);

	// Widget mounting
	try {
		const bridge: ContentBridge = {
			scan() {
				void rescanCurrentPage('rescan');
			},
			retry() {
				void rescanCurrentPage('retry');
			},
			refresh() {
				chrome.runtime
					.sendMessage({ type: 'RESET_EXTENSION' })
					.then(async () => {
						const runtimeState = await registerPageContext(pageContext);
						applyWidgetRuntimeState(runtimeState);
						if (isEnabled && detector) {
							detector.scan();
						}
					})
					.catch(() => {});
			},
		};

		const host = new WidgetHost();
		host.mount(bridge, initialRuntimeState ?? undefined);
		widgetHost = host;
	} catch (error) {
		logger.error('Failed to mount floating widget', error);
	}

	logger.info(`Content script ready (enabled: ${isEnabled})`);
}

init().catch((error) => {
	logger.error('Content script init failed', error);
});

/**
 * Service worker entry — lifecycle management, provider init, message routing.
 * REQ: REQ-006, REQ-007, REQ-008, REQ-011, NFR-004, NFR-005
 */

import { AIProviderManager } from '../services/ai-provider';
import { CerebrasProvider } from '../services/cerebras';
import { GeminiProvider } from '../services/gemini';
import { GroqProvider } from '../services/groq';
import { fetchAsBase64 } from '../services/image-pipeline';
import { NvidiaNimProvider } from '../services/nvidia-nim';
import { OpenRouterProvider } from '../services/openrouter';
import type { AIBatchRequest, IAIProvider } from '../types/api';
import type {
	ApplyOutcomePayload,
	BatchQuestionPayload,
	BatchSolveResponsePayload,
	CancelPageWorkPayload,
	ErrorPayload,
	Message,
	RegisterPageContextPayload,
	RegisterPageContextResponsePayload,
	ReportPageErrorPayload,
	ResetExtensionResponsePayload,
	RuntimeRequestContext,
	SetEnabledResponsePayload,
	TabActionResponsePayload,
	TestConnectionPayload,
	TestConnectionResponsePayload,
} from '../types/messages';
import type { RuntimeScopeDescriptor } from '../types/runtime';
import { getRuntimeScopeId } from '../types/runtime';
import type { AppSettings, ProviderName } from '../types/settings';
import { PROVIDER_KEY_MAP } from '../types/settings';
import {
	ERROR_CODES,
	IDLE_RESET_DELAY_MINUTES,
	KEEPALIVE_PERIOD_MINUTES,
} from '../utils/constants';
import { Logger } from '../utils/logger';
import { RateLimiter } from '../utils/rate-limiter';
import { getSettings, setEnabled } from '../utils/storage';
import { MessageRouter } from './router';
import {
	getProcessingRecoveryAlarmName,
	PROCESSING_RECOVERY_ALARM_PREFIX,
	RuntimeStateManager,
} from './runtime-state';

const logger = new Logger('ServiceWorker');
const router = new MessageRouter();
const runtimeStateManager = new RuntimeStateManager();

let providerManager = new AIProviderManager();
let providersReady = false;
let providerReadyPromise: Promise<void> = getSettings()
	.then((settings) => initializeProviders(settings))
	.catch((error) => {
		logger.error('Provider init failed', error);
		providersReady = true;
	});

const KEEPALIVE_ALARM = 'sw-keepalive';
const IDLE_RESET_ALARM = 'sw-idle-reset';
let idleResetTimestamp = 0;

function errorResponse(code: string, message: string): Message {
	return { type: 'ERROR', payload: { code, message } satisfies ErrorPayload };
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isCancellationError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && /REQUEST_CANCELLED/i.test(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getRuntimeRequestContext(value: unknown): RuntimeRequestContext | null {
	if (
		!isRecord(value) ||
		typeof value.requestId !== 'string' ||
		typeof value.pageInstanceId !== 'string' ||
		typeof value.pageUrl !== 'string'
	) {
		return null;
	}

	return {
		requestId: value.requestId,
		pageInstanceId: value.pageInstanceId,
		pageUrl: value.pageUrl,
	};
}

function getTabId(sender: chrome.runtime.MessageSender): number | null {
	return typeof sender.tab?.id === 'number' ? sender.tab.id : null;
}

function buildScopeDescriptor(
	tabId: number,
	pageInstanceId: string,
	pageUrl: string,
): RuntimeScopeDescriptor {
	return {
		tabId,
		pageInstanceId,
		pageUrl,
		scopeId: getRuntimeScopeId(tabId, pageInstanceId),
	};
}

function getPrimaryProviderModel(settings: AppSettings): string {
	const modelKey = PROVIDER_KEY_MAP[settings.primaryProvider].model;
	return settings[modelKey] as string;
}

function startKeepAlive(): void {
	chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: KEEPALIVE_PERIOD_MINUTES });
}

function stopKeepAlive(): void {
	chrome.alarms.clear(KEEPALIVE_ALARM);
}

function scheduleIdleReset(): void {
	idleResetTimestamp = Date.now();
	chrome.alarms.create(IDLE_RESET_ALARM, { delayInMinutes: IDLE_RESET_DELAY_MINUTES });
}

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === KEEPALIVE_ALARM) {
		logger.debug('Keep-alive ping');
		return;
	}

	if (alarm.name === IDLE_RESET_ALARM) {
		void handleIdleReset();
		return;
	}

	if (alarm.name.startsWith(PROCESSING_RECOVERY_ALARM_PREFIX)) {
		const scopeId = alarm.name.slice(PROCESSING_RECOVERY_ALARM_PREFIX.length);
		void runtimeStateManager.recoverStaleProcessingScope(scopeId);
	}
});

chrome.tabs.onRemoved.addListener((tabId) => {
	void runtimeStateManager.removeTabScope(tabId);
});

async function handleIdleReset(): Promise<void> {
	try {
		await runtimeStateManager.idleActiveScopesUpdatedBefore(idleResetTimestamp);
	} catch {
		/* service worker context may have been invalidated */
	}
}

/** Maps provider name to its constructor */
const PROVIDER_CTORS: Record<
	ProviderName,
	new (
		apiKey: string,
		model: string,
		limiter: RateLimiter,
	) => IAIProvider
> = {
	openrouter: OpenRouterProvider,
	'nvidia-nim': NvidiaNimProvider,
	gemini: GeminiProvider,
	groq: GroqProvider,
	cerebras: CerebrasProvider,
};

const PROVIDER_CONFIG = (Object.keys(PROVIDER_KEY_MAP) as ProviderName[]).map((name) => ({
	name,
	key: PROVIDER_KEY_MAP[name].apiKey,
	model: PROVIDER_KEY_MAP[name].model,
	Ctor: PROVIDER_CTORS[name],
}));

function createProviderManager(settings: AppSettings): AIProviderManager {
	const manager = new AIProviderManager();
	for (const { key, model, Ctor } of PROVIDER_CONFIG) {
		if (settings[key]) {
			manager.register(
				new Ctor(
					settings[key] as string,
					settings[model] as string,
					new RateLimiter(settings.rateLimitRpm),
				),
			);
		}
	}
	manager.setPrimary(settings.primaryProvider);
	return manager;
}

async function initializeProviders(settings: AppSettings): Promise<void> {
	providerManager = createProviderManager(settings);
	providersReady = true;
	logger.info(`Providers initialized: ${providerManager.getProviderNames().join(', ')}`);
}

async function ensureProvidersReady(): Promise<string | null> {
	if (!providersReady) {
		await providerReadyPromise;
	}

	if (providerManager.getProviderCount() === 0) {
		return 'No AI providers configured. Please add API keys in settings.';
	}

	return null;
}

async function resolveCurrentScope(
	sender: chrome.runtime.MessageSender,
	pageInstanceId: string,
	pageUrl: string,
): Promise<RuntimeScopeDescriptor | 'invalid' | null> {
	const tabId = getTabId(sender);
	if (tabId === null) {
		return null;
	}

	const expectedScope = buildScopeDescriptor(tabId, pageInstanceId, pageUrl);
	const currentState = await runtimeStateManager.getStateForTab(tabId);
	if (!currentState) {
		const { enabled } = await chrome.storage.local.get({ enabled: false });
		await runtimeStateManager.registerScope({
			tabId,
			pageInstanceId,
			pageUrl,
			enabled: enabled as boolean,
		});
		return expectedScope;
	}

	if (currentState.scopeId !== expectedScope.scopeId) {
		return 'invalid';
	}

	return expectedScope;
}

async function registerScopeForPage(
	sender: chrome.runtime.MessageSender,
	payload: RegisterPageContextPayload,
): Promise<RegisterPageContextResponsePayload | null> {
	const tabId = getTabId(sender);
	if (tabId === null) {
		return null;
	}

	const { enabled } = await chrome.storage.local.get({ enabled: false });
	const state = await runtimeStateManager.registerScope({
		tabId,
		pageInstanceId: payload.pageInstanceId,
		pageUrl: payload.pageUrl,
		enabled: enabled as boolean,
	});

	return {
		success: true,
		scope: buildScopeDescriptor(tabId, payload.pageInstanceId, payload.pageUrl),
		state,
	};
}

async function solveWithProviderManager<T>(execute: () => Promise<T>): Promise<T> {
	startKeepAlive();
	try {
		return await execute();
	} finally {
		stopKeepAlive();
	}
}

async function preprocessBatchQuestions(
	payload: BatchQuestionPayload,
	signal?: AbortSignal,
): Promise<AIBatchRequest['questions']> {
	return Promise.all(
		payload.questions.map(async (question) => {
			if (!question.images?.length) {
				return question;
			}

			const images = await Promise.all(
				question.images.map(async (imgUrl) => {
					try {
						const result = await fetchAsBase64(imgUrl, signal);
						return `data:${result.mime};base64,${result.base64}`;
					} catch (error) {
						if (isCancellationError(error)) {
							throw error;
						}
						logger.warn('Failed to fetch image, skipping:', imgUrl);
						return null;
					}
				}),
			).then((results) => results.filter((result): result is string => result !== null));

			return { ...question, images };
		}),
	);
}

async function handleSolveBatch(
	payload: unknown,
	sender: chrome.runtime.MessageSender,
): Promise<Message> {
	if (!isRecord(payload) || !Array.isArray(payload.questions)) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid batch payload');
	}

	const batchPayload = payload as unknown as BatchQuestionPayload;
	const runtimeContext = getRuntimeRequestContext(payload.runtimeContext);
	if (!runtimeContext) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid batch payload');
	}

	const resolvedScope = await resolveCurrentScope(
		sender,
		runtimeContext.pageInstanceId,
		runtimeContext.pageUrl,
	);
	if (resolvedScope === 'invalid') {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Page context is no longer current.');
	}
	if (!resolvedScope) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
	}

	const signal = await runtimeStateManager.beginRequest(resolvedScope, runtimeContext.requestId);
	if (!signal) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'The current page scope is not available.');
	}

	const providerConfigError = await ensureProvidersReady();
	if (providerConfigError) {
		await runtimeStateManager.failRequest(
			resolvedScope,
			runtimeContext.requestId,
			providerConfigError,
		);
		return errorResponse(ERROR_CODES.NO_API_KEY, providerConfigError);
	}

	try {
		return await solveWithProviderManager(async () => {
			const batchRequest: AIBatchRequest = {
				questions: await preprocessBatchQuestions(batchPayload, signal),
				signal,
			};
			const result = await providerManager.solveBatch(batchRequest);
			const minConfidence =
				result.answers.length > 0
					? Math.min(...result.answers.map((answer) => answer.confidence))
					: null;

			const accepted = await runtimeStateManager.completeRequestSolve(
				resolvedScope,
				runtimeContext.requestId,
				{
					provider: result.provider,
					model: result.model,
					confidence: minConfidence,
					tokensUsed: result.tokensUsed,
				},
			);
			if (!accepted) {
				return errorResponse(ERROR_CODES.REQUEST_CANCELLED, 'Request cancelled.');
			}

			return {
				type: 'SOLVE_BATCH',
				payload: {
					requestId: runtimeContext.requestId,
					answers: result.answers,
				} satisfies BatchSolveResponsePayload,
			};
		});
	} catch (error) {
		if (isCancellationError(error)) {
			return errorResponse(ERROR_CODES.REQUEST_CANCELLED, 'Request cancelled.');
		}

		const message = getErrorMessage(error);
		await runtimeStateManager.failRequest(resolvedScope, runtimeContext.requestId, message);
		logger.error('Batch solve failed', error);
		return errorResponse(ERROR_CODES.SOLVE_FAILED, message);
	}
}
async function handleRegisterPageContext(
	payload: unknown,
	sender: chrome.runtime.MessageSender,
): Promise<Message> {
	if (
		!isRecord(payload) ||
		typeof payload.pageInstanceId !== 'string' ||
		typeof payload.pageUrl !== 'string'
	) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid page context payload');
	}

	const responsePayload = await registerScopeForPage(
		sender,
		payload as unknown as RegisterPageContextPayload,
	);
	if (!responsePayload) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
	}

	return {
		type: 'REGISTER_PAGE_CONTEXT',
		payload: responsePayload satisfies RegisterPageContextResponsePayload,
	};
}

async function handleCancelPageWork(
	payload: unknown,
	sender: chrome.runtime.MessageSender,
): Promise<Message> {
	if (
		!isRecord(payload) ||
		typeof payload.pageInstanceId !== 'string' ||
		typeof payload.pageUrl !== 'string' ||
		typeof payload.reason !== 'string'
	) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid cancel payload');
	}

	const tabId = getTabId(sender);
	if (tabId === null) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
	}

	const cancelPayload = payload as unknown as CancelPageWorkPayload;
	const scope = buildScopeDescriptor(tabId, cancelPayload.pageInstanceId, cancelPayload.pageUrl);
	const nextStatus = cancelPayload.reason === 'disable' ? 'disabled' : 'idle';
	const removeScope = cancelPayload.reason === 'navigation' || cancelPayload.reason === 'reset';
	await runtimeStateManager.cancelScope(scope.scopeId, nextStatus, removeScope);

	return {
		type: 'CANCEL_PAGE_WORK',
		payload: { success: true } satisfies TabActionResponsePayload,
	};
}

async function handleReportApplyOutcome(
	payload: unknown,
	sender: chrome.runtime.MessageSender,
): Promise<Message> {
	if (
		!isRecord(payload) ||
		typeof payload.requestId !== 'string' ||
		typeof payload.pageInstanceId !== 'string' ||
		typeof payload.pageUrl !== 'string' ||
		typeof payload.appliedCount !== 'number' ||
		typeof payload.failedCount !== 'number'
	) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid apply outcome payload');
	}

	const tabId = getTabId(sender);
	if (tabId === null) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
	}

	const applyOutcome = payload as unknown as ApplyOutcomePayload;
	const scope = buildScopeDescriptor(tabId, applyOutcome.pageInstanceId, applyOutcome.pageUrl);
	const success = await runtimeStateManager.finalizeApply(scope, applyOutcome.requestId, {
		appliedCount: applyOutcome.appliedCount,
		failedCount: applyOutcome.failedCount,
		errorMessage: applyOutcome.errorMessage,
	});
	if (success && applyOutcome.appliedCount > 0) {
		scheduleIdleReset();
	}

	return {
		type: 'REPORT_APPLY_OUTCOME',
		payload: {
			success,
			reason: success ? undefined : ERROR_CODES.INVALID_SCOPE,
		} satisfies TabActionResponsePayload,
	};
}

async function handleReportPageError(
	payload: unknown,
	sender: chrome.runtime.MessageSender,
): Promise<Message> {
	if (
		!isRecord(payload) ||
		typeof payload.pageInstanceId !== 'string' ||
		typeof payload.pageUrl !== 'string' ||
		typeof payload.message !== 'string'
	) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid runtime error payload');
	}

	const tabId = getTabId(sender);
	if (tabId === null) {
		return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
	}

	const runtimeError = payload as unknown as ReportPageErrorPayload;
	const scope = buildScopeDescriptor(tabId, runtimeError.pageInstanceId, runtimeError.pageUrl);
	const success = await runtimeStateManager.reportRuntimeError(
		scope,
		runtimeError.message,
		runtimeError.requestId,
	);

	return {
		type: 'REPORT_PAGE_ERROR',
		payload: {
			success,
			reason: success ? undefined : ERROR_CODES.INVALID_SCOPE,
		} satisfies TabActionResponsePayload,
	};
}

async function handleSetEnabled(payload: unknown): Promise<Message> {
	if (typeof payload !== 'boolean') {
		return errorResponse('INVALID_PAYLOAD', 'Expected boolean payload');
	}

	await setEnabled(payload);
	await runtimeStateManager.setEnabled(payload);

	return {
		type: 'SET_ENABLED',
		payload: { success: true } satisfies SetEnabledResponsePayload,
	};
}

async function handleTestConnection(payload: unknown): Promise<Message> {
	if (!isRecord(payload) || !isRecord(payload.settings)) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid test connection payload');
	}

	const baseSettings = await getSettings();
	const mergedSettings: AppSettings = {
		...baseSettings,
		...(payload as unknown as TestConnectionPayload).settings,
	};

	try {
		const testManager = createProviderManager(mergedSettings);
		if (testManager.getProviderCount() === 0) {
			return {
				type: 'TEST_CONNECTION',
				payload: {
					success: false,
					provider: mergedSettings.primaryProvider,
					model: getPrimaryProviderModel(mergedSettings),
					confidence: null,
					message: `${ERROR_CODES.TEST_CONNECTION_FAILED}: No AI providers configured.`,
				} satisfies TestConnectionResponsePayload,
			};
		}

		const result = await testManager.solve({
			questionText: 'What is 2 + 2?',
			options: ['3', '4', '5', '6'],
			questionType: 'single-choice',
		});

		return {
			type: 'TEST_CONNECTION',
			payload: {
				success: true,
				provider: result.provider,
				model: result.model,
				confidence: result.confidence,
				message: `Connection successful via ${result.provider}.`,
			} satisfies TestConnectionResponsePayload,
		};
	} catch (error) {
		logger.error('Connection test failed', error);
		return {
			type: 'TEST_CONNECTION',
			payload: {
				success: false,
				provider: mergedSettings.primaryProvider,
				model: getPrimaryProviderModel(mergedSettings),
				confidence: null,
				message: `${ERROR_CODES.TEST_CONNECTION_FAILED}: ${getErrorMessage(error)}`,
			} satisfies TestConnectionResponsePayload,
		};
	}
}

async function handleResetExtension(): Promise<Message> {
	try {
		await resetAndReinitialize();
		logger.info('Extension reset via popup');
		return {
			type: 'RESET_EXTENSION',
			payload: { success: true } satisfies ResetExtensionResponsePayload,
		};
	} catch (error) {
		logger.error('Reset failed', error);
		return errorResponse(ERROR_CODES.SOLVE_FAILED, getErrorMessage(error));
	}
}

router.on('SOLVE_BATCH', handleSolveBatch);
router.on('REGISTER_PAGE_CONTEXT', handleRegisterPageContext);
router.on('CANCEL_PAGE_WORK', handleCancelPageWork);
router.on('REPORT_APPLY_OUTCOME', handleReportApplyOutcome);
router.on('REPORT_PAGE_ERROR', handleReportPageError);
router.on('SET_ENABLED', async (payload) => handleSetEnabled(payload));
router.on('TEST_CONNECTION', async (payload) => handleTestConnection(payload));
router.on('RESET_EXTENSION', async () => handleResetExtension());

chrome.commands.onCommand.addListener(async (command) => {
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
		await runtimeStateManager.setEnabled(!enabled);
	}
});

async function resetAndReinitialize(): Promise<void> {
	stopKeepAlive();
	chrome.alarms.clear(IDLE_RESET_ALARM);
	idleResetTimestamp = 0;
	await runtimeStateManager.resetAll();
	providersReady = false;
	const settings = await getSettings();
	providerReadyPromise = initializeProviders(settings);
	await providerReadyPromise;
}

chrome.runtime.onInstalled.addListener(async (details) => {
	try {
		if (details.reason === 'install') {
			chrome.runtime.openOptionsPage();
		}
		await resetAndReinitialize();
		logger.info('Extension installed/updated');
	} catch (error) {
		logger.error('onInstalled handler failed', error);
	}
});

chrome.runtime.onStartup.addListener(async () => {
	try {
		logger.info('Service worker startup');
		await resetAndReinitialize();
	} catch (error) {
		logger.error('onStartup handler failed', error);
	}
});

chrome.runtime.onMessage.addListener(
	(
		message: Message,
		sender: chrome.runtime.MessageSender,
		sendResponse: (response?: unknown) => void,
	) => {
		const senderUrl = sender.tab?.url || sender.url || '';
		const isAllowed =
			sender.id === chrome.runtime.id &&
			(senderUrl.startsWith('https://www.coursera.org/') ||
				senderUrl.startsWith('chrome-extension://') ||
				senderUrl === '');

		if (!isAllowed) {
			sendResponse({
				type: 'ERROR',
				payload: { code: 'UNAUTHORIZED', message: 'Blocked: invalid sender' },
			});
			return false;
		}

		if (!message || typeof message.type !== 'string') {
			sendResponse(errorResponse('INVALID_MESSAGE', 'Invalid message format'));
			return false;
		}

		router
			.route(message, sender)
			.then(sendResponse)
			.catch(() => {
				sendResponse(errorResponse('INTERNAL_ERROR', 'Unexpected routing failure'));
			});

		return true;
	},
);

chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName !== 'local') return;

	const settingsKeys = [
		'openrouterApiKey',
		'nvidiaApiKey',
		'geminiApiKey',
		'groqApiKey',
		'cerebrasApiKey',
		'openrouterModel',
		'nvidiaModel',
		'geminiModel',
		'groqModel',
		'cerebrasModel',
		'primaryProvider',
		'rateLimitRpm',
	];

	if (settingsKeys.some((key) => key in changes)) {
		logger.info('Settings changed, re-initializing providers');
		const settings = await getSettings();
		providersReady = false;
		providerReadyPromise = initializeProviders(settings);
		await providerReadyPromise;
	}
});

export const __testing = {
	runtimeStateManager,
	handleSolveBatch,
	handleRegisterPageContext,
	handleCancelPageWork,
	handleReportApplyOutcome,
	handleReportPageError,
	handleSetEnabled,
	handleTestConnection,
	handleTabRemoved(tabId: number): Promise<void> {
		return runtimeStateManager.removeTabScope(tabId);
	},
	handleProcessingRecoveryAlarm(scopeId: string): Promise<boolean> {
		return runtimeStateManager.recoverStaleProcessingScope(scopeId);
	},
	getProcessingRecoveryAlarmName,
	async reloadProvidersFromStorage(): Promise<void> {
		const settings = await getSettings();
		providersReady = false;
		providerReadyPromise = initializeProviders(settings);
		await providerReadyPromise;
	},
	async resetForTests(): Promise<void> {
		stopKeepAlive();
		chrome.alarms.clear(IDLE_RESET_ALARM);
		idleResetTimestamp = 0;
		providerManager = new AIProviderManager();
		providersReady = true;
		providerReadyPromise = Promise.resolve();
		await runtimeStateManager.resetAll();
	},
};

logger.info('Service worker loaded');

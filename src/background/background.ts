/**
 * Service worker entry — lifecycle management, provider init, message routing.
 * REQ: REQ-006, REQ-007, REQ-008, REQ-011, NFR-004, NFR-005
 */

import { AIProviderManager } from '../services/ai-provider';
import { CerebrasProvider } from '../services/cerebras';
import { GeminiProvider } from '../services/gemini';
import { GroqProvider } from '../services/groq';
import { fetchAsBase64, processCorsBlockedImages } from '../services/image-pipeline';
import { NvidiaNimProvider } from '../services/nvidia-nim';
import { OpenRouterProvider } from '../services/openrouter';
import type { AIBatchRequest, AIRequest, IAIProvider } from '../types/api';
import type {
	BatchQuestionPayload,
	ErrorPayload,
	Message,
	SelectAnswerPayload,
	SolveImageQuestionPayload,
	SolveQuestionPayload,
	StatusPayload,
} from '../types/messages';
import type { AppSettings } from '../types/settings';
import { ERROR_CODES } from '../utils/constants';
import { Logger } from '../utils/logger';
import { RateLimiter } from '../utils/rate-limiter';
import { getSettings, setEnabled } from '../utils/storage';
import { MessageRouter } from './router';

const logger = new Logger('ServiceWorker');
const router = new MessageRouter();
let providerManager = new AIProviderManager();

function errorResponse(code: string, message: string): Message {
	return { type: 'ERROR', payload: { code, message } satisfies ErrorPayload };
}

const KEEPALIVE_ALARM = 'sw-keepalive';

function startKeepAlive(): void {
	chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // 24s, under 30s idle limit
}

function stopKeepAlive(): void {
	chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === KEEPALIVE_ALARM) {
		logger.debug('Keep-alive ping');
	}
});
let providersReady = false;
let providerReadyPromise: Promise<void> = getSettings()
	.then((s) => initializeProviders(s))
	.catch((err) => {
		logger.error('Provider init failed', err);
		providersReady = true; // Unblock message handling; empty provider list will return proper errors
	});

const PROVIDER_CONFIG: ReadonlyArray<{
	key: 'openrouterApiKey' | 'nvidiaApiKey' | 'geminiApiKey' | 'groqApiKey' | 'cerebrasApiKey';
	model: 'openrouterModel' | 'nvidiaModel' | 'geminiModel' | 'groqModel' | 'cerebrasModel';
	Ctor: new (apiKey: string, model: string, limiter: RateLimiter) => IAIProvider;
}> = [
	{ key: 'openrouterApiKey', model: 'openrouterModel', Ctor: OpenRouterProvider },
	{ key: 'nvidiaApiKey', model: 'nvidiaModel', Ctor: NvidiaNimProvider },
	{ key: 'geminiApiKey', model: 'geminiModel', Ctor: GeminiProvider },
	{ key: 'groqApiKey', model: 'groqModel', Ctor: GroqProvider },
	{ key: 'cerebrasApiKey', model: 'cerebrasModel', Ctor: CerebrasProvider },
];

async function initializeProviders(settings: AppSettings): Promise<void> {
	providerManager = new AIProviderManager();
	for (const { key, model, Ctor } of PROVIDER_CONFIG) {
		if (settings[key]) {
			providerManager.register(
				new Ctor(settings[key], settings[model], new RateLimiter(settings.rateLimitRpm)),
			);
		}
	}
	providerManager.setPrimary(settings.primaryProvider);
	providersReady = true;
	logger.info(`Providers initialized: ${providerManager.getProviderNames().join(', ')}`);
}

async function solveLifecycle(label: string, execute: () => Promise<Message>): Promise<Message> {
	await chrome.storage.session.set({
		_lastStatus: 'processing',
		_lastError: '',
		_lastStatusTimestamp: Date.now(),
	});

	if (!providersReady) await providerReadyPromise;

	if (providerManager.getProviderCount() === 0) {
		const msg = 'No AI providers configured. Please add API keys in settings.';
		await chrome.storage.session.set({
			_lastStatus: 'error',
			_lastError: msg,
			_lastStatusTimestamp: Date.now(),
		});
		return errorResponse(ERROR_CODES.NO_API_KEY, msg);
	}

	startKeepAlive();
	try {
		const response = await execute();
		scheduleIdleReset();
		return response;
	} catch (error) {
		logger.error(`${label} failed`, error);
		const failSession = await chrome.storage.session.get({ failedCount: 0 });
		await chrome.storage.session.set({
			_lastStatus: 'error',
			_lastError: error instanceof Error ? error.message : String(error),
			_lastStatusTimestamp: Date.now(),
			failedCount: (failSession.failedCount as number) + 1,
		});
		chrome.action.setBadgeText({ text: '!' });
		chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
		return errorResponse(
			ERROR_CODES.SOLVE_FAILED,
			error instanceof Error ? error.message : 'Unknown error',
		);
	} finally {
		stopKeepAlive();
	}
}

function scheduleIdleReset(): void {
	setTimeout(async () => {
		try {
			const current = await chrome.storage.session.get({ _lastStatus: '' });
			if (current._lastStatus === 'active') {
				await chrome.storage.session.set({ _lastStatus: 'idle' });
			}
		} catch {
			/* SW may have stopped */
		}
	}, 30_000);
}

async function handleSolveQuestion(payload: unknown): Promise<Message> {
	if (!payload || typeof (payload as Record<string, unknown>).questionText !== 'string') {
		return errorResponse('INVALID_PAYLOAD', 'Invalid question payload');
	}

	return solveLifecycle('Solve', async () => {
		const question = payload as SolveQuestionPayload | SolveImageQuestionPayload;
		const request: AIRequest = {
			questionText: question.questionText,
			options: question.options,
			images: [],
			questionType: question.type,
		};

		if ('images' in question && question.images?.length) {
			request.images = await processCorsBlockedImages(
				question.images.map((img) => ({ base64: img.base64, context: img.context })),
			);
		}

		const result = await providerManager.solve(request);

		const session = await chrome.storage.session.get({ solvedCount: 0, tokenCount: 0 });
		await chrome.storage.session.set({
			_lastProvider: result.provider,
			_lastModel: result.model,
			_lastConfidence: result.confidence,
			_lastStatus: 'active',
			_lastError: '',
			_lastStatusTimestamp: Date.now(),
			solvedCount: (session.solvedCount as number) + 1,
			tokenCount: (session.tokenCount as number) + (result.tokensUsed || 0),
		});
		chrome.action.setBadgeText({ text: '1' });
		chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

		return {
			type: 'SELECT_ANSWER',
			payload: {
				answerIndices: result.answerIndices,
				confidence: result.confidence,
				reasoning: result.reasoning,
				provider: result.provider,
			} satisfies SelectAnswerPayload,
		};
	});
}

async function handleGetStatus(): Promise<Message> {
	const [localData, sessionData] = await Promise.all([
		chrome.storage.local.get({ enabled: false }),
		chrome.storage.session.get({
			_lastProvider: '',
			_lastModel: '',
			_lastConfidence: null,
			_lastStatus: 'idle',
		}),
	]);
	return {
		type: 'GET_STATUS',
		payload: {
			enabled: localData.enabled as boolean,
			provider: sessionData._lastProvider as string,
			model: sessionData._lastModel as string,
			lastConfidence: sessionData._lastConfidence as number | null,
			status: sessionData._lastStatus as StatusPayload['status'],
		} satisfies StatusPayload,
	};
}

async function handleSetEnabled(payload: unknown): Promise<Message> {
	if (typeof payload !== 'boolean') {
		return errorResponse('INVALID_PAYLOAD', 'Expected boolean payload');
	}
	await setEnabled(payload);
	return {
		type: 'SET_ENABLED',
		payload: { success: true },
	};
}

async function handleGetSettings(): Promise<Message> {
	const settings = await getSettings();
	const masked = { ...settings };
	for (const { key } of PROVIDER_CONFIG) {
		masked[key] = settings[key] ? '••••••••' : '';
	}
	return {
		type: 'GET_SETTINGS',
		payload: masked,
	};
}

async function handleSolveBatch(payload: unknown): Promise<Message> {
	if (!payload || !Array.isArray((payload as Record<string, unknown>).questions)) {
		return errorResponse('INVALID_PAYLOAD', 'Invalid batch payload');
	}

	return solveLifecycle('Batch solve', async () => {
		const batchPayload = payload as BatchQuestionPayload;
		const processedQuestions = await Promise.all(
			batchPayload.questions.map(async (q) => {
				if (q.images && q.images.length > 0) {
					const base64Images = await Promise.all(
						q.images.map(async (imgUrl) => {
							try {
								const result = await fetchAsBase64(imgUrl);
								return `data:${result.mime};base64,${result.base64}`;
							} catch {
								logger.warn('Failed to fetch image, skipping:', imgUrl);
								return null;
							}
						}),
					).then((results) => results.filter((r): r is string => r !== null));
					return { ...q, images: base64Images };
				}
				return q;
			}),
		);

		const batchRequest: AIBatchRequest = { questions: processedQuestions };
		const result = await providerManager.solveBatch(batchRequest);

		const batchSession = await chrome.storage.session.get({
			_solvedUIDs: [] as string[],
			tokenCount: 0,
		});
		const solvedSet = new Set(batchSession._solvedUIDs as string[]);
		for (const answer of result.answers) {
			solvedSet.add(answer.uid);
		}
		await chrome.storage.session.set({
			_lastProvider: result.provider,
			_lastModel: result.model,
			_lastConfidence:
				result.answers.length > 0 ? Math.min(...result.answers.map((a) => a.confidence)) : 0,
			_lastStatus: 'active',
			_lastError: '',
			_lastStatusTimestamp: Date.now(),
			_solvedUIDs: Array.from(solvedSet),
			solvedCount: solvedSet.size,
			tokenCount: (batchSession.tokenCount as number) + (result.tokensUsed || 0),
		});
		chrome.action.setBadgeText({ text: String(solvedSet.size) });
		chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

		return {
			type: 'SOLVE_BATCH',
			payload: {
				answers: result.answers,
			},
		};
	});
}

router.on('SOLVE_QUESTION', handleSolveQuestion);
router.on('SOLVE_IMAGE_QUESTION', handleSolveQuestion);
router.on('SOLVE_BATCH', handleSolveBatch);
router.on('GET_STATUS', handleGetStatus);
router.on('SET_ENABLED', handleSetEnabled);
router.on('GET_SETTINGS', handleGetSettings);

chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'scan-page') {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PAGE' });
	} else if (command === 'toggle-enabled') {
		const { enabled } = await chrome.storage.local.get({ enabled: false });
		await chrome.storage.local.set({ enabled: !enabled });
	}
});

async function resetAndReinitialize(): Promise<void> {
	chrome.action.setBadgeText({ text: '' });
	await chrome.storage.session.set({
		_lastStatus: 'idle',
		_lastError: '',
		_lastProvider: '',
		_lastModel: '',
		_lastConfidence: null,
		_lastStatusTimestamp: 0,
		_solvedUIDs: [],
		solvedCount: 0,
		failedCount: 0,
		tokenCount: 0,
	});
	const settings = await getSettings();
	providerReadyPromise = initializeProviders(settings);
	await providerReadyPromise;
}

chrome.runtime.onInstalled.addListener(async (details) => {
	try {
		if (details.reason === 'install') chrome.runtime.openOptionsPage();
		await resetAndReinitialize();
		logger.info('Extension installed/updated');
	} catch (err) {
		logger.error('onInstalled handler failed', err);
	}
});

chrome.runtime.onStartup.addListener(async () => {
	try {
		logger.info('Service worker startup');
		await resetAndReinitialize();
	} catch (err) {
		logger.error('onStartup handler failed', err);
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
				senderUrl === ''); // popup/options have empty url

		if (!isAllowed) {
			sendResponse({
				type: 'ERROR',
				payload: { code: 'UNAUTHORIZED', message: 'Blocked: invalid sender' },
			});
			return false;
		}
		router.route(message, sender).then(sendResponse);
		return true; // Keep message channel open for async response
	},
);

// Re-initialize providers when settings change
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
	const needsReinit = settingsKeys.some((key) => key in changes);
	if (needsReinit) {
		logger.info('Settings changed, re-initializing providers');
		const settings = await getSettings();
		providersReady = false;
		providerReadyPromise = initializeProviders(settings);
		await providerReadyPromise;
	}
});

logger.info('Service worker loaded');

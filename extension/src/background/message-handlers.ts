/**
 * Message handling layer — routing, validation, sender auth, and per-type handler logic.
 *
 * Consolidated from the former router.ts, message-utils.ts, and message-handlers.ts modules.
 */

import { fetchAsBase64 } from '../services/image-pipeline';
import type { AIBatchRequest } from '../types/api';
import type {
	BackgroundRequestEnvelope,
	BackgroundRequestType,
	BatchQuestionPayload,
	BatchSolveResponsePayload,
	CheckUpdateResponsePayload,
	ErrorPayload,
	Message,
	RegisterPageContextResponsePayload,
	ResetExtensionResponsePayload,
	SetEnabledResponsePayload,
	TabActionResponsePayload,
	TestConnectionResponsePayload,
} from '../types/messages';
import {
	isApplyOutcomePayload,
	isBatchQuestionPayload,
	isCancelPageWorkPayload,
	isPageRuntimeScope,
	isReportPageErrorPayload,
	isTestConnectionPayload,
} from '../types/messages';
import { ERROR_CODES } from '../utils/constants';
import type { Logger } from '../utils/logger';
import { Logger as LoggerClass } from '../utils/logger';
import { setEnabled } from '../utils/storage';
import type { ProviderService } from './provider-service';
import { getPrimaryProviderModel } from './provider-service';
import type { RuntimeStateManager } from './runtime-state';
import {
	buildScopeDescriptor,
	getTabId,
	registerScopeForPage,
	resolveCurrentScope,
} from './runtime-state';

// ---------------------------------------------------------------------------
// Message utilities (merged from message-utils.ts)
// ---------------------------------------------------------------------------

export function errorResponse(code: string, message: string): Message {
	return { type: 'ERROR', payload: { code, message } satisfies ErrorPayload };
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isCancellationError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && /REQUEST_CANCELLED/i.test(error.message);
}

export function isAllowedSender(
	sender: chrome.runtime.MessageSender,
	extensionId: string = chrome.runtime.id,
): boolean {
	const senderUrl = sender.tab?.url || sender.url || '';
	return (
		sender.id === extensionId &&
		(senderUrl.startsWith('https://www.coursera.org/') ||
			senderUrl.startsWith('chrome-extension://') ||
			senderUrl === '')
	);
}

// ---------------------------------------------------------------------------
// Message router (merged from router.ts, converted from class to factory)
// ---------------------------------------------------------------------------

const routerLogger = new LoggerClass('Router');

export type MessageHandler = (
	payload: unknown,
	sender: chrome.runtime.MessageSender,
) => Promise<Message>;

export interface MessageRouter {
	on(type: BackgroundRequestType, handler: MessageHandler): void;
	route(message: BackgroundRequestEnvelope, sender: chrome.runtime.MessageSender): Promise<Message>;
}

export function createMessageRouter(): MessageRouter {
	const handlers = new Map<BackgroundRequestType, MessageHandler>();

	return {
		on(type: BackgroundRequestType, handler: MessageHandler): void {
			handlers.set(type, handler);
		},

		async route(
			message: BackgroundRequestEnvelope,
			sender: chrome.runtime.MessageSender,
		): Promise<Message> {
			const handler = handlers.get(message.type);
			if (!handler) {
				routerLogger.warn(`No handler for message type: ${message.type}`);
				return {
					type: 'ERROR',
					payload: {
						code: ERROR_CODES.UNKNOWN_MESSAGE,
						message: `Unknown message type: ${message.type}`,
					} satisfies ErrorPayload,
				};
			}

			try {
				routerLogger.info(`Routing ${message.type}`);
				return await handler(message.payload, sender);
			} catch (error) {
				routerLogger.error(`Handler error for ${message.type}`, error);
				return {
					type: 'ERROR',
					payload: {
						code: ERROR_CODES.SOLVE_FAILED,
						message: error instanceof Error ? error.message : 'Unknown error',
					} satisfies ErrorPayload,
				};
			}
		},
	};
}

// ---------------------------------------------------------------------------
// Message handlers (converted from class to factory)
// ---------------------------------------------------------------------------

export interface MessageHandlerDeps {
	logger: Logger;
	runtimeStateManager: RuntimeStateManager;
	providerService: ProviderService;
	withKeepAlive: <T>(execute: () => Promise<T>) => Promise<T>;
	scheduleIdleReset: () => void;
	resetAndReinitialize: () => Promise<void>;
	checkForUpdate: () => Promise<{ reloading: boolean; reason: string }>;
}

export function createMessageHandlers(deps: MessageHandlerDeps) {
	const handleSolveBatch = async (
		payload: unknown,
		sender: chrome.runtime.MessageSender,
	): Promise<Message> => {
		if (!isBatchQuestionPayload(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid batch payload');
		}

		const batchPayload = payload;
		const runtimeContext = payload.runtimeContext;

		const resolvedScope = await resolveCurrentScope(
			deps.runtimeStateManager,
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

		const signal = await deps.runtimeStateManager.beginRequest(
			resolvedScope,
			runtimeContext.requestId,
		);
		if (!signal) {
			return errorResponse(ERROR_CODES.INVALID_SCOPE, 'The current page scope is not available.');
		}

		const providerConfigError = await deps.providerService.ensureConfigured();
		if (providerConfigError) {
			await deps.runtimeStateManager.failRequest(
				resolvedScope,
				runtimeContext.requestId,
				providerConfigError,
			);
			return errorResponse(ERROR_CODES.NO_API_KEY, providerConfigError);
		}

		try {
			return await deps.withKeepAlive(async () => {
				const batchRequest: AIBatchRequest = {
					questions: await preprocessBatchQuestions(batchPayload, signal, deps.logger),
					signal,
				};
				const result = await deps.providerService.solveBatch(batchRequest);
				const minConfidence =
					result.answers.length > 0
						? Math.min(...result.answers.map((answer) => answer.confidence))
						: null;

				const accepted = await deps.runtimeStateManager.completeRequestSolve(
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
			await deps.runtimeStateManager.failRequest(resolvedScope, runtimeContext.requestId, message);
			deps.logger.error('Batch solve failed', error);
			return errorResponse(ERROR_CODES.SOLVE_FAILED, message);
		}
	};

	const handleRegisterPageContext = async (
		payload: unknown,
		sender: chrome.runtime.MessageSender,
	): Promise<Message> => {
		if (!isPageRuntimeScope(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid page context payload');
		}

		const responsePayload = await registerScopeForPage(deps.runtimeStateManager, sender, payload);
		if (!responsePayload) {
			return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
		}

		return {
			type: 'REGISTER_PAGE_CONTEXT',
			payload: responsePayload satisfies RegisterPageContextResponsePayload,
		};
	};

	const handleCancelPageWork = async (
		payload: unknown,
		sender: chrome.runtime.MessageSender,
	): Promise<Message> => {
		if (!isCancelPageWorkPayload(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid cancel payload');
		}

		const tabId = getTabId(sender);
		if (tabId === null) {
			return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
		}

		const cancelPayload = payload;
		const scope = buildScopeDescriptor(tabId, cancelPayload.pageInstanceId, cancelPayload.pageUrl);
		const nextStatus = cancelPayload.reason === 'disable' ? 'disabled' : 'idle';
		const removeScope = cancelPayload.reason === 'navigation' || cancelPayload.reason === 'reset';
		await deps.runtimeStateManager.cancelScope(scope.scopeId, nextStatus, removeScope);

		return {
			type: 'CANCEL_PAGE_WORK',
			payload: { success: true } satisfies TabActionResponsePayload,
		};
	};

	const handleReportApplyOutcome = async (
		payload: unknown,
		sender: chrome.runtime.MessageSender,
	): Promise<Message> => {
		if (!isApplyOutcomePayload(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid apply outcome payload');
		}

		const tabId = getTabId(sender);
		if (tabId === null) {
			return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
		}

		const applyOutcome = payload;
		const scope = buildScopeDescriptor(tabId, applyOutcome.pageInstanceId, applyOutcome.pageUrl);
		const success = await deps.runtimeStateManager.finalizeApply(scope, applyOutcome.requestId, {
			appliedCount: applyOutcome.appliedCount,
			failedCount: applyOutcome.failedCount,
			errorMessage: applyOutcome.errorMessage,
		});
		if (success && applyOutcome.appliedCount > 0) {
			deps.scheduleIdleReset();
		}

		return {
			type: 'REPORT_APPLY_OUTCOME',
			payload: {
				success,
				reason: success ? undefined : ERROR_CODES.INVALID_SCOPE,
			} satisfies TabActionResponsePayload,
		};
	};

	const handleReportPageError = async (
		payload: unknown,
		sender: chrome.runtime.MessageSender,
	): Promise<Message> => {
		if (!isReportPageErrorPayload(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid runtime error payload');
		}

		const tabId = getTabId(sender);
		if (tabId === null) {
			return errorResponse(ERROR_CODES.INVALID_SCOPE, 'Could not determine the current tab scope.');
		}

		const runtimeError = payload;
		const scope = buildScopeDescriptor(tabId, runtimeError.pageInstanceId, runtimeError.pageUrl);
		const success = await deps.runtimeStateManager.reportRuntimeError(
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
	};

	const handleSetEnabled = async (payload: unknown): Promise<Message> => {
		if (typeof payload !== 'boolean') {
			return errorResponse('INVALID_PAYLOAD', 'Expected boolean payload');
		}

		await setEnabled(payload);
		await deps.runtimeStateManager.setEnabled(payload);

		return {
			type: 'SET_ENABLED',
			payload: { success: true } satisfies SetEnabledResponsePayload,
		};
	};

	const handleTestConnection = async (payload: unknown): Promise<Message> => {
		if (!isTestConnectionPayload(payload)) {
			return errorResponse('INVALID_PAYLOAD', 'Invalid test connection payload');
		}

		const { manager, settings } = await deps.providerService.createTestContext(payload.settings);

		try {
			if (manager.getProviderCount() === 0) {
				return {
					type: 'TEST_CONNECTION',
					payload: {
						success: false,
						provider: settings.primaryProvider,
						model: getPrimaryProviderModel(settings),
						confidence: null,
						message: `${ERROR_CODES.TEST_CONNECTION_FAILED}: No AI providers configured.`,
					} satisfies TestConnectionResponsePayload,
				};
			}

			const result = await manager.solveBatch({
				questions: [
					{
						uid: 'test-connection',
						questionText: 'What is 2 + 2?',
						options: ['3', '4', '5', '6'],
						selectionMode: 'single',
					},
				],
			});

			return {
				type: 'TEST_CONNECTION',
				payload: {
					success: true,
					provider: result.provider,
					model: result.model,
					confidence: result.answers[0]?.confidence ?? null,
					message: `Connection successful via ${result.provider}.`,
				} satisfies TestConnectionResponsePayload,
			};
		} catch (error) {
			deps.logger.error('Connection test failed', error);
			return {
				type: 'TEST_CONNECTION',
				payload: {
					success: false,
					provider: settings.primaryProvider,
					model: getPrimaryProviderModel(settings),
					confidence: null,
					message: `${ERROR_CODES.TEST_CONNECTION_FAILED}: ${getErrorMessage(error)}`,
				} satisfies TestConnectionResponsePayload,
			};
		}
	};

	const handleResetExtension = async (): Promise<Message> => {
		try {
			await deps.resetAndReinitialize();
			deps.logger.info('Extension reset via popup');
			return {
				type: 'RESET_EXTENSION',
				payload: { success: true } satisfies ResetExtensionResponsePayload,
			};
		} catch (error) {
			deps.logger.error('Reset failed', error);
			return errorResponse(ERROR_CODES.SOLVE_FAILED, getErrorMessage(error));
		}
	};

	const handleCheckUpdate = async (): Promise<Message> => {
		const result = await deps.checkForUpdate();
		return {
			type: 'CHECK_UPDATE',
			payload: result satisfies CheckUpdateResponsePayload,
		};
	};

	return {
		handleSolveBatch,
		handleRegisterPageContext,
		handleCancelPageWork,
		handleReportApplyOutcome,
		handleReportPageError,
		handleSetEnabled,
		handleTestConnection,
		handleResetExtension,
		handleCheckUpdate,
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function preprocessBatchQuestions(
	payload: BatchQuestionPayload,
	signal: AbortSignal | undefined,
	logger: Logger,
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

/**
 * Content script — single-request question solving with debounce.
 * Detects all questions, collects them, sends one SOLVE_BATCH request with all questions.
 * REQ: REQ-011
 */

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
} from '../types/messages';
import type { DetectedQuestion, ExtractedQuestion } from '../types/questions';
import { DEFAULT_SETTINGS } from '../types/settings';
import { WidgetHost } from '../ui/widget-host';
import type { ContentBridge, WidgetRuntimeBinding } from '../ui/widget-types';
import { BATCH_DEBOUNCE_MS, DATA_ATTRIBUTES, ERROR_CODES } from '../utils/constants';
import { Logger } from '../utils/logger';
import { QuestionDetector } from './detector';
import { DataExtractor } from './extractor';
import { AnswerSelector } from './selector';

const logger = new Logger('ContentScript');

async function sendMessageWithRetry<T>(message: unknown, maxRetries = 2): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await chrome.runtime.sendMessage(message);
			return response as T;
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (
				(msg.includes('Extension context invalidated') ||
					msg.includes('Could not establish connection')) &&
				attempt < maxRetries
			) {
				logger.warn(`SW disconnected, retry ${attempt + 1}/${maxRetries}`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
				continue;
			}
			throw error;
		}
	}
	throw new Error('Max retries exceeded contacting service worker');
}

interface PendingQuestion {
	uid: string;
	element: HTMLElement;
	detected: DetectedQuestion;
	extracted: ExtractedQuestion;
}

interface PageContextScope {
	pageInstanceId: string;
	pageUrl: string;
}

function createUniqueId(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPageContextScope(pageUrl: string): PageContextScope {
	return {
		pageInstanceId: createUniqueId('page'),
		pageUrl,
	};
}

let detector: QuestionDetector | null = null;
let extractor: DataExtractor;
let selector: AnswerSelector;
let isEnabled = false;
const pendingQuestions: PendingQuestion[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;
let batchEpoch = 0;
const solvedUIDs = new Set<string>();
let widgetHost: WidgetHost | null = null;
let pageContext = createPageContextScope(window.location.href);

function applyWidgetRuntimeBinding(binding: WidgetRuntimeBinding | null): void {
	widgetHost?.setRuntimeScope(binding);
}

function clearBatchMarkers(batch: PendingQuestion[]): void {
	for (const question of batch) {
		AnswerSelector.clearProcessing(question.element);
	}
}

function clearVisibleErrors(): void {
	document
		.querySelectorAll(`[${DATA_ATTRIBUTES.ERROR}="true"]`)
		.forEach((el) => AnswerSelector.clearProcessing(el as HTMLElement));
}

function markBatchFailed(batch: PendingQuestion[]): void {
	for (const question of batch) {
		if (!question.detected.processed) {
			AnswerSelector.clearProcessing(question.element);
			AnswerSelector.markError(question.element);
		}
	}
}

function resetPendingState(): void {
	pendingQuestions.length = 0;
	if (batchTimeout) {
		clearTimeout(batchTimeout);
		batchTimeout = null;
	}
	batchEpoch++;
	solvedUIDs.clear();
}

async function registerPageContext(
	scope: PageContextScope = pageContext,
): Promise<WidgetRuntimeBinding | null> {
	try {
		const response = await sendMessageWithRetry<Message>({
			type: 'REGISTER_PAGE_CONTEXT',
			payload: {
				pageInstanceId: scope.pageInstanceId,
				pageUrl: scope.pageUrl,
			} satisfies RegisterPageContextPayload,
		});
		if (response?.type === 'REGISTER_PAGE_CONTEXT') {
			const payload = response.payload as RegisterPageContextResponsePayload;
			return {
				scope: payload.scope,
				state: payload.state,
			};
		}
		if (response?.type === 'ERROR') {
			const error = response.payload as ErrorPayload | undefined;
			logger.warn(`REGISTER_PAGE_CONTEXT rejected: ${error?.message || 'Unknown error'}`);
		}
	} catch (error) {
		logger.warn('Failed to register page context', error);
	}
	return null;
}

async function cancelPageWork(
	reason: CancelPageWorkPayload['reason'],
	scope: PageContextScope = pageContext,
): Promise<void> {
	try {
		const response = await sendMessageWithRetry<Message>({
			type: 'CANCEL_PAGE_WORK',
			payload: {
				pageInstanceId: scope.pageInstanceId,
				pageUrl: scope.pageUrl,
				reason,
			} satisfies CancelPageWorkPayload,
		});
		if (response?.type === 'ERROR') {
			const error = response.payload as ErrorPayload | undefined;
			logger.warn(`CANCEL_PAGE_WORK rejected: ${error?.message || 'Unknown error'}`);
		}
	} catch (error) {
		logger.warn('Failed to cancel page work', error);
	}
}

async function reportApplyOutcome(payload: ApplyOutcomePayload): Promise<void> {
	try {
		await sendMessageWithRetry<Message>({
			type: 'REPORT_APPLY_OUTCOME',
			payload,
		});
	} catch (error) {
		logger.warn('Failed to report apply outcome', error);
	}
}

async function reportPageError(payload: ReportPageErrorPayload): Promise<void> {
	try {
		await sendMessageWithRetry<Message>({
			type: 'REPORT_PAGE_ERROR',
			payload,
		});
	} catch (error) {
		logger.warn('Failed to report page error', error);
	}
}

async function rescanCurrentPage(reason: 'rescan' | 'retry'): Promise<void> {
	await cancelPageWork(reason);
	resetPendingState();
	clearVisibleErrors();
	const binding = await registerPageContext();
	applyWidgetRuntimeBinding(binding);
	if (detector) {
		detector.scan();
	} else {
		startDetection();
	}
}

async function handleNavigation(
	currentUrl: string,
	previousScope: PageContextScope,
): Promise<void> {
	logger.info(`SPA navigation detected: ${currentUrl}`);

	try {
		const { enabled } = await chrome.storage.local.get({ enabled: false });
		isEnabled = enabled as boolean;
	} catch {
		/* keep previous enabled state */
	}

	pageContext = createPageContextScope(currentUrl);
	applyWidgetRuntimeBinding(null);
	await cancelPageWork('navigation', previousScope);
	resetPendingState();

	if (isEnabled) {
		const binding = await registerPageContext();
		applyWidgetRuntimeBinding(binding);
		if (detector) {
			detector.scan();
		}
	}
}

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

	extractor = new DataExtractor();
	selector = new AnswerSelector(
		settings.confidenceThreshold as number,
		settings.autoSelect as boolean,
	);

	const initialRuntimeBinding = await registerPageContext();

	if (isEnabled && settings.autoStartOnPageLoad) {
		startDetection();
	}

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

	chrome.storage.onChanged.addListener(async (changes, areaName) => {
		if (areaName !== 'local') return;

		if (changes.enabled) {
			isEnabled = changes.enabled.newValue as boolean;
			if (isEnabled) {
				const binding = await registerPageContext();
				applyWidgetRuntimeBinding(binding);
				startDetection();
			} else {
				stopDetection();
				await cancelPageWork('disable');
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
						const binding = await registerPageContext();
						applyWidgetRuntimeBinding(binding);
						if (isEnabled && detector) {
							detector.scan();
						}
					})
					.catch(() => {});
			},
		};

		const host = new WidgetHost();
		host.mount(bridge, initialRuntimeBinding ?? undefined);
		widgetHost = host;
	} catch (error) {
		logger.error('Failed to mount floating widget', error);
	}

	logger.info(`Content script ready (enabled: ${isEnabled})`);
}

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
	resetPendingState();
	clearVisibleErrors();
	logger.info('Detection stopped');
}

function shouldDiscardBatch(epoch: number, requestPageContext: PageContextScope): boolean {
	return (
		!isEnabled ||
		epoch !== batchEpoch ||
		requestPageContext.pageInstanceId !== pageContext.pageInstanceId
	);
}

async function handleDetectedQuestion(detected: DetectedQuestion): Promise<void> {
	if (!isEnabled) return;
	if (solvedUIDs.has(detected.uid)) {
		logger.info(`Skipping already-solved question ${detected.uid}`);
		return;
	}

	try {
		AnswerSelector.markProcessing(detected.element);
		const extracted = extractor.extract(detected.element);
		if (!extracted || !extracted.questionText) {
			logger.warn('Could not extract question data for', detected.uid);
			AnswerSelector.clearProcessing(detected.element);
			return;
		}

		pendingQuestions.push({
			uid: detected.uid,
			element: detected.element,
			detected,
			extracted,
		});

		if (batchTimeout) {
			clearTimeout(batchTimeout);
			batchTimeout = null;
		}
		batchTimeout = setTimeout(() => {
			processBatch().catch((error) => logger.error('Batch processing failed', error));
		}, BATCH_DEBOUNCE_MS);

		logger.info(`Queued question ${detected.uid} (${pendingQuestions.length} pending)`);
	} catch (error) {
		AnswerSelector.clearProcessing(detected.element);
		AnswerSelector.markError(detected.element);
		logger.error('Failed to extract question', error);
	}
}

async function processBatch(): Promise<void> {
	if (pendingQuestions.length === 0) return;
	if (isProcessing) {
		if (!batchTimeout) {
			batchTimeout = setTimeout(() => {
				processBatch().catch((error) => logger.error('Batch processing failed', error));
			}, BATCH_DEBOUNCE_MS);
		}
		return;
	}

	const batch = [...pendingQuestions];
	pendingQuestions.length = 0;
	batchTimeout = null;
	isProcessing = true;
	const epoch = batchEpoch;
	const requestId = createUniqueId('request');
	const requestPageContext = pageContext;

	logger.info(`Processing batch of ${batch.length} questions`);

	try {
		await registerPageContext(requestPageContext);

		const payload: BatchQuestionPayload = {
			runtimeContext: {
				requestId,
				pageInstanceId: requestPageContext.pageInstanceId,
				pageUrl: requestPageContext.pageUrl,
			},
			questions: batch.map((question) => {
				const allImages = [...question.extracted.images];
				const optionTexts = question.extracted.options.map((option) => {
					if (option.images && option.images.length > 0) {
						allImages.push(...option.images);
						return option.text || '[Option contains image(s)]';
					}
					return option.text;
				});

				return {
					uid: question.uid,
					questionText: question.extracted.questionText,
					options: optionTexts,
					images: allImages.length > 0 ? allImages : undefined,
					questionType: question.extracted.questionType,
				};
			}),
		};

		const response = await sendMessageWithRetry<Message>({
			type: 'SOLVE_BATCH',
			payload,
		});

		if (epoch !== batchEpoch) {
			logger.info('Batch response discarded (epoch changed — navigation or rescan)');
			clearBatchMarkers(batch);
			return;
		}

		const batchPayload = response?.payload as BatchSolveResponsePayload | undefined;
		if (response?.type === 'SOLVE_BATCH' && batchPayload?.answers) {
			if (shouldDiscardBatch(epoch, requestPageContext)) {
				logger.info('Batch response discarded (extension disabled or scope changed)');
				clearBatchMarkers(batch);
				return;
			}

			if (batchPayload.requestId !== requestId) {
				clearBatchMarkers(batch);
				await reportPageError({
					pageInstanceId: requestPageContext.pageInstanceId,
					pageUrl: requestPageContext.pageUrl,
					requestId,
					message: 'Received mismatched requestId from background runtime flow.',
				});
				return;
			}

			let appliedCount = 0;
			let failedCount = 0;
			for (const question of batch) {
				if (shouldDiscardBatch(epoch, requestPageContext)) {
					logger.info('Batch apply aborted (extension disabled or scope changed)');
					clearBatchMarkers(batch);
					return;
				}

				const answer = batchPayload.answers.find((entry) => entry.uid === question.uid);
				if (!answer) {
					AnswerSelector.clearProcessing(question.element);
					AnswerSelector.markError(question.element);
					failedCount += 1;
					continue;
				}

				try {
					AnswerSelector.clearProcessing(question.element);
					if (answer.answer.length === 0) {
						AnswerSelector.markError(question.element);
						logger.warn(`No valid answer parsed for ${answer.uid}`);
						failedCount += 1;
						continue;
					}

					const results = await selector.select(
						question.extracted.options,
						answer.answer,
						answer.confidence,
					);
					question.detected.processed = true;
					solvedUIDs.add(answer.uid);
					appliedCount += 1;
					const anyClicked = results.some((result) => result.success);
					logger.info(
						`Applied answer for ${answer.uid} (confidence: ${answer.confidence}, clicked: ${anyClicked})`,
					);
				} catch (error) {
					AnswerSelector.clearProcessing(question.element);
					AnswerSelector.markError(question.element);
					failedCount += 1;
					logger.error(`Failed to apply answer for ${answer.uid}`, error);
				}
			}

			if (shouldDiscardBatch(epoch, requestPageContext)) {
				logger.info('Batch outcome dropped (extension disabled or scope changed)');
				return;
			}

			await reportApplyOutcome({
				requestId,
				pageInstanceId: requestPageContext.pageInstanceId,
				pageUrl: requestPageContext.pageUrl,
				appliedCount,
				failedCount,
				errorMessage:
					appliedCount === 0 && failedCount > 0
						? 'Failed to apply any answers from this batch.'
						: undefined,
			} satisfies ApplyOutcomePayload);
			return;
		}

		if (response?.type === 'ERROR') {
			const error = response.payload as ErrorPayload;
			logger.error(`Batch solve error: ${error.code} - ${error.message}`);
			if (
				error.code === ERROR_CODES.REQUEST_CANCELLED ||
				error.code === ERROR_CODES.INVALID_SCOPE
			) {
				clearBatchMarkers(batch);
				if (error.code === ERROR_CODES.INVALID_SCOPE) {
					await registerPageContext(requestPageContext);
				}
				return;
			}

			markBatchFailed(batch);
			return;
		}

		logger.error('No response from service worker (may have been restarted)');
		markBatchFailed(batch);
	} catch (error) {
		logger.error('Batch processing failed', error);
		if (epoch !== batchEpoch) {
			clearBatchMarkers(batch);
			return;
		}

		markBatchFailed(batch);
		await reportPageError({
			pageInstanceId: requestPageContext.pageInstanceId,
			pageUrl: requestPageContext.pageUrl,
			requestId,
			message: error instanceof Error ? error.message : String(error),
		} satisfies ReportPageErrorPayload);
	} finally {
		isProcessing = false;
		if (pendingQuestions.length > 0 && !batchTimeout) {
			batchTimeout = setTimeout(() => {
				processBatch().catch((error) => logger.error('Batch processing failed', error));
			}, BATCH_DEBOUNCE_MS);
		}
	}
}

init().catch((error) => {
	logger.error('Content script init failed', error);
});

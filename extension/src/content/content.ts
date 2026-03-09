/**
 * Content script — single-request question solving with debounce.
 * Detects all questions, collects them, sends one SOLVE_BATCH request with all questions.
 * REQ: REQ-011
 */

import type {
	BatchQuestionPayload,
	BatchSolveResponsePayload,
	ErrorPayload,
	Message,
} from '../types/messages';
import type { DetectedQuestion, ExtractedQuestion } from '../types/questions';
import { DATA_ATTRIBUTES } from '../utils/constants';
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
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
				continue;
			}
			throw error;
		}
	}
	// Unreachable: loop always returns or throws, but TS needs this
	throw new Error('Max retries exceeded contacting service worker');
}

interface PendingQuestion {
	uid: string;
	element: HTMLElement;
	detected: DetectedQuestion;
	extracted: ExtractedQuestion;
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
const BATCH_DEBOUNCE_MS = 800;

function markBatchFailed(batch: PendingQuestion[]): void {
	for (const q of batch) {
		if (!q.detected.processed) {
			AnswerSelector.clearProcessing(q.element);
			AnswerSelector.markError(q.element);
		}
	}
}

async function init(): Promise<void> {
	logger.info(`Content script loaded on: ${window.location.href}`);
	logger.info('Content script initializing');

	const settings = await chrome.storage.local.get({
		enabled: false,
		confidenceThreshold: 0.7,
		autoSelect: true,
		autoStartOnPageLoad: true,
	});
	isEnabled = settings.enabled as boolean;

	extractor = new DataExtractor();
	selector = new AnswerSelector(
		settings.confidenceThreshold as number,
		settings.autoSelect as boolean,
	);

	if (isEnabled && settings.autoStartOnPageLoad) {
		startDetection();
	}

	// Listen for popup commands (SCAN_PAGE, RETRY_QUESTIONS)
	chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
		if (message.type === 'SCAN_PAGE' || message.type === 'RETRY_QUESTIONS') {
			if (!isEnabled) {
				sendResponse({ success: false, reason: 'Extension is disabled' });
				return false;
			}
			pendingQuestions.length = 0;
			if (batchTimeout) {
				clearTimeout(batchTimeout);
				batchTimeout = null;
			}
			batchEpoch++;
			solvedUIDs.clear();
			// Clear previous error markers so questions are re-processable
			document
				.querySelectorAll(`[${DATA_ATTRIBUTES.ERROR}="true"]`)
				.forEach((el) => AnswerSelector.clearProcessing(el as HTMLElement));
			if (detector) {
				detector.scan();
			} else {
				startDetection();
			}
			sendResponse({ success: true });
			return false;
		}
		return false;
	});

	// Listen for settings changes
	chrome.storage.onChanged.addListener(async (changes, areaName) => {
		if (areaName !== 'local') return;
		if (changes.enabled) {
			isEnabled = changes.enabled.newValue as boolean;
			if (isEnabled) {
				startDetection();
			} else {
				stopDetection();
			}
		}
		if (changes.confidenceThreshold || changes.autoSelect) {
			const current = await chrome.storage.local.get({
				confidenceThreshold: 0.7,
				autoSelect: true,
			});
			selector = new AnswerSelector(
				(changes.confidenceThreshold?.newValue ?? current.confidenceThreshold) as number,
				(changes.autoSelect?.newValue ?? current.autoSelect) as boolean,
			);
		}

		// Auto-retry on API key/provider/model changes
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
			pendingQuestions.length = 0;
			if (batchTimeout) {
				clearTimeout(batchTimeout);
				batchTimeout = null;
			}
			batchEpoch++;
			solvedUIDs.clear();
			document
				.querySelectorAll(`[${DATA_ATTRIBUTES.ERROR}="true"]`)
				.forEach((el) => AnswerSelector.clearProcessing(el as HTMLElement));
			if (detector) detector.scan();
		}
	});

	// SPA navigation detection — Coursera uses History API
	let lastUrl = window.location.href;
	const handleUrlChange = (): void => {
		const currentUrl = window.location.href;
		if (currentUrl === lastUrl) return;
		lastUrl = currentUrl;
		logger.info(`SPA navigation detected: ${currentUrl}`);

		// Re-sync isEnabled from storage in case onChanged was missed
		chrome.storage.local
			.get({ enabled: false })
			.then((s) => {
				isEnabled = s.enabled as boolean;
			})
			.catch(() => {});

		// Reset stale session status on navigation
		chrome.storage.session
			.set({
				_lastStatus: 'idle',
				_lastError: '',
				_lastConfidence: null,
			})
			.catch(() => {
				/* ignore storage errors */
			});

		pendingQuestions.length = 0;
		if (batchTimeout) {
			clearTimeout(batchTimeout);
			batchTimeout = null;
		}
		batchEpoch++;
		solvedUIDs.clear();
		if (detector) {
			detector.scan();
		}
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
	pendingQuestions.length = 0;
	if (batchTimeout) {
		clearTimeout(batchTimeout);
		batchTimeout = null;
	}
	logger.info('Detection stopped');
}

async function handleDetectedQuestion(detected: DetectedQuestion): Promise<void> {
	if (!isEnabled) return;
	// Skip questions that were already successfully answered
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

		// Reset debounce timer
		if (batchTimeout) {
			clearTimeout(batchTimeout);
			batchTimeout = null;
		}
		batchTimeout = setTimeout(() => {
			processBatch().catch((err) => logger.error('Batch processing failed', err));
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
		// Re-schedule: another batch is in-flight
		if (!batchTimeout) {
			batchTimeout = setTimeout(() => {
				processBatch().catch((err) => logger.error('Batch processing failed', err));
			}, BATCH_DEBOUNCE_MS);
		}
		return;
	}

	const batch = [...pendingQuestions];
	pendingQuestions.length = 0;
	batchTimeout = null;
	isProcessing = true;
	const epoch = batchEpoch;

	logger.info(`Processing batch of ${batch.length} questions`);

	try {
		// Build batch payload, including option-level images
		const payload: BatchQuestionPayload = {
			questions: batch.map((q) => {
				const allImages = [...q.extracted.images];
				const optionTexts = q.extracted.options.map((o) => {
					if (o.images && o.images.length > 0) {
						allImages.push(...o.images);
						return o.text || '[Option contains image(s)]';
					}
					return o.text;
				});
				return {
					uid: q.uid,
					questionText: q.extracted.questionText,
					options: optionTexts,
					images: allImages.length > 0 ? allImages : undefined,
					questionType: q.extracted.questionType,
				};
			}),
		};

		// Send single batch message to background
		const response = await sendMessageWithRetry<Message>({
			type: 'SOLVE_BATCH',
			payload,
		});

		// Discard stale results if page navigated or re-scanned during the request
		if (epoch !== batchEpoch) {
			logger.info('Batch response discarded (epoch changed — navigation or rescan)');
			for (const q of batch) {
				AnswerSelector.clearProcessing(q.element);
			}
			return;
		}

		const batchPayload = response?.payload as BatchSolveResponsePayload | undefined;
		if (response?.type === 'SOLVE_BATCH' && batchPayload?.answers) {
			for (const answer of batchPayload.answers) {
				const pending = batch.find((q) => q.uid === answer.uid);
				if (!pending) continue;
				try {
					AnswerSelector.clearProcessing(pending.element);
					if (answer.answer.length === 0) {
						AnswerSelector.markError(pending.element);
						logger.warn(`No valid answer parsed for ${answer.uid}`);
						continue;
					}
					const results = await selector.select(
						pending.extracted.options,
						answer.answer,
						answer.confidence,
					);
					pending.detected.processed = true;
					solvedUIDs.add(answer.uid);
					const anyClicked = results.some((r) => r.success);
					logger.info(
						`Applied answer for ${answer.uid} (confidence: ${answer.confidence}, clicked: ${anyClicked})`,
					);
				} catch (answerErr) {
					AnswerSelector.clearProcessing(pending.element);
					AnswerSelector.markError(pending.element);
					logger.error(`Failed to apply answer for ${answer.uid}`, answerErr);
				}
			}
		} else if (response?.type === 'ERROR') {
			const err = response.payload as ErrorPayload;
			logger.error(`Batch solve error: ${err.code} - ${err.message}`);
			markBatchFailed(batch);
			chrome.storage.session
				.set({ _lastStatus: 'error', _lastError: err.message || 'Unknown batch error' })
				.catch(() => {});
		} else {
			logger.error('No response from service worker (may have been restarted)');
			markBatchFailed(batch);
		}
	} catch (error) {
		logger.error('Batch processing failed', error);
		markBatchFailed(batch);
		chrome.storage.session
			.set({
				_lastStatus: 'error',
				_lastError: error instanceof Error ? error.message : String(error),
			})
			.catch(() => {});
	} finally {
		isProcessing = false;
		// Drain any questions that arrived while processing
		if (pendingQuestions.length > 0 && !batchTimeout) {
			batchTimeout = setTimeout(() => {
				processBatch().catch((err) => logger.error('Batch processing failed', err));
			}, BATCH_DEBOUNCE_MS);
		}
	}
}

// Bootstrap
init().catch((err) => {
	logger.error('Content script init failed', err);
});

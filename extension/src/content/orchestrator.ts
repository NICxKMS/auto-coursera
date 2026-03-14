/**
 * Batch solve/apply orchestrator.
 * Coordinates the detect → extract → solve → apply pipeline.
 */

import type {
	ApplyOutcomePayload,
	BackgroundResponseMessage,
	BatchQuestionPayload,
	ReportPageErrorPayload,
} from '../types/messages';
import { isBatchSolveResponseMessage, isErrorMessage } from '../types/messages';
import type {
	AnswerOption,
	DetectedQuestion,
	ExtractedQuestion,
	FillResult,
	SelectionResult,
} from '../types/questions';
import type { PageRuntimeScope } from '../types/runtime';
import { ERROR_CODES } from '../utils/constants';
import { Logger } from '../utils/logger';
import {
	registerPageContext,
	reportApplyOutcome,
	reportPageError,
	sendMessageWithRetry,
} from './bridge';
import { BATCH_DEBOUNCE_MS, createContentId } from './constants';
import { extractQuestion } from './extractor';
import { clearProcessing, markError, markProcessing } from './selector';

const logger = new Logger('Orchestrator');

// ── Types ───────────────────────────────────────────────────────

interface PendingQuestion {
	uid: string;
	element: HTMLElement;
	extracted: ExtractedQuestion;
}

/** Dependencies injected from the content script entry point. */
export interface OrchestrationContext {
	isEnabled(): boolean;
	pageContext(): PageRuntimeScope;
	select(
		options: AnswerOption[],
		answerIndices: number[],
		confidence: number,
	): Promise<SelectionResult[]>;
	fillInput(
		inputElement: HTMLInputElement,
		questionElement: HTMLElement,
		value: string,
		confidence: number,
	): Promise<FillResult>;
}

// ── Module State ────────────────────────────────────────────────

let ctx: OrchestrationContext;
const pendingQuestions: PendingQuestion[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
let isProcessing = false;
let batchEpoch = 0;
const solvedUIDs = new Set<string>();

// ── Init ────────────────────────────────────────────────────────

/** Wire the orchestrator to the content script's shared state. */
export function initOrchestrator(context: OrchestrationContext): void {
	ctx = context;
}

// ── Batch State Management ──────────────────────────────────────

/** Reset all pending batch state (used on navigation, rescan, disable). */
export function resetBatchState(): void {
	pendingQuestions.length = 0;
	if (batchTimeout) {
		clearTimeout(batchTimeout);
		batchTimeout = null;
	}
	batchEpoch++;
	solvedUIDs.clear();
}

function clearBatchMarkers(batch: PendingQuestion[]): void {
	for (const question of batch) {
		clearProcessing(question.element);
	}
}

function markBatchFailed(batch: PendingQuestion[]): void {
	for (const question of batch) {
		if (solvedUIDs.has(question.uid)) continue;
		clearProcessing(question.element);
		markError(question.element);
	}
}

function shouldDiscardBatch(epoch: number, requestPageContext: PageRuntimeScope): boolean {
	return (
		!ctx.isEnabled() ||
		epoch !== batchEpoch ||
		requestPageContext.pageInstanceId !== ctx.pageContext().pageInstanceId
	);
}

// ── Detection Callback ──────────────────────────────────────────

/** Handle a newly detected question: extract, queue, and schedule batch. */
export async function handleDetectedQuestion(detected: DetectedQuestion): Promise<void> {
	if (!ctx.isEnabled()) return;
	if (solvedUIDs.has(detected.uid)) {
		logger.info(`Skipping already-solved question ${detected.uid}`);
		return;
	}

	try {
		markProcessing(detected.element);
		const extracted = extractQuestion(detected.element);
		if (!extracted || !extracted.questionText) {
			logger.warn('Could not extract question data for', detected.uid);
			clearProcessing(detected.element);
			return;
		}

		pendingQuestions.push({
			uid: detected.uid,
			element: detected.element,
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
		clearProcessing(detected.element);
		markError(detected.element);
		logger.error('Failed to extract question', error);
	}
}

// ── Batch Processing ────────────────────────────────────────────

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
	const requestId = createContentId('request');
	const requestPageContext = ctx.pageContext();

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
					selectionMode: question.extracted.selectionMode,
					codeBlocks: question.extracted.codeBlocks,
				};
			}),
		};

		const response = await sendMessageWithRetry<BackgroundResponseMessage>({
			type: 'SOLVE_BATCH',
			payload,
		});

		if (epoch !== batchEpoch) {
			logger.info('Batch response discarded (epoch changed — navigation or rescan)');
			clearBatchMarkers(batch);
			return;
		}

		if (isBatchSolveResponseMessage(response)) {
			const batchPayload = response.payload;
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
					clearProcessing(question.element);
					markError(question.element);
					failedCount += 1;
					continue;
				}

				try {
					clearProcessing(question.element);

					if (question.extracted.selectionMode === 'numeric' && answer.rawAnswer != null) {
						// Numeric question: fill the input field directly
						if (question.extracted.inputElement) {
							const result = await ctx.fillInput(
								question.extracted.inputElement,
								question.element,
								answer.rawAnswer,
								answer.confidence,
							);
							solvedUIDs.add(answer.uid);
							appliedCount += 1;
							logger.info(
								`Numeric question ${answer.uid}: filled "${answer.rawAnswer}" (confidence: ${answer.confidence}, success: ${result.success})`,
							);
						} else {
							markError(question.element);
							failedCount += 1;
							logger.warn(`Numeric question ${answer.uid}: no inputElement found, cannot fill`);
						}
					} else {
						// Multiple-choice question: select options
						if (answer.answer.length === 0) {
							markError(question.element);
							logger.warn(`No valid answer parsed for ${answer.uid}`);
							failedCount += 1;
							continue;
						}

						const results = await ctx.select(
							question.extracted.options,
							answer.answer,
							answer.confidence,
						);
						solvedUIDs.add(answer.uid);
						appliedCount += 1;
						const anyClicked = results.some((result) => result.success);
						logger.info(
							`Applied answer for ${answer.uid} (confidence: ${answer.confidence}, clicked: ${anyClicked})`,
						);
					}
				} catch (error) {
					clearProcessing(question.element);
					markError(question.element);
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

		if (isErrorMessage(response)) {
			const error = response.payload;
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

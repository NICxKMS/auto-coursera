/**
 * Data extraction — question text, options, images, and code blocks from Coursera DOM.
 * Uses COURSERA_SELECTORS for all DOM queries.
 * Filters AI honeypot elements and replaces math blocks with LaTeX source.
 */

import type { AnswerOption, ExtractedQuestion } from '../types/questions';
import { Logger } from '../utils/logger';
import { COURSERA_SELECTORS } from './constants';
import { getQuestionSelectionMode } from './question-contract';

const logger = new Logger('DataExtractor');

/**
 * Extract question data from a question container element.
 * The element should match COURSERA_SELECTORS.questionContainer.
 * Returns null if the legend (question header) cannot be found.
 */
export function extractQuestion(element: Element): ExtractedQuestion | null {
	const legend = element.querySelector(COURSERA_SELECTORS.legend);
	if (!legend) {
		logger.warn('No legend found in question container');
		return null;
	}

	const textEl = legend.querySelector(COURSERA_SELECTORS.questionText);
	const questionText = textEl ? extractTextWithMath(textEl) : '';

	const testId = element.getAttribute('data-testid') || '';
	const selectionMode = getQuestionSelectionMode(element, testId, 'single');

	const questionImages = [
		...new Set(
			Array.from(
				legend.querySelectorAll(`${COURSERA_SELECTORS.image}, img`),
				(img) => (img as HTMLImageElement).src,
			).filter(Boolean),
		),
	];

	// Numeric questions have no options — return early with the input element reference
	if (selectionMode === 'numeric') {
		const numericInput = element.querySelector<HTMLInputElement>(COURSERA_SELECTORS.numericInput);
		const codeBlocks = extractCodeBlocks(element);

		logger.info(
			`Extracted numeric question: images=${questionImages.length}, hasInput=${!!numericInput}, codeBlocks=${codeBlocks.length}`,
		);

		return {
			questionText,
			selectionMode,
			options: [],
			images: questionImages,
			inputElement: numericInput ?? undefined,
			codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
		};
	}

	const options: AnswerOption[] = [];
	const optionEls = element.querySelectorAll(COURSERA_SELECTORS.option);
	optionEls.forEach((optEl, index) => {
		const input = optEl.querySelector(COURSERA_SELECTORS.optionInput) as HTMLInputElement | null;
		const optTextEl = optEl.querySelector(COURSERA_SELECTORS.optionText);
		const optionText = optTextEl ? extractTextWithMath(optTextEl) : '';

		const optImageSrcs = [
			...new Set(
				Array.from(
					optEl.querySelectorAll(`${COURSERA_SELECTORS.image}, img`),
					(img) => (img as HTMLImageElement).src,
				).filter(Boolean),
			),
		];

		options.push({
			element: optEl,
			index,
			text: optionText,
			inputElement: input,
			images: optImageSrcs,
		});
	});

	const codeBlocks = extractCodeBlocks(element);

	logger.info(
		`Extracted question: selectionMode=${selectionMode}, options=${options.length}, images=${questionImages.length}, codeBlocks=${codeBlocks.length}`,
	);

	return {
		questionText,
		selectionMode,
		options,
		images: questionImages,
		codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
	};
}

/**
 * Extract text content from an element, replacing math blocks with LaTeX
 * and filtering out AI honeypot elements.
 */
function extractTextWithMath(el: Element): string {
	const clone = el.cloneNode(true) as Element;

	clone.querySelectorAll(COURSERA_SELECTORS.aiHoneypot).forEach((h) => {
		h.remove();
	});

	clone.querySelectorAll('[data-pendo="math-block"]').forEach((mathBlock) => {
		const ann = mathBlock.querySelector(COURSERA_SELECTORS.mathAnnotation);
		if (!ann || !mathBlock.parentNode) return;
		const latex = ann.textContent || '';
		const textNode = document.createTextNode(` $${latex}$ `);
		mathBlock.parentNode.replaceChild(textNode, mathBlock);
	});

	return clone.textContent?.trim() || '';
}

/**
 * Extract code blocks from Monaco editor instances embedded in a question container.
 * These are read-only code blocks used as computational aids in Coursera quizzes.
 * The code is appended to the AI prompt as additional context.
 */
export function extractCodeBlocks(container: Element): string[] {
	const codeBlocks: string[] = [];
	const editors = container.querySelectorAll(COURSERA_SELECTORS.codeEditor);

	for (const editor of editors) {
		const language = editor.getAttribute('data-mode-id') ?? 'unknown';
		const viewLines = editor.querySelector('.view-lines');
		if (!viewLines) continue;

		const lines: string[] = [];
		for (const line of viewLines.querySelectorAll('.view-line')) {
			lines.push(line.textContent?.trim() ?? '');
		}

		const code = lines.join('\n').trim();
		if (code) {
			codeBlocks.push(`[Code Block (${language})]:\n${code}`);
		}
	}

	return codeBlocks;
}

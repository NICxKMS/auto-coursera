/**
 * DataExtractor — extracts question text, options, and images from Coursera DOM.
 * Uses COURSERA_SELECTORS for all DOM queries.
 * Filters AI honeypot elements and replaces math blocks with LaTeX source.
 * REQ: REQ-004, REQ-005
 */

import type { AnswerOption, ExtractedQuestion, ExtractedQuestionType } from '../types/questions';
import { COURSERA_SELECTORS } from '../utils/constants';
import { Logger } from '../utils/logger';

const logger = new Logger('DataExtractor');

export class DataExtractor {
	/**
	 * Extract question data from a question container element.
	 * The element should match COURSERA_SELECTORS.questionContainer.
	 * Returns null if the legend (question header) cannot be found.
	 */
	extract(element: Element): ExtractedQuestion | null {
		// 1. Extract question text from legend
		const legend = element.querySelector(COURSERA_SELECTORS.legend);
		if (!legend) {
			logger.warn('No legend found in question container');
			return null;
		}

		const textEl = legend.querySelector(COURSERA_SELECTORS.questionText);
		const questionText = textEl ? this.extractTextWithMath(textEl) : '';

		// 2. Determine question type from data-testid
		const testId = element.getAttribute('data-testid') || '';
		let questionType: ExtractedQuestionType = 'multiple-choice';
		if (testId.includes('CheckboxQuestion')) {
			questionType = 'checkbox';
		} else if (testId.includes('CodeExpression')) {
			questionType = 'text-input';
		}

		// 3. Extract options
		const options: AnswerOption[] = [];
		const optionEls = element.querySelectorAll(COURSERA_SELECTORS.option);
		optionEls.forEach((optEl, index) => {
			const input = optEl.querySelector(COURSERA_SELECTORS.optionInput) as HTMLInputElement | null;
			const optTextEl = optEl.querySelector(COURSERA_SELECTORS.optionText);
			const optionText = optTextEl ? this.extractTextWithMath(optTextEl) : '';

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

		// 4. Extract question images from legend only (not from options)
		const questionImages = [
			...new Set(
				Array.from(
					legend.querySelectorAll(`${COURSERA_SELECTORS.image}, img`),
					(img) => (img as HTMLImageElement).src,
				).filter(Boolean),
			),
		];

		logger.info(
			`Extracted question: type=${questionType}, options=${options.length}, images=${questionImages.length}`,
		);

		return {
			questionText,
			questionType,
			options,
			images: questionImages,
		};
	}

	/**
	 * Extract text content from an element, replacing math blocks with LaTeX
	 * and filtering out AI honeypot elements.
	 */
	private extractTextWithMath(el: Element): string {
		// Clone to avoid modifying the live DOM
		const clone = el.cloneNode(true) as Element;

		// Remove honeypot elements
		clone.querySelectorAll(COURSERA_SELECTORS.aiHoneypot).forEach((h) => {
			h.remove();
		});

		// Replace math blocks with their LaTeX source (query blocks directly to avoid
		// orphaned annotations when multiple exist under the same math block)
		clone.querySelectorAll('[data-pendo="math-block"]').forEach((mathBlock) => {
			const ann = mathBlock.querySelector(COURSERA_SELECTORS.mathAnnotation);
			if (!ann || !mathBlock.parentNode) return;
			const latex = ann.textContent || '';
			const textNode = document.createTextNode(` $${latex}$ `);
			mathBlock.parentNode.replaceChild(textNode, mathBlock);
		});

		return clone.textContent?.trim() || '';
	}
}

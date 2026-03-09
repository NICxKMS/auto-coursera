/**
 * AnswerSelector — click simulation and highlighting for answer options.
 * REQ: REQ-010
 */

import type { AnswerOption, SelectionResult } from '../types/questions';
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, DATA_ATTRIBUTES } from '../utils/constants';
import { Logger } from '../utils/logger';

const logger = new Logger('AnswerSelector');

const CONFIDENCE_COLORS: Record<string, string> = {
	high: '#22c55e',
	medium: '#eab308',
	low: '#f97316',
};

export class AnswerSelector {
	private readonly confidenceThreshold: number;
	private readonly autoSelect: boolean;

	constructor(threshold: number = 0.7, autoSelect: boolean = true) {
		this.confidenceThreshold = threshold;
		this.autoSelect = autoSelect;
	}

	/**
	 * Select answers based on AI response.
	 * AC-010.3: Below threshold → highlight only, not click
	 * AC-010.4: Highlighted with data-auto-coursera-suggestion attribute
	 */
	async select(
		options: AnswerOption[],
		answerIndices: number[],
		confidence: number,
	): Promise<SelectionResult[]> {
		// Guard: cap to single answer for radio-button (single-choice) questions
		const isRadio = options.some((o) => o.inputElement?.type === 'radio');
		if (isRadio && answerIndices.length > 1) {
			logger.warn(`Capped ${answerIndices.length} answers to 1 for radio-button question`);
			answerIndices = answerIndices.slice(0, 1);
		}

		if (!this.autoSelect || confidence < this.confidenceThreshold) {
			logger.info(
				`${!this.autoSelect ? 'Auto-select disabled' : `Confidence ${confidence} below threshold ${this.confidenceThreshold}`}, highlighting only`,
			);
			answerIndices.forEach((i) => {
				if (options[i]) this.highlightOption(options[i], confidence, false);
			});
			return answerIndices.map((i) => ({
				success: false,
				selectedIndex: i,
				confidence,
				method: 'click' as const,
			}));
		}

		return Promise.all(
			answerIndices.map(async (idx) => {
				const option = options[idx];
				if (!option) {
					logger.error(`Invalid answer index: ${idx}`);
					return {
						success: false,
						selectedIndex: idx,
						confidence,
						method: 'click' as const,
					};
				}
				const method = await this.performClick(option);
				this.highlightOption(option, confidence);
				logger.info(`Selected option ${idx} via ${method}`);
				return { success: true, selectedIndex: idx, confidence, method };
			}),
		);
	}

	/**
	 * Perform click simulation with three strategies.
	 * AC-010.1: label click → input click → direct click
	 * AC-010.2: Dispatches change event with {bubbles: true}
	 */
	private async performClick(
		option: AnswerOption,
	): Promise<'click' | 'input-change' | 'label-click'> {
		const el = option.element as HTMLElement;

		// Strategy 1: Label click (most reliable for React controlled inputs)
		// Coursera hides <input> at opacity:0; clicking the <label> wrapper
		// triggers the checkbox/radio via browser activation behavior,
		// and the click event bubbles to React's delegation root.
		const label = el.closest('label') ?? el.querySelector('label');
		if (label) {
			await AnswerSelector.clickWithVerification(label);
			return 'label-click';
		}

		// Strategy 2: Input element directly via native click
		const input =
			option.inputElement ??
			el.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
		if (input) {
			await AnswerSelector.clickWithVerification(input);
			return 'input-change';
		}

		// Strategy 3: Direct wrapper element click
		await AnswerSelector.clickWithVerification(el);
		return 'click';
	}

	/**
	 * Simulate a real user click with full event sequence for React compatibility.
	 * Uses native .click() which reliably triggers:
	 * 1. Browser default behavior (checkbox/radio toggle)
	 * 2. Click event that bubbles to React's event delegation root
	 * 3. React's onChange handler fires, updating controlled state
	 */
	private static simulateClick(target: HTMLElement): void {
		// Dispatch mousedown/mouseup for React's synthetic event tracking
		target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

		// Native .click() reliably triggers browser activation behavior
		// (checkbox/radio toggle) AND dispatches a click event that bubbles
		// to React's event delegation root — unlike synthetic MouseEvent('click')
		// which may not trigger activation behavior consistently.
		target.click();

		// Dispatch change/input events as additional signal for React
		const input =
			target instanceof HTMLInputElement
				? target
				: target.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
		if (input) {
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	/**
	 * Click with verification: retry if React reverts the selection.
	 * After each attempt, waits briefly for React to re-render and checks
	 * whether the input is still checked. Retries up to maxRetries times.
	 */
	private static async clickWithVerification(
		target: HTMLElement,
		maxRetries: number = 2,
	): Promise<boolean> {
		const input =
			target.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]') ??
			(target instanceof HTMLInputElement ? target : null);

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			AnswerSelector.simulateClick(target);

			// If no input found, can't verify — trust the click worked
			if (!input) return true;

			// Wait for React to process the event and re-render
			await new Promise<void>((r) => setTimeout(r, 250));

			if (input.checked) return true;

			if (attempt < maxRetries) {
				logger.warn(`Selection reverted, retry ${attempt + 1}/${maxRetries}`);
			}
		}

		logger.warn('Selection did not stick after retries');
		return false;
	}

	/**
	 * Highlight an option with confidence-based coloring.
	 * AC-010.4: data-auto-coursera-suggestion="true" attribute
	 * @param clicked — true if the option was auto-clicked, false if highlight-only (suggestion)
	 */
	private highlightOption(option: AnswerOption, confidence: number, clicked: boolean = true): void {
		const el = option.element as HTMLElement;

		el.classList.remove(
			'auto-coursera-high',
			'auto-coursera-medium',
			'auto-coursera-low',
			'highlight-only',
		);

		const level =
			confidence >= CONFIDENCE_HIGH ? 'high' : confidence >= CONFIDENCE_MEDIUM ? 'medium' : 'low';
		el.setAttribute(DATA_ATTRIBUTES.SUGGESTION, level);
		if (!clicked) el.classList.add('highlight-only');

		const style = clicked ? 'solid' : 'dashed';
		const color = CONFIDENCE_COLORS[level];
		el.style.outline = `2px ${style} ${color}`;
		el.classList.add(`auto-coursera-${level}`);
		el.style.outlineOffset = '2px';
		el.style.borderRadius = '4px';
	}

	/**
	 * Mark a question as having an error.
	 */
	static markError(element: HTMLElement): void {
		element.style.outline = '2px solid #ef4444';
		element.style.outlineOffset = '2px';
		element.setAttribute(DATA_ATTRIBUTES.ERROR, 'true');
	}

	/**
	 * Mark a question as processing with a subtle pulsing outline.
	 */
	static markProcessing(element: HTMLElement): void {
		element.style.outline = '2px solid #94a3b8';
		element.style.outlineOffset = '2px';
		element.style.animation = 'auto-coursera-pulse 1.5s ease-in-out infinite';
		element.setAttribute(DATA_ATTRIBUTES.PROCESSING, 'true');

		// Inject the keyframe animation once into the document
		if (!document.getElementById('auto-coursera-pulse-style')) {
			const style = document.createElement('style');
			style.id = 'auto-coursera-pulse-style';
			style.textContent = `@keyframes auto-coursera-pulse { 0%,100% { outline-color: #94a3b8; } 50% { outline-color: #cbd5e1; } }`;
			document.head.appendChild(style);
		}
	}

	/**
	 * Clear processing/error indicator.
	 */
	static clearProcessing(element: HTMLElement): void {
		element.style.outline = '';
		element.style.outlineOffset = '';
		element.style.animation = '';
		element.removeAttribute(DATA_ATTRIBUTES.PROCESSING);
		element.removeAttribute(DATA_ATTRIBUTES.ERROR);
	}
}

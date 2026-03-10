/**
 * AnswerSelector — click simulation and highlighting for answer options.
 * REQ: REQ-010
 */

import type { AnswerOption, SelectionResult } from '../types/questions';
import { DEFAULT_SETTINGS } from '../types/settings';
import {
	CLICK_SETTLE_DELAY_MS,
	CLICK_VERIFY_MAX_RETRIES,
	COLORS,
	CONFIDENCE_HIGH,
	CONFIDENCE_MEDIUM,
	DATA_ATTRIBUTES,
} from '../utils/constants';
import { Logger } from '../utils/logger';

const logger = new Logger('AnswerSelector');

type ConfidenceLevel = 'high' | 'medium' | 'low';

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
	high: COLORS.SUCCESS,
	medium: COLORS.WARNING,
	low: COLORS.LOW,
};

export class AnswerSelector {
	private readonly confidenceThreshold: number;
	private readonly autoSelect: boolean;

	constructor(
		threshold: number = DEFAULT_SETTINGS.confidenceThreshold,
		autoSelect: boolean = DEFAULT_SETTINGS.autoSelect,
	) {
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

		// Process clicks sequentially — parallel clicks cause React re-renders
		// that can revert earlier selections (controlled component race condition)
		const results: SelectionResult[] = [];
		for (const idx of answerIndices) {
			const option = options[idx];
			if (!option) {
				logger.error(`Invalid answer index: ${idx}`);
				results.push({
					success: false,
					selectedIndex: idx,
					confidence,
					method: 'click' as const,
				});
				continue;
			}
			const { method, verified } = await this.performClick(option);
			this.highlightOption(option, confidence, verified);
			logger.info(`Selected option ${idx} via ${method}${verified ? '' : ' (unverified)'}`);
			results.push({ success: verified, selectedIndex: idx, confidence, method });
		}

		// Re-verification: a later click's React re-render can revert an earlier selection.
		// Wait for React to settle, then re-check and re-click any reverted inputs.
		if (results.length > 1) {
			await new Promise<void>((r) => setTimeout(r, CLICK_SETTLE_DELAY_MS));
			for (let i = 0; i < results.length; i++) {
				if (!results[i].success) continue;
				const option = options[results[i].selectedIndex];
				if (!option) continue;
				const input =
					option.inputElement ??
					(option.element as HTMLElement).querySelector<HTMLInputElement>(
						'input[type="radio"], input[type="checkbox"]',
					);
				if (input && !input.checked) {
					logger.warn(
						`Option ${results[i].selectedIndex} reverted by later React render, re-selecting`,
					);
					const { verified } = await this.performClick(option);
					results[i] = { ...results[i], success: verified };
					if (!verified) {
						this.highlightOption(option, confidence, false);
					}
				}
			}
		}

		return results;
	}

	/**
	 * Perform click simulation with three strategies.
	 * AC-010.1: label click → input click → direct click
	 * AC-010.2: Dispatches change event with {bubbles: true}
	 */
	private async performClick(
		option: AnswerOption,
	): Promise<{ method: 'click' | 'input-change' | 'label-click'; verified: boolean }> {
		const el = option.element as HTMLElement;

		// Warn if the element was detached by a React re-render —
		// the click may not be visible, but clickWithVerification will
		// detect the failure and the solvedUIDs guard prevents re-processing loops.
		if (!el.isConnected) {
			logger.warn('Option element may be detached from DOM');
		}

		// Strategy 1: Label click (most reliable for React controlled inputs)
		// Coursera hides <input> at opacity:0; clicking the <label> wrapper
		// triggers the checkbox/radio via browser activation behavior,
		// and the click event bubbles to React's delegation root.
		const label = el.closest('label') ?? el.querySelector('label');
		if (label) {
			const verified = await AnswerSelector.clickWithVerification(label);
			return { method: 'label-click', verified };
		}

		// Strategy 2: Input element directly via native click
		const input =
			option.inputElement ??
			el.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
		if (input) {
			const verified = await AnswerSelector.clickWithVerification(input);
			return { method: 'input-change', verified };
		}

		// Strategy 3: Direct wrapper element click
		const verified = await AnswerSelector.clickWithVerification(el);
		return { method: 'click', verified };
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
		maxRetries: number = CLICK_VERIFY_MAX_RETRIES,
	): Promise<boolean> {
		const input =
			target.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]') ??
			(target instanceof HTMLInputElement ? target : null);

		// Already in desired state — skip clicking to avoid checkbox toggle-off
		if (input?.checked) return true;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			AnswerSelector.simulateClick(target);

			// If no input found, can't verify — trust the click worked
			if (!input) return true;

			// Wait for React to process the event and re-render
			await new Promise<void>((r) => setTimeout(r, CLICK_SETTLE_DELAY_MS));

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
		element.style.outline = `2px solid ${COLORS.ERROR}`;
		element.style.outlineOffset = '2px';
		element.setAttribute(DATA_ATTRIBUTES.ERROR, 'true');
	}

	/**
	 * Mark a question as processing with a subtle pulsing outline.
	 */
	static markProcessing(element: HTMLElement): void {
		element.style.outline = `2px solid ${COLORS.PROCESSING}`;
		element.style.outlineOffset = '2px';
		element.style.animation = 'auto-coursera-pulse 1.5s ease-in-out infinite';
		element.setAttribute(DATA_ATTRIBUTES.PROCESSING, 'true');

		// Inject the keyframe animation once into the document
		if (!document.getElementById('auto-coursera-pulse-style')) {
			const style = document.createElement('style');
			style.id = 'auto-coursera-pulse-style';
			style.textContent = `@keyframes auto-coursera-pulse { 0%,100% { outline-color: ${COLORS.PROCESSING}; } 50% { outline-color: ${COLORS.PULSE_MID}; } }`;
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

/**
 * AnswerSelector — click simulation and highlighting for answer options.
 */

import type { AnswerOption, FillResult, SelectionResult } from '../types/questions';
import { DEFAULT_SETTINGS } from '../types/settings';
import { COLORS } from '../utils/constants';
import { Logger } from '../utils/logger';
import { DATA_ATTRIBUTES } from './constants';

/** Confidence thresholds for answer highlighting */
const CONFIDENCE_HIGH = 0.8;
const CONFIDENCE_MEDIUM = 0.5;

/** Maximum retries for click verification */
const CLICK_VERIFY_MAX_RETRIES = 2;

/** Delay before verifying click selection (ms) */
const CLICK_SETTLE_DELAY_MS = 250;

const logger = new Logger('AnswerSelector');

type ConfidenceLevel = 'high' | 'medium' | 'low';

const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
	high: COLORS.SUCCESS,
	medium: COLORS.WARNING,
	low: COLORS.LOW,
};

// ── Visual Feedback ─────────────────────────────────────────────

/** Mark a question element as having an error. */
export function markError(element: HTMLElement): void {
	element.style.outline = `2px solid ${COLORS.ERROR}`;
	element.style.outlineOffset = '2px';
	element.setAttribute(DATA_ATTRIBUTES.ERROR, 'true');
}

/** Mark a question element as processing with a subtle pulsing outline. */
export function markProcessing(element: HTMLElement): void {
	element.style.outline = `2px solid ${COLORS.PROCESSING}`;
	element.style.outlineOffset = '2px';
	element.style.animation = 'auto-coursera-pulse 1.5s ease-in-out infinite';
	element.setAttribute(DATA_ATTRIBUTES.PROCESSING, 'true');

	if (!document.getElementById('auto-coursera-pulse-style')) {
		const style = document.createElement('style');
		style.id = 'auto-coursera-pulse-style';
		style.textContent = `@keyframes auto-coursera-pulse { 0%,100% { outline-color: ${COLORS.PROCESSING}; } 50% { outline-color: ${COLORS.PULSE_MID}; } }`;
		document.head.appendChild(style);
	}
}

/** Clear processing/error indicators from a question element. */
export function clearProcessing(element: HTMLElement): void {
	element.style.outline = '';
	element.style.outlineOffset = '';
	element.style.animation = '';
	element.removeAttribute(DATA_ATTRIBUTES.PROCESSING);
	element.removeAttribute(DATA_ATTRIBUTES.ERROR);
}

// ── Click Simulation ────────────────────────────────────────────

/**
 * Simulate a real user click with full event sequence for React compatibility.
 * Uses native .click() which reliably triggers:
 * 1. Browser default behavior (checkbox/radio toggle)
 * 2. Click event that bubbles to React's event delegation root
 * 3. React's onChange handler fires, updating controlled state
 */
function simulateClick(target: HTMLElement): void {
	target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
	target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

	target.click();

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
async function clickWithVerification(
	target: HTMLElement,
	maxRetries: number = CLICK_VERIFY_MAX_RETRIES,
): Promise<boolean> {
	const input =
		target.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]') ??
		(target instanceof HTMLInputElement ? target : null);

	if (input?.checked) return true;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		simulateClick(target);

		if (!input) return true;

		await new Promise<void>((r) => setTimeout(r, CLICK_SETTLE_DELAY_MS));

		if (input.checked) return true;

		if (attempt < maxRetries) {
			logger.warn(`Selection reverted, retry ${attempt + 1}/${maxRetries}`);
		}
	}

	logger.warn('Selection did not stick after retries');
	return false;
}

// ── Answer Selection ────────────────────────────────────────────

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
	 * Fill a numeric/text-input field with an AI-provided value.
	 */
	async fillInput(
		inputElement: HTMLInputElement,
		questionElement: HTMLElement,
		value: string,
		confidence: number,
	): Promise<FillResult> {
		if (!this.autoSelect || confidence < this.confidenceThreshold) {
			logger.info(
				`${!this.autoSelect ? 'Auto-select disabled' : `Confidence ${confidence} below threshold ${this.confidenceThreshold}`}, highlighting input only`,
			);
			this.highlightInput(inputElement, questionElement, value, confidence, true);
			return { success: true, value, confidence };
		}

		// Fill the input using React-compatible value setter
		const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

		if (nativeSetter) {
			nativeSetter.call(inputElement, value);
		} else {
			inputElement.value = value;
		}

		// Dispatch React-compatible events
		inputElement.dispatchEvent(new Event('input', { bubbles: true }));
		inputElement.dispatchEvent(new Event('change', { bubbles: true }));

		// Visual feedback
		this.highlightInput(inputElement, questionElement, value, confidence, false);

		return { success: true, value, confidence };
	}

	/**
	 * Highlight an input container with confidence-based coloring.
	 * @param highlightOnly — true if the input was not filled (suggestion mode)
	 */
	private highlightInput(
		inputElement: HTMLInputElement,
		_questionElement: HTMLElement,
		_value: string,
		confidence: number,
		highlightOnly: boolean,
	): void {
		const level: ConfidenceLevel =
			confidence >= CONFIDENCE_HIGH ? 'high' : confidence >= CONFIDENCE_MEDIUM ? 'medium' : 'low';
		const color = CONFIDENCE_COLORS[level];

		// Find the input's container (cds-input-root or similar)
		const container =
			inputElement.closest('.cds-input-root') ?? inputElement.parentElement ?? inputElement;

		(container as HTMLElement).classList.add(`auto-coursera-${level}`);
		if (highlightOnly) {
			(container as HTMLElement).classList.add('highlight-only');
		}

		const outlineStyle = highlightOnly ? 'dashed' : 'solid';
		(container as HTMLElement).style.outline = `2px ${outlineStyle} ${color}`;
		(container as HTMLElement).style.outlineOffset = '2px';
		(container as HTMLElement).style.borderRadius = '4px';
		(container as HTMLElement).setAttribute(DATA_ATTRIBUTES.SUGGESTION, level);
	}

	/**
	 * Perform click simulation with three strategies.
	 */
	private async performClick(
		option: AnswerOption,
	): Promise<{ method: 'click' | 'input-change' | 'label-click'; verified: boolean }> {
		const el = option.element as HTMLElement;

		if (!el.isConnected) {
			logger.warn('Option element may be detached from DOM');
		}

		// Strategy 1: Label click (most reliable for React controlled inputs)
		const label = el.closest('label') ?? el.querySelector('label');
		if (label) {
			const verified = await clickWithVerification(label);
			return { method: 'label-click', verified };
		}

		// Strategy 2: Input element directly via native click
		const input =
			option.inputElement ??
			el.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
		if (input) {
			const verified = await clickWithVerification(input);
			return { method: 'input-change', verified };
		}

		// Strategy 3: Direct wrapper element click
		const verified = await clickWithVerification(el);
		return { method: 'click', verified };
	}

	/**
	 * Highlight an option with confidence-based coloring.
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
}

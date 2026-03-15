/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
	AnswerSelector,
	clearProcessing,
	markError,
	markProcessing,
} from '../../src/content/selector';
import type { AnswerOption } from '../../src/types/questions';

function makeOption(index: number, inputType: 'radio' | 'checkbox' | null = null): AnswerOption {
	const element = document.createElement('div');
	element.className = 'rc-Option';
	let inputElement: HTMLInputElement | null = null;
	if (inputType) {
		inputElement = document.createElement('input');
		inputElement.type = inputType;
		element.appendChild(inputElement);
	}
	return { element, index, text: `Option ${index}`, inputElement, images: [] };
}

describe('AnswerSelector', () => {
	let selector: AnswerSelector;

	beforeEach(() => {
		document.body.innerHTML = '';
		selector = new AnswerSelector(0.7, true);
	});

	describe('radio guard (M4 fix)', () => {
		it('should cap multi-answer to 1 for radio-button questions', async () => {
			const options = [makeOption(0, 'radio'), makeOption(1, 'radio'), makeOption(2, 'radio')];
			const results = await selector.select(options, [0, 2], 0.9);
			// Should only have 1 result, not 2
			expect(results).toHaveLength(1);
			expect(results[0].selectedIndex).toBe(0);
		});

		it('should allow multi-answer for checkbox questions', async () => {
			const options = [
				makeOption(0, 'checkbox'),
				makeOption(1, 'checkbox'),
				makeOption(2, 'checkbox'),
			];
			const results = await selector.select(options, [0, 2], 0.9);
			expect(results).toHaveLength(2);
			expect(results[0].selectedIndex).toBe(0);
			expect(results[1].selectedIndex).toBe(2);
		});

		it('should pass through single answer for radio without change', async () => {
			const options = [makeOption(0, 'radio'), makeOption(1, 'radio')];
			const results = await selector.select(options, [1], 0.9);
			expect(results).toHaveLength(1);
			expect(results[0].selectedIndex).toBe(1);
		});
	});

	describe('highlight-only vs auto-click (M7 fix)', () => {
		it('should use dashed outline when below confidence threshold', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.3); // below 0.7 threshold
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('dashed');
		});

		it('should use solid outline when above confidence threshold', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.9); // above 0.7 threshold
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('solid');
		});

		it('should return success: false when below threshold', async () => {
			const options = [makeOption(0, 'radio')];
			const results = await selector.select(options, [0], 0.3);
			expect(results[0].success).toBe(false);
		});

		it('should return success: true when above threshold and auto-select enabled', async () => {
			const options = [makeOption(0, 'radio')];
			const results = await selector.select(options, [0], 0.9);
			expect(results[0].success).toBe(true);
		});

		it('should not auto-click when autoSelect is disabled', async () => {
			const noClickSelector = new AnswerSelector(0.7, false);
			const options = [makeOption(0, 'radio')];
			const results = await noClickSelector.select(options, [0], 0.9);
			expect(results[0].success).toBe(false);
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('dashed');
		});
	});

	describe('confidence coloring', () => {
		it('should use green for high confidence (>=0.8)', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.9);
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('#22c55e');
		});

		it('should use yellow for medium confidence (0.5-0.8)', async () => {
			const options = [makeOption(0, 'radio')];
			// Need to be above threshold (0.7) to get solid, but below 0.8 for yellow
			await selector.select(options, [0], 0.75);
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('#eab308');
		});

		it('should use orange for low confidence (<0.5) in highlight-only mode', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.3);
			const el = options[0].element as HTMLElement;
			expect(el.style.outline).toContain('#f97316');
		});
	});

	describe('invalid indices', () => {
		it('should handle out-of-bounds index gracefully', async () => {
			const options = [makeOption(0, 'radio')];
			const results = await selector.select(options, [5], 0.9);
			expect(results[0].success).toBe(false);
		});

		it('should handle empty answer indices', async () => {
			const options = [makeOption(0, 'radio')];
			const results = await selector.select(options, [], 0.9);
			expect(results).toHaveLength(0);
		});
	});

	describe('data attributes', () => {
		it('should set suggestion attribute on highlighted options', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.9);
			expect(options[0].element.getAttribute('data-auto-coursera-suggestion')).toBe('high');
		});
	});

	describe('React controlled input handling', () => {
		it('should set input.checked via native descriptor on selection', async () => {
			const options = [makeOption(0, 'radio')];
			await selector.select(options, [0], 0.9);
			expect(options[0].inputElement!.checked).toBe(true);
		});

		it('should toggle checkbox checked state', async () => {
			const options = [makeOption(0, 'checkbox')];
			expect(options[0].inputElement!.checked).toBe(false);
			await selector.select(options, [0], 0.9);
			expect(options[0].inputElement!.checked).toBe(true);
		});

		it('should select via label when no direct input is provided', async () => {
			// Create an option with a <label> wrapping an <input> but no inputElement ref
			const element = document.createElement('div');
			const label = document.createElement('label');
			const input = document.createElement('input');
			input.type = 'radio';
			label.appendChild(input);
			element.appendChild(label);
			const option: AnswerOption = {
				element,
				index: 0,
				text: 'Opt',
				inputElement: null,
				images: [],
			};

			const results = await selector.select([option], [0], 0.9);
			expect(results[0].success).toBe(true);
			// Input should be checked via native descriptor through the label strategy
			expect(input.checked).toBe(true);
		});

		it('should handle wrapper div with nested input (no inputElement ref)', async () => {
			const element = document.createElement('div');
			const input = document.createElement('input');
			input.type = 'checkbox';
			element.appendChild(input);
			const option: AnswerOption = {
				element,
				index: 0,
				text: 'Opt',
				inputElement: null,
				images: [],
			};

			const results = await selector.select([option], [0], 0.9);
			expect(results[0].success).toBe(true);
			expect(input.checked).toBe(true);
		});
	});

	describe('fillInput (numeric questions)', () => {
		/**
		 * Helper to create a numeric input inside a container with the `.cds-input-root` class
		 * that `highlightInput` looks for via `closest()`.
		 */
		function makeNumericInput(): {
			input: HTMLInputElement;
			container: HTMLElement;
			question: HTMLElement;
		} {
			const question = document.createElement('div');
			const container = document.createElement('div');
			container.className = 'cds-input-root';
			const input = document.createElement('input');
			input.type = 'number';
			container.appendChild(input);
			question.appendChild(container);
			document.body.appendChild(question);
			return { input, container, question };
		}

		it('should fill input value via React-compatible native setter', async () => {
			const { input, question } = makeNumericInput();
			await selector.fillInput(input, question, '42', 0.9);
			expect(input.value).toBe('42');
		});

		it('should dispatch input and change events', async () => {
			const { input, question } = makeNumericInput();
			const events: string[] = [];
			input.addEventListener('input', () => events.push('input'));
			input.addEventListener('change', () => events.push('change'));

			await selector.fillInput(input, question, '7.5', 0.9);

			expect(events).toContain('input');
			expect(events).toContain('change');
		});

		it('should highlight input container with high confidence coloring (green, solid)', async () => {
			const { input, container, question } = makeNumericInput();
			await selector.fillInput(input, question, '100', 0.9);

			expect(container.style.outline).toContain('solid');
			expect(container.style.outline).toContain('#22c55e'); // green for high
			expect(container.classList.contains('auto-coursera-high')).toBe(true);
			expect(container.getAttribute('data-auto-coursera-suggestion')).toBe('high');
		});

		it('should highlight input container with medium confidence coloring (yellow)', async () => {
			const { input, container, question } = makeNumericInput();
			await selector.fillInput(input, question, '50', 0.75);

			expect(container.style.outline).toContain('#eab308'); // yellow for medium
			expect(container.classList.contains('auto-coursera-medium')).toBe(true);
			expect(container.getAttribute('data-auto-coursera-suggestion')).toBe('medium');
		});

		it('should use dashed outline in highlight-only mode (below threshold)', async () => {
			const { input, container, question } = makeNumericInput();
			// Below the 0.7 threshold → highlight-only mode
			await selector.fillInput(input, question, '3.14', 0.3);

			expect(container.style.outline).toContain('dashed');
			expect(container.style.outline).toContain('#f97316'); // orange for low
			expect(container.classList.contains('highlight-only')).toBe(true);
			expect(container.classList.contains('auto-coursera-low')).toBe(true);
		});

		it('should use dashed outline when autoSelect is disabled', async () => {
			const noAutoSelector = new AnswerSelector(0.7, false);
			const { input, container, question } = makeNumericInput();
			await noAutoSelector.fillInput(input, question, '99', 0.95);

			expect(container.style.outline).toContain('dashed');
			expect(container.classList.contains('highlight-only')).toBe(true);
		});

		it('should use solid outline when auto-filling (above threshold)', async () => {
			const { input, container, question } = makeNumericInput();
			await selector.fillInput(input, question, '256', 0.85);

			expect(container.style.outline).toContain('solid');
			expect(container.classList.contains('highlight-only')).toBe(false);
		});

		it('should return FillResult with success: true', async () => {
			const { input, question } = makeNumericInput();
			const result = await selector.fillInput(input, question, '12.5', 0.9);

			expect(result).toEqual({
				success: true,
				value: '12.5',
				confidence: 0.9,
			});
		});

		it('should return FillResult with success: true even in highlight-only mode', async () => {
			const { input, question } = makeNumericInput();
			const result = await selector.fillInput(input, question, '0.5', 0.3);

			expect(result).toEqual({
				success: true,
				value: '0.5',
				confidence: 0.3,
			});
		});

		it('should not set input value when below threshold (highlight-only)', async () => {
			const { input, question } = makeNumericInput();
			input.value = '123';
			await selector.fillInput(input, question, '999', 0.3);

			// In highlight-only mode, the value is NOT set — remains at previous value
			expect(input.value).toBe('123');
		});

		it('should set outlineOffset and borderRadius on container', async () => {
			const { input, container, question } = makeNumericInput();
			await selector.fillInput(input, question, '10', 0.9);

			expect(container.style.outlineOffset).toBe('2px');
			expect(container.style.borderRadius).toBe('4px');
		});

		it('should fall back to parentElement when .cds-input-root is not found', async () => {
			const question = document.createElement('div');
			const wrapper = document.createElement('div');
			const input = document.createElement('input');
			input.type = 'number';
			wrapper.appendChild(input);
			question.appendChild(wrapper);
			document.body.appendChild(question);

			await selector.fillInput(input, question, '5', 0.9);

			// Should highlight the parentElement (wrapper) since no .cds-input-root exists
			expect(wrapper.style.outline).toContain('solid');
			expect(wrapper.style.outline).toContain('#22c55e');
		});
	});

	describe('static methods', () => {
		it('markError should set error outline and attribute', () => {
			const el = document.createElement('div');
			markError(el);
			expect(el.style.outline).toContain('#ef4444');
			expect(el.getAttribute('data-auto-coursera-error')).toBe('true');
		});

		it('markProcessing should set processing attribute', () => {
			const el = document.createElement('div');
			markProcessing(el);
			expect(el.getAttribute('data-auto-coursera-processing')).toBe('true');
		});

		it('clearProcessing should remove all indicators', () => {
			const el = document.createElement('div');
			markProcessing(el);
			clearProcessing(el);
			expect(el.getAttribute('data-auto-coursera-processing')).toBeNull();
			expect(el.getAttribute('data-auto-coursera-error')).toBeNull();
		});
	});
});

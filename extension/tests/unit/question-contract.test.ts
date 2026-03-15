/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
	getQuestionSelectionMode,
	isCodeExpressionQuestion,
	isNumericQuestion,
} from '../../src/content/question-contract';

describe('question-contract', () => {
	describe('isNumericQuestion()', () => {
		it('should return true for testIds containing "NumericQuestion"', () => {
			expect(isNumericQuestion('part-Submission_NumericQuestion')).toBe(true);
		});

		it('should return true when NumericQuestion appears anywhere in the testId', () => {
			expect(isNumericQuestion('some-prefix-NumericQuestion-suffix')).toBe(true);
		});

		it('should return false for MultipleChoiceQuestion testIds', () => {
			expect(isNumericQuestion('part-Submission_MultipleChoiceQuestion')).toBe(false);
		});

		it('should return false for CheckboxQuestion testIds', () => {
			expect(isNumericQuestion('part-Submission_CheckboxQuestion')).toBe(false);
		});

		it('should return false for CodeExpression testIds', () => {
			expect(isNumericQuestion('part-Submission_CodeExpression')).toBe(false);
		});

		it('should return false for RadioQuestion testIds', () => {
			expect(isNumericQuestion('part-Submission_RadioQuestion')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isNumericQuestion('')).toBe(false);
		});
	});

	describe('isCodeExpressionQuestion()', () => {
		it('should return true for testIds containing "CodeExpression"', () => {
			expect(isCodeExpressionQuestion('part-Submission_CodeExpression')).toBe(true);
		});

		it('should return true when CodeExpression appears anywhere in the testId', () => {
			expect(isCodeExpressionQuestion('prefix-CodeExpression-suffix')).toBe(true);
		});

		it('should return false for NumericQuestion testIds', () => {
			expect(isCodeExpressionQuestion('part-Submission_NumericQuestion')).toBe(false);
		});

		it('should return false for MultipleChoiceQuestion testIds', () => {
			expect(isCodeExpressionQuestion('part-Submission_MultipleChoiceQuestion')).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isCodeExpressionQuestion('')).toBe(false);
		});
	});

	describe('getQuestionSelectionMode()', () => {
		function makeElement(innerHTML = ''): Element {
			const el = document.createElement('div');
			el.innerHTML = innerHTML;
			return el;
		}

		it('should return "numeric" for NumericQuestion testIds', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el, 'part-Submission_NumericQuestion')).toBe('numeric');
		});

		it('should return "single" for MultipleChoiceQuestion testIds', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el, 'part-Submission_MultipleChoiceQuestion')).toBe('single');
		});

		it('should return "multiple" for CheckboxQuestion testIds', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el, 'part-Submission_CheckboxQuestion')).toBe('multiple');
		});

		it('should return "text-input" for CodeExpression testIds', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el, 'part-Submission_CodeExpression')).toBe('text-input');
		});

		it('should fall back to input type detection for checkbox inputs', () => {
			const el = makeElement('<input type="checkbox" />');
			expect(getQuestionSelectionMode(el, '')).toBe('multiple');
		});

		it('should fall back to input type detection for radio inputs', () => {
			const el = makeElement('<input type="radio" />');
			expect(getQuestionSelectionMode(el, '')).toBe('single');
		});

		it('should use fallback parameter when no testId or input type matches', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el, '', 'unknown')).toBe('unknown');
		});

		it('should default fallback to "unknown" when not provided', () => {
			const el = makeElement();
			expect(getQuestionSelectionMode(el)).toBe('unknown');
		});

		it('should prioritize testId over input type detection', () => {
			// Element has radio inputs, but testId says CheckboxQuestion
			const el = makeElement('<input type="radio" />');
			expect(getQuestionSelectionMode(el, 'part-Submission_CheckboxQuestion')).toBe('multiple');
		});

		it('should prioritize CheckboxQuestion over MultipleChoiceQuestion when both present', () => {
			// This tests the ordering: Checkbox is checked before MultipleChoice
			const el = makeElement();
			expect(
				getQuestionSelectionMode(el, 'part-Submission_CheckboxQuestion_MultipleChoiceQuestion'),
			).toBe('multiple');
		});
	});
});

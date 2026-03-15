/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
	getQuestionSelectionMode,
	isCodeExpressionQuestion,
} from '../../src/content/question-contract';

describe('QuestionDetector', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	describe('computeUID (FNV-1a)', () => {
		function computeUID(text: string): string {
			let hash = 2166136261;
			const cleaned = text.trim().replace(/\s+/g, ' ');
			for (let i = 0; i < cleaned.length; i++) {
				hash ^= cleaned.charCodeAt(i);
				hash = Math.imul(hash, 16777619);
			}
			return (hash >>> 0).toString(16);
		}

		it('should produce consistent hashes for same content', () => {
			const hash1 = computeUID('What is 2 + 2?');
			const hash2 = computeUID('What is 2 + 2?');
			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different content', () => {
			const hash1 = computeUID('What is 2 + 2?');
			const hash2 = computeUID('What is 3 + 3?');
			expect(hash1).not.toBe(hash2);
		});

		it('should normalize whitespace before hashing', () => {
			const hash1 = computeUID('  What is    2 + 2?  ');
			const hash2 = computeUID('What is 2 + 2?');
			expect(hash1).toBe(hash2);
		});

		it('should return a hex string', () => {
			const uid = computeUID('test input');
			expect(uid).toMatch(/^[0-9a-f]+$/);
		});
	});

	describe('question contract helpers', () => {
		it('should classify radio inputs as single-select', () => {
			const el = document.createElement('div');
			el.innerHTML = `
        <input type="radio" name="q1" value="a">
        <input type="radio" name="q1" value="b">
      `;
			expect(getQuestionSelectionMode(el)).toBe('single');
		});

		it('should classify checkboxes as multi-select', () => {
			const el = document.createElement('div');
			el.innerHTML = `
        <input type="checkbox" name="q1" value="a">
        <input type="checkbox" name="q1" value="b">
      `;
			expect(getQuestionSelectionMode(el)).toBe('multiple');
		});

		it('should keep image presence separate from selection mode', () => {
			const el = document.createElement('div');
			el.innerHTML = '<img src="test.png" alt="chart"><input type="checkbox">';
			expect(getQuestionSelectionMode(el)).toBe('multiple');
			expect(el.querySelector('img')).not.toBeNull();
		});

		it('should classify elements with no inputs as unknown', () => {
			const el = document.createElement('div');
			el.innerHTML = '<p>Some text question</p>';
			expect(getQuestionSelectionMode(el)).toBe('unknown');
		});

		it('should honor Coursera testId markers for checkboxes', () => {
			const el = document.createElement('div');
			el.innerHTML = '<input type="radio">';
			expect(getQuestionSelectionMode(el, 'part-Submission_CheckboxQuestion')).toBe('multiple');
		});

		it('should prioritize checkboxes over radios when falling back to DOM inspection', () => {
			const el = document.createElement('div');
			el.innerHTML = '<input type="checkbox"><input type="radio">';
			expect(getQuestionSelectionMode(el)).toBe('multiple');
		});

		it('should classify code-expression markers as text input', () => {
			expect(isCodeExpressionQuestion('part-Submission_CodeExpressionQuestion')).toBe(true);
			const el = document.createElement('div');
			expect(getQuestionSelectionMode(el, 'part-Submission_CodeExpressionQuestion')).toBe(
				'text-input',
			);
		});
	});

	describe('Coursera question selectors', () => {
		const SELECTOR = 'div[data-testid^="part-Submission_"]';

		it('should detect CheckboxQuestion elements', () => {
			document.body.innerHTML =
				'<div data-testid="part-Submission_CheckboxQuestion"><input type="checkbox"></div>';
			const questions = document.querySelectorAll(SELECTOR);
			expect(questions.length).toBe(1);
		});

		it('should detect MultipleChoiceQuestion elements', () => {
			document.body.innerHTML =
				'<div data-testid="part-Submission_MultipleChoiceQuestion"><input type="radio"></div>';
			const questions = document.querySelectorAll(SELECTOR);
			expect(questions.length).toBe(1);
		});

		it('should detect CodeExpressionQuestion elements (before filtering)', () => {
			document.body.innerHTML =
				'<div data-testid="part-Submission_CodeExpressionQuestion"><textarea></textarea></div>';
			const questions = document.querySelectorAll(SELECTOR);
			expect(questions.length).toBe(1);
		});

		it('should detect multiple questions on a page', () => {
			document.body.innerHTML = `
        <div data-testid="part-Submission_MultipleChoiceQuestion"><input type="radio"></div>
        <div data-testid="part-Submission_CheckboxQuestion"><input type="checkbox"></div>
        <div data-testid="part-Submission_MultipleChoiceQuestion"><input type="radio"></div>
      `;
			const questions = document.querySelectorAll(SELECTOR);
			expect(questions.length).toBe(3);
		});

		it('should not match unrelated data-testid values', () => {
			document.body.innerHTML = '<div data-testid="legend"><p>Not a question</p></div>';
			const questions = document.querySelectorAll(SELECTOR);
			expect(questions.length).toBe(0);
		});
	});
});

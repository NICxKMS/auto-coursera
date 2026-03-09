/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

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

	describe('classifyType logic', () => {
		function classifyType(el: HTMLElement): string {
			const hasImages = el.querySelectorAll('img').length > 0;
			if (hasImages) return 'image-based';

			const checkboxes = el.querySelectorAll('input[type="checkbox"]');
			if (checkboxes.length > 0) return 'multiple-choice';

			const radios = el.querySelectorAll('input[type="radio"]');
			if (radios.length > 0) return 'single-choice';

			return 'unknown';
		}

		it('should classify elements with radio inputs as single-choice', () => {
			const el = document.createElement('div');
			el.innerHTML = `
        <input type="radio" name="q1" value="a">
        <input type="radio" name="q1" value="b">
      `;
			expect(classifyType(el)).toBe('single-choice');
		});

		it('should classify elements with checkboxes as multiple-choice', () => {
			const el = document.createElement('div');
			el.innerHTML = `
        <input type="checkbox" name="q1" value="a">
        <input type="checkbox" name="q1" value="b">
      `;
			expect(classifyType(el)).toBe('multiple-choice');
		});

		it('should classify elements with images as image-based', () => {
			const el = document.createElement('div');
			el.innerHTML = '<img src="test.png" alt="chart"><input type="radio">';
			expect(classifyType(el)).toBe('image-based');
		});

		it('should classify elements with no inputs as unknown', () => {
			const el = document.createElement('div');
			el.innerHTML = '<p>Some text question</p>';
			expect(classifyType(el)).toBe('unknown');
		});

		it('should prioritize images over checkboxes', () => {
			const el = document.createElement('div');
			el.innerHTML = '<img src="x.png"><input type="checkbox">';
			expect(classifyType(el)).toBe('image-based');
		});

		it('should prioritize checkboxes over radios', () => {
			const el = document.createElement('div');
			el.innerHTML = '<input type="checkbox"><input type="radio">';
			expect(classifyType(el)).toBe('multiple-choice');
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

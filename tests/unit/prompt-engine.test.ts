import { describe, expect, it } from 'vitest';
import { buildPrompt, SYSTEM_PROMPT } from '../../src/services/prompt-engine';
import type { AIRequest } from '../../src/types/api';

describe('PromptEngine', () => {
	describe('SYSTEM_PROMPT', () => {
		it('should enforce JSON output format', () => {
			expect(SYSTEM_PROMPT).toContain('JSON');
			expect(SYSTEM_PROMPT).toContain('"answer"');
			expect(SYSTEM_PROMPT).toContain('"confidence"');
			expect(SYSTEM_PROMPT).toContain('"reasoning"');
		});
	});

	describe('build()', () => {
		it('should build single-choice prompt with "exactly ONE" instruction', () => {
			const request: AIRequest = {
				questionText: 'What is 2 + 2?',
				options: ['3', '4', '5', '6'],
				questionType: 'single-choice',
			};
			const prompt = buildPrompt(request);
			expect(prompt).toContain('SINGLE-CHOICE');
			expect(prompt).toContain('exactly ONE');
			expect(prompt).toContain('What is 2 + 2?');
			expect(prompt).toContain('0: 3');
			expect(prompt).toContain('1: 4');
			expect(prompt).toContain('2: 5');
			expect(prompt).toContain('3: 6');
		});

		it('should build multiple-choice prompt with "ALL correct" instruction', () => {
			const request: AIRequest = {
				questionText: 'Select all prime numbers',
				options: ['2', '3', '4', '5'],
				questionType: 'multiple-choice',
			};
			const prompt = buildPrompt(request);
			expect(prompt).toContain('MULTIPLE-CHOICE');
			expect(prompt).toContain('ALL correct');
			expect(prompt).toContain('multiple indices');
		});

		it('should build image-based prompt with image examination instruction', () => {
			const request: AIRequest = {
				questionText: 'What does this image show?',
				options: ['Cat', 'Dog', 'Bird'],
				images: [{ base64: 'abc123', context: 'question' }],
				questionType: 'image-based',
			};
			const prompt = buildPrompt(request);
			expect(prompt).toContain('IMAGE-BASED');
			expect(prompt).toContain('image(s)');
		});

		it('should build generic prompt for unknown type', () => {
			const request: AIRequest = {
				questionText: 'Some question',
				options: ['A', 'B'],
				questionType: 'unknown',
			};
			const prompt = buildPrompt(request);
			expect(prompt).toContain('Some question');
			expect(prompt).toContain('0: A');
			expect(prompt).toContain('1: B');
		});

		it('should include all options with correct indices', () => {
			const request: AIRequest = {
				questionText: 'Test',
				options: ['Alpha', 'Beta', 'Gamma'],
				questionType: 'single-choice',
			};
			const prompt = buildPrompt(request);
			expect(prompt).toContain('0: Alpha');
			expect(prompt).toContain('1: Beta');
			expect(prompt).toContain('2: Gamma');
		});
	});
});

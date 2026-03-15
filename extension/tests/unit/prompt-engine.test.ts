import { describe, expect, it } from 'vitest';
import {
	BATCH_SYSTEM_PROMPT,
	buildBatchPrompt,
	formatBatchQuestion,
} from '../../src/services/prompt-engine';

describe('PromptEngine', () => {
	describe('BATCH_SYSTEM_PROMPT', () => {
		it('should enforce JSON batch output format', () => {
			expect(BATCH_SYSTEM_PROMPT).toContain('JSON');
			expect(BATCH_SYSTEM_PROMPT).toContain('"answers"');
			expect(BATCH_SYSTEM_PROMPT).toContain('"uid"');
			expect(BATCH_SYSTEM_PROMPT).toContain('"reasoning"');
		});
	});

	describe('build()', () => {
		it('should format single-select batch questions with an exact-one instruction', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'Pick one answer',
					options: ['A', 'B'],
					selectionMode: 'single',
				},
				0,
			);
			expect(prompt).toContain('Select exactly ONE answer');
		});

		it('should format multi-select batch questions with an all-that-apply instruction', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'Pick all correct answers',
					options: ['A', 'B', 'C'],
					selectionMode: 'multiple',
				},
				0,
			);
			expect(prompt).toContain('select ALL that apply');
		});

		it('should build batch prompts without the old checkbox/multiple-choice ambiguity', () => {
			const prompt = buildBatchPrompt({
				questions: [
					{
						uid: 'q1',
						questionText: 'Pick one answer',
						options: ['A', 'B'],
						selectionMode: 'single',
					},
					{
						uid: 'q2',
						questionText: 'Pick all correct answers',
						options: ['A', 'B', 'C'],
						selectionMode: 'multiple',
					},
				],
			});
			expect(prompt).toContain('Question 1');
			expect(prompt).toContain('Select exactly ONE answer');
			expect(prompt).toContain('select ALL that apply');
		});

		it('should truncate overly long question text in batch prompts', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'x'.repeat(6000),
					options: ['A', 'B'],
					selectionMode: 'single',
				},
				0,
			);
			expect(prompt).toContain('[truncated]');
		});

		it('should include code blocks as relevant context when present', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'What does this code output?',
					options: ['3', '4', '5'],
					selectionMode: 'single',
					codeBlocks: ['[Code Block (python)]:\nprint(2 + 2)'],
				},
				0,
			);
			expect(prompt).toContain('Relevant code context:');
			expect(prompt).toContain('[Code Block (python)]');
			expect(prompt).toContain('print(2 + 2)');
		});

		it('should not include code context section when codeBlocks is empty', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'Simple question',
					options: ['A', 'B'],
					selectionMode: 'single',
					codeBlocks: [],
				},
				0,
			);
			expect(prompt).not.toContain('Relevant code context:');
		});

		it('should not include code context section when codeBlocks is undefined', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'Simple question',
					options: ['A', 'B'],
					selectionMode: 'single',
				},
				0,
			);
			expect(prompt).not.toContain('Relevant code context:');
		});

		it('should include multiple code blocks in the prompt', () => {
			const prompt = formatBatchQuestion(
				{
					uid: 'q1',
					questionText: 'Analyze the code',
					options: ['A', 'B'],
					selectionMode: 'single',
					codeBlocks: ['[Code Block (python)]:\nx = 1', '[Code Block (python)]:\ny = 2'],
				},
				0,
			);
			expect(prompt).toContain('x = 1');
			expect(prompt).toContain('y = 2');
		});
	});
});

import { describe, expect, it } from 'vitest';
import { parseBatchAIResponse } from '../../src/services/response-parser';

describe('parseBatchAIResponse', () => {
	const questions = [{ uid: 'q1' }, { uid: 'q2' }];

	describe('JSON array parsing', () => {
		it('should parse valid batch JSON with letter answers', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['A'], confidence: 0.9, reasoning: 'clear' },
				{ uid: 'q2', answer: ['B', 'C'], confidence: 0.85, reasoning: 'multi' },
			]);
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[0].answer).toEqual([0]);
			expect(result.answers[1].answer).toEqual([1, 2]);
		});

		it('should parse valid batch JSON with numeric answers', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: [0], confidence: 0.9, reasoning: '' },
				{ uid: 'q2', answer: [1, 2], confidence: 0.85, reasoning: '' },
			]);
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[0].answer).toEqual([0]);
			expect(result.answers[1].answer).toEqual([1, 2]);
		});

		it('should unwrap object-wrapped batch responses', () => {
			const raw = JSON.stringify({
				answers: [{ uid: 'q1', answer: [1], confidence: 0.8, reasoning: 'wrapped' }],
			});
			const result = parseBatchAIResponse(raw, [{ uid: 'q1' }]);
			expect(result.answers[0].answer).toEqual([1]);
			expect(result.answers[0].confidence).toBe(0.8);
		});

		it('should match by uid when available', () => {
			const raw = JSON.stringify([
				{ uid: 'q2', answer: [0], confidence: 0.9, reasoning: '' },
				{ uid: 'q1', answer: [1], confidence: 0.8, reasoning: '' },
			]);
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[0].uid).toBe('q1');
			expect(result.answers[0].answer).toEqual([1]); // matched by uid, not position
			expect(result.answers[1].uid).toBe('q2');
			expect(result.answers[1].answer).toEqual([0]);
		});
	});

	describe('empty/failed answers', () => {
		it('should return empty answer array with confidence 0 when no match found', () => {
			const raw = JSON.stringify([{ uid: 'q1', answer: [0], confidence: 0.9, reasoning: '' }]);
			// q2 has no match in the JSON
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[1].answer).toEqual([]);
			expect(result.answers[1].confidence).toBe(0);
		});

		it('should return empty answer with confidence 0 on regex fallback failure', () => {
			const raw = 'totally unparseable gibberish with no letters or numbers';
			const result = parseBatchAIResponse(raw, questions);
			for (const answer of result.answers) {
				expect(answer.answer).toEqual([]);
				expect(answer.confidence).toBe(0);
			}
		});

		it('should return answer from valid entries even when some fail', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['B'], confidence: 0.9, reasoning: '' },
				// q2 missing entirely
			]);
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[0].answer).toEqual([1]);
			expect(result.answers[0].confidence).toBe(0.9);
		});
	});

	describe('rawAnswer for numeric questions', () => {
		it('should set rawAnswer and empty answer[] when AI returns string answer', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: '2.5', confidence: 0.9, reasoning: 'computed' },
			]);
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'numeric' }]);
			expect(result.answers[0].rawAnswer).toBe('2.5');
			expect(result.answers[0].answer).toEqual([]);
			expect(result.answers[0].confidence).toBe(0.9);
		});

		it('should handle mixed batch: some string answers (numeric), some letter answers (MCQ)', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: '42', confidence: 0.85, reasoning: 'numeric value' },
				{ uid: 'q2', answer: ['B'], confidence: 0.9, reasoning: 'letter choice' },
			]);
			const questions = [
				{ uid: 'q1', selectionMode: 'numeric' },
				{ uid: 'q2', selectionMode: 'single' },
			];
			const result = parseBatchAIResponse(raw, questions);

			// First answer is numeric — rawAnswer set, answer empty
			expect(result.answers[0].rawAnswer).toBe('42');
			expect(result.answers[0].answer).toEqual([]);

			// Second answer is MCQ — no rawAnswer, answer has indices
			expect(result.answers[1].rawAnswer).toBeUndefined();
			expect(result.answers[1].answer).toEqual([1]); // B → index 1
		});

		it('should handle object-wrapped response with string answers', () => {
			const raw = JSON.stringify({
				answers: [{ uid: 'q1', answer: '3.14', confidence: 0.95, reasoning: 'pi' }],
			});
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'numeric' }]);
			expect(result.answers[0].rawAnswer).toBe('3.14');
			expect(result.answers[0].answer).toEqual([]);
			expect(result.answers[0].confidence).toBe(0.95);
		});

		it('should NOT set rawAnswer for letter-based answers (existing path unchanged)', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['A', 'C'], confidence: 0.8, reasoning: 'multiple choice' },
			]);
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'multiple' }]);
			expect(result.answers[0].rawAnswer).toBeUndefined();
			expect(result.answers[0].answer).toEqual([0, 2]); // A → 0, C → 2
		});

		it('should extract rawAnswer from array-wrapped string answer (json_schema mode)', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['2.5'], confidence: 0.9, reasoning: 'computed' },
			]);
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'numeric' }]);
			expect(result.answers[0].rawAnswer).toBe('2.5');
			expect(result.answers[0].answer).toEqual([]);
		});

		it('should NOT treat single-letter array as rawAnswer', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['A'], confidence: 0.9, reasoning: 'letter choice' },
			]);
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'single' }]);
			expect(result.answers[0].rawAnswer).toBeUndefined();
			expect(result.answers[0].answer).toEqual([0]); // A → index 0
		});

		it('should NOT treat multi-element string array as rawAnswer', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['2.5', '3.0'], confidence: 0.9, reasoning: 'multi' },
			]);
			const result = parseBatchAIResponse(raw, [{ uid: 'q1', selectionMode: 'numeric' }]);
			// Not a single-element array, falls through to normalizeAnswerValues
			expect(result.answers[0].rawAnswer).toBeUndefined();
			expect(result.answers[0].answer).toEqual([]); // non-letter strings filtered out
		});

		it('should handle mixed batch with array-wrapped numeric and normal letter answers', () => {
			const raw = JSON.stringify([
				{ uid: 'q1', answer: ['2.5'], confidence: 0.85, reasoning: 'numeric value' },
				{ uid: 'q2', answer: ['A', 'C'], confidence: 0.9, reasoning: 'letter choices' },
			]);
			const questions = [
				{ uid: 'q1', selectionMode: 'numeric' },
				{ uid: 'q2', selectionMode: 'multiple' },
			];
			const result = parseBatchAIResponse(raw, questions);

			// First answer is array-wrapped numeric — rawAnswer set, answer empty
			expect(result.answers[0].rawAnswer).toBe('2.5');
			expect(result.answers[0].answer).toEqual([]);

			// Second answer is MCQ — no rawAnswer, answer has indices
			expect(result.answers[1].rawAnswer).toBeUndefined();
			expect(result.answers[1].answer).toEqual([0, 2]); // A → 0, C → 2
		});
	});

	describe('regex fallback per question', () => {
		it('should extract letters from question sections', () => {
			const raw = 'Question 1: The answer is A.\nQuestion 2: B and C are correct.';
			const result = parseBatchAIResponse(raw, questions);
			expect(result.answers[0].answer).toContain(0); // A
			expect(result.answers[1].answer).toContain(1); // B
			expect(result.answers[1].answer).toContain(2); // C
		});
	});
});

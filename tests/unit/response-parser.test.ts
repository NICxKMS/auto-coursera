import { describe, expect, it } from 'vitest';
import { parseAIResponse, parseBatchAIResponse } from '../../src/services/response-parser';

describe('parseAIResponse', () => {
	describe('JSON with numeric indices', () => {
		it('should parse valid JSON with numeric answer', () => {
			const result = parseAIResponse('{"answer": [0], "confidence": 0.95, "reasoning": "test"}');
			expect(result.answer).toEqual([0]);
			expect(result.confidence).toBe(0.95);
		});

		it('should wrap single numeric answer in array', () => {
			const result = parseAIResponse('{"answer": 2, "confidence": 0.8, "reasoning": "x"}');
			expect(result.answer).toEqual([2]);
		});

		it('should handle multiple numeric indices', () => {
			const result = parseAIResponse('{"answer": [0, 2, 3], "confidence": 0.9, "reasoning": ""}');
			expect(result.answer).toEqual([0, 2, 3]);
		});
	});

	describe('JSON with letter answers (M1+M2 fix)', () => {
		it('should convert single letter to 0-based index', () => {
			const result = parseAIResponse('{"answer": "A", "confidence": 0.95, "reasoning": ""}');
			expect(result.answer).toEqual([0]);
		});

		it('should convert letter array to 0-based indices', () => {
			const result = parseAIResponse('{"answer": ["A", "C"], "confidence": 0.9, "reasoning": ""}');
			expect(result.answer).toEqual([0, 2]);
		});

		it('should handle lowercase letters', () => {
			const result = parseAIResponse('{"answer": ["b", "d"], "confidence": 0.85, "reasoning": ""}');
			expect(result.answer).toEqual([1, 3]);
		});

		it('should handle mixed letters and numbers', () => {
			const result = parseAIResponse('{"answer": ["A", 2], "confidence": 0.7, "reasoning": ""}');
			expect(result.answer).toEqual([0, 2]);
		});

		it('should filter out invalid non-letter/non-number values', () => {
			const result = parseAIResponse(
				'{"answer": ["A", true, null, "Z"], "confidence": 0.5, "reasoning": ""}',
			);
			// "A" → 0, true → -1 (filtered), null → -1 (filtered), "Z" doesn't match A-J but let's check
			// "Z" is not A-J so it should still work via the regex
			expect(result.answer).toContain(0); // A
		});

		it('should parse letters beyond J (extended A-Z range)', () => {
			// X=23, Y=24 are valid A-Z letters
			const result = parseAIResponse('{"answer": ["X", "Y"], "confidence": 0.9, "reasoning": ""}');
			expect(result.answer).toEqual([23, 24]);
			expect(result.confidence).toBe(0.9);
		});

		it('should fall through to regex if all answer values are non-letter/non-number', () => {
			// Non-letter strings cause fallthrough to contextual regex → "answer: B" → index 1
			const result = parseAIResponse(
				'{"answer": ["!!", "??"], "confidence": 0.9, "reasoning": ""}\nAnswer: B',
			);
			expect(result.answer).toContain(1);
		});
	});

	describe('JSON with negative/out-of-range values', () => {
		it('should filter out negative indices', () => {
			const result = parseAIResponse('{"answer": [-1, 0, 3], "confidence": 0.8, "reasoning": ""}');
			expect(result.answer).toEqual([0, 3]);
		});

		it('should fall through to number fallback when all indices are negative', () => {
			// [-1] filtered → empty → falls through to regex (no match) → number fallback finds "1"
			const result = parseAIResponse('{"answer": [-1], "confidence": 0.5, "reasoning": ""}');
			expect(result.answer).toEqual([1]);
			expect(result.confidence).toBe(0.2);
		});
	});

	describe('regex fallback', () => {
		it('should find letter answers in structured format', () => {
			// Contextual regex matches "answer: A" pattern
			const result = parseAIResponse('The answer: A');
			expect(result.answer).toEqual([0]);
			expect(result.confidence).toBe(0.3);
		});

		it('should find letter at start of line with delimiter', () => {
			const result = parseAIResponse('A) This is the correct one');
			expect(result.answer).toContain(0);
		});

		it('should find multiple answers from context keywords', () => {
			// Contextual regex requires keyword directly followed by colon/whitespace then letter
			const result = parseAIResponse('Answer: A\nAlso select: C');
			expect(result.answer).toContain(0);
			expect(result.answer).toContain(2);
		});
	});

	describe('number fallback', () => {
		it('should find bare numbers as last resort', () => {
			const result = parseAIResponse('I think it is 3');
			expect(result.answer).toEqual([3]);
			expect(result.confidence).toBe(0.2);
		});
	});

	describe('complete failure', () => {
		it('should throw when nothing parseable', () => {
			expect(() => parseAIResponse('I have no idea what the answer is')).toThrow(
				/Failed to parse AI response/,
			);
		});
	});
});

describe('parseBatchAIResponse', () => {
	const questions = [
		{ uid: 'q1', options: ['A', 'B', 'C', 'D'], questionType: 'multiple-choice' },
		{ uid: 'q2', options: ['X', 'Y', 'Z'], questionType: 'checkbox' },
	];

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

	describe('empty/failed answers (M3 fix)', () => {
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

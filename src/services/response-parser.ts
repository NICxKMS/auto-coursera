import type { ParsedAIAnswer } from '../types/api';
import { Logger } from '../utils/logger';

const logger = new Logger('ResponseParser');

function letterToIndex(letter: string): number {
	return letter.toUpperCase().charCodeAt(0) - 65;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAnswerValues(raw: unknown[]): number[] {
	return raw
		.map((a) => {
			if (typeof a === 'string' && /^[A-Z]$/i.test(a)) return letterToIndex(a);
			return typeof a === 'number' ? a : -1;
		})
		.filter((n) => n >= 0);
}

/**
 * Parse an AI response into a structured answer.
 * Shared between all providers.
 */
export function parseAIResponse(content: string): ParsedAIAnswer {
	// 1. Try JSON parse
	try {
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			if (parsed.answer !== undefined) {
				const normalized = normalizeAnswerValues(
					Array.isArray(parsed.answer) ? parsed.answer : [parsed.answer],
				);
				if (normalized.length > 0) {
					return {
						answer: normalized,
						confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
						reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 1000) : '',
					};
				}
				// Valid JSON but answer values were all invalid — fall through to regex
			}
		}
	} catch {
		logger.warn('JSON parse failed, trying regex fallback');
	}

	// 2. Regex fallback: find letter answers with answer context
	const matches = [...content.matchAll(/(?:^|\n)\s*([A-Z])\s*[).,:]/gim)];
	if (matches.length > 0) {
		const indices = [...new Set(matches.map((m) => letterToIndex(m[1])))];
		return {
			answer: indices,
			confidence: 0.3,
			reasoning: content.substring(0, 200),
		};
	}

	// 2b. Contextual fallback: "answer is A" or "Answer: A"
	const contextMatches = [...content.matchAll(/(?:answer|select|correct|option)[:\s]+([A-Z])\b/gi)];
	if (contextMatches.length > 0) {
		const indices = [...new Set(contextMatches.map((m) => letterToIndex(m[1])))];
		return {
			answer: indices,
			confidence: 0.3,
			reasoning: content.substring(0, 200),
		};
	}

	// 3. Number fallback: find bare numbers 0-9
	const numMatch = content.match(/\b([0-9])\b/);
	if (numMatch) {
		return {
			answer: [parseInt(numMatch[1], 10)],
			confidence: 0.2,
			reasoning: 'Number fallback',
		};
	}

	throw new Error(`Failed to parse AI response: ${content.substring(0, 200)}`);
}

/**
 * Parse a batch AI response into individual answers.
 * Shared between all providers.
 */
export function parseBatchAIResponse(
	rawContent: string,
	questions: Array<{
		uid: string;
		options?: string[];
		questionType?: import('../types/questions').ExtractedQuestionType;
	}>,
): {
	answers: Array<{
		uid: string;
		answer: number[];
		confidence: number;
		reasoning: string;
	}>;
	tokensUsed: number;
} {
	// 0. Unwrap {"answers": [...]} object-wrapped format (from json_schema / json_object mode)
	let jsonContent = rawContent;
	try {
		const objMatch = rawContent.match(/\{[\s\S]*\}/);
		if (objMatch) {
			const obj = JSON.parse(objMatch[0]);
			if (Array.isArray(obj.answers)) {
				jsonContent = JSON.stringify(obj.answers);
			}
		}
	} catch {
		// Not object-wrapped, use original content
	}

	// 1. Try JSON array parse
	try {
		const jsonMatch = jsonContent.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
			const answers = questions.map((q, i) => {
				const match = parsed.find((p: Record<string, unknown>) => p.uid === q.uid) || parsed[i];
				if (match) {
					const answer = normalizeAnswerValues(
						Array.isArray(match.answer) ? match.answer : [match.answer],
					);
					return {
						uid: q.uid,
						answer,
						confidence: typeof match.confidence === 'number' ? match.confidence : 0.5,
						reasoning: typeof match.reasoning === 'string' ? match.reasoning.slice(0, 1000) : '',
					};
				}
				return {
					uid: q.uid,
					answer: [],
					confidence: 0,
					reasoning: 'No answer from AI',
				};
			});
			return { answers, tokensUsed: 0 };
		}
	} catch {
		logger.warn('Batch JSON parse failed, trying regex fallback');
	}

	// 2. Regex fallback per question
	const answers = questions.map((q, i) => {
		const qNum = i + 1;
		// Find question section boundaries for multi-answer extraction
		const sectionPatterns = [
			new RegExp(
				`(?:Q|Question)\\s*${qNum}[:\\s]([\\s\\S]*?)(?=(?:Q|Question)\\s*${qNum + 1}[:\\s]|$)`,
				'i',
			),
			new RegExp(
				`${escapeRegex(q.uid)}[:\\s]([\\s\\S]*?)(?=${questions[i + 1]?.uid ? escapeRegex(questions[i + 1].uid) : '$'})`,
				'i',
			),
			new RegExp(`^\\s*${qNum}\\.?\\s*([\\s\\S]*?)(?=^\\s*${qNum + 1}\\.?\\s|$)`, 'im'),
		];
		for (const pat of sectionPatterns) {
			const m = rawContent.match(pat);
			if (m) {
				const answerSection = m[1] || m[0];
				const allLetters = [...answerSection.matchAll(/\b([A-Z])\b/gi)];
				if (allLetters.length > 0) {
					const indices = [...new Set(allLetters.map((lm) => letterToIndex(lm[1])))];
					return {
						uid: q.uid,
						answer: indices,
						confidence: 0.3,
						reasoning: 'Extracted via regex fallback',
					};
				}
			}
		}
		return {
			uid: q.uid,
			answer: [],
			confidence: 0,
			reasoning: 'Failed to parse answer',
		};
	});

	return { answers, tokensUsed: 0 };
}

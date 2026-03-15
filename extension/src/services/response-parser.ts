import { Logger } from '../utils/logger';

/** Fallback confidence when JSON parse succeeds but confidence missing */
const CONFIDENCE_FALLBACK_JSON = 0.5;

/** Fallback confidence when regex extraction works */
const CONFIDENCE_FALLBACK_REGEX = 0.3;

/** Max characters for reasoning truncation */
const REASONING_MAX_LENGTH = 1000;

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
 * Parse a batch AI response into individual answers.
 * Shared between all providers.
 */
export function parseBatchAIResponse(
	rawContent: string,
	questions: Array<{ uid: string; selectionMode?: string }>,
): {
	answers: Array<{
		uid: string;
		answer: number[];
		confidence: number;
		reasoning: string;
		/** For numeric/text-input answers (not letter-based) */
		rawAnswer?: string;
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
					const confidence =
						typeof match.confidence === 'number' ? match.confidence : CONFIDENCE_FALLBACK_JSON;
					const reasoning =
						typeof match.reasoning === 'string'
							? match.reasoning.slice(0, REASONING_MAX_LENGTH)
							: '';
					const answerValue = match.answer;

					// Numeric/text-input: AI responds with a string answer (e.g. "2.5")
					if (typeof answerValue === 'string') {
						return {
							uid: q.uid,
							answer: [] as number[],
							confidence,
							reasoning,
							rawAnswer: answerValue,
						};
					}

					// Numeric/text-input wrapped in array by json_schema mode (e.g. ["2.5"])
					if (
						Array.isArray(answerValue) &&
						answerValue.length === 1 &&
						typeof answerValue[0] === 'string' &&
						!/^[A-Z]$/i.test(answerValue[0])
					) {
						return {
							uid: q.uid,
							answer: [] as number[],
							confidence,
							reasoning,
							rawAnswer: answerValue[0],
						};
					}

					// Multiple-choice: AI responds with array of letters (e.g. ["A", "C"])
					const answer = normalizeAnswerValues(
						Array.isArray(answerValue) ? answerValue : [answerValue],
					);
					return {
						uid: q.uid,
						answer,
						confidence,
						reasoning,
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
						confidence: CONFIDENCE_FALLBACK_REGEX,
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

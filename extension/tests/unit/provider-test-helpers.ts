import type { AIBatchRequest, AIBatchResponse } from '../../src/types/api';

export function createSingleQuestionBatch(
	overrides: Partial<AIBatchRequest['questions'][number]> = {},
	signal?: AbortSignal,
): AIBatchRequest {
	return {
		questions: [
			{
				uid: 'q1',
				questionText: 'Test?',
				options: ['A', 'B'],
				selectionMode: 'single',
				...overrides,
			},
		],
		...(signal ? { signal } : {}),
	};
}

export function buildSingleBatchContent(
	answer: Array<number | string>,
	confidence = 0.9,
	reasoning = 'test',
	uid = 'q1',
): string {
	return JSON.stringify({
		answers: [
			{
				uid,
				answer,
				confidence,
				reasoning,
			},
		],
	});
}

export function getSingleBatchAnswer(response: AIBatchResponse) {
	const answer = response.answers[0];
	if (!answer) {
		throw new Error('Expected at least one batch answer');
	}
	return answer;
}

/** Mock a successful OpenAI-compatible JSON response. */
export function makeResponse(content: string, tokens = 100) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ({
			id: 'chat-test',
			choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: tokens },
		}),
		text: async () => '',
	};
}

/** Mock a 429 Too Many Requests response. */
export function make429() {
	return {
		ok: false,
		status: 429,
		statusText: 'Too Many Requests',
		text: async () => 'rate limited',
	};
}

/** Mock a 500 Internal Server Error response. */
export function make500() {
	return {
		ok: false,
		status: 500,
		statusText: 'Internal Server Error',
		text: async () => 'server error',
	};
}

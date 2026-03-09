import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/services/openrouter';
import { RateLimiter } from '../../src/utils/rate-limiter';

function makeResponse(content: string, tokens = 100) {
	return {
		ok: true,
		status: 200,
		json: async () => ({
			id: 'chat-123',
			choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: tokens },
		}),
		text: async () => '',
	};
}

function make429() {
	return {
		ok: false,
		status: 429,
		statusText: 'Too Many Requests',
		text: async () => 'rate limited',
	};
}

describe('OpenRouterProvider', () => {
	let provider: OpenRouterProvider;
	let limiter: RateLimiter;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		limiter = new RateLimiter(100);
		provider = new OpenRouterProvider('test-api-key', 'test-model', limiter);
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		// Speed up retries for tests
		vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
			fn();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('API call headers', () => {
		it('should include Authorization header with Bearer token', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'What is 1+1?',
				options: ['1', '2', '3'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			const headers = init.headers;
			expect(headers.Authorization).toBe('Bearer test-api-key');
		});

		it('should include HTTP-Referer header', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['HTTP-Referer']).toBeDefined();
		});

		it('should include X-Title header', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['X-Title']).toBe('Auto-Coursera');
		});
	});

	describe('request body', () => {
		it('should include response_format in request body', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.response_format.type).toBe('json_schema');
			expect(body.response_format.json_schema.name).toBe('quiz_answer');
			expect(body.response_format.json_schema.strict).toBe(true);
		});

		it('should include model in request body', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.model).toBe('test-model');
		});
	});

	describe('retry on 429', () => {
		it('should retry on 429 and succeed on subsequent attempt', async () => {
			fetchMock
				.mockResolvedValueOnce(make429())
				.mockResolvedValueOnce(
					makeResponse('{"answer": [1], "confidence": 0.85, "reasoning": "retried"}'),
				);

			const result = await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(result.answerIndices).toEqual([1]);
		});
	});

	describe('timeout handling', () => {
		it('should throw timeout error on AbortError', async () => {
			fetchMock.mockImplementation(() => {
				const error = new DOMException('The operation was aborted', 'AbortError');
				throw error;
			});

			await expect(
				provider.solve({
					questionText: 'Test?',
					options: ['A', 'B'],
					questionType: 'single-choice',
				}),
			).rejects.toThrow(/timed out/);
		});
	});

	describe('API URL', () => {
		it('should call the OpenRouter completions endpoint', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "ok"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		});
	});
});

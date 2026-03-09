import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CerebrasProvider } from '../../src/services/cerebras';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../../src/utils/constants';
import { RateLimiter } from '../../src/utils/rate-limiter';

function makeResponse(content: string, tokens = 100) {
	return {
		ok: true,
		status: 200,
		json: async () => ({
			id: 'chat-cerebras-1',
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

function make500() {
	return {
		ok: false,
		status: 500,
		statusText: 'Internal Server Error',
		text: async () => 'server error',
	};
}

describe('CerebrasProvider', () => {
	let provider: CerebrasProvider;
	let limiter: RateLimiter;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		limiter = new RateLimiter(100);
		provider = new CerebrasProvider('cerebras-test-key', 'cerebras-gpt', limiter);
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

	describe('API URL', () => {
		it('should call the Cerebras completions endpoint', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "ok"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe('https://api.cerebras.ai/v1/chat/completions');
		});
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
			expect(init.headers.Authorization).toBe('Bearer cerebras-test-key');
		});

		it('should include Content-Type application/json', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "test"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['Content-Type']).toBe('application/json');
		});
	});

	describe('request body', () => {
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
			expect(body.model).toBe('cerebras-gpt');
		});

		it('should include stream: false in request body', async () => {
			fetchMock.mockResolvedValueOnce(
				makeResponse('{"answer": [0], "confidence": 0.9, "reasoning": "ok"}'),
			);

			await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.stream).toBe(false);
		});
	});

	describe('timeout configuration', () => {
		it('should use default timeout (10 min)', () => {
			expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(600_000);
		});

		it('should throw timeout error on AbortError', async () => {
			fetchMock.mockImplementation(() => {
				throw new DOMException('The operation was aborted', 'AbortError');
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

	describe('retry on errors', () => {
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

		it('should retry on 500 and succeed on subsequent attempt', async () => {
			fetchMock
				.mockResolvedValueOnce(make500())
				.mockResolvedValueOnce(
					makeResponse('{"answer": [0], "confidence": 0.8, "reasoning": "retried"}'),
				);

			const result = await provider.solve({
				questionText: 'Test?',
				options: ['A', 'B'],
				questionType: 'single-choice',
			});

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(result.answerIndices).toEqual([0]);
		});
	});
});

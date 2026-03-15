import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../../src/services/openrouter';
import { RateLimiter } from '../../src/utils/rate-limiter';
import {
	buildSingleBatchContent,
	createSingleQuestionBatch,
	getSingleBatchAnswer,
	make429,
	makeResponse,
} from './provider-test-helpers';

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
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(
				createSingleQuestionBatch({
					questionText: 'What is 1+1?',
					options: ['1', '2', '3'],
				}),
			);

			const [, init] = fetchMock.mock.calls[0];
			const headers = init.headers;
			expect(headers.Authorization).toBe('Bearer test-api-key');
		});

		it('should include HTTP-Referer header', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['HTTP-Referer']).toBeDefined();
		});

		it('should include X-Title header', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['X-Title']).toBe('Auto-Coursera');
		});
	});

	describe('request body', () => {
		it('should include response_format in request body', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.response_format.type).toBe('json_schema');
			expect(body.response_format.json_schema.name).toBe('quiz_answers_batch');
			expect(body.response_format.json_schema.strict).toBe(true);
		});

		it('should include model in request body', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.model).toBe('test-model');
		});
	});

	describe('retry on 429', () => {
		it('should retry on 429 and succeed on subsequent attempt', async () => {
			fetchMock
				.mockResolvedValueOnce(make429())
				.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([1], 0.85, 'retried')));

			const result = await provider.solveBatch(createSingleQuestionBatch());

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(getSingleBatchAnswer(result).answer).toEqual([1]);
		});
	});

	describe('timeout handling', () => {
		it('should throw timeout error on AbortError', async () => {
			fetchMock.mockImplementation(() => {
				const error = new DOMException('The operation was aborted', 'AbortError');
				throw error;
			});

			await expect(provider.solveBatch(createSingleQuestionBatch())).rejects.toThrow(/timed out/);
		});

		it('should surface REQUEST_CANCELLED when an external abort signal cancels fetch', async () => {
			fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
				return new Promise((_, reject) => {
					const signal = init?.signal;
					if (!(signal instanceof AbortSignal)) {
						reject(new Error('Missing abort signal'));
						return;
					}

					signal.addEventListener(
						'abort',
						() => reject(new DOMException('The operation was aborted', 'AbortError')),
						{ once: true },
					);
				});
			});

			const controller = new AbortController();
			const promise = provider.solveBatch(createSingleQuestionBatch({}, controller.signal));

			controller.abort();

			await expect(promise).rejects.toThrow('REQUEST_CANCELLED');
		});
	});

	describe('API URL', () => {
		it('should call the OpenRouter completions endpoint', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.9, 'ok')));

			await provider.solveBatch(createSingleQuestionBatch());

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		});
	});
});

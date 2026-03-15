import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../../src/services/constants';
import { ConfigurableProvider, PROVIDER_CONFIGS } from '../../src/services/provider-registry';
import { RateLimiter } from '../../src/utils/rate-limiter';
import {
	buildSingleBatchContent,
	createSingleQuestionBatch,
	getSingleBatchAnswer,
	make500,
	makeResponse,
} from './provider-test-helpers';

describe('NvidiaNimProvider', () => {
	let provider: ConfigurableProvider;
	let limiter: RateLimiter;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		limiter = new RateLimiter(100);
		provider = new ConfigurableProvider(
			PROVIDER_CONFIGS['nvidia-nim']!,
			'nvidia-test-key',
			'nvidia/test-model',
			limiter,
		);
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
			expect(init.headers.Authorization).toBe('Bearer nvidia-test-key');
		});

		it('should include Content-Type application/json', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['Content-Type']).toBe('application/json');
		});
	});

	describe('timeout configuration', () => {
		it('should use DEFAULT_REQUEST_TIMEOUT_MS (600000ms / 10 min)', () => {
			expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(600_000);
		});

		it('should throw timeout error on AbortError', async () => {
			fetchMock.mockImplementation(() => {
				throw new DOMException('The operation was aborted', 'AbortError');
			});

			await expect(provider.solveBatch(createSingleQuestionBatch())).rejects.toThrow(/timed out/);
		});
	});

	describe('retry on errors', () => {
		it('should retry on 500 and succeed on subsequent attempt', async () => {
			fetchMock
				.mockResolvedValueOnce(make500())
				.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.8, 'retried')));

			const result = await provider.solveBatch(createSingleQuestionBatch());

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(getSingleBatchAnswer(result).answer).toEqual([0]);
		});

		it('should throw after exhausting retries', async () => {
			fetchMock.mockResolvedValue(make500());

			await expect(provider.solveBatch(createSingleQuestionBatch())).rejects.toThrow();
		});
	});

	describe('API URL', () => {
		it('should call the NVIDIA NIM completions endpoint', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.9, 'ok')));

			await provider.solveBatch(createSingleQuestionBatch());

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
		});
	});

	describe('request body', () => {
		it('should include stream: false in request body', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.9, 'ok')));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.stream).toBe(false);
		});
	});
});

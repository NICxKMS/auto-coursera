import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../../src/services/constants';
import { ConfigurableProvider, PROVIDER_CONFIGS } from '../../src/services/provider-registry';
import { RateLimiter } from '../../src/utils/rate-limiter';
import {
	buildSingleBatchContent,
	createSingleQuestionBatch,
	getSingleBatchAnswer,
	make429,
	make500,
	makeResponse,
} from './provider-test-helpers';

/**
 * Per-provider fixture data. Everything else (endpoint, display name, etc.)
 * is derived from the registry config at runtime.
 */
const PROVIDER_FIXTURES = [
	{ configKey: 'cerebras', apiKey: 'cerebras-test-key', model: 'cerebras-gpt' },
	{ configKey: 'gemini', apiKey: 'gemini-test-key', model: 'gemini-pro' },
	{ configKey: 'groq', apiKey: 'groq-test-key', model: 'llama-3-70b' },
	{ configKey: 'nvidia-nim', apiKey: 'nvidia-test-key', model: 'nvidia/test-model' },
] as const;

describe.each(PROVIDER_FIXTURES)('$configKey provider', ({ configKey, apiKey, model }) => {
	const config = PROVIDER_CONFIGS[configKey]!;

	let provider: ConfigurableProvider;
	let limiter: RateLimiter;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		limiter = new RateLimiter(100);
		provider = new ConfigurableProvider(config, apiKey, model, limiter);
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
			fn();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('API URL', () => {
		it('should call the correct completions endpoint', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.9, 'ok')));

			await provider.solveBatch(createSingleQuestionBatch());

			const [url] = fetchMock.mock.calls[0];
			expect(url).toBe(config.endpoint);
		});
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
			expect(init.headers.Authorization).toBe(`Bearer ${apiKey}`);
		});

		it('should include Content-Type application/json', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			expect(init.headers['Content-Type']).toBe('application/json');
		});
	});

	describe('request body', () => {
		it('should include model in request body', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0])));

			await provider.solveBatch(createSingleQuestionBatch());

			const [, init] = fetchMock.mock.calls[0];
			const body = JSON.parse(init.body);
			expect(body.model).toBe(model);
		});

		it('should include stream: false in request body', async () => {
			fetchMock.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([0], 0.9, 'ok')));

			await provider.solveBatch(createSingleQuestionBatch());

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

			await expect(provider.solveBatch(createSingleQuestionBatch())).rejects.toThrow(/timed out/);
		});
	});

	describe('retry on errors', () => {
		it('should retry on 429 and succeed on subsequent attempt', async () => {
			fetchMock
				.mockResolvedValueOnce(make429())
				.mockResolvedValueOnce(makeResponse(buildSingleBatchContent([1], 0.85, 'retried')));

			const result = await provider.solveBatch(createSingleQuestionBatch());

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(getSingleBatchAnswer(result).answer).toEqual([1]);
		});

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
});

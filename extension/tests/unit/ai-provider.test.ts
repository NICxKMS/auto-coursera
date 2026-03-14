import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderManager } from '../../src/services/ai-provider';
import type { AIBatchResponse, IAIProvider } from '../../src/types/api';
import { createSingleQuestionBatch, getSingleBatchAnswer } from './provider-test-helpers';

function createMockProvider(
	name: string,
	opts: {
		supportsVision?: boolean;
		available?: boolean;
		solveBatchResult?: AIBatchResponse;
		solveBatchError?: Error;
	} = {},
): IAIProvider {
	const { supportsVision = false, available = true, solveBatchResult, solveBatchError } = opts;

	return {
		name,
		supportsVision,
		isAvailable: vi.fn(async () => available),
		solveBatch: vi.fn(async () => {
			if (solveBatchError) throw solveBatchError;
			return (
				solveBatchResult ?? {
					provider: name,
					model: 'mock-model',
					tokensUsed: 100,
					answers: [
						{
							uid: 'q1',
							answer: [0],
							confidence: 0.9,
							reasoning: 'mock',
						},
					],
				}
			);
		}),
	};
}

const baseRequest = createSingleQuestionBatch({
	questionText: 'What is 2+2?',
	options: ['3', '4', '5'],
});

describe('AIProviderManager', () => {
	let manager: AIProviderManager;

	beforeEach(() => {
		manager = new AIProviderManager();
	});

	describe('fallback chain', () => {
		it('should use primary provider when it succeeds', async () => {
			const primary = createMockProvider('primary');
			const fallback = createMockProvider('fallback');
			manager.register(primary);
			manager.register(fallback);

			const result = await manager.solveBatch(baseRequest);

			expect(result.provider).toBe('primary');
			expect(primary.solveBatch).toHaveBeenCalledTimes(1);
			expect(fallback.solveBatch).not.toHaveBeenCalled();
		});

		it('should fall back to secondary when primary fails', async () => {
			const primary = createMockProvider('primary', {
				solveBatchError: new Error('primary down'),
			});
			const fallback = createMockProvider('fallback', {
				solveBatchResult: {
					provider: 'fallback',
					model: 'fb-model',
					tokensUsed: 80,
					answers: [
						{
							uid: 'q1',
							answer: [1],
							confidence: 0.8,
							reasoning: 'fallback',
						},
					],
				},
			});
			manager.register(primary);
			manager.register(fallback);

			const result = await manager.solveBatch(baseRequest);

			expect(result.provider).toBe('fallback');
			expect(getSingleBatchAnswer(result).answer).toEqual([1]);
		});

		it('should skip unavailable providers and try the next one', async () => {
			const unavailable = createMockProvider('unavailable', { available: false });
			const available = createMockProvider('available');
			manager.register(unavailable);
			manager.register(available);

			const result = await manager.solveBatch(baseRequest);

			expect(unavailable.solveBatch).not.toHaveBeenCalled();
			expect(result.provider).toBe('available');
		});
	});

	describe('circuit breaker integration', () => {
		it('should skip providers with open circuit breakers', async () => {
			const failing = createMockProvider('failing', {
				solveBatchError: new Error('fail'),
			});
			const healthy = createMockProvider('healthy');
			manager.register(failing);
			manager.register(healthy);

			// Trip the circuit breaker by failing 3 times (default threshold)
			for (let i = 0; i < 3; i++) {
				try {
					manager.setPrimary('failing');
					await manager.solveBatch(baseRequest);
				} catch {
					// expected
				}
			}

			// Now failing provider's circuit should be open, healthy should be used
			const result = await manager.solveBatch(baseRequest);
			expect(result.provider).toBe('healthy');
		});
	});

	describe('all providers failed', () => {
		it('should throw ALL_PROVIDERS_FAILED when no providers registered', async () => {
			await expect(manager.solveBatch(baseRequest)).rejects.toThrow('ALL_PROVIDERS_FAILED');
		});

		it('should throw ALL_PROVIDERS_FAILED when all providers fail', async () => {
			const p1 = createMockProvider('p1', { solveBatchError: new Error('fail1') });
			const p2 = createMockProvider('p2', { solveBatchError: new Error('fail2') });
			manager.register(p1);
			manager.register(p2);

			await expect(manager.solveBatch(baseRequest)).rejects.toThrow('ALL_PROVIDERS_FAILED');
		});

		it('should include provider names in error message', async () => {
			const p1 = createMockProvider('alpha', { solveBatchError: new Error('err-alpha') });
			const p2 = createMockProvider('beta', { solveBatchError: new Error('err-beta') });
			manager.register(p1);
			manager.register(p2);

			await expect(manager.solveBatch(baseRequest)).rejects.toThrow(/alpha.*beta/);
		});
	});

	describe('provider registration', () => {
		it('should track registered providers', () => {
			manager.register(createMockProvider('a'));
			manager.register(createMockProvider('b'));
			expect(manager.getProviderCount()).toBe(2);
			expect(manager.getProviderNames()).toEqual(['a', 'b']);
		});

		it('should set primary provider by name', async () => {
			const a = createMockProvider('a');
			const b = createMockProvider('b', {
				solveBatchResult: {
					provider: 'b',
					model: 'b-model',
					tokensUsed: 50,
					answers: [
						{
							uid: 'q1',
							answer: [2],
							confidence: 0.95,
							reasoning: 'from b',
						},
					],
				},
			});
			manager.register(a);
			manager.register(b);
			manager.setPrimary('b');

			const result = await manager.solveBatch(baseRequest);
			expect(result.provider).toBe('b');
		});
	});

	describe('vision routing', () => {
		it('should route vision requests to vision-capable providers', async () => {
			const noVision = createMockProvider('no-vision', { supportsVision: false });
			const hasVision = createMockProvider('has-vision', {
				supportsVision: true,
				solveBatchResult: {
					provider: 'has-vision',
					model: 'v-model',
					tokensUsed: 200,
					answers: [
						{
							uid: 'q1',
							answer: [0],
							confidence: 0.9,
							reasoning: 'vision',
						},
					],
				},
			});
			manager.register(noVision);
			manager.register(hasVision);

			const result = await manager.solveBatch(
				createSingleQuestionBatch({ images: ['data:image/png;base64,abc'] }),
			);

			expect(result.provider).toBe('has-vision');
		});
	});

	describe('cancellation', () => {
		it('should not fall back to a secondary provider when the request is cancelled', async () => {
			const primary = createMockProvider('primary', {
				solveBatchError: new Error('REQUEST_CANCELLED'),
			});
			const fallback = createMockProvider('fallback');
			manager.register(primary);
			manager.register(fallback);

			await expect(manager.solveBatch(baseRequest)).rejects.toThrow('REQUEST_CANCELLED');
			expect(fallback.solveBatch).not.toHaveBeenCalled();
		});
	});
});

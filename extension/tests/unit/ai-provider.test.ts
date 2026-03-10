import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProviderManager } from '../../src/services/ai-provider';
import type { AIRequest, AIResponse, IAIProvider } from '../../src/types/api';

function createMockProvider(
	name: string,
	opts: {
		supportsVision?: boolean;
		available?: boolean;
		solveResult?: AIResponse;
		solveError?: Error;
	} = {},
): IAIProvider {
	const { supportsVision = false, available = true, solveResult, solveError } = opts;

	return {
		name,
		supportsVision,
		isAvailable: vi.fn(async () => available),
		solve: vi.fn(async () => {
			if (solveError) throw solveError;
			return (
				solveResult ?? {
					answerIndices: [0],
					confidence: 0.9,
					reasoning: 'mock',
					provider: name,
					model: 'mock-model',
					tokensUsed: 100,
					latencyMs: 50,
				}
			);
		}),
	};
}

const baseRequest: AIRequest = {
	questionText: 'What is 2+2?',
	options: ['3', '4', '5'],
	questionType: 'single-choice',
};

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

			const result = await manager.solve(baseRequest);

			expect(result.provider).toBe('primary');
			expect(primary.solve).toHaveBeenCalledTimes(1);
			expect(fallback.solve).not.toHaveBeenCalled();
		});

		it('should fall back to secondary when primary fails', async () => {
			const primary = createMockProvider('primary', {
				solveError: new Error('primary down'),
			});
			const fallback = createMockProvider('fallback', {
				solveResult: {
					answerIndices: [1],
					confidence: 0.8,
					reasoning: 'fallback',
					provider: 'fallback',
					model: 'fb-model',
					tokensUsed: 80,
					latencyMs: 60,
				},
			});
			manager.register(primary);
			manager.register(fallback);

			const result = await manager.solve(baseRequest);

			expect(result.provider).toBe('fallback');
			expect(result.answerIndices).toEqual([1]);
		});

		it('should skip unavailable providers and try the next one', async () => {
			const unavailable = createMockProvider('unavailable', { available: false });
			const available = createMockProvider('available');
			manager.register(unavailable);
			manager.register(available);

			const result = await manager.solve(baseRequest);

			expect(unavailable.solve).not.toHaveBeenCalled();
			expect(result.provider).toBe('available');
		});
	});

	describe('circuit breaker integration', () => {
		it('should skip providers with open circuit breakers', async () => {
			const failing = createMockProvider('failing', {
				solveError: new Error('fail'),
			});
			const healthy = createMockProvider('healthy');
			manager.register(failing);
			manager.register(healthy);

			// Trip the circuit breaker by failing 3 times (default threshold)
			for (let i = 0; i < 3; i++) {
				try {
					manager.setPrimary('failing');
					await manager.solve(baseRequest);
				} catch {
					// expected
				}
			}

			// Now failing provider's circuit should be open, healthy should be used
			const result = await manager.solve(baseRequest);
			expect(result.provider).toBe('healthy');
		});
	});

	describe('all providers failed', () => {
		it('should throw ALL_PROVIDERS_FAILED when no providers registered', async () => {
			await expect(manager.solve(baseRequest)).rejects.toThrow('ALL_PROVIDERS_FAILED');
		});

		it('should throw ALL_PROVIDERS_FAILED when all providers fail', async () => {
			const p1 = createMockProvider('p1', { solveError: new Error('fail1') });
			const p2 = createMockProvider('p2', { solveError: new Error('fail2') });
			manager.register(p1);
			manager.register(p2);

			await expect(manager.solve(baseRequest)).rejects.toThrow('ALL_PROVIDERS_FAILED');
		});

		it('should include provider names in error message', async () => {
			const p1 = createMockProvider('alpha', { solveError: new Error('err-alpha') });
			const p2 = createMockProvider('beta', { solveError: new Error('err-beta') });
			manager.register(p1);
			manager.register(p2);

			await expect(manager.solve(baseRequest)).rejects.toThrow(/alpha.*beta/);
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
				solveResult: {
					answerIndices: [2],
					confidence: 0.95,
					reasoning: 'from b',
					provider: 'b',
					model: 'b-model',
					tokensUsed: 50,
					latencyMs: 30,
				},
			});
			manager.register(a);
			manager.register(b);
			manager.setPrimary('b');

			const result = await manager.solve(baseRequest);
			expect(result.provider).toBe('b');
		});
	});

	describe('vision routing', () => {
		it('should route vision requests to vision-capable providers', async () => {
			const noVision = createMockProvider('no-vision', { supportsVision: false });
			const hasVision = createMockProvider('has-vision', {
				supportsVision: true,
				solveResult: {
					answerIndices: [0],
					confidence: 0.9,
					reasoning: 'vision',
					provider: 'has-vision',
					model: 'v-model',
					tokensUsed: 200,
					latencyMs: 100,
				},
			});
			manager.register(noVision);
			manager.register(hasVision);

			const result = await manager.solve({
				...baseRequest,
				images: [{ base64: 'abc', context: 'question' }],
			});

			expect(result.provider).toBe('has-vision');
		});
	});

	describe('cancellation', () => {
		it('should not fall back to a secondary provider when the request is cancelled', async () => {
			const primary = createMockProvider('primary', {
				solveError: new Error('REQUEST_CANCELLED'),
			});
			const fallback = createMockProvider('fallback');
			manager.register(primary);
			manager.register(fallback);

			await expect(manager.solve(baseRequest)).rejects.toThrow('REQUEST_CANCELLED');
			expect(fallback.solve).not.toHaveBeenCalled();
		});
	});
});

/**
 * AI Provider Manager — Strategy pattern with ordered fallback.
 * REQ: REQ-008 — provider fallback on failure
 */

import type {
	AIBatchRequest,
	AIBatchResponse,
	AIRequest,
	AIResponse,
	IAIProvider,
} from '../types/api';
import { CircuitBreaker, CircuitState } from '../utils/circuit-breaker';
import { Logger } from '../utils/logger';

const logger = new Logger('AIProviderManager');

function isCancellationError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && /REQUEST_CANCELLED/i.test(error.message);
}

export class AIProviderManager {
	private providers: IAIProvider[] = [];
	private primaryIndex: number = 0;
	private circuits: Map<string, CircuitBreaker> = new Map();

	/**
	 * Register a provider. First registered becomes primary by default.
	 */
	register(provider: IAIProvider): void {
		this.providers.push(provider);
		this.circuits.set(provider.name, new CircuitBreaker(provider.name));
		logger.info(`Registered provider: ${provider.name} (vision: ${provider.supportsVision})`);
	}

	/**
	 * Set the primary provider by name.
	 */
	setPrimary(name: string): void {
		const idx = this.providers.findIndex((p) => p.name === name);
		if (idx >= 0) {
			this.primaryIndex = idx;
			logger.info(`Primary provider set to: ${name}`);
		} else {
			logger.warn(`Provider not found: ${name}, keeping current primary`);
		}
	}

	async solve(request: AIRequest): Promise<AIResponse> {
		if (request.signal?.aborted) {
			throw new Error('REQUEST_CANCELLED');
		}
		const needsVision = (request.images?.length ?? 0) > 0;
		return this.withFallback(needsVision, 'solve', (p) => p.solve(request));
	}

	async solveBatch(batchRequest: AIBatchRequest): Promise<AIBatchResponse> {
		if (batchRequest.signal?.aborted) {
			throw new Error('REQUEST_CANCELLED');
		}
		const needsVision = batchRequest.questions.some((q) => q.images && q.images.length > 0);
		return this.withFallback(needsVision, 'batch', (provider) => {
			if (!provider.solveBatch) throw new Error('solveBatch not implemented');
			return provider.solveBatch(batchRequest);
		});
	}

	private async withFallback<T>(
		needsVision: boolean,
		label: string,
		attempt: (provider: IAIProvider) => Promise<T>,
	): Promise<T> {
		const ordered = this.getOrderedProviders(needsVision);
		if (ordered.length === 0) {
			throw new Error('ALL_PROVIDERS_FAILED: No providers registered');
		}

		const errors: Array<{ provider: string; error: unknown }> = [];
		// Use getState() instead of canProceed() — canProceed() has side effects
		// (consumes HALF_OPEN probe slots) that would prevent the actual loop from
		// sending a test request through a recovering provider.
		const allCircuitsOpen = ordered.every((p) => {
			const cb = this.circuits.get(p.name);
			return cb?.getState() === CircuitState.OPEN;
		});

		for (const provider of ordered) {
			const circuit = this.circuits.get(provider.name);
			if (circuit && !circuit.canProceed() && !allCircuitsOpen) {
				logger.warn(`Provider ${provider.name} circuit open for ${label}, skipping`);
				errors.push({ provider: provider.name, error: 'circuit breaker open' });
				continue;
			}
			try {
				const available = await provider.isAvailable();
				if (!available) {
					errors.push({
						provider: provider.name,
						error: 'not available (rate limited or misconfigured)',
					});
					logger.warn(`Provider ${provider.name} not available for ${label}, skipping`);
					continue;
				}
				logger.info(`Attempting ${label} with ${provider.name}`);
				const result = await attempt(provider);
				circuit?.recordSuccess();
				logger.info(`Completed ${label} with ${provider.name}`);
				return result;
			} catch (error) {
				if (isCancellationError(error)) {
					logger.info(`Aborted ${label} with ${provider.name}`);
					throw error;
				}
				circuit?.recordFailure();
				logger.error(`Provider ${provider.name} ${label} failed`, error);
				errors.push({ provider: provider.name, error });
			}
		}

		const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join('; ');
		throw new Error(`ALL_PROVIDERS_FAILED: ${errorSummary}`);
	}

	/**
	 * Get providers ordered by preference, filtering by vision capability if needed.
	 * AC-008.4: Vision-required questions route to vision-capable providers.
	 */
	private getOrderedProviders(needsVision: boolean): IAIProvider[] {
		let suitable = needsVision ? this.providers.filter((p) => p.supportsVision) : this.providers;

		// If no vision providers available, try all providers anyway
		if (suitable.length === 0) {
			suitable = this.providers;
		}

		// Put primary first
		const primaryIdx = Math.min(this.primaryIndex, suitable.length - 1);
		const primary = suitable[primaryIdx];
		if (!primary) return suitable;

		return [primary, ...suitable.filter((p) => p !== primary)];
	}

	/**
	 * Get the number of registered providers.
	 */
	getProviderCount(): number {
		return this.providers.length;
	}

	/**
	 * Get registered provider names.
	 */
	getProviderNames(): string[] {
		return this.providers.map((p) => p.name);
	}
}

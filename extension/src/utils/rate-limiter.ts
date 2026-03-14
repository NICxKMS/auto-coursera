/**
 * Token-bucket rate limiter for AI API requests.
 */

import { throwIfAborted, waitWithAbort } from './abort';

export class RateLimiter {
	private tokens: number;
	private readonly maxTokens: number;
	private readonly refillRate: number; // tokens per millisecond
	private lastRefill: number;

	/**
	 * @param requestsPerMinute - Maximum requests allowed per minute (default: 20)
	 */
	constructor(requestsPerMinute: number = 20) {
		this.maxTokens = requestsPerMinute;
		this.tokens = requestsPerMinute;
		this.refillRate = requestsPerMinute / 60000; // tokens per ms
		this.lastRefill = Date.now();
	}

	/**
	 * Check if a request can proceed without waiting.
	 */
	canProceed(): boolean {
		this.refill();
		return this.tokens >= 1;
	}

	/**
	 * Acquire a token. Waits asynchronously if no tokens are available.
	 */
	async acquire(signal?: AbortSignal): Promise<void> {
		throwIfAborted(signal);

		while (true) {
			this.refill();
			if (this.tokens >= 1) {
				this.tokens -= 1;
				return;
			}
			// Calculate wait time until 1 token is available
			const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
			await waitWithAbort(waitMs, signal);
		}
	}

	/**
	 * Refill tokens based on elapsed time.
	 */
	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
		this.lastRefill = now;
	}
}

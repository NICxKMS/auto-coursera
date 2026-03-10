/**
 * Token-bucket rate limiter for AI API requests.
 * REQ: NFR-002 — per-provider rate limiting
 */

import { ERROR_CODES } from './constants';

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error(ERROR_CODES.REQUEST_CANCELLED);
	}
}

async function waitWithAbort(waitMs: number, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
		return;
	}

	throwIfAborted(signal);

	await new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, waitMs);

		const onAbort = () => {
			clearTimeout(timeoutId);
			signal.removeEventListener('abort', onAbort);
			reject(new Error(ERROR_CODES.REQUEST_CANCELLED));
		};

		signal.addEventListener('abort', onAbort, { once: true });
	});
}

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
	 * AC-NFR-002.2: Callers wait when bucket is empty, not rejected.
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
	 * AC-NFR-002.3: Tokens refill continuously (not reset per minute).
	 */
	private refill(): void {
		const now = Date.now();
		const elapsed = now - this.lastRefill;
		this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
		this.lastRefill = now;
	}

	/**
	 * Get current token count (for debugging/status).
	 */
	getAvailableTokens(): number {
		this.refill();
		return Math.floor(this.tokens);
	}
}

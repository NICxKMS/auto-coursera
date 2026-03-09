import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../src/utils/rate-limiter';

describe('RateLimiter', () => {
	let limiter: RateLimiter;

	beforeEach(() => {
		limiter = new RateLimiter(20); // 20 RPM
	});

	describe('canProceed()', () => {
		it('should return true when tokens available', () => {
			expect(limiter.canProceed()).toBe(true);
		});

		it('should return false when all tokens consumed', async () => {
			// Consume all 20 tokens
			for (let i = 0; i < 20; i++) {
				await limiter.acquire();
			}
			expect(limiter.canProceed()).toBe(false);
		});
	});

	describe('acquire()', () => {
		it('should consume a token', async () => {
			await limiter.acquire();
			expect(limiter.getAvailableTokens()).toBe(19);
		});

		it('should allow 20 immediate requests', async () => {
			for (let i = 0; i < 20; i++) {
				await limiter.acquire();
			}
			// Should have consumed all tokens
			expect(limiter.getAvailableTokens()).toBe(0);
		});
	});

	describe('refill', () => {
		it('should refill tokens over time', async () => {
			// Consume all tokens
			for (let i = 0; i < 20; i++) {
				await limiter.acquire();
			}
			// Fast-forward time by faking Date.now
			const original = Date.now;
			Date.now = () => original() + 60000; // +1 minute

			expect(limiter.canProceed()).toBe(true);
			expect(limiter.getAvailableTokens()).toBe(20);

			Date.now = original;
		});
	});

	describe('constructor defaults', () => {
		it('should default to 20 RPM', () => {
			const defaultLimiter = new RateLimiter();
			expect(defaultLimiter.getAvailableTokens()).toBe(20);
		});

		it('should accept custom RPM', () => {
			const customLimiter = new RateLimiter(60);
			expect(customLimiter.getAvailableTokens()).toBe(60);
		});
	});
});

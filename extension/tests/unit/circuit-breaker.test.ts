import { beforeEach, describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../src/utils/circuit-breaker';

describe('CircuitBreaker', () => {
	let cb: CircuitBreaker;

	beforeEach(() => {
		cb = new CircuitBreaker('test-provider', 3, 60_000);
	});

	describe('CLOSED state', () => {
		it('should start in CLOSED state', () => {
			expect(cb.getState()).toBe(CircuitState.CLOSED);
		});

		it('should allow requests when CLOSED', () => {
			expect(cb.canProceed()).toBe(true);
		});

		it('should remain CLOSED after fewer failures than threshold', () => {
			cb.recordFailure();
			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.CLOSED);
			expect(cb.canProceed()).toBe(true);
		});
	});

	describe('transition to OPEN', () => {
		it('should transition to OPEN after reaching failure threshold', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.OPEN);
		});

		it('should deny requests when OPEN', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordFailure();
			expect(cb.canProceed()).toBe(false);
		});
	});

	describe('transition to HALF_OPEN after cooldown', () => {
		it('should transition to HALF_OPEN after cooldown elapses', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.OPEN);

			// Fast-forward past cooldown
			const original = Date.now;
			Date.now = () => original() + 60_001;

			expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
			expect(cb.canProceed()).toBe(true);

			Date.now = original;
		});
	});

	describe('transition from HALF_OPEN', () => {
		it('should transition to CLOSED on success in HALF_OPEN', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordFailure();

			const original = Date.now;
			Date.now = () => original() + 60_001;

			// Trigger transition to HALF_OPEN
			cb.canProceed();
			expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

			cb.recordSuccess();
			expect(cb.getState()).toBe(CircuitState.CLOSED);

			Date.now = original;
		});

		it('should transition back to OPEN on failure in HALF_OPEN', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordFailure();

			const original = Date.now;
			const base = original();
			Date.now = () => base + 60_001;

			// Trigger transition to HALF_OPEN
			cb.canProceed();
			expect(cb.getState()).toBe(CircuitState.HALF_OPEN);

			// Fail again => failure count is now 4 (>= threshold), so OPEN
			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.OPEN);

			Date.now = original;
		});
	});

	describe('recordSuccess resets failure count', () => {
		it('should reset failure count on success', () => {
			cb.recordFailure();
			cb.recordFailure();
			cb.recordSuccess();

			// Failures again should require full threshold to trip
			cb.recordFailure();
			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.CLOSED);

			cb.recordFailure();
			expect(cb.getState()).toBe(CircuitState.OPEN);
		});
	});

	describe('custom threshold and cooldown', () => {
		it('should respect custom failure threshold', () => {
			const cb5 = new CircuitBreaker('five', 5, 1000);
			for (let i = 0; i < 4; i++) cb5.recordFailure();
			expect(cb5.getState()).toBe(CircuitState.CLOSED);
			cb5.recordFailure();
			expect(cb5.getState()).toBe(CircuitState.OPEN);
		});

		it('should respect custom cooldown', () => {
			const cb1s = new CircuitBreaker('fast', 1, 1000);
			cb1s.recordFailure();
			expect(cb1s.getState()).toBe(CircuitState.OPEN);

			const original = Date.now;
			Date.now = () => original() + 1001;
			expect(cb1s.getState()).toBe(CircuitState.HALF_OPEN);
			Date.now = original;
		});
	});
});

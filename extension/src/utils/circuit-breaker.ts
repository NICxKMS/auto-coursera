import { CIRCUIT_COOLDOWN_MS, CIRCUIT_FAILURE_THRESHOLD } from './constants';
import { Logger } from './logger';

const logger = new Logger('CircuitBreaker');

export enum CircuitState {
	CLOSED = 'CLOSED', // Normal — requests pass through
	OPEN = 'OPEN', // Broken — requests skip this provider
	HALF_OPEN = 'HALF_OPEN', // Testing — one request allowed to check recovery
}

export class CircuitBreaker {
	private state: CircuitState = CircuitState.CLOSED;
	private failureCount = 0;
	private lastFailureTime = 0;
	private halfOpenRequestInFlight = false;

	constructor(
		private readonly name: string,
		private readonly failureThreshold: number = CIRCUIT_FAILURE_THRESHOLD,
		private readonly cooldownMs: number = CIRCUIT_COOLDOWN_MS,
	) {}

	canProceed(): boolean {
		switch (this.state) {
			case CircuitState.CLOSED:
				return true;
			case CircuitState.OPEN:
				if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
					this.state = CircuitState.HALF_OPEN;
					this.halfOpenRequestInFlight = true;
					logger.info(`${this.name} circuit half-open, allowing test request`);
					return true;
				}
				return false;
			case CircuitState.HALF_OPEN:
				// Only allow one probe request through in HALF_OPEN
				if (this.halfOpenRequestInFlight) return false;
				this.halfOpenRequestInFlight = true;
				return true;
		}
	}

	recordSuccess(): void {
		if (this.state === CircuitState.HALF_OPEN) {
			logger.info(`${this.name} circuit closed — provider recovered`);
		}
		this.failureCount = 0;
		this.halfOpenRequestInFlight = false;
		this.state = CircuitState.CLOSED;
	}

	recordFailure(): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();
		this.halfOpenRequestInFlight = false;

		if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.failureThreshold) {
			this.state = CircuitState.OPEN;
			logger.warn(`${this.name} circuit OPEN after ${this.failureCount} failures`);
		}
	}

	getState(): CircuitState {
		if (this.state === CircuitState.OPEN && Date.now() - this.lastFailureTime >= this.cooldownMs) {
			return CircuitState.HALF_OPEN;
		}
		return this.state;
	}
}

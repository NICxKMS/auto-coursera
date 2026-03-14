/**
 * Cross-cutting constants shared across multiple domains.
 * Domain-specific constants live in their respective modules:
 *   - Content/DOM selectors  → content/constants.ts
 *   - AI provider config     → services/constants.ts
 *   - Single-consumer values → inlined in the consuming file
 */

/** Error codes used throughout the extension */
export const ERROR_CODES = {
	NO_API_KEY: 'NO_API_KEY',
	UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
	SOLVE_FAILED: 'SOLVE_FAILED',
	REQUEST_CANCELLED: 'REQUEST_CANCELLED',
	INVALID_SCOPE: 'INVALID_SCOPE',
	TEST_CONNECTION_FAILED: 'TEST_CONNECTION_FAILED',
} as const;

/** Shared color palette for UI feedback */
export const COLORS = {
	SUCCESS: '#22c55e',
	WARNING: '#eab308',
	LOW: '#f97316',
	ERROR: '#ef4444',
	PROCESSING: '#94a3b8',
	PULSE_MID: '#cbd5e1',
} as const;

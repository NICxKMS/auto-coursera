/**
 * Shared error pattern → user-friendly message mapping.
 * Used by both the popup and the floating widget panel to display
 * consistent, readable error messages from raw error codes.
 *
 * REQ: REQ-012 (popup), REQ-UI-PANEL (widget)
 */

/** Error pattern → user-friendly message mapping */
const ERROR_PATTERNS: [RegExp, string][] = [
	[/NO_API_KEY/i, 'Please add an API key in Settings to get started.'],
	[/RATE_LIMITED|429|rate.?limit/i, 'Too many requests \u2014 please wait a moment and try again.'],
	[/AUTH_FAILED|40[13]/i, 'Your API key is invalid or expired. Check Settings.'],
	[
		/ALL_PROVIDERS_FAILED/i,
		'Could not connect to any AI provider. Check your internet and API keys.',
	],
	[
		/REQUEST_CANCELLED|INVALID_SCOPE/i,
		'That run is no longer current. Scan the page again if needed.',
	],
	[
		/TEST_CONNECTION_FAILED/i,
		'Connection test failed. Check the staged provider settings and try again.',
	],
	[/SOLVE_FAILED/i, 'Failed to solve this question. Try again or check Settings.'],
];

/**
 * Map a raw error string to a user-friendly message.
 * Falls back to a generic message if no pattern matches.
 */
export function getUserFriendlyError(rawError: string): string {
	return (
		ERROR_PATTERNS.find(([p]) => p.test(rawError))?.[1] ??
		'Something went wrong. Check the popup for details.'
	);
}

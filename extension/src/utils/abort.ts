/**
 * Shared abort/cancellation helpers for async operations.
 */

import { ERROR_CODES } from './constants';

/** Throw immediately if the signal is already aborted. */
export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error(ERROR_CODES.REQUEST_CANCELLED);
	}
}

/** Wait for `delayMs`, rejecting early if the signal fires. */
export async function waitWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
		return;
	}

	throwIfAborted(signal);

	await new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, delayMs);

		const onAbort = () => {
			clearTimeout(timeoutId);
			signal.removeEventListener('abort', onAbort);
			reject(new Error(ERROR_CODES.REQUEST_CANCELLED));
		};

		signal.addEventListener('abort', onAbort, { once: true });
	});
}

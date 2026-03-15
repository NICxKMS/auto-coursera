/**
 * Content-to-background messaging bridge.
 * Pure functions for Chrome runtime communication with retry logic.
 */

import type {
	ApplyOutcomePayload,
	BackgroundResponseMessage,
	CancelPageWorkPayload,
	RegisterPageContextPayload,
	ReportPageErrorPayload,
} from '../types/messages';
import { isErrorMessage, isRegisterPageContextResponseMessage } from '../types/messages';
import type { PageRuntimeScope, RuntimeStateView } from '../types/runtime';
import { Logger } from '../utils/logger';

const logger = new Logger('ContentBridge');

/**
 * Send a Chrome runtime message with exponential backoff retry
 * for transient service worker disconnection.
 */
export async function sendMessageWithRetry<T>(message: unknown, maxRetries = 2): Promise<T> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await chrome.runtime.sendMessage(message);
			return response as T;
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (
				(msg.includes('Extension context invalidated') ||
					msg.includes('Could not establish connection')) &&
				attempt < maxRetries
			) {
				logger.warn(`SW disconnected, retry ${attempt + 1}/${maxRetries}`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
				continue;
			}
			throw error;
		}
	}
	throw new Error('Max retries exceeded contacting service worker');
}

/** Register a page context scope with the background runtime. */
export async function registerPageContext(
	scope: PageRuntimeScope,
): Promise<RuntimeStateView | null> {
	try {
		const response = await sendMessageWithRetry<BackgroundResponseMessage>({
			type: 'REGISTER_PAGE_CONTEXT',
			payload: {
				pageInstanceId: scope.pageInstanceId,
				pageUrl: scope.pageUrl,
			} satisfies RegisterPageContextPayload,
		});
		if (isRegisterPageContextResponseMessage(response)) {
			return response.payload.state;
		}
		if (isErrorMessage(response)) {
			logger.warn(`REGISTER_PAGE_CONTEXT rejected: ${response.payload.message}`);
		}
	} catch (error) {
		logger.warn('Failed to register page context', error);
	}
	return null;
}

/** Cancel in-progress work for a page scope. */
export async function cancelPageWork(
	reason: CancelPageWorkPayload['reason'],
	scope: PageRuntimeScope,
): Promise<void> {
	try {
		const response = await sendMessageWithRetry<BackgroundResponseMessage>({
			type: 'CANCEL_PAGE_WORK',
			payload: {
				pageInstanceId: scope.pageInstanceId,
				pageUrl: scope.pageUrl,
				reason,
			} satisfies CancelPageWorkPayload,
		});
		if (isErrorMessage(response)) {
			logger.warn(`CANCEL_PAGE_WORK rejected: ${response.payload.message}`);
		}
	} catch (error) {
		logger.warn('Failed to cancel page work', error);
	}
}

/** Report the outcome of applying answers to a page. */
export async function reportApplyOutcome(payload: ApplyOutcomePayload): Promise<void> {
	try {
		await sendMessageWithRetry<BackgroundResponseMessage>({
			type: 'REPORT_APPLY_OUTCOME',
			payload,
		});
	} catch (error) {
		logger.warn('Failed to report apply outcome', error);
	}
}

/** Report an error that occurred during page processing. */
export async function reportPageError(payload: ReportPageErrorPayload): Promise<void> {
	try {
		await sendMessageWithRetry<BackgroundResponseMessage>({
			type: 'REPORT_PAGE_ERROR',
			payload,
		});
	} catch (error) {
		logger.warn('Failed to report page error', error);
	}
}

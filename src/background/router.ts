/**
 * Service worker message router — maps message types to handlers.
 * REQ: REQ-011
 */

import type { ErrorPayload, Message } from '../types/messages';
import { ERROR_CODES } from '../utils/constants';
import { Logger } from '../utils/logger';

const logger = new Logger('Router');

export type MessageHandler = (
	payload: unknown,
	sender: chrome.runtime.MessageSender,
) => Promise<Message>;

export class MessageRouter {
	private handlers: Map<string, MessageHandler> = new Map();

	on(type: string, handler: MessageHandler): void {
		this.handlers.set(type, handler);
	}

	async route(message: Message, sender: chrome.runtime.MessageSender): Promise<Message> {
		const handler = this.handlers.get(message.type);
		if (!handler) {
			logger.warn(`No handler for message type: ${message.type}`);
			return {
				type: 'ERROR',
				payload: {
					code: ERROR_CODES.UNKNOWN_MESSAGE,
					message: `Unknown message type: ${message.type}`,
				} satisfies ErrorPayload,
			};
		}

		try {
			logger.info(`Routing ${message.type}`);
			return await handler(message.payload, sender);
		} catch (error) {
			logger.error(`Handler error for ${message.type}`, error);
			// Persist error state for popup visibility
			await chrome.storage.session.set({
				_lastStatus: 'error',
				_lastError: error instanceof Error ? error.message : String(error),
				_lastStatusTimestamp: Date.now(),
			});
			return {
				type: 'ERROR',
				payload: {
					code: ERROR_CODES.SOLVE_FAILED,
					message: error instanceof Error ? error.message : 'Unknown error',
				} satisfies ErrorPayload,
			};
		}
	}
}

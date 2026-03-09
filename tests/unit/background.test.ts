import { beforeEach, describe, expect, it } from 'vitest';
import { MessageRouter } from '../../src/background/router';
import type { ErrorPayload, Message } from '../../src/types/messages';

/**
 * Tests for background message routing and sender validation.
 *
 * NOTE: background.ts has module-level side effects (listener registration,
 * provider init). We test the MessageRouter directly from router.ts and
 * replicate the sender validation logic from the onMessage listener.
 */

describe('MessageRouter', () => {
	let router: MessageRouter;

	beforeEach(() => {
		router = new MessageRouter();
	});

	describe('handler registration and routing', () => {
		it('should route a message to the registered handler', async () => {
			router.on('GET_STATUS', async () => ({
				type: 'GET_STATUS',
				payload: { status: 'idle' },
			}));

			const message: Message = { type: 'GET_STATUS', payload: null };
			const sender = {
				id: 'ext-id',
				tab: { url: 'https://www.coursera.org/' },
			} as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('GET_STATUS');
			expect((result.payload as Record<string, unknown>).status).toBe('idle');
		});

		it('should return ERROR for unknown message types', async () => {
			const message = { type: 'NONEXISTENT_TYPE', payload: null } as unknown as Message;
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('ERROR');
			const errPayload = result.payload as ErrorPayload;
			expect(errPayload.code).toBe('UNKNOWN_MESSAGE');
			expect(errPayload.message).toContain('NONEXISTENT_TYPE');
		});

		it('should handle handler errors gracefully', async () => {
			router.on('SOLVE_QUESTION', async () => {
				throw new Error('Provider exploded');
			});

			const message: Message = { type: 'SOLVE_QUESTION', payload: {} };
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('ERROR');
			const errPayload = result.payload as ErrorPayload;
			expect(errPayload.code).toBe('SOLVE_FAILED');
			expect(errPayload.message).toBe('Provider exploded');
		});

		it('should persist error state to session storage on handler error', async () => {
			router.on('SOLVE_QUESTION', async () => {
				throw new Error('Crash');
			});

			const message: Message = { type: 'SOLVE_QUESTION', payload: {} };
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			await router.route(message, sender);

			const sessionStore = chrome.storage.session._getStore() as Record<string, unknown>;
			expect(sessionStore._lastStatus).toBe('error');
			expect(sessionStore._lastError).toBe('Crash');
		});

		it('should route multiple different message types correctly', async () => {
			router.on('GET_STATUS', async () => ({ type: 'GET_STATUS', payload: 'status-ok' }));
			router.on('SET_ENABLED', async () => ({ type: 'SET_ENABLED', payload: 'enabled-ok' }));

			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const r1 = await router.route({ type: 'GET_STATUS', payload: null }, sender);
			const r2 = await router.route({ type: 'SET_ENABLED', payload: true }, sender);

			expect(r1.payload).toBe('status-ok');
			expect(r2.payload).toBe('enabled-ok');
		});

		it('should pass payload and sender to handler', async () => {
			let receivedPayload: unknown;
			let receivedSender: chrome.runtime.MessageSender | undefined;

			router.on('SOLVE_QUESTION', async (payload, sender) => {
				receivedPayload = payload;
				receivedSender = sender;
				return { type: 'SELECT_ANSWER', payload: { answerIndices: [0] } };
			});

			const message: Message = { type: 'SOLVE_QUESTION', payload: { questionText: 'test?' } };
			const sender = {
				id: 'ext-id',
				tab: { id: 42, url: 'https://www.coursera.org/learn/test' },
			} as chrome.runtime.MessageSender;
			await router.route(message, sender);

			expect(receivedPayload).toEqual({ questionText: 'test?' });
			expect(receivedSender?.tab?.id).toBe(42);
		});
	});
});

describe('Sender Validation Logic', () => {
	/**
	 * Replicate the exact sender validation from background.ts onMessage listener
	 * to test it in isolation.
	 */
	const MOCK_EXTENSION_ID = 'mock-extension-id-12345';

	function isAllowedSender(sender: chrome.runtime.MessageSender): boolean {
		const senderUrl = sender.tab?.url || sender.url || '';
		return (
			sender.id === MOCK_EXTENSION_ID &&
			(senderUrl.startsWith('https://www.coursera.org/') ||
				senderUrl.startsWith('chrome-extension://') ||
				senderUrl === '')
		);
	}

	it('should allow messages from extension popup (empty url)', () => {
		expect(isAllowedSender({ id: MOCK_EXTENSION_ID } as chrome.runtime.MessageSender)).toBe(true);
	});

	it('should allow messages from Coursera tabs', () => {
		expect(
			isAllowedSender({
				id: MOCK_EXTENSION_ID,
				tab: { url: 'https://www.coursera.org/learn/ml' },
			} as chrome.runtime.MessageSender),
		).toBe(true);
	});

	it('should allow messages from chrome-extension:// pages', () => {
		expect(
			isAllowedSender({
				id: MOCK_EXTENSION_ID,
				url: 'chrome-extension://mock-extension-id-12345/options.html',
			} as chrome.runtime.MessageSender),
		).toBe(true);
	});

	it('should reject messages from non-extension sources', () => {
		expect(
			isAllowedSender({
				id: 'some-other-extension',
				tab: { url: 'https://www.coursera.org/learn/ml' },
			} as chrome.runtime.MessageSender),
		).toBe(false);
	});

	it('should reject messages from non-Coursera tabs', () => {
		expect(
			isAllowedSender({
				id: MOCK_EXTENSION_ID,
				tab: { url: 'https://evil.com/phish' },
			} as chrome.runtime.MessageSender),
		).toBe(false);
	});

	it('should reject messages from Coursera subdomains that are not www', () => {
		expect(
			isAllowedSender({
				id: MOCK_EXTENSION_ID,
				tab: { url: 'https://evil.coursera.org.fake.com/' },
			} as chrome.runtime.MessageSender),
		).toBe(false);
	});

	it('should reject when extension id matches but URL is wrong', () => {
		expect(
			isAllowedSender({
				id: MOCK_EXTENSION_ID,
				tab: { url: 'https://google.com' },
			} as chrome.runtime.MessageSender),
		).toBe(false);
	});

	it('should reject when URL is Coursera but extension id is wrong', () => {
		expect(
			isAllowedSender({
				id: 'wrong-id',
				tab: { url: 'https://www.coursera.org/' },
			} as chrome.runtime.MessageSender),
		).toBe(false);
	});
});

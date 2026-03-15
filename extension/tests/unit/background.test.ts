import { beforeEach, describe, expect, it } from 'vitest';
import { createMessageRouter, isAllowedSender } from '../../src/background/message-handlers';
import type {
	BackgroundRequestEnvelope,
	BackgroundResponseMessage,
	ErrorPayload,
	TestConnectionResponsePayload,
} from '../../src/types/messages';
import { chromeMock } from '../mocks/chrome';

/**
 * Tests for background message routing and sender validation.
 *
 * NOTE: background.ts has module-level side effects (listener registration,
 * provider init). We test the MessageRouter directly from router.ts and the
 * extracted sender validation helper from message-utils.ts.
 */

describe('MessageRouter', () => {
	let router: ReturnType<typeof createMessageRouter>;

	beforeEach(() => {
		router = createMessageRouter();
	});

	describe('handler registration and routing', () => {
		it('should route a message to the registered handler', async () => {
			router.on('SET_ENABLED', async () => ({
				type: 'SET_ENABLED',
				payload: { success: true },
			}));

			const message = { type: 'SET_ENABLED' as const, payload: true };
			const sender = {
				id: 'ext-id',
				tab: { url: 'https://www.coursera.org/' },
			} as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('SET_ENABLED');
			expect((result.payload as { success: boolean }).success).toBe(true);
		});

		it('should return ERROR for unknown message types', async () => {
			const message = {
				type: 'NONEXISTENT_TYPE',
				payload: null,
			} as unknown as BackgroundRequestEnvelope;
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('ERROR');
			const errPayload = result.payload as ErrorPayload;
			expect(errPayload.code).toBe('UNKNOWN_MESSAGE');
			expect(errPayload.message).toContain('NONEXISTENT_TYPE');
		});

		it('should handle handler errors gracefully', async () => {
			router.on('SOLVE_BATCH', async () => {
				throw new Error('Provider exploded');
			});

			const message = { type: 'SOLVE_BATCH' as const, payload: {} };
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const result = await router.route(message, sender);
			expect(result.type).toBe('ERROR');
			const errPayload = result.payload as ErrorPayload;
			expect(errPayload.code).toBe('SOLVE_FAILED');
			expect(errPayload.message).toBe('Provider exploded');
		});

		it('should not mutate session storage on handler error', async () => {
			router.on('SOLVE_BATCH', async () => {
				throw new Error('Crash');
			});

			const message = { type: 'SOLVE_BATCH' as const, payload: {} };
			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			await router.route(message, sender);

			const sessionStore = chromeMock.storage.session._getStore() as Record<string, unknown>;
			expect(sessionStore).toEqual({});
		});

		it('should route multiple different message types correctly', async () => {
			router.on('TEST_CONNECTION', async () => ({
				type: 'TEST_CONNECTION',
				payload: {
					success: true,
					provider: 'openrouter',
					model: 'openrouter/free',
					confidence: 0.91,
					message: 'connection-ok',
				} satisfies TestConnectionResponsePayload,
			}));
			router.on('SET_ENABLED', async () => ({
				type: 'SET_ENABLED',
				payload: { success: true },
			}));

			const sender = { id: 'ext-id' } as chrome.runtime.MessageSender;
			const r1 = await router.route({ type: 'TEST_CONNECTION', payload: {} }, sender);
			const r2 = await router.route({ type: 'SET_ENABLED', payload: true }, sender);

			expect((r1 as BackgroundResponseMessage<'TEST_CONNECTION'>).payload.message).toBe(
				'connection-ok',
			);
			expect((r2 as BackgroundResponseMessage<'SET_ENABLED'>).payload.success).toBe(true);
		});

		it('should pass payload and sender to handler', async () => {
			let receivedPayload: unknown;
			let receivedSender: chrome.runtime.MessageSender | undefined;

			router.on('SOLVE_BATCH', async (payload, sender) => {
				receivedPayload = payload;
				receivedSender = sender;
				return { type: 'SOLVE_BATCH', payload: { requestId: 'req-1', answers: [] } };
			});

			const message = { type: 'SOLVE_BATCH' as const, payload: { questionText: 'test?' } };
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
	const MOCK_EXTENSION_ID = 'mock-extension-id-12345';

	it('should allow messages from extension popup (empty url)', () => {
		expect(
			isAllowedSender({ id: MOCK_EXTENSION_ID } as chrome.runtime.MessageSender, MOCK_EXTENSION_ID),
		).toBe(true);
	});

	it('should allow messages from Coursera tabs', () => {
		expect(
			isAllowedSender(
				{
					id: MOCK_EXTENSION_ID,
					tab: { url: 'https://www.coursera.org/learn/ml' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(true);
	});

	it('should allow messages from chrome-extension:// pages', () => {
		expect(
			isAllowedSender(
				{
					id: MOCK_EXTENSION_ID,
					url: 'chrome-extension://mock-extension-id-12345/popup.html',
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(true);
	});

	it('should reject messages from non-extension sources', () => {
		expect(
			isAllowedSender(
				{
					id: 'some-other-extension',
					tab: { url: 'https://www.coursera.org/learn/ml' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(false);
	});

	it('should reject messages from non-Coursera tabs', () => {
		expect(
			isAllowedSender(
				{
					id: MOCK_EXTENSION_ID,
					tab: { url: 'https://evil.com/phish' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(false);
	});

	it('should reject messages from Coursera subdomains that are not www', () => {
		expect(
			isAllowedSender(
				{
					id: MOCK_EXTENSION_ID,
					tab: { url: 'https://evil.coursera.org.fake.com/' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(false);
	});

	it('should reject when extension id matches but URL is wrong', () => {
		expect(
			isAllowedSender(
				{
					id: MOCK_EXTENSION_ID,
					tab: { url: 'https://google.com' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(false);
	});

	it('should reject when URL is Coursera but extension id is wrong', () => {
		expect(
			isAllowedSender(
				{
					id: 'wrong-id',
					tab: { url: 'https://www.coursera.org/' },
				} as chrome.runtime.MessageSender,
				MOCK_EXTENSION_ID,
			),
		).toBe(false);
	});
});

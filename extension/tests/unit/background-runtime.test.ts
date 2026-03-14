import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	BatchSolveResponsePayload,
	RegisterPageContextResponsePayload,
	TabActionResponsePayload,
	TestConnectionResponsePayload,
} from '../../src/types/messages';
import { ERROR_CODES } from '../../src/utils/constants';
import { chromeMock, resetChromeMock } from '../mocks/chrome';
import { makeResponse } from './provider-test-helpers';

function makeSender(tabId = 7): chrome.runtime.MessageSender {
	return {
		id: chromeMock.runtime.id,
		tab: {
			id: tabId,
			url: 'https://www.coursera.org/learn/test',
		},
	} as chrome.runtime.MessageSender;
}

describe('background runtime handlers', () => {
	let background: typeof import('../../src/background/background');

	beforeEach(async () => {
		resetChromeMock();
		vi.resetModules();
		background = await import('../../src/background/background');
		await background.__testing.resetForTests();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('registers page context and cancels active work for that scope', async () => {
		const sender = makeSender();
		await chrome.storage.local.set({ enabled: true });
		const registerResponse = await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);
		expect(registerResponse.type).toBe('REGISTER_PAGE_CONTEXT');

		const payload = registerResponse.payload as RegisterPageContextResponsePayload;
		const signal = await background.__testing.runtimeStateManager.beginRequest(
			payload.state,
			'req-1',
		);
		expect(signal?.aborted).toBe(false);

		const cancelResponse = await background.__testing.handleCancelPageWork(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
				reason: 'retry',
			},
			sender,
		);
		expect((cancelResponse.payload as TabActionResponsePayload).success).toBe(true);
		expect(signal?.aborted).toBe(true);
		expect((await background.__testing.runtimeStateManager.getStateForTab(7))?.status).toBe('idle');
	});

	it('finalizes apply outcomes through the background handler', async () => {
		const sender = makeSender();
		await chrome.storage.local.set({ enabled: true });
		const registerResponse = await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);
		const payload = registerResponse.payload as RegisterPageContextResponsePayload;
		await background.__testing.runtimeStateManager.beginRequest(payload.state, 'req-1');
		await background.__testing.runtimeStateManager.completeRequestSolve(payload.state, 'req-1', {
			provider: 'openrouter',
			model: 'openrouter/free',
			confidence: 0.88,
			tokensUsed: 21,
		});

		const response = await background.__testing.handleReportApplyOutcome(
			{
				requestId: 'req-1',
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
				appliedCount: 3,
				failedCount: 1,
			},
			sender,
		);
		expect((response.payload as TabActionResponsePayload).success).toBe(true);

		const state = await background.__testing.runtimeStateManager.getStateForTab(7);
		expect(state?.status).toBe('active');
		expect(state?.solvedCount).toBe(3);
		expect(state?.failedCount).toBe(1);
		expect(state?.tokenCount).toBe(21);
	});

	it('tests staged provider settings without mutating runtime session state or badges', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				makeResponse(
					'{"answers":[{"uid":"test-connection","answer":[1],"confidence":0.93,"reasoning":"basic math"}]}',
				),
			);
		vi.stubGlobal('fetch', fetchMock);
		chromeMock.storage.session._setStore({ sentinel: 'persist me' });
		vi.clearAllMocks();

		const response = await background.__testing.handleTestConnection({
			settings: {
				openrouterApiKey: 'sk-or-test',
				openrouterModel: 'openrouter/free',
				primaryProvider: 'openrouter',
			},
		});
		expect(response.type).toBe('TEST_CONNECTION');
		const payload = response.payload as TestConnectionResponsePayload;
		expect(payload.success).toBe(true);
		expect(payload.provider).toBe('openrouter');
		expect(payload.model).toBe('openrouter/free');
		expect(chromeMock.storage.session._getStore()).toEqual({ sentinel: 'persist me' });
		expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
	});

	it('solves SOLVE_BATCH requests with runtimeContext and echoes requestId', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					makeResponse(
						'{"answers":[{"uid":"q-1","answer":["1"],"confidence":0.93,"reasoning":"basic math"}]}',
						48,
					),
				),
		);
		await chrome.storage.local.set({
			enabled: true,
			openrouterApiKey: 'sk-or-test',
			openrouterModel: 'openrouter/free',
			primaryProvider: 'openrouter',
		});
		await background.__testing.reloadProvidersFromStorage();

		const sender = makeSender();
		await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);

		const response = await background.__testing.handleSolveBatch(
			{
				runtimeContext: {
					requestId: 'req-batch-1',
					pageInstanceId: 'page-1',
					pageUrl: 'https://www.coursera.org/learn/test',
				},
				questions: [
					{
						uid: 'q-1',
						questionText: 'What is 2 + 2?',
						options: ['3', '4', '5'],
						selectionMode: 'single',
					},
				],
			},
			sender,
		);

		expect(response.type).toBe('SOLVE_BATCH');
		const payload = response.payload as BatchSolveResponsePayload;
		expect(payload.requestId).toBe('req-batch-1');
		expect(payload.answers).toHaveLength(1);
		expect(payload.answers[0]?.uid).toBe('q-1');

		const state = await background.__testing.runtimeStateManager.getStateForTab(7);
		expect(state?.status).toBe('processing');
		expect(state?.currentRequestId).toBe('req-batch-1');
	});

	it('rejects SOLVE_BATCH when runtimeContext refers to a stale scope', async () => {
		const sender = makeSender();
		await chrome.storage.local.set({ enabled: true });
		await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);

		const response = await background.__testing.handleSolveBatch(
			{
				runtimeContext: {
					requestId: 'req-invalid',
					pageInstanceId: 'page-2',
					pageUrl: 'https://www.coursera.org/learn/test?next=1',
				},
				questions: [],
			},
			sender,
		);

		expect(response.type).toBe('ERROR');
		expect(response.payload).toMatchObject({ code: ERROR_CODES.INVALID_SCOPE });
	});

	it('rejects SOLVE_BATCH with malformed runtimeContext before mutating scoped state', async () => {
		const sender = makeSender();

		const response = await background.__testing.handleSolveBatch(
			{
				runtimeContext: {
					requestId: 'req-invalid-payload',
					pageInstanceId: 7,
					pageUrl: ['https://www.coursera.org/learn/test'],
				},
				questions: [],
			},
			sender,
		);

		expect(response.type).toBe('ERROR');
		expect(response.payload).toMatchObject({
			code: 'INVALID_PAYLOAD',
			message: 'Invalid batch payload',
		});
		expect(await background.__testing.runtimeStateManager.getStateForTab(7)).toBeNull();
	});

	it('rejects SOLVE_BATCH with legacy questionType-only payloads before mutating scoped state', async () => {
		const sender = makeSender();

		const response = await background.__testing.handleSolveBatch(
			{
				runtimeContext: {
					requestId: 'req-legacy-payload',
					pageInstanceId: 'page-1',
					pageUrl: 'https://www.coursera.org/learn/test',
				},
				questions: [
					{
						uid: 'q-1',
						questionText: 'What is 2 + 2?',
						options: ['3', '4', '5'],
						questionType: 'single-choice',
					},
				],
			},
			sender,
		);

		expect(response.type).toBe('ERROR');
		expect(response.payload).toMatchObject({
			code: 'INVALID_PAYLOAD',
			message: 'Invalid batch payload',
		});
		expect(await background.__testing.runtimeStateManager.getStateForTab(7)).toBeNull();
	});

	it('cancels an in-flight SOLVE_BATCH runtime request', async () => {
		let resolveFetchStarted: (() => void) | null = null;
		const fetchStarted = new Promise<void>((resolve) => {
			resolveFetchStarted = resolve;
		});
		let fetchSignal: AbortSignal | null | undefined;
		let rejectFetch: ((reason?: unknown) => void) | null = null;
		const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
			fetchSignal = init?.signal;
			resolveFetchStarted?.();
			return new Promise((_resolve, reject) => {
				rejectFetch = reject;
				if (fetchSignal?.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}
				fetchSignal?.addEventListener(
					'abort',
					() => reject(new DOMException('Aborted', 'AbortError')),
					{ once: true },
				);
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		await chrome.storage.local.set({
			enabled: true,
			openrouterApiKey: 'sk-or-test',
			openrouterModel: 'openrouter/free',
			primaryProvider: 'openrouter',
		});
		await background.__testing.reloadProvidersFromStorage();

		const sender = makeSender();
		await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);

		const solvePromise = background.__testing.handleSolveBatch(
			{
				runtimeContext: {
					requestId: 'req-cancel',
					pageInstanceId: 'page-1',
					pageUrl: 'https://www.coursera.org/learn/test',
				},
				questions: [
					{
						uid: 'q-1',
						questionText: 'What is 2 + 2?',
						options: ['3', '4', '5'],
						selectionMode: 'single',
					},
				],
			},
			sender,
		);

		await fetchStarted;

		const cancelResponse = await background.__testing.handleCancelPageWork(
			{
				pageInstanceId: 'page-1',
				pageUrl: 'https://www.coursera.org/learn/test',
				reason: 'retry',
			},
			sender,
		);
		expect((cancelResponse.payload as TabActionResponsePayload).success).toBe(true);
		expect(fetchSignal?.aborted).toBe(true);
		rejectFetch!(new DOMException('Aborted', 'AbortError'));

		const response = await solvePromise;
		expect(response.type).toBe('ERROR');
		expect(response.payload).toMatchObject({ code: ERROR_CODES.REQUEST_CANCELLED });
		expect((await background.__testing.runtimeStateManager.getStateForTab(7))?.status).toBe('idle');
	});

	it('cleans runtime scope state when a tab is removed', async () => {
		const sender = makeSender(12);
		await chrome.storage.local.set({ enabled: true });
		await background.__testing.handleRegisterPageContext(
			{
				pageInstanceId: 'page-12',
				pageUrl: 'https://www.coursera.org/learn/test',
			},
			sender,
		);

		await background.__testing.handleTabRemoved(12);

		expect(await background.__testing.runtimeStateManager.getStateForTab(12)).toBeNull();
	});
});

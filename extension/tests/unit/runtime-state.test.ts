import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeStateManager } from '../../src/background/runtime-state';
import {
	getRuntimeScopeId,
	SESSION_RUNTIME_SCOPES_KEY,
	SESSION_RUNTIME_TAB_SCOPES_KEY,
} from '../../src/types/runtime';
import { chromeMock } from '../mocks/chrome';

function buildScope(tabId: number, pageInstanceId: string, pageUrl: string) {
	return {
		tabId,
		pageInstanceId,
		pageUrl,
		scopeId: getRuntimeScopeId(tabId, pageInstanceId),
	};
}

describe('RuntimeStateManager', () => {
	let manager: RuntimeStateManager;

	beforeEach(() => {
		manager = new RuntimeStateManager();
	});

	it('persists only scoped runtime state for the active page scope', async () => {
		const scope = buildScope(7, 'page-1', 'https://www.coursera.org/learn/test');
		await manager.registerScope({
			tabId: scope.tabId,
			pageInstanceId: scope.pageInstanceId,
			pageUrl: scope.pageUrl,
			enabled: true,
		});

		await manager.beginRequest(scope, 'req-1');
		await manager.completeRequestSolve(scope, 'req-1', {
			provider: 'openrouter',
			model: 'openrouter/free',
			confidence: 0.91,
			tokensUsed: 42,
		});
		await manager.finalizeApply(scope, 'req-1', {
			appliedCount: 2,
			failedCount: 1,
		});

		const sessionStore = chromeMock.storage.session._getStore() as Record<string, unknown>;
		expect(sessionStore[SESSION_RUNTIME_TAB_SCOPES_KEY]).toEqual({
			'7': scope.scopeId,
		});
		expect(sessionStore[SESSION_RUNTIME_SCOPES_KEY]).toMatchObject({
			[scope.scopeId]: {
				status: 'active',
				provider: 'openrouter',
				model: 'openrouter/free',
				confidence: 0.91,
				solvedCount: 2,
				failedCount: 1,
				tokenCount: 42,
			},
		});
		expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '2' });
	});

	it('aborts active requests and ignores stale completion after cancellation', async () => {
		const scope = buildScope(7, 'page-1', 'https://www.coursera.org/learn/test');
		await manager.registerScope({
			tabId: scope.tabId,
			pageInstanceId: scope.pageInstanceId,
			pageUrl: scope.pageUrl,
			enabled: true,
		});

		const signal = await manager.beginRequest(scope, 'req-1');
		expect(signal).not.toBeNull();
		expect(signal?.aborted).toBe(false);

		await manager.cancelScope(scope.scopeId, 'idle');
		expect(signal?.aborted).toBe(true);
		expect(
			await manager.completeRequestSolve(scope, 'req-1', {
				provider: 'openrouter',
				model: 'openrouter/free',
				confidence: 0.5,
				tokensUsed: 5,
			}),
		).toBe(false);

		const state = await manager.getStateForScope(scope.scopeId);
		expect(state?.status).toBe('idle');
		expect(state?.currentRequestId).toBeNull();
	});

	it('replaces the previous scope when the same tab registers a new page instance', async () => {
		await manager.registerScope({
			tabId: 5,
			pageInstanceId: 'page-1',
			pageUrl: 'https://www.coursera.org/learn/old',
			enabled: true,
		});
		const nextState = await manager.registerScope({
			tabId: 5,
			pageInstanceId: 'page-2',
			pageUrl: 'https://www.coursera.org/learn/new',
			enabled: true,
		});

		expect(nextState.scopeId).toBe(getRuntimeScopeId(5, 'page-2'));
		expect(await manager.getStateForScope(getRuntimeScopeId(5, 'page-1'))).toBeNull();
		expect((await manager.getStateForTab(5))?.scopeId).toBe(getRuntimeScopeId(5, 'page-2'));
	});

	it('recovers stale processing state when apply outcome never arrives', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

		const scope = buildScope(7, 'page-1', 'https://www.coursera.org/learn/test');
		await manager.registerScope({
			tabId: scope.tabId,
			pageInstanceId: scope.pageInstanceId,
			pageUrl: scope.pageUrl,
			enabled: true,
		});

		await manager.beginRequest(scope, 'req-1');
		await manager.completeRequestSolve(scope, 'req-1', {
			provider: 'openrouter',
			model: 'openrouter/free',
			confidence: 0.82,
			tokensUsed: 12,
		});
		vi.setSystemTime(new Date('2026-03-10T12:01:01Z'));

		expect(await manager.recoverStaleProcessingScope(scope.scopeId)).toBe(true);

		const state = await manager.getStateForScope(scope.scopeId);
		expect(state?.status).toBe('error');
		expect(state?.lastError).toContain('Timed out waiting for the page');
		expect(state?.currentRequestId).toBeNull();
		expect(state?.failedCount).toBe(1);
		vi.useRealTimers();
	});

	it('removes the runtime scope when a tab is closed', async () => {
		const scope = buildScope(9, 'page-1', 'https://www.coursera.org/learn/test');
		await manager.registerScope({
			tabId: scope.tabId,
			pageInstanceId: scope.pageInstanceId,
			pageUrl: scope.pageUrl,
			enabled: true,
		});

		await manager.removeTabScope(scope.tabId);

		expect(await manager.getStateForTab(scope.tabId)).toBeNull();
		expect(await manager.getStateForScope(scope.scopeId)).toBeNull();
	});
});

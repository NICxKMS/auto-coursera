import { describe, expect, it, vi } from 'vitest';
import {
	createDefaultRuntimeState,
	getRuntimeScopeId,
	SESSION_RUNTIME_SCOPES_KEY,
	SESSION_RUNTIME_TAB_SCOPES_KEY,
} from '../../src/types/runtime';
import { getPopupRuntimeSnapshot } from '../../src/popup/popup';

function buildRuntimeState(
	tabId: number,
	pageInstanceId: string,
	overrides: Partial<ReturnType<typeof createDefaultRuntimeState>> = {},
) {
	const scopeId = getRuntimeScopeId(tabId, pageInstanceId);
	return {
		...createDefaultRuntimeState(
			{
				tabId,
				pageInstanceId,
				pageUrl: `https://www.coursera.org/learn/${pageInstanceId}`,
				scopeId,
			},
			'idle',
		),
		...overrides,
	};
}

describe('getPopupRuntimeSnapshot', () => {
	it('selects the scoped runtime state for the active tab', () => {
		const activeScopeId = getRuntimeScopeId(8, 'page-8');
		const sessionData = {
			[SESSION_RUNTIME_SCOPES_KEY]: {
				[getRuntimeScopeId(7, 'page-7')]: buildRuntimeState(7, 'page-7', {
					status: 'active',
					solvedCount: 9,
				}),
				[activeScopeId]: buildRuntimeState(8, 'page-8', {
					status: 'error',
					lastError: 'apply failed',
					solvedCount: 1,
					failedCount: 2,
					tokenCount: 21,
				}),
			},
			[SESSION_RUNTIME_TAB_SCOPES_KEY]: {
				'7': getRuntimeScopeId(7, 'page-7'),
				'8': activeScopeId,
			},
		};

		expect(getPopupRuntimeSnapshot(sessionData, 8, true)).toEqual({
			status: 'error',
			lastError: 'apply failed',
			solvedCount: 1,
			failedCount: 2,
			tokenCount: 21,
		});
	});

	it('downgrades stale active state to idle for popup rendering', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T12:05:00Z'));

		const scopeId = getRuntimeScopeId(9, 'page-9');
		const sessionData = {
			[SESSION_RUNTIME_SCOPES_KEY]: {
				[scopeId]: buildRuntimeState(9, 'page-9', {
					status: 'active',
					updatedAt: Date.now() - 61_000,
					solvedCount: 4,
				}),
			},
			[SESSION_RUNTIME_TAB_SCOPES_KEY]: {
				'9': scopeId,
			},
		};

		expect(getPopupRuntimeSnapshot(sessionData, 9, true)).toMatchObject({
			status: 'idle',
			solvedCount: 4,
		});

		vi.useRealTimers();
	});
});

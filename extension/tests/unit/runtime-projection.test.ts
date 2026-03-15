import { describe, expect, it, vi } from 'vitest';
import {
	projectRuntimeReadModel,
	RUNTIME_ACTIVE_STALE_MS,
	resolveRuntimeStateForScope,
} from '../../src/runtime/projection';
import { createDefaultRuntimeState, getRuntimeScopeId } from '../../src/types/runtime';

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

describe('projectRuntimeReadModel', () => {
	it('forces disabled status while preserving scoped runtime metrics', () => {
		const runtimeState = buildRuntimeState(7, 'page-1', {
			status: 'active',
			solvedCount: 3,
			failedCount: 1,
			tokenCount: 24,
		});

		expect(projectRuntimeReadModel({ enabled: false, runtimeState })).toMatchObject({
			isEnabled: false,
			status: 'disabled',
			solvedCount: 3,
			failedCount: 1,
			tokenCount: 24,
		});
	});

	it('downgrades stale active state to idle and flags the read-model as stale', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T12:05:00Z'));

		const runtimeState = buildRuntimeState(9, 'page-9', {
			status: 'active',
			updatedAt: Date.now() - (RUNTIME_ACTIVE_STALE_MS + 1),
			solvedCount: 4,
		});

		expect(projectRuntimeReadModel({ enabled: true, runtimeState })).toMatchObject({
			status: 'idle',
			isStale: true,
			solvedCount: 4,
		});

		vi.useRealTimers();
	});
});

describe('resolveRuntimeStateForScope', () => {
	it('selects the current page scope from a raw scope map', () => {
		const scopeId = getRuntimeScopeId(7, 'page-1');
		const runtimeState = buildRuntimeState(7, 'page-1', { status: 'processing' });

		expect(resolveRuntimeStateForScope({ [scopeId]: runtimeState }, scopeId)).toEqual(runtimeState);
		expect(resolveRuntimeStateForScope({ [scopeId]: runtimeState }, null)).toBeNull();
	});
});

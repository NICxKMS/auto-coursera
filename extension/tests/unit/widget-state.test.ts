import { beforeEach, describe, expect, it } from 'vitest';
import { getRuntimeScopeId, SESSION_RUNTIME_SCOPES_KEY } from '../../src/types/runtime';
import { WidgetStore } from '../../src/ui/widget-state';
import { chromeMock, resetChromeMock } from '../mocks/chrome';

function buildRuntimeState(overrides: Partial<Record<string, unknown>> = {}) {
	const scopeId = getRuntimeScopeId(7, 'page-1');
	return {
		tabId: 7,
		pageInstanceId: 'page-1',
		pageUrl: 'https://www.coursera.org/learn/test',
		scopeId,
		status: 'processing',
		provider: 'openrouter',
		model: 'openrouter/free',
		confidence: 0.92,
		lastError: '',
		solvedCount: 2,
		failedCount: 1,
		tokenCount: 33,
		processingCount: 1,
		currentRequestId: 'req-1',
		updatedAt: Date.now(),
		...overrides,
	};
}

describe('WidgetStore scoped runtime sync', () => {
	beforeEach(() => {
		resetChromeMock();
	});

	it('hydrates the widget from the current scoped runtime state', async () => {
		const scopeId = getRuntimeScopeId(7, 'page-1');
		chromeMock.storage.local._setStore({ enabled: true });
		chromeMock.storage.session._setStore({
			[SESSION_RUNTIME_SCOPES_KEY]: {
				[scopeId]: buildRuntimeState(),
			},
		});

		const store = new WidgetStore();
		store.setRuntimeScope({
			tabId: 7,
			pageInstanceId: 'page-1',
			pageUrl: 'https://www.coursera.org/learn/test',
			scopeId,
		});
		await store.syncFromStorage();

		expect(store.get()).toMatchObject({
			isEnabled: true,
			status: 'processing',
			provider: 'openrouter',
			model: 'openrouter/free',
			confidence: 0.92,
			solvedCount: 2,
			failedCount: 1,
			tokenCount: 33,
			processingCount: 1,
		});

		store.destroy();
	});

	it('reacts to scoped runtime storage changes for the active page scope', async () => {
		const scopeId = getRuntimeScopeId(7, 'page-1');
		chromeMock.storage.local._setStore({ enabled: true });

		const store = new WidgetStore();
		store.setRuntimeScope({
			tabId: 7,
			pageInstanceId: 'page-1',
			pageUrl: 'https://www.coursera.org/learn/test',
			scopeId,
		});
		await store.syncFromStorage();

		const storageListener = chromeMock.storage.onChanged.addListener.mock.calls[0]?.[0] as
			| ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
			| undefined;
		expect(storageListener).toBeTypeOf('function');

		storageListener?.(
			{
				[SESSION_RUNTIME_SCOPES_KEY]: {
					oldValue: {},
					newValue: {
						[scopeId]: buildRuntimeState({
							status: 'active',
							processingCount: 0,
							currentRequestId: null,
							lastError: 'ignored while active',
						}),
					},
				},
			},
			'session',
		);

		expect(store.get()).toMatchObject({
			status: 'active',
			solvedCount: 2,
			failedCount: 1,
			tokenCount: 33,
			processingCount: 0,
		});

		store.destroy();
	});
});

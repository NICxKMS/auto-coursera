// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { WidgetPanel } from '../../src/ui/widget-panel';
import type { WidgetStore } from '../../src/ui/widget-state';
import {
	type ContentBridge,
	DEFAULT_WIDGET_STATE,
	type WidgetState,
} from '../../src/ui/widget-types';
import { chromeMock, resetChromeMock } from '../mocks/chrome';

function createStore(stateOverrides: Partial<WidgetState> = {}): WidgetStore {
	const state: WidgetState = {
		...DEFAULT_WIDGET_STATE,
		...stateOverrides,
	};

	return {
		get(key?: keyof WidgetState) {
			return key ? state[key] : state;
		},
		subscribeMany() {
			return () => {};
		},
	} as unknown as WidgetStore;
}

function createBridge(): ContentBridge {
	return {
		scan() {},
		retry() {},
		refresh() {},
	};
}

async function flushAsyncWork(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('WidgetPanel onboarding', () => {
	beforeEach(() => {
		resetChromeMock();
		document.body.innerHTML = '';
	});

	it('shows onboarding when a stored API key blob cannot be decrypted', async () => {
		chromeMock.storage.local._setStore({
			openrouterApiKey: 'ENC:not-valid-base64!!!',
		});

		const panel = new WidgetPanel(createStore(), createBridge());
		document.body.appendChild(panel.getElement());

		await flushAsyncWork();

		const onboardingBanner = panel.getElement().querySelector('.ac-onboarding');
		expect(onboardingBanner).not.toBeNull();
		expect(onboardingBanner?.classList.contains('ac-hidden')).toBe(false);

		panel.destroy();
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
	buildLoadedSettingsView,
	buildProviderAvailability,
	buildSettingsSavePayload,
	buildTestConnectionSettings,
	createSettingsWorkflowController,
	loadSettingsView,
	normalizeTestConnectionResponse,
	resolveSettingsSnapshot,
	type SettingsFormSnapshot,
	testSettingsConnection,
} from '../../src/settings/domain';
import { DEFAULT_SETTINGS } from '../../src/types/settings';
import { chromeMock, resetChromeMock } from '../mocks/chrome';

function createSnapshot(overrides: Partial<SettingsFormSnapshot> = {}): SettingsFormSnapshot {
	return {
		keyInputs: {
			openrouter: { value: '', hasStoredValue: false },
			'nvidia-nim': { value: '', hasStoredValue: false },
			gemini: { value: '', hasStoredValue: false },
			groq: { value: '', hasStoredValue: false },
			cerebras: { value: '', hasStoredValue: false },
		},
		models: {
			openrouter: DEFAULT_SETTINGS.openrouterModel,
			'nvidia-nim': DEFAULT_SETTINGS.nvidiaModel,
			gemini: DEFAULT_SETTINGS.geminiModel,
			groq: DEFAULT_SETTINGS.groqModel,
			cerebras: DEFAULT_SETTINGS.cerebrasModel,
		},
		primaryProvider: 'openrouter',
		confidenceThreshold: DEFAULT_SETTINGS.confidenceThreshold,
		autoSelect: DEFAULT_SETTINGS.autoSelect,
		autoStartOnPageLoad: DEFAULT_SETTINGS.autoStartOnPageLoad,
		...overrides,
	};
}

describe('settings domain', () => {
	beforeEach(() => {
		resetChromeMock();
	});

	it('buildLoadedSettingsView masks stored keys and derives onboarding from configured keys', () => {
		const view = buildLoadedSettingsView({
			...DEFAULT_SETTINGS,
			openrouterApiKey: 'sk-or-secret-1234',
		});

		expect(view.keyPlaceholders.openrouter).toBe('••••••••••1234');
		expect(view.keyHasStoredValue.openrouter).toBe(true);
		expect(view.providers.openrouter.availability.isConfigured).toBe(true);
		expect(view.hasAvailableProvider).toBe(true);
		expect(view.availableProviders).toEqual(['openrouter']);
		expect(view.keyPlaceholders.gemini).toBe('AIza...');
		expect(view.onboardingComplete).toBe(true);
	});

	it('buildProviderAvailability marks configured and primary providers without taking runtime authority', () => {
		const availability = buildProviderAvailability(
			{
				openrouterApiKey: '',
				nvidiaApiKey: 'nvapi-123',
				geminiApiKey: '',
				groqApiKey: 'gsk_123',
				cerebrasApiKey: '',
			},
			'groq',
		);

		expect(availability.openrouter).toEqual({ isConfigured: false, isPrimary: false });
		expect(availability['nvidia-nim']).toEqual({ isConfigured: true, isPrimary: false });
		expect(availability.groq).toEqual({ isConfigured: true, isPrimary: true });
	});

	it('loadSettingsView treats corrupt encrypted stored keys as unconfigured for onboarding', async () => {
		chromeMock.storage.local._setStore({
			openrouterApiKey: 'ENC:not-valid-base64!!!',
		});

		const view = await loadSettingsView();

		expect(view.keyHasStoredValue.openrouter).toBe(false);
		expect(view.keyPlaceholders.openrouter).toBe('sk-or-...');
		expect(view.onboardingComplete).toBe(false);
	});

	it('buildSettingsSavePayload preserves untouched stored keys and clears intentionally removed keys', () => {
		const snapshot = createSnapshot({
			keyInputs: {
				openrouter: { value: '', hasStoredValue: true },
				'nvidia-nim': { value: '', hasStoredValue: false },
				gemini: { value: '', hasStoredValue: false },
				groq: { value: 'new-groq-key', hasStoredValue: false },
				cerebras: { value: '', hasStoredValue: false },
			},
			primaryProvider: 'groq',
			confidenceThreshold: 0.85,
			autoSelect: false,
			autoStartOnPageLoad: false,
		});

		const payload = buildSettingsSavePayload(snapshot, {
			...DEFAULT_SETTINGS,
			openrouterApiKey: 'stored-openrouter-key',
			geminiApiKey: 'stored-gemini-key',
		});

		expect(payload.openrouterApiKey).toBe('stored-openrouter-key');
		expect(payload.geminiApiKey).toBe('');
		expect(payload.groqApiKey).toBe('new-groq-key');
		expect(payload.primaryProvider).toBe('groq');
		expect(payload.confidenceThreshold).toBe(0.85);
		expect(payload.autoSelect).toBe(false);
		expect(payload.autoStartOnPageLoad).toBe(false);
	});

	it('buildTestConnectionSettings stages current provider, models, and resolved keys', () => {
		const snapshot = createSnapshot({
			keyInputs: {
				openrouter: { value: '', hasStoredValue: true },
				'nvidia-nim': { value: 'staged-nvidia-key', hasStoredValue: false },
				gemini: { value: '', hasStoredValue: false },
				groq: { value: '', hasStoredValue: false },
				cerebras: { value: '', hasStoredValue: false },
			},
			models: {
				openrouter: 'openrouter/free',
				'nvidia-nim': 'z-ai/glm5',
				gemini: DEFAULT_SETTINGS.geminiModel,
				groq: DEFAULT_SETTINGS.groqModel,
				cerebras: DEFAULT_SETTINGS.cerebrasModel,
			},
			primaryProvider: 'nvidia-nim',
		});

		const payload = buildTestConnectionSettings(snapshot, {
			...DEFAULT_SETTINGS,
			openrouterApiKey: 'stored-openrouter-key',
		});

		expect(payload.openrouterApiKey).toBe('stored-openrouter-key');
		expect(payload.nvidiaApiKey).toBe('staged-nvidia-key');
		expect(payload.primaryProvider).toBe('nvidia-nim');
		expect(payload.nvidiaModel).toBe('z-ai/glm5');
	});

	it('resolveSettingsSnapshot derives available providers from staged and persisted keys', () => {
		const resolved = resolveSettingsSnapshot(
			createSnapshot({
				keyInputs: {
					openrouter: { value: '', hasStoredValue: true },
					'nvidia-nim': { value: 'staged-nvidia-key', hasStoredValue: false },
					gemini: { value: '', hasStoredValue: false },
					groq: { value: '', hasStoredValue: false },
					cerebras: { value: '', hasStoredValue: false },
				},
				primaryProvider: 'nvidia-nim',
			}),
			{
				...DEFAULT_SETTINGS,
				openrouterApiKey: 'stored-openrouter-key',
			},
		);

		expect(resolved.resolvedApiKeys.openrouterApiKey).toBe('stored-openrouter-key');
		expect(resolved.resolvedApiKeys.nvidiaApiKey).toBe('staged-nvidia-key');
		expect(resolved.availableProviders).toEqual(['openrouter', 'nvidia-nim']);
		expect(resolved.hasAvailableProvider).toBe(true);
		expect(resolved.primaryProviderConfigured).toBe(true);
	});

	it('normalizeTestConnectionResponse formats successful and fallback responses', () => {
		expect(
			normalizeTestConnectionResponse({
				type: 'TEST_CONNECTION',
				payload: {
					success: true,
					provider: 'openrouter',
					model: 'openrouter/free',
					confidence: 0.91,
					message: 'Connection successful.',
				},
			}),
		).toEqual({
			type: 'success',
			message: '✅ openrouter (openrouter/free): Connected',
		});

		expect(
			normalizeTestConnectionResponse({
				type: 'ERROR',
				payload: { code: 'FAIL', message: 'Boom' },
			}),
		).toEqual({
			type: 'error',
			message: 'Boom',
		});
	});

	it('testSettingsConnection short-circuits when no keys are configured', async () => {
		const result = await testSettingsConnection(createSnapshot());

		expect(result).toEqual({
			type: 'error',
			message: '⏭️ No API keys configured',
		});
		expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
	});

	it('testSettingsConnection uses persisted untouched keys in staged payload', async () => {
		chromeMock.storage.local._setStore({
			openrouterApiKey: 'stored-openrouter-key',
		});
		chromeMock.runtime.sendMessage.mockResolvedValue({
			type: 'TEST_CONNECTION',
			payload: {
				success: true,
				provider: 'openrouter',
				model: 'openrouter/free',
				confidence: 0.9,
				message: 'Connection successful.',
			},
		});

		const result = await testSettingsConnection(
			createSnapshot({
				keyInputs: {
					openrouter: { value: '', hasStoredValue: true },
					'nvidia-nim': { value: '', hasStoredValue: false },
					gemini: { value: '', hasStoredValue: false },
					groq: { value: '', hasStoredValue: false },
					cerebras: { value: '', hasStoredValue: false },
				},
			}),
		);

		expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
			type: 'TEST_CONNECTION',
			payload: {
				settings: expect.objectContaining({
					openrouterApiKey: 'stored-openrouter-key',
					openrouterModel: DEFAULT_SETTINGS.openrouterModel,
					primaryProvider: 'openrouter',
				}),
			},
		});
		expect(result.type).toBe('success');
	});

	it('createSettingsWorkflowController shares load, save, and test orchestration for settings surfaces', async () => {
		const snapshot = createSnapshot({
			keyInputs: {
				openrouter: { value: 'typed-openrouter-key', hasStoredValue: false },
				'nvidia-nim': { value: '', hasStoredValue: false },
				gemini: { value: '', hasStoredValue: false },
				groq: { value: '', hasStoredValue: false },
				cerebras: { value: '', hasStoredValue: false },
			},
		});
		const appliedViews: ReturnType<typeof buildLoadedSettingsView>[] = [];
		const statuses: Array<{ message: string; type: 'success' | 'error' }> = [];
		const pendingTransitions: Array<[action: 'save' | 'test', pending: boolean]> = [];
		const pristineCalls: string[] = [];
		const errors: string[] = [];

		chromeMock.runtime.sendMessage.mockResolvedValue({
			type: 'TEST_CONNECTION',
			payload: {
				success: true,
				provider: 'openrouter',
				model: DEFAULT_SETTINGS.openrouterModel,
				confidence: 0.9,
				message: 'Connection successful.',
			},
		});

		const controller = createSettingsWorkflowController(
			{
				getSnapshot: () => snapshot,
				applyLoadedView: (view) => {
					appliedViews.push(view);
				},
				setActionPending: (action, pending) => {
					pendingTransitions.push([action, pending]);
				},
				showStatus: (result) => {
					statuses.push(result);
				},
				markPristine: () => {
					pristineCalls.push('called');
				},
			},
			{
				saveSuccess: 'Saved!',
				saveError: 'Save failed.',
				testError: 'Test failed.',
			},
			{
				onError: (action) => {
					errors.push(action);
				},
			},
		);

		await controller.load();
		const saveResult = await controller.save();
		const testResult = await controller.test();

		expect(appliedViews).toHaveLength(2);
		expect(saveResult.ok).toBe(true);
		expect(testResult).toEqual({
			type: 'success',
			message: '✅ openrouter (openrouter/free): Connected',
		});
		expect(statuses).toEqual([
			{ type: 'success', message: 'Saved!' },
			{ type: 'success', message: '✅ openrouter (openrouter/free): Connected' },
		]);
		expect(pristineCalls).toEqual(['called']);
		expect(pendingTransitions).toEqual([
			['save', true],
			['save', false],
			['test', true],
			['test', false],
		]);
		expect(errors).toEqual([]);
	});
});

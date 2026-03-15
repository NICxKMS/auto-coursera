import type { Message, TestConnectionResponsePayload } from '../types/messages';
import { isErrorMessage, isTestConnectionResponseMessage } from '../types/messages';
import type {
	AppSettings,
	ProviderApiKeyField,
	ProviderModelField,
	ProviderName,
} from '../types/settings';
import { API_KEY_FIELDS, PROVIDER_KEY_MAP, PROVIDER_NAMES } from '../types/settings';
import { getSettings, saveSettings } from '../utils/storage';

const GEMINI_MODELS = [
	'gemini-3-flash-preview',
	'gemini-3.1-flash-lite-preview',
	'gemini-2.5-flash-lite',
	'gemini-2.5-flash',
] as const;

const GROQ_MODELS = [
	'llama-3.3-70b-versatile',
	'llama-3.1-8b-instant',
	'mixtral-8x7b-32768',
	'gemma2-9b-it',
] as const;

const CEREBRAS_MODELS = ['llama-3.3-70b', 'llama-3.1-8b'] as const;

const KEY_MASK_PREFIX = '\u2022'.repeat(10);

export interface ModelOption {
	value: string;
	label: string;
}

export interface ModelGroup {
	label: string;
	options: readonly ModelOption[];
}

export type ProviderModelCatalog =
	| {
			kind: 'grouped';
			groups: readonly ModelGroup[];
	  }
	| {
			kind: 'flat';
			models: readonly string[];
	  };

export interface SettingsProviderDefinition {
	name: ProviderName;
	label: string;
	keyLabel: string;
	keyPlaceholder: string;
	modelLabel: string;
	catalog: ProviderModelCatalog;
}

const OPENROUTER_MODEL_GROUPS: readonly ModelGroup[] = [
	{
		label: '🆓 Free — Vision/Multimodal',
		options: [
			{ value: 'openrouter/free', label: 'Auto-Select Free OpenRouter Model' },
			{ value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B Vision (Free)' },
			{
				value: 'mistralai/mistral-small-3.1-24b-instruct:free',
				label: 'Mistral Small 3.1 24B Vision (Free)',
			},
			{
				value: 'nvidia/nemotron-nano-12b-v2-vl:free',
				label: 'Nemotron Nano 12B VL (Free)',
			},
			{ value: 'google/gemma-3-12b-it:free', label: 'Gemma 3 12B Vision (Free)' },
			{ value: 'google/gemma-3-4b-it:free', label: 'Gemma 3 4B Vision (Free)' },
		],
	},
	{
		label: '🆓 Free — Text (Strongest)',
		options: [
			{
				value: 'nousresearch/hermes-3-llama-3.1-405b:free',
				label: 'Hermes 3 Llama 405B (Free)',
			},
			{ value: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B (Free)' },
			{ value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
			{
				value: 'qwen/qwen3-next-80b-a3b-instruct:free',
				label: 'Qwen3 Next 80B MoE (Free)',
			},
			{ value: 'stepfun/step-3.5-flash:free', label: 'Step 3.5 Flash 196B (Free)' },
			{ value: 'z-ai/glm-4.5-air:free', label: 'GLM-4.5 Air (Free)' },
			{
				value: 'arcee-ai/trinity-large-preview:free',
				label: 'Trinity Large 400B MoE (Free)',
			},
		],
	},
	{
		label: '🆓 Free — Lightweight',
		options: [
			{ value: 'nvidia/nemotron-nano-9b-v2:free', label: 'Nemotron Nano 9B (Free)' },
			{ value: 'qwen/qwen3-4b:free', label: 'Qwen3 4B (Free)' },
			{ value: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (Free)' },
		],
	},
	{
		label: '💰 Paid (Better Quality)',
		options: [
			{ value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (Paid)' },
			{ value: 'openai/gpt-4o', label: 'GPT-4o (Paid)' },
			{ value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 (Paid)' },
		],
	},
];

const NVIDIA_MODEL_GROUPS: readonly ModelGroup[] = [
	{
		label: '⭐ Requested Models',
		options: [
			{ value: 'z-ai/glm5', label: 'GLM-5 (Z.ai Flagship)' },
			{ value: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5 (Multimodal)' },
		],
	},
	{
		label: '🔭 Vision Models',
		options: [
			{ value: 'meta/llama-3.2-90b-vision-instruct', label: 'Llama 3.2 90B Vision' },
			{ value: 'meta/llama-3.2-11b-vision-instruct', label: 'Llama 3.2 11B Vision' },
			{ value: 'nvidia/nemotron-nano-12b-v2-vl', label: 'Nemotron Nano 12B VL' },
			{ value: 'microsoft/phi-4-multimodal-instruct', label: 'Phi-4 Multimodal' },
			{ value: 'nvidia/llama-3.2-nv-vision-instruct', label: 'Llama 3.2 NV Vision' },
		],
	},
	{
		label: '📝 Text Models',
		options: [
			{ value: 'z-ai/glm4.7', label: 'GLM-4.7 (Agentic)' },
			{ value: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 Instruct' },
			{ value: 'moonshotai/kimi-k2-thinking', label: 'Kimi K2 Thinking' },
			{ value: 'deepseek-ai/deepseek-v3.2', label: 'DeepSeek V3.2' },
			{ value: 'qwen/qwen3.5-397b-a17b', label: 'Qwen 3.5 397B MoE' },
			{
				value: 'meta/llama-4-maverick-17b-128e-instruct',
				label: 'Llama 4 Maverick',
			},
			{ value: 'stepfun-ai/step-3.5-flash', label: 'Step 3.5 Flash' },
		],
	},
];

export const SETTINGS_PROVIDERS = [
	{
		name: 'openrouter',
		label: 'OpenRouter',
		keyLabel: 'OpenRouter API Key',
		keyPlaceholder: 'sk-or-...',
		modelLabel: 'OpenRouter Model',
		catalog: { kind: 'grouped', groups: OPENROUTER_MODEL_GROUPS },
	},
	{
		name: 'nvidia-nim',
		label: 'NVIDIA NIM',
		keyLabel: 'NVIDIA NIM API Key',
		keyPlaceholder: 'nvapi-...',
		modelLabel: 'NVIDIA NIM Model',
		catalog: { kind: 'grouped', groups: NVIDIA_MODEL_GROUPS },
	},
	{
		name: 'gemini',
		label: 'Google Gemini',
		keyLabel: 'Google Gemini API Key',
		keyPlaceholder: 'AIza...',
		modelLabel: 'Google Gemini Model',
		catalog: { kind: 'flat', models: GEMINI_MODELS },
	},
	{
		name: 'groq',
		label: 'Groq',
		keyLabel: 'Groq API Key',
		keyPlaceholder: 'gsk_...',
		modelLabel: 'Groq Model',
		catalog: { kind: 'flat', models: GROQ_MODELS },
	},
	{
		name: 'cerebras',
		label: 'Cerebras',
		keyLabel: 'Cerebras API Key',
		keyPlaceholder: 'cbs-...',
		modelLabel: 'Cerebras Model',
		catalog: { kind: 'flat', models: CEREBRAS_MODELS },
	},
] as const satisfies readonly SettingsProviderDefinition[];

export const SETTINGS_PROVIDER_MAP = Object.fromEntries(
	SETTINGS_PROVIDERS.map((provider) => [provider.name, provider]),
) as Record<ProviderName, SettingsProviderDefinition>;

export interface StagedKeyInput {
	value: string;
	hasStoredValue: boolean;
}

export interface ProviderAvailability {
	isConfigured: boolean;
	isPrimary: boolean;
}

export interface LoadedSettingsProviderView {
	keyPlaceholder: string;
	hasStoredKey: boolean;
	model: string;
	availability: ProviderAvailability;
}

export interface SettingsFormSnapshot {
	keyInputs: Record<ProviderName, StagedKeyInput>;
	models: Record<ProviderName, string>;
	primaryProvider: ProviderName;
	confidenceThreshold: number;
	autoSelect: boolean;
	autoStartOnPageLoad: boolean;
}

export interface LoadedSettingsView {
	settings: AppSettings;
	providers: Record<ProviderName, LoadedSettingsProviderView>;
	keyPlaceholders: Record<ProviderName, string>;
	keyHasStoredValue: Record<ProviderName, boolean>;
	models: Record<ProviderName, string>;
	primaryProvider: ProviderName;
	confidenceThreshold: number;
	autoSelect: boolean;
	autoStartOnPageLoad: boolean;
	onboardingComplete: boolean;
	hasAvailableProvider: boolean;
	primaryProviderConfigured: boolean;
	availableProviders: ProviderName[];
}

export interface SettingsStatusResult {
	message: string;
	type: 'success' | 'error';
}

export interface ResolvedSettingsSnapshot {
	resolvedApiKeys: Pick<AppSettings, ProviderApiKeyField>;
	providerAvailability: Record<ProviderName, ProviderAvailability>;
	hasAvailableProvider: boolean;
	primaryProviderConfigured: boolean;
	availableProviders: ProviderName[];
}

export type SettingsWorkflowAction = 'load' | 'save' | 'test';

export interface SettingsWorkflowHost {
	getSnapshot(): SettingsFormSnapshot;
	applyLoadedView(view: LoadedSettingsView): void;
	setActionPending(action: Exclude<SettingsWorkflowAction, 'load'>, pending: boolean): void;
	showStatus(result: SettingsStatusResult): void;
	markPristine?(): void;
}

export interface SettingsWorkflowMessages {
	saveSuccess: string;
	saveError: string;
	testError: string;
}

export interface SettingsWorkflowHooks {
	onError?(action: SettingsWorkflowAction, error: unknown): void;
}

export type SettingsSaveResult =
	| { ok: true; view: LoadedSettingsView }
	| { ok: false; error: unknown };

export interface SettingsWorkflowController {
	load(): Promise<LoadedSettingsView>;
	save(): Promise<SettingsSaveResult>;
	test(): Promise<SettingsStatusResult>;
}

function toProviderRecord<T>(
	builder: (provider: SettingsProviderDefinition) => T,
): Record<ProviderName, T> {
	return Object.fromEntries(
		SETTINGS_PROVIDERS.map((provider) => [provider.name, builder(provider)]),
	) as Record<ProviderName, T>;
}

function getProviderApiKey(settings: AppSettings, providerName: ProviderName): string {
	const keyField = PROVIDER_KEY_MAP[providerName].apiKey;
	return settings[keyField];
}

function getProviderModel(settings: AppSettings, providerName: ProviderName): string {
	const modelField = PROVIDER_KEY_MAP[providerName].model;
	return settings[modelField];
}

function buildModelPayload(
	models: Record<ProviderName, string>,
): Pick<AppSettings, ProviderModelField> {
	return Object.fromEntries(
		PROVIDER_NAMES.map((providerName) => [
			PROVIDER_KEY_MAP[providerName].model,
			models[providerName],
		]),
	) as Pick<AppSettings, ProviderModelField>;
}

function resolveStagedKeyValue(staged: StagedKeyInput, persistedValue: string): string {
	const typedValue = staged.value.trim();
	if (typedValue) {
		return typedValue;
	}

	return staged.hasStoredValue ? persistedValue : '';
}

export function getMaskedKeyPlaceholder(key: string, fallback: string): string {
	return key ? `${KEY_MASK_PREFIX}${key.slice(-4)}` : fallback;
}

export function hasAnyConfiguredApiKey(
	source: Partial<Record<ProviderApiKeyField, string | undefined | null>>,
): boolean {
	return API_KEY_FIELDS.some((field) => {
		const value = source[field];
		return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
	});
}

export function isOnboardingComplete(
	source: Partial<Record<ProviderApiKeyField, string | undefined | null>>,
): boolean {
	return hasAnyConfiguredApiKey(source);
}

export function shouldShowSettingsOnboarding(
	source: Partial<Record<ProviderApiKeyField, string | undefined | null>>,
): boolean {
	return !isOnboardingComplete(source);
}

export function buildProviderAvailability(
	source: Partial<Record<ProviderApiKeyField, string | undefined | null>>,
	primaryProvider: ProviderName,
): Record<ProviderName, ProviderAvailability> {
	return toProviderRecord((provider) => {
		const keyField = PROVIDER_KEY_MAP[provider.name].apiKey;
		const keyValue = source[keyField];
		return {
			isConfigured: typeof keyValue === 'string' ? keyValue.trim().length > 0 : Boolean(keyValue),
			isPrimary: provider.name === primaryProvider,
		};
	});
}

export function resolveSettingsSnapshot(
	snapshot: Pick<SettingsFormSnapshot, 'keyInputs' | 'primaryProvider'>,
	persistedSettings: AppSettings,
): ResolvedSettingsSnapshot {
	const resolvedApiKeys = Object.fromEntries(
		PROVIDER_NAMES.map((providerName) => {
			const keyField = PROVIDER_KEY_MAP[providerName].apiKey;
			return [
				keyField,
				resolveStagedKeyValue(snapshot.keyInputs[providerName], persistedSettings[keyField]),
			];
		}),
	) as Pick<AppSettings, ProviderApiKeyField>;

	const providerAvailability = buildProviderAvailability(resolvedApiKeys, snapshot.primaryProvider);
	const availableProviders = PROVIDER_NAMES.filter(
		(providerName) => providerAvailability[providerName].isConfigured,
	);

	return {
		resolvedApiKeys,
		providerAvailability,
		hasAvailableProvider: availableProviders.length > 0,
		primaryProviderConfigured: providerAvailability[snapshot.primaryProvider].isConfigured,
		availableProviders,
	};
}

export function buildLoadedSettingsView(settings: AppSettings): LoadedSettingsView {
	const providerAvailability = buildProviderAvailability(settings, settings.primaryProvider);
	const availableProviders = PROVIDER_NAMES.filter(
		(providerName) => providerAvailability[providerName].isConfigured,
	);

	return {
		settings,
		providers: toProviderRecord((provider) => ({
			keyPlaceholder: getMaskedKeyPlaceholder(
				getProviderApiKey(settings, provider.name),
				provider.keyPlaceholder,
			),
			hasStoredKey: Boolean(getProviderApiKey(settings, provider.name)),
			model: getProviderModel(settings, provider.name),
			availability: providerAvailability[provider.name],
		})),
		keyPlaceholders: toProviderRecord((provider) =>
			getMaskedKeyPlaceholder(getProviderApiKey(settings, provider.name), provider.keyPlaceholder),
		),
		keyHasStoredValue: toProviderRecord((provider) =>
			Boolean(getProviderApiKey(settings, provider.name)),
		),
		models: toProviderRecord((provider) => getProviderModel(settings, provider.name)),
		primaryProvider: settings.primaryProvider,
		confidenceThreshold: settings.confidenceThreshold,
		autoSelect: settings.autoSelect,
		autoStartOnPageLoad: settings.autoStartOnPageLoad,
		onboardingComplete: availableProviders.length > 0,
		hasAvailableProvider: availableProviders.length > 0,
		primaryProviderConfigured: providerAvailability[settings.primaryProvider].isConfigured,
		availableProviders,
	};
}

export async function loadSettingsView(): Promise<LoadedSettingsView> {
	const settings = await getSettings();
	return buildLoadedSettingsView(settings);
}

export function resolveStagedApiKeys(
	snapshot: Pick<SettingsFormSnapshot, 'keyInputs'>,
	persistedSettings: AppSettings,
): Pick<AppSettings, ProviderApiKeyField> {
	return resolveSettingsSnapshot(
		{ keyInputs: snapshot.keyInputs, primaryProvider: persistedSettings.primaryProvider },
		persistedSettings,
	).resolvedApiKeys;
}

export function buildSettingsSavePayload(
	snapshot: SettingsFormSnapshot,
	persistedSettings: AppSettings,
): Partial<AppSettings> {
	const resolved = resolveSettingsSnapshot(snapshot, persistedSettings);

	return {
		...resolved.resolvedApiKeys,
		...buildModelPayload(snapshot.models),
		primaryProvider: snapshot.primaryProvider,
		confidenceThreshold: snapshot.confidenceThreshold,
		autoSelect: snapshot.autoSelect,
		autoStartOnPageLoad: snapshot.autoStartOnPageLoad,
	};
}

export function buildTestConnectionSettings(
	snapshot: SettingsFormSnapshot,
	persistedSettings: AppSettings,
): Partial<AppSettings> {
	const resolved = resolveSettingsSnapshot(snapshot, persistedSettings);

	return {
		...resolved.resolvedApiKeys,
		...buildModelPayload(snapshot.models),
		primaryProvider: snapshot.primaryProvider,
	};
}

export async function saveSettingsFromSnapshot(
	snapshot: SettingsFormSnapshot,
): Promise<LoadedSettingsView> {
	const persistedSettings = await getSettings();
	await saveSettings(buildSettingsSavePayload(snapshot, persistedSettings));
	return loadSettingsView();
}

export function normalizeTestConnectionResponse(
	response: Message | undefined,
): SettingsStatusResult {
	if (isTestConnectionResponseMessage(response)) {
		const payload: TestConnectionResponsePayload = response.payload;
		return {
			type: payload.success ? 'success' : 'error',
			message: payload.success
				? `✅ ${payload.provider} (${payload.model}): Connected`
				: `⚠️ ${payload.provider} (${payload.model}): ${payload.message}`,
		};
	}

	const errorMessage = isErrorMessage(response)
		? response.payload.message
		: 'Test connection failed.';
	return {
		type: 'error',
		message: errorMessage,
	};
}

export async function testSettingsConnection(
	snapshot: SettingsFormSnapshot,
): Promise<SettingsStatusResult> {
	const persistedSettings = await getSettings();
	const resolved = resolveSettingsSnapshot(snapshot, persistedSettings);
	const stagedSettings = buildTestConnectionSettings(snapshot, persistedSettings);

	if (!resolved.hasAvailableProvider) {
		return {
			type: 'error',
			message: '⏭️ No API keys configured',
		};
	}

	const response = (await chrome.runtime.sendMessage({
		type: 'TEST_CONNECTION',
		payload: { settings: stagedSettings },
	})) as Message | undefined;

	return normalizeTestConnectionResponse(response);
}

export function createSettingsWorkflowController(
	host: SettingsWorkflowHost,
	messages: SettingsWorkflowMessages,
	hooks: SettingsWorkflowHooks = {},
): SettingsWorkflowController {
	return {
		async load() {
			try {
				const view = await loadSettingsView();
				host.applyLoadedView(view);
				return view;
			} catch (error) {
				hooks.onError?.('load', error);
				throw error;
			}
		},
		async save() {
			host.setActionPending('save', true);
			try {
				const view = await saveSettingsFromSnapshot(host.getSnapshot());
				host.applyLoadedView(view);
				host.markPristine?.();
				host.showStatus({ type: 'success', message: messages.saveSuccess });
				return { ok: true, view };
			} catch (error) {
				host.showStatus({ type: 'error', message: messages.saveError });
				hooks.onError?.('save', error);
				return { ok: false, error };
			} finally {
				host.setActionPending('save', false);
			}
		},
		async test() {
			host.setActionPending('test', true);
			try {
				const result = await testSettingsConnection(host.getSnapshot());
				host.showStatus(result);
				return result;
			} catch (error) {
				const result = {
					type: 'error',
					message: messages.testError,
				} satisfies SettingsStatusResult;
				host.showStatus(result);
				hooks.onError?.('test', error);
				return result;
			} finally {
				host.setActionPending('test', false);
			}
		},
	};
}

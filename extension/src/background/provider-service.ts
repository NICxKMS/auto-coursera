import { AIProviderManager } from '../services/ai-provider';
import { OpenRouterProvider } from '../services/openrouter';
import { ConfigurableProvider, PROVIDER_CONFIGS } from '../services/provider-registry';
import type { AIBatchRequest, IAIProvider } from '../types/api';
import type { AppSettings, ProviderName } from '../types/settings';
import { PROVIDER_KEY_MAP, PROVIDER_NAMES } from '../types/settings';
import type { Logger } from '../utils/logger';
import { RateLimiter } from '../utils/rate-limiter';
import { getSettings } from '../utils/storage';

/** Create a provider instance by name — OpenRouter keeps its own class. */
function createProvider(
	name: ProviderName,
	apiKey: string,
	model: string,
	rateLimiter: RateLimiter,
): IAIProvider {
	if (name === 'openrouter') {
		return new OpenRouterProvider(apiKey, model, rateLimiter);
	}
	const config = PROVIDER_CONFIGS[name];
	if (!config) {
		throw new Error(`Unknown configurable provider: ${name}`);
	}
	return new ConfigurableProvider(config, apiKey, model, rateLimiter);
}

export const PROVIDER_SETTINGS_KEYS = [
	...new Set(
		PROVIDER_NAMES.flatMap((name) => {
			const { apiKey, model } = PROVIDER_KEY_MAP[name];
			return [apiKey, model];
		}),
	),
	'primaryProvider',
	'rateLimitRpm',
] as const satisfies ReadonlyArray<keyof AppSettings>;

export function getPrimaryProviderModel(settings: AppSettings): string {
	const modelKey = PROVIDER_KEY_MAP[settings.primaryProvider].model;
	return settings[modelKey] as string;
}

export function createProviderManager(settings: AppSettings): AIProviderManager {
	const manager = new AIProviderManager();
	for (const name of PROVIDER_NAMES) {
		const { apiKey: apiKeyField, model: modelField } = PROVIDER_KEY_MAP[name];
		const apiKey = settings[apiKeyField] as string;
		if (apiKey) {
			manager.register(
				createProvider(
					name,
					apiKey,
					settings[modelField] as string,
					new RateLimiter(settings.rateLimitRpm),
				),
			);
		}
	}
	manager.setPrimary(settings.primaryProvider);
	return manager;
}

export class ProviderService {
	private providerManager = new AIProviderManager();
	private providersReady = false;
	private providerReadyPromise: Promise<void>;

	constructor(private readonly logger: Logger) {
		this.providerReadyPromise = getSettings()
			.then((settings) => this.initialize(settings))
			.catch((error) => {
				this.logger.error('Provider init failed', error);
				this.providersReady = true;
			});
	}

	async ensureConfigured(): Promise<string | null> {
		if (!this.providersReady) {
			await this.providerReadyPromise;
		}

		if (this.providerManager.getProviderCount() === 0) {
			return 'No AI providers configured. Please add API keys in settings.';
		}

		return null;
	}

	async reloadFromStorage(): Promise<void> {
		this.providersReady = false;
		this.providerReadyPromise = getSettings().then((settings) => this.initialize(settings));
		await this.providerReadyPromise;
	}

	async createTestContext(
		stagedSettings: Partial<AppSettings>,
	): Promise<{ manager: AIProviderManager; settings: AppSettings }> {
		const baseSettings = await getSettings();
		const settings: AppSettings = {
			...baseSettings,
			...stagedSettings,
		};

		return {
			manager: createProviderManager(settings),
			settings,
		};
	}

	async solveBatch(request: AIBatchRequest) {
		return this.providerManager.solveBatch(request);
	}

	async resetForTests(): Promise<void> {
		this.providerManager = new AIProviderManager();
		this.providersReady = true;
		this.providerReadyPromise = Promise.resolve();
	}

	private async initialize(settings: AppSettings): Promise<void> {
		this.providerManager = createProviderManager(settings);
		this.providersReady = true;
		this.logger.info(
			`Providers initialized: ${this.providerManager.getProviderNames().join(', ')}`,
		);
	}
}

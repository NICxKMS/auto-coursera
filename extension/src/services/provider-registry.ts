/**
 * Config-driven provider registry for OpenAI-compatible AI providers.
 *
 * Replaces per-provider subclasses (Cerebras, Gemini, Groq, NVIDIA NIM)
 * with a single {@link ConfigurableProvider} driven by a static config map.
 * Providers with custom protocol logic (e.g. OpenRouter) keep their own class.
 */

import { DEFAULT_SETTINGS } from '../types/settings';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';
import { API_URLS, CEREBRAS_API_URL, GEMINI_API_URL, GROQ_API_URL } from './constants';

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

/** Static configuration for an OpenAI-compatible provider. */
export interface ProviderConfig {
	/** Unique provider identifier (matches {@link ProviderName}). */
	readonly name: string;
	/** Human-readable name used in logs and error messages. */
	readonly displayName: string;
	/** Full chat/completions endpoint URL. */
	readonly endpoint: string;
	/** Whether the provider accepts image content parts. */
	readonly supportsVision: boolean;
	/** Fallback model when none is supplied by the user. */
	readonly defaultModel?: string;
	/** Request timeout override (ms). Omit to use the base-class default. */
	readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Provider configurations keyed by provider name. */
export const PROVIDER_CONFIGS: Readonly<Record<string, ProviderConfig>> = {
	cerebras: {
		name: 'cerebras',
		displayName: 'Cerebras',
		endpoint: CEREBRAS_API_URL,
		supportsVision: false,
	},
	gemini: {
		name: 'gemini',
		displayName: 'Gemini',
		endpoint: GEMINI_API_URL,
		supportsVision: true,
	},
	groq: {
		name: 'groq',
		displayName: 'Groq',
		endpoint: GROQ_API_URL,
		supportsVision: false,
	},
	'nvidia-nim': {
		name: 'nvidia-nim',
		displayName: 'NVIDIA NIM',
		endpoint: `${API_URLS.NVIDIA_NIM}/chat/completions`,
		supportsVision: true,
		defaultModel: DEFAULT_SETTINGS.nvidiaModel,
	},
};

// ---------------------------------------------------------------------------
// Generic provider class
// ---------------------------------------------------------------------------

/**
 * A single concrete provider class driven entirely by {@link ProviderConfig}.
 * Inherits all retry / circuit-breaker / rate-limiter logic from
 * {@link BaseAIProvider} and adds no custom protocol behaviour.
 */
export class ConfigurableProvider extends BaseAIProvider {
	readonly name: string;
	readonly supportsVision: boolean;

	constructor(config: ProviderConfig, apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(
			apiKey,
			model || config.defaultModel || '',
			rateLimiter,
			`${config.displayName}Provider`,
			config.timeoutMs,
		);
		this.name = config.name;
		this.supportsVision = config.supportsVision;
		this.apiUrl = config.endpoint;
		this.displayName = config.displayName;
	}
}

/**
 * Create a {@link ConfigurableProvider} by provider name.
 *
 * @throws {Error} if the name is not found in {@link PROVIDER_CONFIGS}.
 */
export function createConfiguredProvider(
	providerName: string,
	apiKey: string,
	model: string,
	rateLimiter: RateLimiter,
): ConfigurableProvider {
	const config = PROVIDER_CONFIGS[providerName];
	if (!config) {
		throw new Error(
			`Unknown provider: ${providerName}. Known: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`,
		);
	}
	return new ConfigurableProvider(config, apiKey, model, rateLimiter);
}

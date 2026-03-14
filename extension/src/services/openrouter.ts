/**
 * OpenRouter AI provider — chat/completions with vision support.
 */

import type { APICompletionResponse, ChatMessage } from '../types/api';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';
import { AI_MAX_TOKENS, AI_TEMPERATURE, AI_TOP_P, API_URLS, OPENROUTER_HEADERS } from './constants';

export class OpenRouterProvider extends BaseAIProvider {
	readonly name = 'openrouter';
	readonly supportsVision = true;
	protected apiUrl = `${API_URLS.OPENROUTER}/chat/completions`;
	protected displayName = 'OpenRouter';

	constructor(apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(apiKey, model, rateLimiter, 'OpenRouterProvider');
	}

	/**
	 * Use json_schema mode for OpenRouter — enforces exact schema on output.
	 */
	protected override getResponseFormat(schema: {
		name: string;
		strict: boolean;
		schema: Record<string, unknown>;
	}): Record<string, unknown> {
		return {
			type: 'json_schema',
			json_schema: schema,
		};
	}

	/**
	 * Call OpenRouter API with exponential backoff retry.
	 */
	protected async callAPI(
		messages: ChatMessage[],
		maxTokens: number = AI_MAX_TOKENS,
		responseFormat?: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<APICompletionResponse> {
		return this.fetchWithRetry(
			this.apiUrl,
			{
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer':
					typeof chrome !== 'undefined' && chrome.runtime?.getURL
						? chrome.runtime.getURL('')
						: OPENROUTER_HEADERS.HTTP_REFERER,
				'X-Title': OPENROUTER_HEADERS.X_TITLE,
			},
			{
				model: this.model,
				messages,
				temperature: AI_TEMPERATURE,
				max_tokens: maxTokens,
				top_p: AI_TOP_P,
				...(responseFormat && { response_format: responseFormat }),
				plugins: [{ id: 'response-healing' }],
			},
			'OpenRouter',
			undefined,
			signal,
		);
	}
}

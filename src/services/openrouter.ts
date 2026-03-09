/**
 * OpenRouter AI provider — chat/completions with vision support.
 * REQ: REQ-006
 */

import type { APICompletionResponse, ChatMessage } from '../types/api';
import { AI_MAX_TOKENS, AI_TEMPERATURE, API_URLS, OPENROUTER_HEADERS } from '../utils/constants';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';

export class OpenRouterProvider extends BaseAIProvider {
	readonly name = 'openrouter';
	readonly supportsVision = true;

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
	 * AC-006.1: Authorization, HTTP-Referer, X-Title headers
	 * AC-006.2: temperature 0.1
	 * AC-008.1: Retry with exponential backoff on 429/5xx
	 */
	protected async callAPI(
		messages: ChatMessage[],
		maxTokens: number = AI_MAX_TOKENS,
		responseFormat?: Record<string, unknown>,
	): Promise<APICompletionResponse> {
		return this.fetchWithRetry(
			`${API_URLS.OPENROUTER}/chat/completions`,
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
				top_p: 0.95,
				...(responseFormat && { response_format: responseFormat }),
				plugins: [{ id: 'response-healing' }],
			},
			'OpenRouter',
		);
	}
}

/**
 * Google Gemini AI provider — OpenAI-compatible chat/completions with vision support.
 */

import { GEMINI_API_URL } from '../utils/constants';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';

export class GeminiProvider extends BaseAIProvider {
	readonly name = 'gemini';
	readonly supportsVision = true;
	protected apiUrl = GEMINI_API_URL;
	protected displayName = 'Gemini';

	constructor(apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(apiKey, model, rateLimiter, 'GeminiProvider');
	}
}

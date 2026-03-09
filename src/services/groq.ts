/**
 * Groq AI provider — OpenAI-compatible chat/completions.
 */

import { GROQ_API_URL } from '../utils/constants';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';

export class GroqProvider extends BaseAIProvider {
	readonly name = 'groq';
	readonly supportsVision = false;
	protected apiUrl = GROQ_API_URL;
	protected displayName = 'Groq';

	constructor(apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(apiKey, model, rateLimiter, 'GroqProvider');
	}
}

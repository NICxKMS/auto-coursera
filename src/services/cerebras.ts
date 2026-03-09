/**
 * Cerebras AI provider — OpenAI-compatible chat/completions.
 */

import { CEREBRAS_API_URL } from '../utils/constants';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';

export class CerebrasProvider extends BaseAIProvider {
	readonly name = 'cerebras';
	readonly supportsVision = false;
	protected apiUrl = CEREBRAS_API_URL;
	protected displayName = 'Cerebras';

	constructor(apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(apiKey, model, rateLimiter, 'CerebrasProvider');
	}
}

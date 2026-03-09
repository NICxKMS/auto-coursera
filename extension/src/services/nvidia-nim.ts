/**
 * NVIDIA NIM AI provider — OpenAI-compatible chat/completions with vision.
 * REQ: REQ-007
 */

import { DEFAULT_SETTINGS } from '../types/settings';
import { API_URLS, NVIDIA_NIM_TIMEOUT_MS } from '../utils/constants';
import type { RateLimiter } from '../utils/rate-limiter';
import { BaseAIProvider } from './base-provider';

export class NvidiaNimProvider extends BaseAIProvider {
	readonly name = 'nvidia-nim';
	readonly supportsVision = true;
	protected apiUrl = `${API_URLS.NVIDIA_NIM}/chat/completions`;
	protected displayName = 'NVIDIA NIM';

	constructor(apiKey: string, model: string, rateLimiter: RateLimiter) {
		super(
			apiKey,
			model || DEFAULT_SETTINGS.nvidiaModel,
			rateLimiter,
			'NvidiaNimProvider',
			NVIDIA_NIM_TIMEOUT_MS,
		);
	}
}

/**
 * Abstract base class for OpenAI-compatible AI providers.
 * Extracts shared logic: message building, response parsing, solve/solveBatch flow.
 */

import type {
	AIBatchRequest,
	AIBatchResponse,
	AIRequest,
	AIResponse,
	APICompletionResponse,
	ChatMessage,
	ContentPart,
	IAIProvider,
} from '../types/api';
import {
	AI_MAX_TOKENS,
	AI_TEMPERATURE,
	AI_TOP_P,
	DEFAULT_REQUEST_TIMEOUT_MS,
	ERROR_CODES,
	MAX_RETRIES,
	RETRY_BACKOFF_BASE_MS,
	RETRY_JITTER_MS,
} from '../utils/constants';
import { Logger } from '../utils/logger';
import type { RateLimiter } from '../utils/rate-limiter';
import {
	BATCH_SYSTEM_PROMPT,
	buildBatchPrompt,
	buildPrompt,
	formatBatchQuestion,
	SYSTEM_PROMPT,
} from './prompt-engine';
import { parseAIResponse, parseBatchAIResponse } from './response-parser';

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === 'AbortError'
		: error instanceof Error && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error(ERROR_CODES.REQUEST_CANCELLED);
	}
}

function attachAbortSignal(
	externalSignal: AbortSignal | undefined,
	controller: AbortController,
): () => void {
	if (!externalSignal) return () => {};

	if (externalSignal.aborted) {
		controller.abort();
		return () => {};
	}

	const onAbort = () => controller.abort();
	externalSignal.addEventListener('abort', onAbort, { once: true });
	return () => externalSignal.removeEventListener('abort', onAbort);
}

async function delayWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
		return;
	}

	throwIfAborted(signal);

	await new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, delayMs);

		const onAbort = () => {
			clearTimeout(timeoutId);
			signal.removeEventListener('abort', onAbort);
			reject(new Error(ERROR_CODES.REQUEST_CANCELLED));
		};

		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/** JSON Schema for single question solve — enforces structured AI output */
export const SINGLE_ANSWER_SCHEMA = {
	name: 'quiz_answer',
	strict: true,
	schema: {
		type: 'object',
		properties: {
			answer: {
				type: 'array',
				items: { type: 'integer' },
				description: 'Zero-based indices of correct options',
			},
			confidence: {
				type: 'number',
				description: 'Confidence score between 0 and 1',
			},
			reasoning: {
				type: 'string',
				description: 'Brief explanation for the answer',
			},
		},
		required: ['answer', 'confidence', 'reasoning'],
		additionalProperties: false,
	},
};

/** JSON Schema for batch question solve — wraps answers in an object */
export const BATCH_ANSWER_SCHEMA = {
	name: 'quiz_answers_batch',
	strict: true,
	schema: {
		type: 'object',
		properties: {
			answers: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						uid: { type: 'string' },
						answer: { type: 'array', items: { type: 'string' } },
						confidence: { type: 'number' },
						reasoning: { type: 'string' },
					},
					required: ['uid', 'answer', 'confidence', 'reasoning'],
					additionalProperties: false,
				},
			},
		},
		required: ['answers'],
		additionalProperties: false,
	},
};

export abstract class BaseAIProvider implements IAIProvider {
	abstract readonly name: string;
	abstract readonly supportsVision: boolean;

	protected readonly apiKey: string;
	protected readonly model: string;
	protected readonly rateLimiter: RateLimiter;
	protected readonly logger: Logger;
	protected readonly timeoutMs: number;
	protected apiUrl = '';
	protected displayName = '';

	constructor(
		apiKey: string,
		model: string,
		rateLimiter: RateLimiter,
		loggerName: string,
		timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
	) {
		this.apiKey = apiKey;
		this.model = model;
		this.rateLimiter = rateLimiter;
		this.logger = new Logger(loggerName);
		this.timeoutMs = timeoutMs;
	}

	async isAvailable(): Promise<boolean> {
		return !!this.apiKey && this.rateLimiter.canProceed();
	}

	/**
	 * Standard OpenAI-compatible API call. Subclasses with
	 * custom headers/body (e.g. OpenRouter) override this.
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
			},
			{
				model: this.model,
				messages,
				temperature: AI_TEMPERATURE,
				max_tokens: maxTokens,
				top_p: AI_TOP_P,
				stream: false,
				...(responseFormat && { response_format: responseFormat }),
			},
			this.displayName,
			MAX_RETRIES,
			signal,
		);
	}

	/**
	 * Build the response_format parameter for the API request.
	 * Default: json_object (safe for all providers).
	 * Providers that support json_schema (e.g. OpenRouter) override this.
	 */
	protected getResponseFormat(_schema: {
		name: string;
		strict: boolean;
		schema: Record<string, unknown>;
	}): Record<string, unknown> {
		return { type: 'json_object' };
	}

	/**
	 * Shared fetch-with-retry logic: exponential backoff, abort timeout, 429/5xx handling.
	 */
	protected async fetchWithRetry(
		url: string,
		headers: Record<string, string>,
		body: Record<string, unknown>,
		providerName: string,
		retries: number = MAX_RETRIES,
		signal?: AbortSignal,
	): Promise<APICompletionResponse> {
		throwIfAborted(signal);

		for (let attempt = 0; attempt <= retries; attempt++) {
			throwIfAborted(signal);

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
			const detachAbort = attachAbortSignal(signal, controller);
			let res: Response;
			try {
				res = await fetch(url, {
					method: 'POST',
					headers,
					body: JSON.stringify(body),
					signal: controller.signal,
				});
			} catch (error) {
				clearTimeout(timeout);
				detachAbort();
				if (signal?.aborted && isAbortError(error)) {
					throw new Error(ERROR_CODES.REQUEST_CANCELLED);
				}
				if (error instanceof Error && error.name === 'AbortError') {
					const timeoutSec = Math.round(this.timeoutMs / 1000);
					throw new Error(`${providerName}: Request timed out (${timeoutSec}s)`);
				}
				if (attempt < retries) {
					const backoff = 2 ** attempt * RETRY_BACKOFF_BASE_MS + Math.random() * RETRY_JITTER_MS;
					this.logger.warn(
						`Network error, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${retries + 1})`,
					);
					await delayWithAbort(backoff, signal);
					continue;
				}
				throw error;
			}
			clearTimeout(timeout);
			detachAbort();

			if (res.ok) {
				return (await res.json()) as APICompletionResponse;
			}

			// Non-retryable auth errors — throw immediately, never retry
			if (res.status === 401 || res.status === 403) {
				throw new Error(
					`${providerName} API key is invalid or expired. Please check your API key in extension settings.`,
				);
			}

			// Retryable server/rate-limit errors
			if ((res.status === 429 || res.status >= 500) && attempt < retries) {
				const backoff = 2 ** attempt * RETRY_BACKOFF_BASE_MS + Math.random() * RETRY_JITTER_MS;
				this.logger.warn(
					`${providerName} ${res.status}, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${retries + 1})`,
				);
				await delayWithAbort(backoff, signal);
				continue;
			}

			// Non-retryable client error or exhausted retries on server error
			const errorBody = await res.text().catch(() => '');
			throw new Error(
				`${providerName} API error: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
			);
		}

		throw new Error(`${providerName}: Max retries exceeded`);
	}

	async solve(request: AIRequest): Promise<AIResponse> {
		await this.rateLimiter.acquire(request.signal);
		const startTime = Date.now();

		const messages = this.buildMessages(request);
		const responseFormat = this.getResponseFormat(SINGLE_ANSWER_SCHEMA);
		const data = await this.callAPI(messages, AI_MAX_TOKENS, responseFormat, request.signal);
		const parsed = parseAIResponse(data.choices?.[0]?.message?.content ?? '');

		return {
			answerIndices: parsed.answer.filter((i) => i >= 0 && i < request.options.length),
			confidence: Math.min(1, Math.max(0, parsed.confidence)),
			reasoning: parsed.reasoning,
			provider: this.name,
			model: this.model,
			tokensUsed: data.usage?.total_tokens ?? 0,
			latencyMs: Date.now() - startTime,
		};
	}

	async solveBatch(batchRequest: AIBatchRequest): Promise<AIBatchResponse> {
		await this.rateLimiter.acquire(batchRequest.signal);
		const messages = this.buildBatchMessages(batchRequest);
		const scaledTokens = Math.max(4096, batchRequest.questions.length * 384);
		const responseFormat = this.getResponseFormat(BATCH_ANSWER_SCHEMA);
		const response = await this.callAPI(
			messages,
			scaledTokens,
			responseFormat,
			batchRequest.signal,
		);
		const rawContent = response.choices?.[0]?.message?.content ?? '';
		const result = parseBatchAIResponse(rawContent, batchRequest.questions);
		return {
			provider: this.name,
			model: this.model,
			answers: result.answers,
			tokensUsed: result.tokensUsed || (response.usage?.total_tokens ?? 0),
		};
	}

	/**
	 * Build chat messages for batch requests.
	 */
	protected buildBatchMessages(req: AIBatchRequest): ChatMessage[] {
		const hasImages = req.questions.some((q) => q.images && q.images.length > 0);

		if (hasImages) {
			const contentParts: ContentPart[] = [];

			for (let i = 0; i < req.questions.length; i++) {
				const q = req.questions[i];
				contentParts.push({ type: 'text', text: formatBatchQuestion(q, i) });

				if (q.images) {
					for (const img of q.images) {
						contentParts.push({
							type: 'image_url',
							image_url: { url: img },
						});
					}
				}
			}

			return [
				{ role: 'system', content: BATCH_SYSTEM_PROMPT },
				{ role: 'user', content: contentParts },
			];
		}

		return [
			{ role: 'system', content: BATCH_SYSTEM_PROMPT },
			{ role: 'user', content: buildBatchPrompt(req) },
		];
	}

	/**
	 * Build chat messages. Uses image_url content parts for vision.
	 */
	protected buildMessages(request: AIRequest): ChatMessage[] {
		const prompt = buildPrompt(request);

		if (request.images?.length) {
			const contentParts: ContentPart[] = [
				{ type: 'text', text: prompt },
				...request.images.map((img) => ({
					type: 'image_url' as const,
					image_url: {
						url: `data:${img.mime || 'image/png'};base64,${img.base64}`,
					},
				})),
			];
			return [
				{ role: 'system' as const, content: SYSTEM_PROMPT },
				{ role: 'user' as const, content: contentParts },
			];
		}

		return [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: prompt },
		];
	}
}

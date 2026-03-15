import type { QuestionSelectionMode } from './questions';

/** Chat message for OpenAI-compatible API */
export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | ContentPart[];
}

/** Content part for multimodal messages (discriminated union) */
export type ContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

/** OpenRouter/NVIDIA API response shape */
export interface APICompletionResponse {
	id: string;
	choices: Array<{
		index: number;
		message: { role: 'system' | 'user' | 'assistant'; content: string };
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/** Batch request sent to an AI provider */
export interface AIBatchRequest {
	questions: Array<{
		uid: string;
		questionText: string;
		options: string[];
		images?: string[];
		selectionMode: QuestionSelectionMode;
		/** Code blocks from embedded editors, for AI context */
		codeBlocks?: string[];
	}>;
	signal?: AbortSignal;
}

/** Batch response from an AI provider */
export interface AIBatchResponse {
	provider: string;
	model: string;
	answers: Array<{
		uid: string;
		answer: number[];
		confidence: number;
		reasoning: string;
		/** For numeric/text-input answers (not letter-based) */
		rawAnswer?: string;
	}>;
	tokensUsed: number;
}

/** AI Provider interface (implemented by OpenRouter, NVIDIA NIM, etc.) */
export interface IAIProvider {
	readonly name: string;
	readonly supportsVision: boolean;
	isAvailable(): Promise<boolean>;
	solveBatch(batchRequest: AIBatchRequest): Promise<AIBatchResponse>;
}

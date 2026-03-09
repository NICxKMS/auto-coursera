import type { ExtractedQuestionType, QuestionType } from './questions';

/** Request sent to an AI provider */
export interface AIRequest {
	questionText: string;
	options: string[];
	images?: { base64: string; context: string; mime?: string }[];
	questionType: QuestionType;
	model?: string;
}

/** Response from an AI provider */
export interface AIResponse {
	answerIndices: number[];
	confidence: number;
	reasoning: string;
	provider: string;
	model: string;
	tokensUsed: number;
	latencyMs: number;
}

/** Parsed JSON answer from AI (the format we request in prompts) */
export interface ParsedAIAnswer {
	answer: number[];
	confidence: number;
	reasoning: string;
}

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
		questionType: ExtractedQuestionType;
	}>;
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
	}>;
	tokensUsed: number;
}

/** AI Provider interface (implemented by OpenRouter, NVIDIA NIM, etc.) */
export interface IAIProvider {
	readonly name: string;
	readonly supportsVision: boolean;
	isAvailable(): Promise<boolean>;
	solve(request: AIRequest): Promise<AIResponse>;
	solveBatch?(batchRequest: AIBatchRequest): Promise<AIBatchResponse>;
}

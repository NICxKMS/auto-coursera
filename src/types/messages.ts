import type { ExtractedQuestionType, QuestionType } from './questions';

/** All supported message types */
export type MessageType =
	| 'SOLVE_QUESTION'
	| 'SOLVE_IMAGE_QUESTION'
	| 'SOLVE_BATCH'
	| 'SELECT_ANSWER'
	| 'ERROR'
	| 'GET_STATUS'
	| 'SET_ENABLED'
	| 'GET_SETTINGS'
	| 'SCAN_PAGE'
	| 'RETRY_QUESTIONS';

/** Generic message envelope */
export interface Message<T = unknown> {
	type: MessageType;
	payload: T;
	tabId?: number;
}

/** Question metadata */
export interface QuestionMetadata {
	pageUrl: string;
	quizTitle: string | null;
	questionIndex: number;
	totalQuestions: number | null;
}

/** Payload sent from content script to service worker to solve a text question */
export interface SolveQuestionPayload {
	uid: string;
	type: QuestionType;
	questionText: string;
	options: string[];
	metadata: QuestionMetadata;
}

/** Image data sent to service worker */
export interface ImagePayload {
	base64: string;
	context: 'question' | 'option';
	alt: string;
}

/** Payload sent from content script to service worker to solve an image question */
export interface SolveImageQuestionPayload extends SolveQuestionPayload {
	type: 'image-based';
	images: ImagePayload[];
}

/** Payload sent from service worker to content script with the answer */
export interface SelectAnswerPayload {
	answerIndices: number[];
	confidence: number;
	reasoning: string;
	provider: string;
}

/** Error payload sent from service worker to content script */
export interface ErrorPayload {
	code: string;
	message: string;
}

/** Status payload for popup communication */
export interface StatusPayload {
	enabled: boolean;
	provider: string;
	model: string;
	lastConfidence: number | null;
	status: 'active' | 'idle' | 'error' | 'processing';
}

/** Payload for batch question solving */
export interface BatchQuestionPayload {
	questions: Array<{
		uid: string;
		questionText: string;
		options: string[];
		images?: string[]; // base64 data URIs
		questionType: ExtractedQuestionType;
	}>;
}

import type { ExtractedQuestionType } from './questions';
import type { RuntimeScopeDescriptor, RuntimeStateView, RuntimeStatus } from './runtime';
import type { AppSettings } from './settings';

/** All supported message types */
export type MessageType =
	| 'SOLVE_BATCH'
	| 'ERROR'
	| 'REGISTER_PAGE_CONTEXT'
	| 'CANCEL_PAGE_WORK'
	| 'REPORT_APPLY_OUTCOME'
	| 'REPORT_PAGE_ERROR'
	| 'SET_ENABLED'
	| 'TEST_CONNECTION'
	| 'SCAN_PAGE'
	| 'RETRY_QUESTIONS'
	| 'RESET_EXTENSION'
	| 'OPEN_SETTINGS';

/** Generic message envelope */
export interface Message<T = unknown> {
	type: MessageType;
	payload?: T;
	tabId?: number;
}

export interface RuntimeRequestContext {
	requestId: string;
	pageInstanceId: string;
	pageUrl: string;
}

/** Error payload sent from service worker to content script */
export interface ErrorPayload {
	code: string;
	message: string;
}

/** Payload for batch question solving */
export interface BatchQuestionPayload {
	runtimeContext: RuntimeRequestContext;
	questions: Array<{
		uid: string;
		questionText: string;
		options: string[];
		images?: string[]; // base64 data URIs
		questionType: ExtractedQuestionType;
	}>;
}

/** Response payload for SOLVE_BATCH messages */
export interface BatchSolveResponsePayload {
	requestId: string;
	answers: Array<{
		uid: string;
		answer: number[];
		confidence: number;
		reasoning: string;
	}>;
}

/** Response payload for SET_ENABLED messages */
export interface SetEnabledResponsePayload {
	success: boolean;
}

/** Response payload for RESET_EXTENSION messages */
export interface ResetExtensionResponsePayload {
	success: boolean;
}

export interface RegisterPageContextPayload {
	pageInstanceId: string;
	pageUrl: string;
}

export interface RegisterPageContextResponsePayload {
	success: boolean;
	scope: RuntimeScopeDescriptor;
	state: RuntimeStateView;
}

export interface CancelPageWorkPayload {
	pageInstanceId: string;
	pageUrl: string;
	reason: 'disable' | 'navigation' | 'rescan' | 'retry' | 'reset';
}

export interface ApplyOutcomePayload {
	requestId: string;
	pageInstanceId: string;
	pageUrl: string;
	appliedCount: number;
	failedCount: number;
	errorMessage?: string;
}

export interface ReportPageErrorPayload {
	pageInstanceId: string;
	pageUrl: string;
	message: string;
	requestId?: string;
}

export interface TabActionResponsePayload {
	success: boolean;
	reason?: string;
}

export interface TestConnectionPayload {
	settings: Partial<AppSettings>;
}

export interface TestConnectionResponsePayload {
	success: boolean;
	provider: string;
	model: string;
	confidence: number | null;
	message: string;
}

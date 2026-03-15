import type { QuestionSelectionMode } from './questions';
import {
	isPageRuntimeScope,
	isRecord,
	isRuntimeStateView,
	type PageRuntimeScope,
	type RuntimeStateView,
} from './runtime';
import type { AppSettings } from './settings';

export interface RuntimeRequestContext extends PageRuntimeScope {
	requestId: string;
}

/** Error payload sent from service worker to content script */
export interface ErrorPayload {
	code: string;
	message: string;
}

export interface BatchQuestionMessage {
	uid: string;
	questionText: string;
	options: string[];
	images?: string[]; // base64 data URIs
	selectionMode: QuestionSelectionMode;
	/** Code blocks from embedded editors, for AI context */
	codeBlocks?: string[];
}

/** Payload for batch question solving */
export interface BatchQuestionPayload {
	runtimeContext: RuntimeRequestContext;
	questions: BatchQuestionMessage[];
}

/** Response payload for SOLVE_BATCH messages */
export interface BatchSolveResponsePayload {
	requestId: string;
	answers: Array<{
		uid: string;
		answer: number[];
		confidence: number;
		reasoning: string;
		/** For numeric/text-input answers (not letter-based) */
		rawAnswer?: string;
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

export interface CheckUpdateResponsePayload {
	reloading: boolean;
	reason: string;
}

export type RegisterPageContextPayload = PageRuntimeScope;

export interface RegisterPageContextResponsePayload {
	success: boolean;
	state: RuntimeStateView;
}

export type CancelPageWorkReason = 'disable' | 'navigation' | 'rescan' | 'retry' | 'reset';

export type CancelPageWorkPayload = PageRuntimeScope & {
	reason: CancelPageWorkReason;
};

export type ApplyOutcomePayload = RuntimeRequestContext & {
	appliedCount: number;
	failedCount: number;
	errorMessage?: string;
};

export type ReportPageErrorPayload = PageRuntimeScope & {
	message: string;
	requestId?: string;
};

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

interface BackgroundRequestPayloadMap {
	SOLVE_BATCH: BatchQuestionPayload;
	REGISTER_PAGE_CONTEXT: RegisterPageContextPayload;
	CANCEL_PAGE_WORK: CancelPageWorkPayload;
	REPORT_APPLY_OUTCOME: ApplyOutcomePayload;
	REPORT_PAGE_ERROR: ReportPageErrorPayload;
	SET_ENABLED: boolean;
	TEST_CONNECTION: TestConnectionPayload;
	RESET_EXTENSION: undefined;
	CHECK_UPDATE: undefined;
}

interface BackgroundResponsePayloadMap {
	SOLVE_BATCH: BatchSolveResponsePayload;
	ERROR: ErrorPayload;
	REGISTER_PAGE_CONTEXT: RegisterPageContextResponsePayload;
	CANCEL_PAGE_WORK: TabActionResponsePayload;
	REPORT_APPLY_OUTCOME: TabActionResponsePayload;
	REPORT_PAGE_ERROR: TabActionResponsePayload;
	SET_ENABLED: SetEnabledResponsePayload;
	TEST_CONNECTION: TestConnectionResponsePayload;
	RESET_EXTENSION: ResetExtensionResponsePayload;
	CHECK_UPDATE: CheckUpdateResponsePayload;
}

interface ContentCommandPayloadMap {
	SCAN_PAGE: undefined;
	RETRY_QUESTIONS: undefined;
	OPEN_SETTINGS: undefined;
}

export type BackgroundRequestType = keyof BackgroundRequestPayloadMap;

export type BackgroundResponseType = keyof BackgroundResponsePayloadMap;

export type ContentCommandType = keyof ContentCommandPayloadMap;

type MessageEnvelope<TType extends string, TPayload> = {
	type: TType;
	tabId?: number;
} & ([TPayload] extends [undefined] ? { payload?: undefined } : { payload: TPayload });

type UntypedMessageEnvelope<TType extends string> = {
	type: TType;
	tabId?: number;
	payload?: unknown;
};

type DiscriminatedMessageUnion<
	TPayloadMap extends object,
	TType extends keyof TPayloadMap = keyof TPayloadMap,
> = {
	[K in TType]: MessageEnvelope<K & string, TPayloadMap[K]>;
}[TType];

export type BackgroundRequestMessage<TType extends BackgroundRequestType = BackgroundRequestType> =
	DiscriminatedMessageUnion<BackgroundRequestPayloadMap, TType>;

export type BackgroundRequestEnvelope<TType extends BackgroundRequestType = BackgroundRequestType> =
	{
		[K in TType]: UntypedMessageEnvelope<K & string>;
	}[TType];

export type BackgroundResponseMessage<
	TType extends BackgroundResponseType = BackgroundResponseType,
> = DiscriminatedMessageUnion<BackgroundResponsePayloadMap, TType>;

export type ContentCommandMessage<TType extends ContentCommandType = ContentCommandType> =
	DiscriminatedMessageUnion<ContentCommandPayloadMap, TType>;

export type Message = BackgroundRequestMessage | BackgroundResponseMessage | ContentCommandMessage;

/** Union of all valid `Message['type']` string literals. */
export type MessageType = Message['type'];

export { isPageRuntimeScope, isRecord };

const BACKGROUND_REQUEST_TYPES = new Set<BackgroundRequestType>([
	'SOLVE_BATCH',
	'REGISTER_PAGE_CONTEXT',
	'CANCEL_PAGE_WORK',
	'REPORT_APPLY_OUTCOME',
	'REPORT_PAGE_ERROR',
	'SET_ENABLED',
	'TEST_CONNECTION',
	'RESET_EXTENSION',
	'CHECK_UPDATE',
]);

const BATCH_SELECTION_MODES = new Set<QuestionSelectionMode>([
	'single',
	'multiple',
	'text-input',
	'numeric',
	'unknown',
]);

const CANCEL_PAGE_WORK_REASONS = new Set<CancelPageWorkReason>([
	'disable',
	'navigation',
	'rescan',
	'retry',
	'reset',
]);

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isRuntimeRequestContext(value: unknown): value is RuntimeRequestContext {
	return isPageRuntimeScope(value) && isRecord(value) && typeof value.requestId === 'string';
}

export function isBatchQuestionMessage(value: unknown): value is BatchQuestionMessage {
	return (
		isRecord(value) &&
		typeof value.uid === 'string' &&
		typeof value.questionText === 'string' &&
		isStringArray(value.options) &&
		(value.images === undefined || isStringArray(value.images)) &&
		(value.codeBlocks === undefined || isStringArray(value.codeBlocks)) &&
		typeof value.selectionMode === 'string' &&
		BATCH_SELECTION_MODES.has(value.selectionMode as QuestionSelectionMode)
	);
}

export function isBatchQuestionPayload(value: unknown): value is BatchQuestionPayload {
	return (
		isRecord(value) &&
		isRuntimeRequestContext(value.runtimeContext) &&
		Array.isArray(value.questions) &&
		value.questions.every(isBatchQuestionMessage)
	);
}

export function isCancelPageWorkPayload(value: unknown): value is CancelPageWorkPayload {
	return (
		isPageRuntimeScope(value) &&
		isRecord(value) &&
		typeof value.reason === 'string' &&
		CANCEL_PAGE_WORK_REASONS.has(value.reason as CancelPageWorkReason)
	);
}

export function isApplyOutcomePayload(value: unknown): value is ApplyOutcomePayload {
	return (
		isRuntimeRequestContext(value) &&
		isRecord(value) &&
		typeof value.appliedCount === 'number' &&
		typeof value.failedCount === 'number' &&
		(value.errorMessage === undefined || typeof value.errorMessage === 'string')
	);
}

export function isReportPageErrorPayload(value: unknown): value is ReportPageErrorPayload {
	return (
		isPageRuntimeScope(value) &&
		isRecord(value) &&
		typeof value.message === 'string' &&
		(value.requestId === undefined || typeof value.requestId === 'string')
	);
}

export function isTestConnectionPayload(value: unknown): value is TestConnectionPayload {
	return isRecord(value) && isRecord(value.settings);
}

export function isBackgroundRequestMessage(value: unknown): value is BackgroundRequestEnvelope {
	return (
		isRecord(value) &&
		typeof value.type === 'string' &&
		BACKGROUND_REQUEST_TYPES.has(value.type as BackgroundRequestType)
	);
}

export function isErrorMessage(message: unknown): message is BackgroundResponseMessage<'ERROR'> {
	return (
		isRecord(message) &&
		message.type === 'ERROR' &&
		isRecord(message.payload) &&
		typeof message.payload.code === 'string' &&
		typeof message.payload.message === 'string'
	);
}

export function isRegisterPageContextResponseMessage(
	message: unknown,
): message is BackgroundResponseMessage<'REGISTER_PAGE_CONTEXT'> {
	return (
		isRecord(message) &&
		message.type === 'REGISTER_PAGE_CONTEXT' &&
		isRecord(message.payload) &&
		message.payload.success === true &&
		isRuntimeStateView(message.payload.state)
	);
}

export function isBatchSolveResponseMessage(
	message: unknown,
): message is BackgroundResponseMessage<'SOLVE_BATCH'> {
	return (
		isRecord(message) &&
		message.type === 'SOLVE_BATCH' &&
		isRecord(message.payload) &&
		typeof message.payload.requestId === 'string' &&
		Array.isArray(message.payload.answers)
	);
}

export function isTestConnectionResponseMessage(
	message: unknown,
): message is BackgroundResponseMessage<'TEST_CONNECTION'> {
	return (
		isRecord(message) &&
		message.type === 'TEST_CONNECTION' &&
		isRecord(message.payload) &&
		typeof message.payload.success === 'boolean' &&
		typeof message.payload.provider === 'string' &&
		typeof message.payload.model === 'string' &&
		(message.payload.confidence === null || typeof message.payload.confidence === 'number') &&
		typeof message.payload.message === 'string'
	);
}

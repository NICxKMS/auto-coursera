export type RuntimeStatus = 'idle' | 'processing' | 'active' | 'error' | 'disabled';

export interface PageRuntimeScope {
	pageInstanceId: string;
	pageUrl: string;
}

export interface RuntimeScopeDescriptor extends PageRuntimeScope {
	tabId: number;
	scopeId: string;
}

export interface RuntimeStateView extends RuntimeScopeDescriptor {
	status: RuntimeStatus;
	provider: string;
	model: string;
	confidence: number | null;
	lastError: string;
	solvedCount: number;
	failedCount: number;
	tokenCount: number;
	processingCount: number;
	currentRequestId: string | null;
	updatedAt: number;
}

export type RuntimeScopeMap = Record<string, RuntimeStateView>;
export type RuntimeTabScopeMap = Record<string, string>;

export interface RuntimeSessionSnapshot {
	scopes: RuntimeScopeMap;
	tabScopes: RuntimeTabScopeMap;
}

export const SESSION_RUNTIME_SCOPES_KEY = '_runtimeScopes';
export const SESSION_RUNTIME_TAB_SCOPES_KEY = '_runtimeTabScopes';

export function getRuntimeScopeId(tabId: number, pageInstanceId: string): string {
	return `${tabId}:${pageInstanceId}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isPageRuntimeScope(value: unknown): value is PageRuntimeScope {
	return (
		isRecord(value) && typeof value.pageInstanceId === 'string' && typeof value.pageUrl === 'string'
	);
}

export function isRuntimeScopeDescriptor(value: unknown): value is RuntimeScopeDescriptor {
	return (
		isPageRuntimeScope(value) &&
		isRecord(value) &&
		typeof value.tabId === 'number' &&
		typeof value.scopeId === 'string'
	);
}

export function isRuntimeStateView(value: unknown): value is RuntimeStateView {
	return (
		isRuntimeScopeDescriptor(value) &&
		isRecord(value) &&
		(value.status === 'idle' ||
			value.status === 'processing' ||
			value.status === 'active' ||
			value.status === 'error' ||
			value.status === 'disabled') &&
		typeof value.provider === 'string' &&
		typeof value.model === 'string' &&
		(value.confidence === null || typeof value.confidence === 'number') &&
		typeof value.lastError === 'string' &&
		typeof value.solvedCount === 'number' &&
		typeof value.failedCount === 'number' &&
		typeof value.tokenCount === 'number' &&
		typeof value.processingCount === 'number' &&
		(value.currentRequestId === null || typeof value.currentRequestId === 'string') &&
		typeof value.updatedAt === 'number'
	);
}

export function createDefaultRuntimeState(
	scope: Partial<RuntimeScopeDescriptor>,
	status: RuntimeStatus = 'idle',
): RuntimeStateView {
	const tabId = typeof scope.tabId === 'number' ? scope.tabId : -1;
	const pageInstanceId = scope.pageInstanceId ?? '';
	return {
		tabId,
		pageInstanceId,
		pageUrl: scope.pageUrl ?? '',
		scopeId: scope.scopeId ?? getRuntimeScopeId(tabId, pageInstanceId),
		status,
		provider: '',
		model: '',
		confidence: null,
		lastError: '',
		solvedCount: 0,
		failedCount: 0,
		tokenCount: 0,
		processingCount: 0,
		currentRequestId: null,
		updatedAt: Date.now(),
	};
}

export function readRuntimeSessionSnapshot(
	sessionData: Record<string, unknown>,
): RuntimeSessionSnapshot {
	const rawScopes = sessionData[SESSION_RUNTIME_SCOPES_KEY];
	const rawTabScopes = sessionData[SESSION_RUNTIME_TAB_SCOPES_KEY];

	const scopes =
		rawScopes && typeof rawScopes === 'object' && !Array.isArray(rawScopes)
			? (rawScopes as RuntimeScopeMap)
			: {};
	const tabScopes =
		rawTabScopes && typeof rawTabScopes === 'object' && !Array.isArray(rawTabScopes)
			? (rawTabScopes as RuntimeTabScopeMap)
			: {};

	return { scopes, tabScopes };
}

export function getRuntimeStateForScope(
	snapshot: RuntimeSessionSnapshot,
	scopeId: string,
): RuntimeStateView | null {
	return snapshot.scopes[scopeId] ?? null;
}

export function getRuntimeStateForTab(
	snapshot: RuntimeSessionSnapshot,
	tabId: number,
): RuntimeStateView | null {
	const scopeId = snapshot.tabScopes[String(tabId)];
	if (!scopeId) return null;
	return getRuntimeStateForScope(snapshot, scopeId);
}

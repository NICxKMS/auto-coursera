export type RuntimeStatus = 'idle' | 'processing' | 'active' | 'error' | 'disabled';

export interface RuntimeScopeDescriptor {
	tabId: number;
	pageInstanceId: string;
	pageUrl: string;
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

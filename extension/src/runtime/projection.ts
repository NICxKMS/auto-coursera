import type { RuntimeStateView, RuntimeStatus } from '../types/runtime';

export const RUNTIME_ACTIVE_STALE_MS = 60_000;

export interface RuntimeReadModel {
	isEnabled: boolean;
	hasRuntimeState: boolean;
	isStale: boolean;
	status: RuntimeStatus;
	provider: string;
	model: string;
	confidence: number | null;
	lastError: string;
	solvedCount: number;
	failedCount: number;
	tokenCount: number;
	processingCount: number;
}

interface ProjectRuntimeReadModelOptions {
	enabled: boolean;
	runtimeState: RuntimeStateView | null;
	now?: number;
	staleActiveMs?: number;
}

export function resolveRuntimeStateForScope(
	rawScopes: unknown,
	scopeId: string | null,
): RuntimeStateView | null {
	if (!scopeId || !rawScopes || typeof rawScopes !== 'object' || Array.isArray(rawScopes)) {
		return null;
	}

	const scopes = rawScopes as Record<string, RuntimeStateView>;
	return scopes[scopeId] ?? null;
}

export function projectRuntimeReadModel({
	enabled,
	runtimeState,
	now = Date.now(),
	staleActiveMs = RUNTIME_ACTIVE_STALE_MS,
}: ProjectRuntimeReadModelOptions): RuntimeReadModel {
	const isStale =
		runtimeState?.status === 'active' &&
		runtimeState.updatedAt > 0 &&
		now - runtimeState.updatedAt > staleActiveMs;

	return {
		isEnabled: enabled,
		hasRuntimeState: runtimeState !== null,
		isStale,
		status: !enabled ? 'disabled' : isStale ? 'idle' : (runtimeState?.status ?? 'idle'),
		provider: runtimeState?.provider ?? '',
		model: runtimeState?.model ?? '',
		confidence: runtimeState?.confidence ?? null,
		lastError: runtimeState?.lastError ?? '',
		solvedCount: runtimeState?.solvedCount ?? 0,
		failedCount: runtimeState?.failedCount ?? 0,
		tokenCount: runtimeState?.tokenCount ?? 0,
		processingCount: runtimeState?.processingCount ?? 0,
	};
}

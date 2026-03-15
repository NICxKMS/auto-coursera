import type {
	RegisterPageContextPayload,
	RegisterPageContextResponsePayload,
} from '../types/messages';
import type {
	RuntimeScopeDescriptor,
	RuntimeScopeMap,
	RuntimeStateView,
	RuntimeStatus,
	RuntimeTabScopeMap,
} from '../types/runtime';
import {
	createDefaultRuntimeState,
	getRuntimeScopeId,
	readRuntimeSessionSnapshot,
	SESSION_RUNTIME_SCOPES_KEY,
	SESSION_RUNTIME_TAB_SCOPES_KEY,
} from '../types/runtime';
import { COLORS } from '../utils/constants';

/** Apply-outcome recovery timeout in ms after solve completes but the page never reports apply status */
const APPLY_OUTCOME_TIMEOUT_MS = 60 * 1000;

export const PROCESSING_RECOVERY_ALARM_PREFIX = 'runtime-processing-recovery:';

const APPLY_TIMEOUT_ERROR_MESSAGE =
	'Timed out waiting for the page to finish applying answers. Please rescan the page.';

export function getProcessingRecoveryAlarmName(scopeId: string): string {
	return `${PROCESSING_RECOVERY_ALARM_PREFIX}${scopeId}`;
}

interface ActiveRequest {
	requestId: string;
	controller: AbortController;
}

interface RegisterScopeInput {
	tabId: number;
	pageInstanceId: string;
	pageUrl: string;
	enabled: boolean;
}

interface RequestMetadata {
	provider: string;
	model: string;
	confidence: number | null;
	tokensUsed: number;
}

interface ApplyOutcome {
	appliedCount: number;
	failedCount: number;
	errorMessage?: string;
}

interface RuntimeBadgeSummary {
	status: RuntimeStatus;
	totalSolved: number;
}

function deriveRuntimeBadgeSummary(states: Iterable<RuntimeStateView>): RuntimeBadgeSummary {
	const allStates = Array.from(states);
	if (allStates.length === 0) {
		return { status: 'idle', totalSolved: 0 };
	}

	let status: RuntimeStatus = 'idle';
	if (allStates.some((state) => state.status === 'processing')) {
		status = 'processing';
	} else if (allStates.some((state) => state.status === 'error')) {
		status = 'error';
	} else if (allStates.some((state) => state.status === 'active')) {
		status = 'active';
	} else if (allStates.every((state) => state.status === 'disabled')) {
		status = 'disabled';
	}

	return {
		status,
		totalSolved: allStates.reduce((sum, state) => sum + state.solvedCount, 0),
	};
}

export class RuntimeStateManager {
	private readonly scopes = new Map<string, RuntimeStateView>();
	private readonly tabScopes = new Map<number, string>();
	private readonly activeRequests = new Map<string, ActiveRequest>();
	private hydrated = false;

	async hydrate(): Promise<void> {
		if (this.hydrated) return;
		const sessionData = await chrome.storage.session.get({
			[SESSION_RUNTIME_SCOPES_KEY]: {},
			[SESSION_RUNTIME_TAB_SCOPES_KEY]: {},
		});
		const snapshot = readRuntimeSessionSnapshot(sessionData as Record<string, unknown>);

		this.scopes.clear();
		for (const [scopeId, state] of Object.entries(snapshot.scopes)) {
			this.scopes.set(scopeId, state);
		}

		this.tabScopes.clear();
		for (const [tabId, scopeId] of Object.entries(snapshot.tabScopes)) {
			const parsed = Number.parseInt(tabId, 10);
			if (!Number.isNaN(parsed)) {
				this.tabScopes.set(parsed, scopeId);
			}
		}

		this.activeRequests.clear();
		this.hydrated = true;
	}

	async registerScope(input: RegisterScopeInput): Promise<RuntimeStateView> {
		await this.hydrate();

		const scopeId = getRuntimeScopeId(input.tabId, input.pageInstanceId);
		const previousScopeId = this.tabScopes.get(input.tabId);
		if (previousScopeId && previousScopeId !== scopeId) {
			await this.cancelScope(previousScopeId, input.enabled ? 'idle' : 'disabled', true);
		}

		const existing = this.scopes.get(scopeId);
		const nextStatus: RuntimeStatus = input.enabled ? 'idle' : 'disabled';
		const nextState: RuntimeStateView = {
			...(existing ??
				createDefaultRuntimeState(
					{
						tabId: input.tabId,
						pageInstanceId: input.pageInstanceId,
						pageUrl: input.pageUrl,
						scopeId,
					},
					nextStatus,
				)),
			tabId: input.tabId,
			pageInstanceId: input.pageInstanceId,
			pageUrl: input.pageUrl,
			scopeId,
			status: nextStatus,
			lastError: '',
			processingCount: 0,
			currentRequestId: null,
			updatedAt: Date.now(),
		};

		this.scopes.set(scopeId, nextState);
		this.tabScopes.set(input.tabId, scopeId);
		await this.persist();
		return { ...nextState };
	}

	async beginRequest(
		scope: RuntimeScopeDescriptor,
		requestId: string,
	): Promise<AbortSignal | null> {
		await this.hydrate();
		if (!this.isCurrentScope(scope)) return null;

		const state = this.scopes.get(scope.scopeId);
		if (!state || state.status === 'disabled') return null;

		await this.cancelActiveRequest(scope.scopeId);
		this.clearProcessingRecoveryAlarm(scope.scopeId);
		const controller = new AbortController();
		this.activeRequests.set(scope.scopeId, { requestId, controller });

		this.scopes.set(scope.scopeId, {
			...state,
			status: 'processing',
			lastError: '',
			processingCount: 1,
			currentRequestId: requestId,
			updatedAt: Date.now(),
		});
		await this.persist();
		return controller.signal;
	}

	async completeRequestSolve(
		scope: RuntimeScopeDescriptor,
		requestId: string,
		metadata: RequestMetadata,
	): Promise<boolean> {
		await this.hydrate();
		const state = this.scopes.get(scope.scopeId);
		if (!state || state.currentRequestId !== requestId || !this.isCurrentScope(scope)) {
			return false;
		}

		this.activeRequests.delete(scope.scopeId);
		this.scopes.set(scope.scopeId, {
			...state,
			provider: metadata.provider,
			model: metadata.model,
			confidence: metadata.confidence,
			tokenCount: state.tokenCount + metadata.tokensUsed,
			lastError: '',
			updatedAt: Date.now(),
		});
		this.scheduleProcessingRecovery(scope.scopeId);
		await this.persist();
		return true;
	}

	async failRequest(
		scope: RuntimeScopeDescriptor,
		requestId: string,
		message: string,
	): Promise<boolean> {
		await this.hydrate();
		const state = this.scopes.get(scope.scopeId);
		if (!state || state.currentRequestId !== requestId || !this.isCurrentScope(scope)) {
			return false;
		}

		this.activeRequests.delete(scope.scopeId);
		this.clearProcessingRecoveryAlarm(scope.scopeId);
		this.scopes.set(scope.scopeId, {
			...state,
			status: 'error',
			lastError: message,
			failedCount: state.failedCount + 1,
			processingCount: 0,
			currentRequestId: null,
			updatedAt: Date.now(),
		});
		await this.persist();
		return true;
	}

	async finalizeApply(
		scope: RuntimeScopeDescriptor,
		requestId: string,
		outcome: ApplyOutcome,
	): Promise<boolean> {
		await this.hydrate();
		const state = this.scopes.get(scope.scopeId);
		if (!state || state.currentRequestId !== requestId || !this.isCurrentScope(scope)) {
			return false;
		}

		this.activeRequests.delete(scope.scopeId);
		this.clearProcessingRecoveryAlarm(scope.scopeId);
		const nextSolvedCount = state.solvedCount + outcome.appliedCount;
		const nextFailedCount = state.failedCount + outcome.failedCount;
		const nextStatus: RuntimeStatus =
			outcome.appliedCount > 0 ? 'active' : outcome.failedCount > 0 ? 'error' : 'idle';
		const nextError = nextStatus === 'error' ? (outcome.errorMessage ?? state.lastError) : '';

		const nextState: RuntimeStateView = {
			...state,
			status: nextStatus,
			lastError: nextError,
			solvedCount: nextSolvedCount,
			failedCount: nextFailedCount,
			processingCount: 0,
			currentRequestId: null,
			updatedAt: Date.now(),
		};
		this.scopes.set(scope.scopeId, nextState);
		await this.persist();
		return true;
	}

	async reportRuntimeError(
		scope: RuntimeScopeDescriptor,
		message: string,
		requestId?: string,
	): Promise<boolean> {
		await this.hydrate();
		const state = this.scopes.get(scope.scopeId);
		if (!state || !this.isCurrentScope(scope)) return false;
		if (requestId && state.currentRequestId !== requestId) return false;

		this.activeRequests.delete(scope.scopeId);
		this.clearProcessingRecoveryAlarm(scope.scopeId);
		this.scopes.set(scope.scopeId, {
			...state,
			status: 'error',
			lastError: message,
			failedCount: state.failedCount + 1,
			processingCount: 0,
			currentRequestId: null,
			updatedAt: Date.now(),
		});
		await this.persist();
		return true;
	}

	async cancelScope(
		scopeId: string,
		nextStatus: RuntimeStatus = 'idle',
		removeScope: boolean = false,
	): Promise<void> {
		await this.hydrate();
		await this.cancelActiveRequest(scopeId);
		this.clearProcessingRecoveryAlarm(scopeId);

		const state = this.scopes.get(scopeId);
		if (!state) return;

		if (removeScope) {
			this.scopes.delete(scopeId);
			if (this.tabScopes.get(state.tabId) === scopeId) {
				this.tabScopes.delete(state.tabId);
			}
		} else {
			const nextState: RuntimeStateView = {
				...state,
				status: nextStatus,
				lastError: '',
				processingCount: 0,
				currentRequestId: null,
				updatedAt: Date.now(),
			};
			this.scopes.set(scopeId, nextState);
		}

		await this.persist();
	}

	async removeTabScope(tabId: number): Promise<void> {
		await this.hydrate();
		const scopeId = this.tabScopes.get(tabId);
		if (!scopeId) return;
		await this.cancelScope(scopeId, 'idle', true);
	}

	async setEnabled(enabled: boolean): Promise<void> {
		await this.hydrate();
		for (const scopeId of this.scopes.keys()) {
			await this.cancelActiveRequest(scopeId);
			this.clearProcessingRecoveryAlarm(scopeId);
		}

		for (const [scopeId, state] of this.scopes.entries()) {
			this.scopes.set(scopeId, {
				...state,
				status: enabled ? 'idle' : 'disabled',
				lastError: '',
				processingCount: 0,
				currentRequestId: null,
				updatedAt: Date.now(),
			});
		}

		await this.persist();
		if (!enabled) {
			chrome.action.setBadgeText({ text: '' });
		}
	}

	async resetAll(): Promise<void> {
		await this.hydrate();
		for (const scopeId of this.scopes.keys()) {
			await this.cancelActiveRequest(scopeId);
			this.clearProcessingRecoveryAlarm(scopeId);
		}
		this.scopes.clear();
		this.tabScopes.clear();
		await this.persist();
		chrome.action.setBadgeText({ text: '' });
	}

	async getStateForTab(tabId: number): Promise<RuntimeStateView | null> {
		await this.hydrate();
		const scopeId = this.tabScopes.get(tabId);
		if (!scopeId) return null;
		const state = this.scopes.get(scopeId);
		return state ? { ...state } : null;
	}

	async getStateForScope(scopeId: string): Promise<RuntimeStateView | null> {
		await this.hydrate();
		const state = this.scopes.get(scopeId);
		return state ? { ...state } : null;
	}

	async idleActiveScopesUpdatedBefore(timestamp: number): Promise<void> {
		await this.hydrate();
		let changed = false;
		for (const [scopeId, state] of this.scopes.entries()) {
			if (state.status !== 'active' || state.updatedAt > timestamp) {
				continue;
			}

			this.scopes.set(scopeId, {
				...state,
				status: 'idle',
				updatedAt: Date.now(),
			});
			changed = true;
		}

		if (changed) {
			await this.persist();
		}
	}

	async recoverStaleProcessingScope(scopeId: string): Promise<boolean> {
		await this.hydrate();
		const state = this.scopes.get(scopeId);
		if (!state || state.status !== 'processing') {
			this.clearProcessingRecoveryAlarm(scopeId);
			return false;
		}

		if (this.activeRequests.has(scopeId)) {
			return false;
		}

		if (Date.now() - state.updatedAt < APPLY_OUTCOME_TIMEOUT_MS) {
			this.scheduleProcessingRecovery(scopeId);
			return false;
		}

		this.clearProcessingRecoveryAlarm(scopeId);
		this.scopes.set(scopeId, {
			...state,
			status: 'error',
			lastError: APPLY_TIMEOUT_ERROR_MESSAGE,
			failedCount: state.failedCount + 1,
			processingCount: 0,
			currentRequestId: null,
			updatedAt: Date.now(),
		});
		await this.persist();
		return true;
	}

	private async cancelActiveRequest(scopeId: string): Promise<void> {
		const active = this.activeRequests.get(scopeId);
		if (!active) return;
		active.controller.abort();
		this.activeRequests.delete(scopeId);
	}

	private scheduleProcessingRecovery(scopeId: string): void {
		chrome.alarms.create(getProcessingRecoveryAlarmName(scopeId), {
			when: Date.now() + APPLY_OUTCOME_TIMEOUT_MS,
		});
	}

	private clearProcessingRecoveryAlarm(scopeId: string): void {
		chrome.alarms.clear(getProcessingRecoveryAlarmName(scopeId));
	}

	private isCurrentScope(scope: RuntimeScopeDescriptor): boolean {
		return this.tabScopes.get(scope.tabId) === scope.scopeId;
	}

	private async persist(): Promise<void> {
		const scopes: RuntimeScopeMap = {};
		for (const [scopeId, state] of this.scopes.entries()) {
			scopes[scopeId] = state;
		}

		const tabScopes: RuntimeTabScopeMap = {};
		for (const [tabId, scopeId] of this.tabScopes.entries()) {
			tabScopes[String(tabId)] = scopeId;
		}

		const badgeSummary = deriveRuntimeBadgeSummary(this.scopes.values());

		await chrome.storage.session.set({
			[SESSION_RUNTIME_SCOPES_KEY]: scopes,
			[SESSION_RUNTIME_TAB_SCOPES_KEY]: tabScopes,
		});

		if (badgeSummary.status === 'error') {
			chrome.action.setBadgeText({ text: '!' });
			chrome.action.setBadgeBackgroundColor({ color: COLORS.ERROR });
			return;
		}

		const badgeText = badgeSummary.totalSolved > 0 ? String(badgeSummary.totalSolved) : '';
		chrome.action.setBadgeText({ text: badgeText });
		if (badgeText) {
			chrome.action.setBadgeBackgroundColor({ color: COLORS.SUCCESS });
		}
	}
}

// ---------------------------------------------------------------------------
// Scope resolution helpers (merged from runtime-scope.ts)
// ---------------------------------------------------------------------------

export function getTabId(sender: chrome.runtime.MessageSender): number | null {
	return typeof sender.tab?.id === 'number' ? sender.tab.id : null;
}

export function buildScopeDescriptor(
	tabId: number,
	pageInstanceId: string,
	pageUrl: string,
): RuntimeScopeDescriptor {
	return {
		tabId,
		pageInstanceId,
		pageUrl,
		scopeId: getRuntimeScopeId(tabId, pageInstanceId),
	};
}

export async function resolveCurrentScope(
	runtimeStateManager: RuntimeStateManager,
	sender: chrome.runtime.MessageSender,
	pageInstanceId: string,
	pageUrl: string,
): Promise<RuntimeScopeDescriptor | 'invalid' | null> {
	const tabId = getTabId(sender);
	if (tabId === null) {
		return null;
	}

	const expectedScope = buildScopeDescriptor(tabId, pageInstanceId, pageUrl);
	const currentState = await runtimeStateManager.getStateForTab(tabId);
	if (!currentState) {
		const { enabled } = await chrome.storage.local.get({ enabled: false });
		await runtimeStateManager.registerScope({
			tabId,
			pageInstanceId,
			pageUrl,
			enabled: enabled as boolean,
		});
		return expectedScope;
	}

	if (currentState.scopeId !== expectedScope.scopeId) {
		return 'invalid';
	}

	return expectedScope;
}

export async function registerScopeForPage(
	runtimeStateManager: RuntimeStateManager,
	sender: chrome.runtime.MessageSender,
	payload: RegisterPageContextPayload,
): Promise<RegisterPageContextResponsePayload | null> {
	const tabId = getTabId(sender);
	if (tabId === null) {
		return null;
	}

	const { enabled } = await chrome.storage.local.get({ enabled: false });
	const state = await runtimeStateManager.registerScope({
		tabId,
		pageInstanceId: payload.pageInstanceId,
		pageUrl: payload.pageUrl,
		enabled: enabled as boolean,
	});

	return {
		success: true,
		state,
	};
}

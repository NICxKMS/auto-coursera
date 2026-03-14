/**
 * Service worker entry — lifecycle wiring, provider init bootstrap, message routing.
 */

import { isBackgroundRequestMessage } from '../types/messages';
import { Logger } from '../utils/logger';
import { BackgroundLifecycle } from './lifecycle';
import {
	createMessageHandlers,
	createMessageRouter,
	errorResponse,
	isAllowedSender,
} from './message-handlers';
import { ProviderService } from './provider-service';
import { getProcessingRecoveryAlarmName, RuntimeStateManager } from './runtime-state';

const logger = new Logger('ServiceWorker');
const router = createMessageRouter();
const runtimeStateManager = new RuntimeStateManager();
const providerService = new ProviderService(logger);
const lifecycle = new BackgroundLifecycle({
	logger,
	runtimeStateManager,
	providerService,
});
const handlers = createMessageHandlers({
	logger,
	runtimeStateManager,
	providerService,
	withKeepAlive: lifecycle.withKeepAlive,
	scheduleIdleReset: () => lifecycle.scheduleIdleReset(),
	resetAndReinitialize: lifecycle.resetAndReinitialize,
	checkForUpdate: lifecycle.checkForUpdate,
});

registerMessageRoutes();
registerChromeListeners();

function registerMessageRoutes(): void {
	router.on('SOLVE_BATCH', handlers.handleSolveBatch);
	router.on('REGISTER_PAGE_CONTEXT', handlers.handleRegisterPageContext);
	router.on('CANCEL_PAGE_WORK', handlers.handleCancelPageWork);
	router.on('REPORT_APPLY_OUTCOME', handlers.handleReportApplyOutcome);
	router.on('REPORT_PAGE_ERROR', handlers.handleReportPageError);
	router.on('SET_ENABLED', async (payload) => handlers.handleSetEnabled(payload));
	router.on('TEST_CONNECTION', async (payload) => handlers.handleTestConnection(payload));
	router.on('RESET_EXTENSION', async () => handlers.handleResetExtension());
	router.on('CHECK_UPDATE', async () => handlers.handleCheckUpdate());
}

function registerChromeListeners(): void {
	chrome.alarms.onAlarm.addListener((alarm) => {
		void lifecycle.handleAlarm(alarm);
	});

	chrome.tabs.onRemoved.addListener((tabId) => {
		void lifecycle.handleTabRemoved(tabId);
	});

	chrome.commands.onCommand.addListener((command) => {
		void lifecycle.handleCommand(command);
	});

	chrome.runtime.onInstalled.addListener((details) => {
		void lifecycle.handleInstalled(details);
	});

	chrome.runtime.onStartup.addListener(() => {
		void lifecycle.handleStartup();
	});

	chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
		if (!isAllowedSender(sender)) {
			sendResponse({
				type: 'ERROR',
				payload: { code: 'UNAUTHORIZED', message: 'Blocked: invalid sender' },
			});
			return false;
		}

		if (!isBackgroundRequestMessage(message)) {
			sendResponse(errorResponse('INVALID_MESSAGE', 'Invalid message format'));
			return false;
		}

		router
			.route(message, sender)
			.then(sendResponse)
			.catch(() => {
				sendResponse(errorResponse('INTERNAL_ERROR', 'Unexpected routing failure'));
			});

		return true;
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		void lifecycle.handleStorageChanged(changes, areaName);
	});
}

export const __testing = {
	runtimeStateManager,
	handleSolveBatch: handlers.handleSolveBatch,
	handleRegisterPageContext: handlers.handleRegisterPageContext,
	handleCancelPageWork: handlers.handleCancelPageWork,
	handleReportApplyOutcome: handlers.handleReportApplyOutcome,
	handleReportPageError: handlers.handleReportPageError,
	handleSetEnabled: handlers.handleSetEnabled,
	handleTestConnection: handlers.handleTestConnection,
	handleTabRemoved(tabId: number): Promise<void> {
		return runtimeStateManager.removeTabScope(tabId);
	},
	handleProcessingRecoveryAlarm(scopeId: string): Promise<boolean> {
		return runtimeStateManager.recoverStaleProcessingScope(scopeId);
	},
	getProcessingRecoveryAlarmName,
	reloadProvidersFromStorage: lifecycle.reloadProvidersFromStorage,
	checkForUpdate: lifecycle.checkForUpdate,
	resetForTests: lifecycle.resetForTests,
};

logger.info('Service worker loaded');

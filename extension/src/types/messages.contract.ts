import type {
	BackgroundRequestMessage,
	BackgroundResponseMessage,
	ContentCommandMessage,
} from './messages';

/**
 * Compile-time message contract fixtures.
 *
 * This file is intentionally not imported at runtime. It exists so the normal
 * extension `tsc --noEmit` pass enforces discriminated message typing.
 */

const validSetEnabledRequest = {
	type: 'SET_ENABLED',
	payload: true,
} satisfies BackgroundRequestMessage<'SET_ENABLED'>;

const validResetExtensionRequest = {
	type: 'RESET_EXTENSION',
} satisfies BackgroundRequestMessage<'RESET_EXTENSION'>;

const validTestConnectionResponse = {
	type: 'TEST_CONNECTION',
	payload: {
		success: true,
		provider: 'openrouter',
		model: 'openrouter/free',
		confidence: 0.91,
		message: 'Connection successful.',
	},
} satisfies BackgroundResponseMessage<'TEST_CONNECTION'>;

const validOpenSettingsCommand = {
	type: 'OPEN_SETTINGS',
} satisfies ContentCommandMessage<'OPEN_SETTINGS'>;

function expectBackgroundRequestMessage(_message: BackgroundRequestMessage): void {}

function expectBackgroundResponseMessage(_message: BackgroundResponseMessage): void {}

function expectContentCommandMessage(_message: ContentCommandMessage): void {}

// @ts-expect-error SET_ENABLED requires a boolean payload.
expectBackgroundRequestMessage({ type: 'SET_ENABLED', payload: { success: true } });

// @ts-expect-error RESET_EXTENSION must not accept a TEST_CONNECTION payload shape.
expectBackgroundRequestMessage({ type: 'RESET_EXTENSION', payload: { settings: {} } });

// @ts-expect-error TEST_CONNECTION responses must carry the full structured payload.
expectBackgroundResponseMessage({ type: 'TEST_CONNECTION', payload: { success: true } });

// @ts-expect-error OPEN_SETTINGS does not accept an arbitrary payload.
expectContentCommandMessage({ type: 'OPEN_SETTINGS', payload: true });

void [
	validSetEnabledRequest,
	validResetExtensionRequest,
	validTestConnectionResponse,
	validOpenSettingsCommand,
];

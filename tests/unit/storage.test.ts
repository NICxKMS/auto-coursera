import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeMock, resetChromeMock } from '../mocks/chrome';

// The storage module caches the derived key in module scope.
// We need a fresh module for each test to avoid cross-test key caching issues.
let getSettings: typeof import('../../src/utils/storage').getSettings;
let saveSettings: typeof import('../../src/utils/storage').saveSettings;
let setEnabled: typeof import('../../src/utils/storage').setEnabled;

beforeEach(async () => {
	resetChromeMock();
	// Reset module to clear cached derivedKey
	vi.resetModules();
	const mod = await import('../../src/utils/storage');
	getSettings = mod.getSettings;
	saveSettings = mod.saveSettings;
	setEnabled = mod.setEnabled;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Storage', () => {
	describe('getSettings()', () => {
		it('should return default settings when storage is empty', async () => {
			const settings = await getSettings();
			expect(settings.enabled).toBe(false);
			expect(settings.openrouterApiKey).toBe('');
			expect(settings.nvidiaApiKey).toBe('');
			expect(settings.geminiApiKey).toBe('');
			expect(settings.groqApiKey).toBe('');
			expect(settings.cerebrasApiKey).toBe('');
			expect(settings.primaryProvider).toBe('openrouter');
			expect(settings.confidenceThreshold).toBe(0.7);
			expect(settings.autoSelect).toBe(true);
			expect(settings.maxRetries).toBe(2);
			expect(settings.rateLimitRpm).toBe(20);
		});

		it('should return stored non-key settings as plaintext', async () => {
			chromeMock.storage.local._setStore({
				enabled: true,
				primaryProvider: 'gemini',
				confidenceThreshold: 0.9,
				autoSelect: false,
			});
			const settings = await getSettings();
			expect(settings.enabled).toBe(true);
			expect(settings.primaryProvider).toBe('gemini');
			expect(settings.confidenceThreshold).toBe(0.9);
			expect(settings.autoSelect).toBe(false);
		});

		it('should fall back to defaults for type-mismatched stored values', async () => {
			chromeMock.storage.local._setStore({
				enabled: 'not-a-boolean', // wrong type
				confidenceThreshold: 'not-a-number', // wrong type
			});
			const settings = await getSettings();
			// Should get defaults due to type mismatch
			expect(settings.enabled).toBe(false);
			expect(settings.confidenceThreshold).toBe(0.7);
		});
	});

	describe('saveSettings()', () => {
		it('should encrypt API keys before storing', async () => {
			await saveSettings({ openrouterApiKey: 'sk-or-test-key-123' });
			const store = chromeMock.storage.local._getStore();
			const stored = store.openrouterApiKey as string;
			// The stored value must be encrypted (ENC: prefix)
			expect(stored).toMatch(/^ENC:/);
			// And must differ from the plaintext input
			expect(stored).not.toBe('sk-or-test-key-123');
		});

		it('should encrypt all API key fields', async () => {
			await saveSettings({
				openrouterApiKey: 'key-or',
				nvidiaApiKey: 'key-nv',
				geminiApiKey: 'key-gem',
				groqApiKey: 'key-groq',
				cerebrasApiKey: 'key-cer',
			});
			const store = chromeMock.storage.local._getStore();
			expect((store.openrouterApiKey as string).startsWith('ENC:')).toBe(true);
			expect((store.nvidiaApiKey as string).startsWith('ENC:')).toBe(true);
			expect((store.geminiApiKey as string).startsWith('ENC:')).toBe(true);
			expect((store.groqApiKey as string).startsWith('ENC:')).toBe(true);
			expect((store.cerebrasApiKey as string).startsWith('ENC:')).toBe(true);
		});

		it('should store non-key settings as plaintext', async () => {
			await saveSettings({
				enabled: true,
				primaryProvider: 'groq',
				confidenceThreshold: 0.85,
			});
			const store = chromeMock.storage.local._getStore();
			expect(store.enabled).toBe(true);
			expect(store.primaryProvider).toBe('groq');
			expect(store.confidenceThreshold).toBe(0.85);
		});

		it('should store empty string for empty API key without ENC prefix', async () => {
			await saveSettings({ openrouterApiKey: '' });
			const store = chromeMock.storage.local._getStore();
			expect(store.openrouterApiKey).toBe('');
		});
	});

	describe('encrypt/decrypt roundtrip', () => {
		it('should preserve API key through save → get cycle', async () => {
			const testKey = 'sk-or-v1-my-secret-api-key-12345';
			await saveSettings({ openrouterApiKey: testKey });
			const settings = await getSettings();
			expect(settings.openrouterApiKey).toBe(testKey);
		});

		it('should preserve all API keys through roundtrip', async () => {
			const keys = {
				openrouterApiKey: 'or-key-123',
				nvidiaApiKey: 'nv-key-456',
				geminiApiKey: 'gem-key-789',
				groqApiKey: 'groq-key-abc',
				cerebrasApiKey: 'cer-key-def',
			};
			await saveSettings(keys);
			const settings = await getSettings();
			expect(settings.openrouterApiKey).toBe(keys.openrouterApiKey);
			expect(settings.nvidiaApiKey).toBe(keys.nvidiaApiKey);
			expect(settings.geminiApiKey).toBe(keys.geminiApiKey);
			expect(settings.groqApiKey).toBe(keys.groqApiKey);
			expect(settings.cerebrasApiKey).toBe(keys.cerebrasApiKey);
		});

		it('should preserve mixed key and non-key settings', async () => {
			await saveSettings({
				openrouterApiKey: 'my-api-key',
				enabled: true,
				primaryProvider: 'nvidia-nim',
				confidenceThreshold: 0.6,
			});
			const settings = await getSettings();
			expect(settings.openrouterApiKey).toBe('my-api-key');
			expect(settings.enabled).toBe(true);
			expect(settings.primaryProvider).toBe('nvidia-nim');
			expect(settings.confidenceThreshold).toBe(0.6);
		});
	});

	describe('corrupt data handling', () => {
		it('should return empty string for corrupt encrypted data', async () => {
			// Simulate corrupt ciphertext in storage
			chromeMock.storage.local._setStore({
				openrouterApiKey: 'ENC:not-valid-base64!!!',
			});
			const settings = await getSettings();
			// decrypt should fail gracefully and return ''
			expect(settings.openrouterApiKey).toBe('');
		});

		it('should return non-encrypted strings as-is', async () => {
			// If a key was stored without encryption (legacy/manual edit)
			chromeMock.storage.local._setStore({
				openrouterApiKey: 'plaintext-key',
			});
			const settings = await getSettings();
			expect(settings.openrouterApiKey).toBe('plaintext-key');
		});

		it('should handle null/undefined stored values gracefully', async () => {
			chromeMock.storage.local._setStore({
				openrouterApiKey: null,
			});
			const settings = await getSettings();
			// decrypt(null) → return '' (falsy check)
			expect(settings.openrouterApiKey).toBe('');
		});
	});

	describe('setEnabled()', () => {
		it('should store the enabled state', async () => {
			await setEnabled(true);
			const store = chromeMock.storage.local._getStore();
			expect(store.enabled).toBe(true);
		});

		it('should toggle enabled state', async () => {
			await setEnabled(true);
			expect(chromeMock.storage.local._getStore().enabled).toBe(true);
			await setEnabled(false);
			expect(chromeMock.storage.local._getStore().enabled).toBe(false);
		});
	});
});

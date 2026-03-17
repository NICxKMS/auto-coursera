import type { AppSettings } from '../types/settings';
import { API_KEY_FIELDS, DEFAULT_SETTINGS } from '../types/settings';
import { Logger } from './logger';

const logger = new Logger('Storage');

const ENC_PREFIX = 'ENC:';
let derivedKeyPromise: Promise<CryptoKey> | null = null;

export async function getSettings(): Promise<AppSettings> {
	const raw = await chrome.storage.local.get(DEFAULT_SETTINGS);

	const result = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>) {
		if (typeof raw[key] === typeof DEFAULT_SETTINGS[key]) {
			(result as Record<string, unknown>)[key] = raw[key];
		}
	}

	// ⚡ Bolt: Parallelize API key decryption for faster storage reads
	const decryptedKeys = await Promise.all(API_KEY_FIELDS.map((key) => decrypt(raw[key] as string)));

	for (let i = 0; i < API_KEY_FIELDS.length; i++) {
		result[API_KEY_FIELDS[i]] = decryptedKeys[i];
	}

	return result;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
	const toStore: Record<string, unknown> = { ...settings };

	// ⚡ Bolt: Parallelize API key encryption for faster storage writes
	const keysToEncrypt = API_KEY_FIELDS.filter((key) => settings[key] !== undefined);
	if (keysToEncrypt.length > 0) {
		const encryptedValues = await Promise.all(
			keysToEncrypt.map((key) => encrypt(settings[key] as string)),
		);

		for (let i = 0; i < keysToEncrypt.length; i++) {
			toStore[keysToEncrypt[i]] = encryptedValues[i];
		}
	}

	await chrome.storage.local.set(toStore);
}

export async function setEnabled(enabled: boolean): Promise<void> {
	await chrome.storage.local.set({ enabled });
}

async function encrypt(plaintext: string): Promise<string> {
	if (!plaintext) return '';
	const key = await getDerivedKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(plaintext);
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
	const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
	combined.set(iv);
	combined.set(new Uint8Array(ciphertext), iv.length);
	return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

async function decrypt(stored: string): Promise<string> {
	if (!stored || !stored.startsWith(ENC_PREFIX)) return stored ?? '';
	try {
		const combined = Uint8Array.from(atob(stored.slice(ENC_PREFIX.length)), (c) => c.charCodeAt(0));
		const iv = combined.slice(0, 12);
		const ciphertext = combined.slice(12);
		const key = await getDerivedKey();
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
		return new TextDecoder().decode(decrypted);
	} catch {
		// Ciphertext corrupted or key changed (e.g., extension reload changed runtime.id)
		logger.warn('Decryption failed — key may need to be re-entered in settings');
		return '';
	}
}

async function getDerivedKey(): Promise<CryptoKey> {
	if (!derivedKeyPromise) {
		derivedKeyPromise = (async () => {
			const material = await crypto.subtle.importKey(
				'raw',
				new TextEncoder().encode(chrome.runtime.id),
				'PBKDF2',
				false,
				['deriveKey'],
			);
			return crypto.subtle.deriveKey(
				{
					name: 'PBKDF2',
					salt: new TextEncoder().encode('auto-coursera-v1'),
					iterations: 100_000,
					hash: 'SHA-256',
				},
				material,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt', 'decrypt'],
			);
		})();
	}
	return derivedKeyPromise;
}

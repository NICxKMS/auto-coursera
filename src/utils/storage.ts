import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

const ENC_PREFIX = 'ENC:';
const API_KEY_FIELDS = [
	'openrouterApiKey',
	'nvidiaApiKey',
	'geminiApiKey',
	'groqApiKey',
	'cerebrasApiKey',
] as const;
let derivedKey: CryptoKey | null = null;

export async function getSettings(): Promise<AppSettings> {
	const raw = await chrome.storage.local.get(DEFAULT_SETTINGS);

	const result = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>) {
		if (typeof raw[key] === typeof DEFAULT_SETTINGS[key]) {
			(result as Record<string, unknown>)[key] = raw[key];
		}
	}

	for (const key of API_KEY_FIELDS) {
		result[key] = await decrypt(raw[key] as string);
	}
	return result;
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
	const toStore: Record<string, unknown> = { ...settings };
	for (const key of API_KEY_FIELDS) {
		if (settings[key] !== undefined) {
			toStore[key] = await encrypt(settings[key] as string);
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
		console.warn('[Storage] Decryption failed — key may need to be re-entered in settings');
		return '';
	}
}

async function getDerivedKey(): Promise<CryptoKey> {
	if (derivedKey) return derivedKey;
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(chrome.runtime.id),
		'PBKDF2',
		false,
		['deriveKey'],
	);
	derivedKey = await crypto.subtle.deriveKey(
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
	return derivedKey;
}

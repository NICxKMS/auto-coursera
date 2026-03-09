/**
 * Options page logic — API key config, model selection, behavior settings.
 * REQ: REQ-013
 */

import type { ErrorPayload, Message } from '../types/messages';
import type { AppSettings } from '../types/settings';
import { CEREBRAS_MODELS, GEMINI_MODELS, GROQ_MODELS } from '../utils/constants';
import { Logger } from '../utils/logger';
import { getSettings, saveSettings } from '../utils/storage';

const logger = new Logger('Options');

function getElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

// DOM elements
let openrouterKeyInput: HTMLInputElement;
let nvidiaKeyInput: HTMLInputElement;
let geminiKeyInput: HTMLInputElement;
let groqKeyInput: HTMLInputElement;
let cerebrasKeyInput: HTMLInputElement;
let openrouterModelSelect: HTMLSelectElement;
let nvidiaModelSelect: HTMLSelectElement;
let geminiModelSelect: HTMLSelectElement;
let groqModelSelect: HTMLSelectElement;
let cerebrasModelSelect: HTMLSelectElement;
let primaryProviderRadios: NodeListOf<HTMLInputElement>;
let confidenceSlider: HTMLInputElement;
let thresholdValue: HTMLElement;
let autoSelectCheckbox: HTMLInputElement;
let autoStartOnPageLoadCheckbox: HTMLInputElement;
let saveBtn: HTMLButtonElement;
let testBtn: HTMLButtonElement;
let statusMessage: HTMLElement;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function populateSelect(select: HTMLSelectElement, models: readonly string[]): void {
	for (const model of models) {
		const opt = document.createElement('option');
		opt.value = model;
		opt.textContent = model;
		select.appendChild(opt);
	}
}

/**
 * Mask an API key input: show last 4 chars as placeholder, clear value.
 */
function applyKeyMask(input: HTMLInputElement, key: string, fallback: string): void {
	if (key) {
		input.value = '';
		input.placeholder = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${key.slice(-4)}`;
		input.dataset.hasKey = 'true';
	} else {
		input.placeholder = fallback;
	}
}

function populateModelDropdowns(): void {
	populateSelect(geminiModelSelect, GEMINI_MODELS);
	populateSelect(groqModelSelect, GROQ_MODELS);
	populateSelect(cerebrasModelSelect, CEREBRAS_MODELS);
}

async function init(): Promise<void> {
	// Get DOM references
	openrouterKeyInput = getElement<HTMLInputElement>('openrouterKey');
	nvidiaKeyInput = getElement<HTMLInputElement>('nvidiaKey');
	geminiKeyInput = getElement<HTMLInputElement>('geminiKey');
	groqKeyInput = getElement<HTMLInputElement>('groqKey');
	cerebrasKeyInput = getElement<HTMLInputElement>('cerebrasKey');
	openrouterModelSelect = getElement<HTMLSelectElement>('openrouterModel');
	nvidiaModelSelect = getElement<HTMLSelectElement>('nvidiaModel');
	geminiModelSelect = getElement<HTMLSelectElement>('geminiModel');
	groqModelSelect = getElement<HTMLSelectElement>('groqModel');
	cerebrasModelSelect = getElement<HTMLSelectElement>('cerebrasModel');
	primaryProviderRadios = document.querySelectorAll(
		'input[name="primaryProvider"]',
	) as NodeListOf<HTMLInputElement>;
	confidenceSlider = getElement<HTMLInputElement>('confidenceThreshold');
	thresholdValue = getElement<HTMLElement>('thresholdValue');
	autoSelectCheckbox = getElement<HTMLInputElement>('autoSelect');
	autoStartOnPageLoadCheckbox = getElement<HTMLInputElement>('autoStartOnPageLoad');
	saveBtn = getElement<HTMLButtonElement>('saveBtn');
	testBtn = getElement<HTMLButtonElement>('testBtn');
	statusMessage = getElement<HTMLElement>('statusMessage');

	// Load current settings
	populateModelDropdowns();
	await loadSettings();

	// Event listeners
	saveBtn.addEventListener('click', handleSave);
	testBtn.addEventListener('click', handleTest);
	confidenceSlider.addEventListener('input', () => {
		thresholdValue.textContent = confidenceSlider.value;
	});

	// Issue 9: Onboarding flow — show on first install
	const { onboarded } = await chrome.storage.local.get({ onboarded: false });
	if (!onboarded) {
		const onboardingEl = document.getElementById('onboarding');
		if (onboardingEl) {
			onboardingEl.style.display = 'block';
			document.getElementById('dismissOnboarding')?.addEventListener('click', async () => {
				onboardingEl.style.display = 'none';
				await chrome.storage.local.set({ onboarded: true });
			});
		}
	}

	logger.info('Options page initialized');
}

async function loadSettings(): Promise<void> {
	const settings = await getSettings();

	// Issue 7: Masked API keys — show placeholder with last 4 chars
	applyKeyMask(openrouterKeyInput, settings.openrouterApiKey, 'sk-or-...');
	applyKeyMask(nvidiaKeyInput, settings.nvidiaApiKey, 'nvapi-...');
	applyKeyMask(geminiKeyInput, settings.geminiApiKey, 'AIza...');
	applyKeyMask(groqKeyInput, settings.groqApiKey, 'gsk_...');
	applyKeyMask(cerebrasKeyInput, settings.cerebrasApiKey, 'cbs-...');

	// Clear hasKey flag when user interacts with a key field, enabling intentional clearing
	for (const input of [
		openrouterKeyInput,
		nvidiaKeyInput,
		geminiKeyInput,
		groqKeyInput,
		cerebrasKeyInput,
	]) {
		input.addEventListener(
			'input',
			() => {
				delete input.dataset.hasKey;
			},
			{ once: true },
		);
	}

	// Model selection
	openrouterModelSelect.value = settings.openrouterModel;
	nvidiaModelSelect.value = settings.nvidiaModel;
	geminiModelSelect.value = settings.geminiModel;
	groqModelSelect.value = settings.groqModel;
	cerebrasModelSelect.value = settings.cerebrasModel;

	// Primary provider
	primaryProviderRadios.forEach((radio) => {
		radio.checked = radio.value === settings.primaryProvider;
	});

	// Behavior
	confidenceSlider.value = settings.confidenceThreshold.toString();
	thresholdValue.textContent = settings.confidenceThreshold.toString();
	autoSelectCheckbox.checked = settings.autoSelect;
	autoStartOnPageLoadCheckbox.checked = settings.autoStartOnPageLoad;
}

/**
 * Handle Save button — persist settings.
 * AC-013.6: Save persists via StorageManager.saveSettings()
 */
async function handleSave(): Promise<void> {
	try {
		saveBtn.disabled = true;
		saveBtn.textContent = 'Saving...';

		const selectedProvider =
			Array.from(primaryProviderRadios).find((r) => r.checked)?.value ?? 'openrouter';

		// Issue 7: Only save API key if user typed a new one
		const currentSettings = await getSettings();
		const apiKeyFields: { input: HTMLInputElement; key: keyof AppSettings }[] = [
			{ input: openrouterKeyInput, key: 'openrouterApiKey' },
			{ input: nvidiaKeyInput, key: 'nvidiaApiKey' },
			{ input: geminiKeyInput, key: 'geminiApiKey' },
			{ input: groqKeyInput, key: 'groqApiKey' },
			{ input: cerebrasKeyInput, key: 'cerebrasApiKey' },
		];
		const resolvedKeys: Partial<AppSettings> = {};
		for (const { input, key } of apiKeyFields) {
			// If user typed a new value, use it; if field was untouched (has stored key), keep it; otherwise clear
			const typed = input.value.trim();
			if (typed) {
				(resolvedKeys as Record<string, string>)[key] = typed;
			} else if (input.dataset.hasKey === 'true') {
				(resolvedKeys as Record<string, string>)[key] = currentSettings[key] as string;
			} else {
				(resolvedKeys as Record<string, string>)[key] = '';
			}
		}

		const settings: Partial<AppSettings> = {
			...resolvedKeys,
			openrouterModel: openrouterModelSelect.value,
			nvidiaModel: nvidiaModelSelect.value,
			geminiModel: geminiModelSelect.value,
			groqModel: groqModelSelect.value,
			cerebrasModel: cerebrasModelSelect.value,
			primaryProvider: selectedProvider as AppSettings['primaryProvider'],
			confidenceThreshold: parseFloat(confidenceSlider.value),
			autoSelect: autoSelectCheckbox.checked,
			autoStartOnPageLoad: autoStartOnPageLoadCheckbox.checked,
		};

		await saveSettings(settings);
		showStatus('Settings saved successfully!', 'success');
		logger.info('Settings saved');
	} catch (error) {
		showStatus('Failed to save settings. Please try again.', 'error');
		logger.error('Save failed', error);
	} finally {
		saveBtn.disabled = false;
		saveBtn.textContent = 'Save Settings';
	}
}

/**
 * Handle Test button — validate API keys by making test requests.
 * AC-013.6: Test validates API keys
 */
async function handleTest(): Promise<void> {
	try {
		testBtn.disabled = true;
		testBtn.textContent = 'Testing...';

		const results: string[] = [];

		// Issue 3: Enhanced model validation — test selected model
		const hasKey = (el: HTMLInputElement) => el.value.trim() || el.dataset.hasKey === 'true';
		const allKeyInputs = [
			openrouterKeyInput,
			nvidiaKeyInput,
			geminiKeyInput,
			groqKeyInput,
			cerebrasKeyInput,
		];
		const selectedProvider =
			Array.from(primaryProviderRadios).find((r) => r.checked)?.value ?? 'openrouter';
		const modelSelects: Record<string, HTMLSelectElement> = {
			openrouter: openrouterModelSelect,
			'nvidia-nim': nvidiaModelSelect,
			gemini: geminiModelSelect,
			groq: groqModelSelect,
			cerebras: cerebrasModelSelect,
		};
		const selectedModel = modelSelects[selectedProvider]?.value || 'unknown';
		if (allKeyInputs.some((el) => hasKey(el))) {
			try {
				const res = (await chrome.runtime.sendMessage({
					type: 'SOLVE_QUESTION',
					payload: {
						uid: 'test',
						type: 'single-choice',
						questionText: 'What is 2 + 2?',
						options: ['3', '4', '5', '6'],
						metadata: {
							pageUrl: 'test',
							quizTitle: null,
							questionIndex: 0,
							totalQuestions: 1,
						},
					},
				})) as Message | undefined;
				if (res?.type === 'SELECT_ANSWER') {
					results.push(`✅ Model ${selectedModel}: Connected`);
				} else {
					const errPayload = res?.payload as ErrorPayload | undefined;
					results.push(`⚠️ Model ${selectedModel}: ${errPayload?.message || 'Unknown error'}`);
				} // Clear test pollution from session status
				await chrome.storage.session.set({
					_lastStatus: 'idle',
					_lastProvider: '',
					_lastModel: '',
					_lastConfidence: null,
				});
			} catch {
				results.push(`❌ Model ${selectedModel}: Connection failed`);
			}
		} else {
			results.push('⏭️ No API keys configured');
		}

		showStatus(results.join('\n'), results.some((r) => r.startsWith('❌')) ? 'error' : 'success');
	} catch (error) {
		showStatus('Test failed. Check console for details.', 'error');
		logger.error('Test failed', error);
	} finally {
		testBtn.disabled = false;
		testBtn.textContent = 'Test Connection';
	}
}

function showStatus(message: string, type: 'success' | 'error'): void {
	if (statusTimeout) clearTimeout(statusTimeout);
	statusMessage.textContent = message;
	statusMessage.className = `status-message ${type}`;
	statusTimeout = setTimeout(() => {
		statusMessage.className = 'status-message';
		statusTimeout = null;
	}, 5000);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
	init().catch((err) => logger.error('Options init failed', err));
});

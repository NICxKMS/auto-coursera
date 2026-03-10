/**
 * Options page logic — API key config, model selection, behavior settings.
 * REQ: REQ-013
 */

import {
	SETTINGS_PROVIDERS,
	loadSettingsView,
	saveSettingsFromSnapshot,
	testSettingsConnection,
	type LoadedSettingsView,
	type SettingsFormSnapshot,
	type SettingsProviderDefinition,
} from '../settings/domain';
import type { ProviderName } from '../types/settings';
import { Logger } from '../utils/logger';

const logger = new Logger('Options');

function getElement<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Element #${id} not found`);
	return el as T;
}

function createProviderRecord<T>(
	builder: (provider: SettingsProviderDefinition) => T,
): Record<ProviderName, T> {
	return Object.fromEntries(
		SETTINGS_PROVIDERS.map((provider) => [provider.name, builder(provider)]),
	) as Record<ProviderName, T>;
}

// DOM elements
let onboardingEl: HTMLDivElement;
let apiKeyFieldsEl: HTMLDivElement;
let modelFieldsEl: HTMLDivElement;
let providerPriorityGroupEl: HTMLDivElement;
let keyInputs = createProviderRecord(() => document.createElement('input'));
let modelSelects = createProviderRecord(() => document.createElement('select'));
let primaryProviderRadios = createProviderRecord(() => document.createElement('input'));
let confidenceSlider: HTMLInputElement;
let thresholdValue: HTMLElement;
let autoSelectCheckbox: HTMLInputElement;
let autoStartOnPageLoadCheckbox: HTMLInputElement;
let saveBtn: HTMLButtonElement;
let testBtn: HTMLButtonElement;
let statusMessage: HTMLElement;
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function buildModelSelect(provider: SettingsProviderDefinition): HTMLSelectElement {
	const select = document.createElement('select');
	select.id = `${provider.name}Model`;

	if (provider.catalog.kind === 'grouped') {
		for (const group of provider.catalog.groups) {
			const optgroup = document.createElement('optgroup');
			optgroup.label = group.label;

			for (const optionConfig of group.options) {
				const option = document.createElement('option');
				option.value = optionConfig.value;
				option.textContent = optionConfig.label;
				optgroup.appendChild(option);
			}

			select.appendChild(optgroup);
		}
		return select;
	}

	for (const model of provider.catalog.models) {
		const option = document.createElement('option');
		option.value = model;
		option.textContent = model;
		select.appendChild(option);
	}

	return select;
}

function renderDynamicSections(): void {
	apiKeyFieldsEl.textContent = '';
	modelFieldsEl.textContent = '';
	providerPriorityGroupEl.textContent = '';

	keyInputs = createProviderRecord(() => document.createElement('input'));
	modelSelects = createProviderRecord(() => document.createElement('select'));
	primaryProviderRadios = createProviderRecord(() => document.createElement('input'));

	for (const provider of SETTINGS_PROVIDERS) {
		const keyField = document.createElement('div');
		keyField.className = 'form-field';

		const keyLabel = document.createElement('label');
		keyLabel.htmlFor = `${provider.name}Key`;
		keyLabel.textContent = provider.keyLabel;

		const keyInput = document.createElement('input');
		keyInput.type = 'password';
		keyInput.id = `${provider.name}Key`;
		keyInput.placeholder = provider.keyPlaceholder;
		keyInput.autocomplete = 'off';
		keyInput.addEventListener('input', () => {
			delete keyInput.dataset.hasKey;
		});

		keyField.append(keyLabel, keyInput);
		apiKeyFieldsEl.appendChild(keyField);
		keyInputs[provider.name] = keyInput;

		const modelField = document.createElement('div');
		modelField.className = 'form-field';

		const modelLabel = document.createElement('label');
		modelLabel.htmlFor = `${provider.name}Model`;
		modelLabel.textContent = provider.modelLabel;

		const modelSelect = buildModelSelect(provider);
		modelField.append(modelLabel, modelSelect);
		modelFieldsEl.appendChild(modelField);
		modelSelects[provider.name] = modelSelect;

		const radioLabel = document.createElement('label');
		const radioInput = document.createElement('input');
		radioInput.type = 'radio';
		radioInput.name = 'primaryProvider';
		radioInput.value = provider.name;
		radioInput.checked = provider.name === 'openrouter';
		radioLabel.append(radioInput, document.createTextNode(` ${provider.label} (Primary)`));
		providerPriorityGroupEl.appendChild(radioLabel);
		primaryProviderRadios[provider.name] = radioInput;
	}
}

function getSelectedProvider(): ProviderName {
	return (
		SETTINGS_PROVIDERS.find((provider) => primaryProviderRadios[provider.name].checked)?.name ??
		'openrouter'
	);
}

function getSnapshot(): SettingsFormSnapshot {
	return {
		keyInputs: createProviderRecord((provider) => ({
			value: keyInputs[provider.name].value,
			hasStoredValue: keyInputs[provider.name].dataset.hasKey === 'true',
		})),
		models: createProviderRecord((provider) => modelSelects[provider.name].value),
		primaryProvider: getSelectedProvider(),
		confidenceThreshold: Number.parseFloat(confidenceSlider.value),
		autoSelect: autoSelectCheckbox.checked,
		autoStartOnPageLoad: autoStartOnPageLoadCheckbox.checked,
	};
}

function applyLoadedView(view: LoadedSettingsView): void {
	for (const provider of SETTINGS_PROVIDERS) {
		const input = keyInputs[provider.name];
		input.value = '';
		input.placeholder = view.keyPlaceholders[provider.name];
		if (view.keyHasStoredValue[provider.name]) {
			input.dataset.hasKey = 'true';
		} else {
			delete input.dataset.hasKey;
		}

		modelSelects[provider.name].value = view.models[provider.name];
		primaryProviderRadios[provider.name].checked = provider.name === view.primaryProvider;
	}

	confidenceSlider.value = view.confidenceThreshold.toString();
	thresholdValue.textContent = view.confidenceThreshold.toString();
	autoSelectCheckbox.checked = view.autoSelect;
	autoStartOnPageLoadCheckbox.checked = view.autoStartOnPageLoad;
	onboardingEl.style.display = view.onboardingComplete ? 'none' : 'block';
}

async function init(): Promise<void> {
	// Get DOM references
	onboardingEl = getElement<HTMLDivElement>('onboarding');
	apiKeyFieldsEl = getElement<HTMLDivElement>('apiKeyFields');
	modelFieldsEl = getElement<HTMLDivElement>('modelFields');
	providerPriorityGroupEl = getElement<HTMLDivElement>('providerPriorityGroup');
	confidenceSlider = getElement<HTMLInputElement>('confidenceThreshold');
	thresholdValue = getElement<HTMLElement>('thresholdValue');
	autoSelectCheckbox = getElement<HTMLInputElement>('autoSelect');
	autoStartOnPageLoadCheckbox = getElement<HTMLInputElement>('autoStartOnPageLoad');
	saveBtn = getElement<HTMLButtonElement>('saveBtn');
	testBtn = getElement<HTMLButtonElement>('testBtn');
	statusMessage = getElement<HTMLElement>('statusMessage');
	renderDynamicSections();

	// Load current settings
	await loadSettings();

	// Event listeners
	saveBtn.addEventListener('click', handleSave);
	testBtn.addEventListener('click', handleTest);
	confidenceSlider.addEventListener('input', () => {
		thresholdValue.textContent = confidenceSlider.value;
	});

	logger.info('Options page initialized');
}

async function loadSettings(): Promise<void> {
	applyLoadedView(await loadSettingsView());
}

/**
 * Handle Save button — persist settings.
 * AC-013.6: Save persists via the shared settings-domain workflow.
 */
async function handleSave(): Promise<void> {
	try {
		saveBtn.disabled = true;
		saveBtn.textContent = 'Saving...';
		applyLoadedView(await saveSettingsFromSnapshot(getSnapshot()));
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

		const result = await testSettingsConnection(getSnapshot());
		showStatus(result.message, result.type);
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

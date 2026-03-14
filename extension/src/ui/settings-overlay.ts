/**
 * Settings overlay — full-viewport modal for configuring the extension.
 * Uses the shared settings-domain module so the overlay stays aligned on
 * provider catalogs, key masking, save payload assembly, test-connection
 * staging, and onboarding semantics.
 *
 * This is the sole settings surface — there is no separate options page.
 *
 * Features:
 *   - API key inputs with masked values (last 4 chars visible for existing keys)
 *   - Provider/model controls generated from shared provider metadata
 *   - Provider priority radio buttons
 *   - Behavior controls: confidence slider, auto-select, auto-start checkboxes
 *   - Save & test connection
 *   - Focus trap (Tab cycles within overlay, Escape closes)
 *   - Unsaved changes detection with confirm-before-close
 *   - Onboarding banner shown until at least one API key is configured
 *
 * Dependencies:
 *   - settings/domain.ts  (shared settings-domain metadata + workflows)
 *   - widget-state.ts     (WidgetStore)
 *   - styles/             (OVERLAY_STYLES CSS classes)
 */

import {
	createSettingsWorkflowController,
	type LoadedSettingsView,
	type ModelGroup,
	SETTINGS_PROVIDERS,
	type SettingsFormSnapshot,
	type SettingsWorkflowAction,
	type SettingsWorkflowController,
} from '../settings/domain';
import type { ProviderName } from '../types/settings';
import { createField, createSection } from './overlay-helpers';
import type { WidgetStore } from './widget-state';

// ── Constants ───────────────────────────────────────────────────

const STATUS_DISMISS_MS = 5000;

// ── SettingsOverlay ─────────────────────────────────────────────

export class SettingsOverlay {
	private readonly el: HTMLDivElement;
	private readonly card: HTMLDivElement;

	// Form elements
	private readonly keyInputs: Record<ProviderName, HTMLInputElement> = {} as Record<
		ProviderName,
		HTMLInputElement
	>;
	private readonly modelSelects: Record<ProviderName, HTMLSelectElement> = {} as Record<
		ProviderName,
		HTMLSelectElement
	>;
	private readonly radioInputs: Record<ProviderName, HTMLInputElement> = {} as Record<
		ProviderName,
		HTMLInputElement
	>;
	private readonly radioLabels: Record<ProviderName, HTMLLabelElement> = {} as Record<
		ProviderName,
		HTMLLabelElement
	>;
	private confidenceInput!: HTMLInputElement;
	private confidenceValueEl!: HTMLSpanElement;
	private autoSelectLabel!: HTMLLabelElement;
	private autoSelectInput!: HTMLInputElement;
	private autoStartLabel!: HTMLLabelElement;
	private autoStartInput!: HTMLInputElement;

	// Buttons
	private saveBtn!: HTMLButtonElement;
	private testBtn!: HTMLButtonElement;
	private statusMsgEl!: HTMLSpanElement;

	// Onboarding
	private onboardingBanner!: HTMLDivElement;

	/** Callback wired by WidgetHost — called when the overlay closes itself */
	onClose: (() => void) | null = null;

	// Internal state
	private dirty = false;
	private statusTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly workflow: SettingsWorkflowController;

	constructor(private readonly store: WidgetStore) {
		this.workflow = createSettingsWorkflowController(
			{
				getSnapshot: () => this.getSnapshot(),
				applyLoadedView: (view) => this.applyLoadedView(view),
				setActionPending: (action, pending) => this.setActionPending(action, pending),
				showStatus: (result) => this.showStatus(result.message, result.type),
				markPristine: () => {
					this.dirty = false;
				},
			},
			{
				saveSuccess: '✅ Settings saved successfully!',
				saveError: 'Failed to save settings. Please try again.',
				testError: '❌ Connection failed',
			},
		);

		// ── Backdrop ───────────────────────────────────────────
		this.el = document.createElement('div');
		this.el.className = 'ac-overlay';
		this.el.setAttribute('role', 'dialog');
		this.el.setAttribute('aria-modal', 'true');
		this.el.setAttribute('aria-label', 'Auto-Coursera Settings');

		// Backdrop click → close
		this.el.addEventListener('click', (e) => {
			if (e.target === this.el) this.requestClose();
		});

		// ── Card ───────────────────────────────────────────────
		this.card = document.createElement('div');
		this.card.className = 'ac-overlay__card';

		// Header
		const header = this.buildHeader();

		// Body (scrollable)
		const body = document.createElement('div');
		body.className = 'ac-overlay__body';
		this.buildBody(body);

		// Footer
		const footer = this.buildFooter();

		this.card.append(header, body, footer);
		this.el.appendChild(this.card);

		// ── Keyboard ───────────────────────────────────────────
		this.el.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.requestClose();
			}
			if (e.key === 'Tab') {
				this.handleFocusTrap(e);
			}
		});
	}

	// ── DOM Builders ──────────────────────────────────────────

	private buildHeader(): HTMLDivElement {
		const header = document.createElement('div');
		header.className = 'ac-overlay__header';

		const title = document.createElement('span');
		title.className = 'ac-overlay__title';
		title.textContent = 'Settings';

		const closeBtn = document.createElement('button');
		closeBtn.className = 'ac-overlay__close';
		closeBtn.textContent = '✕';
		closeBtn.setAttribute('aria-label', 'Close settings');
		closeBtn.addEventListener('click', () => this.requestClose());

		header.append(title, closeBtn);
		return header;
	}

	private buildBody(body: HTMLDivElement): void {
		// Onboarding
		this.onboardingBanner = this.buildOnboarding();
		body.appendChild(this.onboardingBanner);

		// API Keys
		body.appendChild(this.buildApiKeysSection());

		// Model Selection
		body.appendChild(this.buildModelSection());

		// Provider Priority
		body.appendChild(this.buildProviderPrioritySection());

		// Behavior
		body.appendChild(this.buildBehaviorSection());
	}

	private buildOnboarding(): HTMLDivElement {
		const banner = document.createElement('div');
		banner.className = 'ac-overlay-onboarding ac-hidden';

		const title = document.createElement('span');
		title.className = 'ac-overlay-onboarding__title';
		title.textContent = 'Welcome to Auto-Coursera! 🎓';

		const text = document.createElement('span');
		text.className = 'ac-overlay-onboarding__text';
		text.textContent =
			'Get a free API key from OpenRouter, paste it below, then navigate to any Coursera quiz.';

		banner.append(title, text);
		return banner;
	}

	// ── API Keys Section ──────────────────────────────────────

	private buildApiKeysSection(): HTMLDivElement {
		const section = createSection('API Keys');

		for (const provider of SETTINGS_PROVIDERS) {
			const input = document.createElement('input');
			input.type = 'password';
			input.className = 'ac-input';
			input.placeholder = provider.keyPlaceholder;
			input.autocomplete = 'off';
			input.setAttribute('aria-label', provider.keyLabel);

			input.addEventListener('input', () => {
				this.dirty = true;
				delete input.dataset.hasKey;
			});

			section.appendChild(createField(provider.keyLabel, `ac-key-${provider.name}`, input));
			this.keyInputs[provider.name] = input;
		}

		return section;
	}

	// ── Model Selection Section ───────────────────────────────

	private buildModelSection(): HTMLDivElement {
		const section = createSection('Model Selection');

		for (const provider of SETTINGS_PROVIDERS) {
			const select =
				provider.catalog.kind === 'grouped'
					? this.buildOptGroupSelect(provider.catalog.groups)
					: this.buildFlatSelect(provider.catalog.models);

			select.setAttribute('aria-label', provider.modelLabel);
			select.addEventListener('change', () => {
				this.dirty = true;
			});

			section.appendChild(createField(provider.modelLabel, `ac-model-${provider.name}`, select));
			this.modelSelects[provider.name] = select;
		}

		return section;
	}

	/** Build a <select> with <optgroup> children from grouped model data */
	private buildOptGroupSelect(groups: readonly ModelGroup[]): HTMLSelectElement {
		const select = document.createElement('select');
		select.className = 'ac-select';

		for (const group of groups) {
			const optgroup = document.createElement('optgroup');
			optgroup.label = group.label;

			for (const opt of group.options) {
				const option = document.createElement('option');
				option.value = opt.value;
				option.textContent = opt.label;
				optgroup.appendChild(option);
			}

			select.appendChild(optgroup);
		}

		return select;
	}

	/** Build a <select> from a flat list of model strings */
	private buildFlatSelect(models: readonly string[]): HTMLSelectElement {
		const select = document.createElement('select');
		select.className = 'ac-select';

		for (const model of models) {
			const option = document.createElement('option');
			option.value = model;
			option.textContent = model;
			select.appendChild(option);
		}

		return select;
	}

	// ── Provider Priority Section ─────────────────────────────

	private buildProviderPrioritySection(): HTMLDivElement {
		const section = createSection('Primary Provider');

		const radioGroup = document.createElement('div');
		radioGroup.className = 'ac-radio-group';
		radioGroup.setAttribute('role', 'radiogroup');
		radioGroup.setAttribute('aria-label', 'Primary AI provider');

		for (const provider of SETTINGS_PROVIDERS) {
			const label = document.createElement('label');
			label.className = 'ac-radio';

			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'ac-primaryProvider';
			input.value = provider.name;
			input.className = 'ac-sr-only';
			input.setAttribute('aria-label', `${provider.label} as primary provider`);

			const dot = document.createElement('span');
			dot.className = 'ac-radio__dot';

			label.append(input, dot, document.createTextNode(` ${provider.label}`));

			input.addEventListener('change', () => {
				this.updateRadioVisuals();
				this.dirty = true;
			});

			radioGroup.appendChild(label);

			this.radioInputs[provider.name] = input;
			this.radioLabels[provider.name] = label;
		}

		section.appendChild(radioGroup);
		return section;
	}

	/** Sync .ac-radio--selected on all radio labels based on checked state */
	private updateRadioVisuals(): void {
		for (const provider of SETTINGS_PROVIDERS) {
			const isChecked = this.radioInputs[provider.name].checked;
			this.radioLabels[provider.name].classList.toggle('ac-radio--selected', isChecked);
		}
	}

	// ── Behavior Section ──────────────────────────────────────

	private buildBehaviorSection(): HTMLDivElement {
		const section = createSection('Behavior');

		// Confidence slider
		const slider = document.createElement('div');
		slider.className = 'ac-slider';

		const sliderHeader = document.createElement('div');
		sliderHeader.className = 'ac-slider__header';

		const sliderLabel = document.createElement('span');
		sliderLabel.className = 'ac-slider__label';
		sliderLabel.textContent = 'Confidence Threshold';

		this.confidenceValueEl = document.createElement('span');
		this.confidenceValueEl.className = 'ac-slider__value';
		this.confidenceValueEl.textContent = '0.70';

		sliderHeader.append(sliderLabel, this.confidenceValueEl);

		this.confidenceInput = document.createElement('input');
		this.confidenceInput.type = 'range';
		this.confidenceInput.className = 'ac-slider__input';
		this.confidenceInput.min = '0';
		this.confidenceInput.max = '1';
		this.confidenceInput.step = '0.05';
		this.confidenceInput.value = '0.7';
		this.confidenceInput.setAttribute('aria-label', 'Confidence threshold');

		this.confidenceInput.addEventListener('input', () => {
			this.confidenceValueEl.textContent = Number.parseFloat(this.confidenceInput.value).toFixed(2);
			this.dirty = true;
		});

		slider.append(sliderHeader, this.confidenceInput);
		section.appendChild(slider);

		// Auto-select checkbox
		const autoSelectResult = this.buildCheckbox(
			'Auto-select answers (uncheck for highlight-only)',
			true,
		);
		this.autoSelectLabel = autoSelectResult.label;
		this.autoSelectInput = autoSelectResult.input;
		section.appendChild(this.autoSelectLabel);

		// Auto-start checkbox
		const autoStartResult = this.buildCheckbox('Auto-start solver on page load', true);
		this.autoStartLabel = autoStartResult.label;
		this.autoStartInput = autoStartResult.input;
		section.appendChild(this.autoStartLabel);

		return section;
	}

	/** Build a custom checkbox with hidden input and visual box */
	private buildCheckbox(
		text: string,
		defaultChecked: boolean,
	): { label: HTMLLabelElement; input: HTMLInputElement } {
		const label = document.createElement('label');
		label.className = `ac-checkbox${defaultChecked ? ' ac-checkbox--checked' : ''}`;

		const input = document.createElement('input');
		input.type = 'checkbox';
		input.className = 'ac-sr-only';
		input.checked = defaultChecked;
		input.setAttribute('aria-label', text);

		const box = document.createElement('span');
		box.className = 'ac-checkbox__box';

		label.append(input, box, document.createTextNode(` ${text}`));

		input.addEventListener('change', () => {
			label.classList.toggle('ac-checkbox--checked', input.checked);
			this.dirty = true;
		});

		return { label, input };
	}

	// ── Footer ────────────────────────────────────────────────

	private buildFooter(): HTMLDivElement {
		const footer = document.createElement('div');
		footer.className = 'ac-overlay__footer';

		this.saveBtn = document.createElement('button');
		this.saveBtn.className = 'ac-btn ac-btn--primary';
		this.saveBtn.textContent = '💾 Save Settings';
		this.saveBtn.addEventListener('click', () => this.handleSave());

		this.testBtn = document.createElement('button');
		this.testBtn.className = 'ac-btn ac-btn--secondary';
		this.testBtn.textContent = '🔌 Test Connection';
		this.testBtn.addEventListener('click', () => this.handleTest());

		this.statusMsgEl = document.createElement('span');
		this.statusMsgEl.className = 'ac-status-msg';

		footer.append(this.saveBtn, this.testBtn, this.statusMsgEl);
		return footer;
	}

	// ── Settings Load / Save ──────────────────────────────────

	private getSelectedProvider(): ProviderName {
		return (
			SETTINGS_PROVIDERS.find((provider) => this.radioInputs[provider.name].checked)?.name ??
			'openrouter'
		);
	}

	private getSnapshot(): SettingsFormSnapshot {
		return {
			keyInputs: Object.fromEntries(
				SETTINGS_PROVIDERS.map((provider) => [
					provider.name,
					{
						value: this.keyInputs[provider.name].value,
						hasStoredValue: this.keyInputs[provider.name].dataset.hasKey === 'true',
					},
				]),
			) as Record<ProviderName, SettingsFormSnapshot['keyInputs'][ProviderName]>,
			models: Object.fromEntries(
				SETTINGS_PROVIDERS.map((provider) => [
					provider.name,
					this.modelSelects[provider.name].value,
				]),
			) as Record<ProviderName, string>,
			primaryProvider: this.getSelectedProvider(),
			confidenceThreshold: Number.parseFloat(this.confidenceInput.value),
			autoSelect: this.autoSelectInput.checked,
			autoStartOnPageLoad: this.autoStartInput.checked,
		};
	}

	private applyLoadedView(view: LoadedSettingsView): void {
		for (const provider of SETTINGS_PROVIDERS) {
			const providerView = view.providers[provider.name];
			const input = this.keyInputs[provider.name];
			input.value = '';
			input.placeholder = providerView.keyPlaceholder;
			if (providerView.hasStoredKey) {
				input.dataset.hasKey = 'true';
			} else {
				delete input.dataset.hasKey;
			}

			this.modelSelects[provider.name].value = providerView.model;
			this.radioInputs[provider.name].checked = providerView.availability.isPrimary;
		}
		this.updateRadioVisuals();

		this.confidenceInput.value = view.confidenceThreshold.toString();
		this.confidenceValueEl.textContent = view.confidenceThreshold.toFixed(2);

		this.autoSelectInput.checked = view.autoSelect;
		this.autoSelectLabel.classList.toggle('ac-checkbox--checked', view.autoSelect);

		this.autoStartInput.checked = view.autoStartOnPageLoad;
		this.autoStartLabel.classList.toggle('ac-checkbox--checked', view.autoStartOnPageLoad);

		this.onboardingBanner.classList.toggle('ac-hidden', view.onboardingComplete);
	}

	private setActionPending(
		action: Exclude<SettingsWorkflowAction, 'load'>,
		pending: boolean,
	): void {
		if (action === 'save') {
			this.saveBtn.disabled = pending;
			this.saveBtn.textContent = pending ? 'Saving...' : '💾 Save Settings';
			return;
		}

		this.testBtn.disabled = pending;
		this.testBtn.textContent = pending ? 'Testing...' : '🔌 Test Connection';
	}

	/**
	 * Load current settings from chrome.storage and populate form.
	 * Key masking: existing keys show `••••••••••xxxx` as placeholder.
	 */
	private async loadSettings(): Promise<void> {
		await this.workflow.load();
	}

	/**
	 * Handle Save — persist settings via the shared workflow controller.
	 *   - If user typed → save new key
	 *   - If untouched (hasKey) → keep existing key
	 *   - If cleared → save empty string
	 */
	private async handleSave(): Promise<void> {
		await this.workflow.save();
	}

	/**
	 * Handle Test Connection — send staged settings through TEST_CONNECTION
	 * via the shared workflow controller.
	 */
	private async handleTest(): Promise<void> {
		await this.workflow.test();
	}

	// ── Status Message ────────────────────────────────────────

	/** Show a transient status message in the footer */
	private showStatus(message: string, type: 'success' | 'error'): void {
		if (this.statusTimer) clearTimeout(this.statusTimer);
		this.statusMsgEl.textContent = message;
		this.statusMsgEl.className = `ac-status-msg ac-status-msg--${type} ac-status-msg--visible`;
		this.statusTimer = setTimeout(() => {
			this.statusMsgEl.classList.remove('ac-status-msg--visible');
			this.statusTimer = null;
		}, STATUS_DISMISS_MS);
	}

	// ── Focus Trap ────────────────────────────────────────────

	/**
	 * Trap Tab focus within the overlay card.
	 * Uses getRootNode() to access the ShadowRoot's activeElement.
	 */
	private handleFocusTrap(e: KeyboardEvent): void {
		const focusable = Array.from(
			this.card.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		).filter((el) => el.offsetParent !== null); // exclude hidden elements

		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		// Get the currently focused element within the shadow DOM
		const root = this.el.getRootNode() as ShadowRoot;
		const active = root.activeElement as HTMLElement | null;

		if (e.shiftKey) {
			if (active === first || !this.card.contains(active)) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (active === last || !this.card.contains(active)) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// ── Close Logic ───────────────────────────────────────────

	/**
	 * User-initiated close — checks for unsaved changes.
	 * Called by close button, Escape key, backdrop click.
	 */
	private requestClose(): void {
		if (this.dirty) {
			// eslint-disable-next-line no-restricted-globals -- intentional use of confirm()
			if (!confirm('You have unsaved changes. Discard?')) return;
		}
		this.close();
	}

	// ── Public API ────────────────────────────────────────────

	/** Open the overlay and load current settings */
	open(): void {
		this.dirty = false;
		this.el.classList.add('ac-overlay--open');
		this.loadSettings().catch(() => {
			// If settings fail to load, form shows defaults/empty
		});
		// Focus first interactive element after open animation
		setTimeout(() => {
			const first = this.card.querySelector<HTMLElement>('input, select, button');
			first?.focus();
		}, 300);
	}

	/** Close the overlay and notify host */
	close(): void {
		this.dirty = false;
		if (this.statusTimer) {
			clearTimeout(this.statusTimer);
			this.statusTimer = null;
		}
		this.statusMsgEl.className = 'ac-status-msg';
		this.el.classList.remove('ac-overlay--open');
		this.onClose?.();
	}

	/** Return the root element for appending to the Shadow DOM */
	getElement(): HTMLDivElement {
		return this.el;
	}

	/** Full cleanup — remove element, clear timers (does not trigger onClose) */
	destroy(): void {
		if (this.statusTimer) {
			clearTimeout(this.statusTimer);
			this.statusTimer = null;
		}
		this.el.remove();
	}
}

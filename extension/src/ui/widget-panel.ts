/**
 * Expanded panel — 320×480px floating card showing status, stats, and actions.
 * Subscribes to WidgetStore for reactive updates. All DOM created via createElement.
 *
 * Sections:
 *   - Header: brand icon, title, status badge, progress bar, minimize button
 *   - Toggle row: enable/disable extension
 *   - Error banner: user-friendly error messages (click to copy)
 *   - Onboarding: banner shown when no API keys are configured
 *   - Status info: provider, model, confidence
 *   - Stats grid: solved/failed/tokens with animated counters
 *   - Action buttons: Scan Page, Retry (via ContentBridge)
 *   - Footer: Settings link
 *
 * Dependencies:
 *   - widget-state.ts  (WidgetStore)
 *   - widget-types.ts  (ContentBridge, WidgetState)
 *   - ./styles/panel.ts (PANEL_STYLES CSS classes)
 */

import { loadSettingsView } from '../settings/domain';
import { copyToClipboard } from '../utils/clipboard';
import { getUserFriendlyError } from '../utils/error-messages';
import type { WidgetStore } from './widget-state';
import type { ContentBridge, WidgetState } from './widget-types';

// ── Constants ───────────────────────────────────────────────────

const COUNTER_ANIM_MS = 300;
const BUTTON_RESET_MS = 1500;

// ── WidgetPanel ─────────────────────────────────────────────────

export class WidgetPanel {
	private readonly el: HTMLDivElement;

	// Header (assigned in buildHeader(), called from constructor)
	private statusBadge!: HTMLSpanElement;
	private statusDot!: HTMLSpanElement;
	private statusLabel!: HTMLSpanElement;
	private progressContainer!: HTMLDivElement;

	// Toggle
	private readonly toggleRow: HTMLDivElement;
	private readonly toggleEl: HTMLDivElement;

	// Error
	private readonly errorBanner: HTMLDivElement;
	private readonly errorTextEl: HTMLSpanElement;

	// Onboarding
	private readonly onboardingBanner: HTMLDivElement;

	// Status info
	private readonly providerValue: HTMLSpanElement;
	private readonly modelValue: HTMLSpanElement;
	private readonly confidenceEl: HTMLSpanElement;

	// Stats
	private readonly solvedEl: HTMLSpanElement;
	private readonly failedEl: HTMLSpanElement;
	private readonly tokensEl: HTMLSpanElement;

	// Actions
	private readonly scanBtn: HTMLButtonElement;
	private readonly retryBtn: HTMLButtonElement;

	/** Callback wired by WidgetHost — called when user clicks minimize */
	onMinimize: (() => void) | null = null;

	/** Callback wired by WidgetHost — called when user clicks Settings */
	onSettingsClick: (() => void) | null = null;

	private readonly unsubscribe: () => void;
	private prevStats = { solved: 0, failed: 0, tokens: 0 };

	constructor(
		private readonly store: WidgetStore,
		private readonly bridge: ContentBridge,
	) {
		// ── Root ───────────────────────────────────────────────
		this.el = document.createElement('div');
		this.el.className = 'ac-panel';
		this.el.setAttribute('role', 'dialog');
		this.el.setAttribute('aria-label', 'Auto-Coursera Panel');

		// ── Header ─────────────────────────────────────────────
		const header = this.buildHeader();

		// ── Body ───────────────────────────────────────────────
		const body = document.createElement('div');
		body.className = 'ac-panel__body';

		// Toggle row
		this.toggleRow = this.buildToggleRow();
		this.toggleEl = this.toggleRow.querySelector('.ac-toggle') as HTMLDivElement;

		// Error banner
		const errorResult = this.buildErrorBanner();
		this.errorBanner = errorResult.banner;
		this.errorTextEl = errorResult.textEl;

		// Onboarding
		this.onboardingBanner = this.buildOnboardingBanner();

		// Status info
		const statusSection = document.createElement('div');
		statusSection.className = 'ac-status';
		this.providerValue = this.appendStatusRow(statusSection, 'Provider');
		this.modelValue = this.appendStatusRow(statusSection, 'Model');
		this.confidenceEl = this.appendStatusRow(statusSection, 'Confidence');

		// Stats grid
		const statsGrid = document.createElement('div');
		statsGrid.className = 'ac-stats';
		this.solvedEl = this.appendStatCard(statsGrid, '0', 'solved', 'ac-stat__value--success');
		this.failedEl = this.appendStatCard(statsGrid, '0', 'failed', 'ac-stat__value--error');
		this.tokensEl = this.appendStatCard(statsGrid, '0', 'tokens', 'ac-stat__value--info');

		// Action buttons
		const actionsRow = document.createElement('div');
		actionsRow.className = 'ac-actions';
		this.scanBtn = this.buildActionButton('🔍', ' Scan Page', 'ac-btn--primary');
		this.retryBtn = this.buildActionButton('🔄', ' Retry', 'ac-btn--secondary');
		this.scanBtn.addEventListener('click', () => this.handleAction(this.scanBtn, 'scan'));
		this.retryBtn.addEventListener('click', () => this.handleAction(this.retryBtn, 'retry'));
		actionsRow.append(this.scanBtn, this.retryBtn);

		body.append(
			this.toggleRow,
			this.errorBanner,
			this.onboardingBanner,
			statusSection,
			statsGrid,
			actionsRow,
		);

		// ── Footer ─────────────────────────────────────────────
		const footer = this.buildFooter();

		// ── Assemble ───────────────────────────────────────────
		this.el.append(header, body, footer);

		// ── Keyboard ───────────────────────────────────────────
		this.el.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.onMinimize?.();
			}
		});

		// ── Subscribe to store ─────────────────────────────────
		this.unsubscribe = store.subscribeMany(
			[
				'isEnabled',
				'status',
				'provider',
				'model',
				'confidence',
				'lastError',
				'solvedCount',
				'failedCount',
				'tokenCount',
				'processingCount',
			],
			(state) => this.render(state),
		);

		// Initial render
		this.render(store.get());

		// Check onboarding state
		this.checkOnboarding();
	}

	// ── DOM Builders ──────────────────────────────────────────

	private buildHeader(): HTMLDivElement {
		const header = document.createElement('div');
		header.className = 'ac-panel__header';

		const brand = document.createElement('span');
		brand.className = 'ac-panel__brand';
		brand.textContent = '🎓';
		brand.setAttribute('aria-hidden', 'true');

		const title = document.createElement('span');
		title.className = 'ac-panel__title';
		title.textContent = 'Auto-Coursera';

		this.statusBadge = document.createElement('span');
		this.statusBadge.className = 'ac-panel__status-badge ac-panel__status-badge--disabled';

		this.statusDot = document.createElement('span');
		this.statusDot.className = 'ac-panel__status-dot';

		this.statusLabel = document.createElement('span');
		this.statusLabel.textContent = 'Disabled';

		this.statusBadge.append(this.statusDot, this.statusLabel);

		const minimizeBtn = document.createElement('button');
		minimizeBtn.className = 'ac-panel__minimize';
		minimizeBtn.textContent = '─';
		minimizeBtn.setAttribute('aria-label', 'Minimize panel');
		minimizeBtn.addEventListener('click', () => this.onMinimize?.());

		// Progress bar (visible during processing)
		this.progressContainer = document.createElement('div');
		this.progressContainer.className = 'ac-panel__progress ac-hidden';
		const progressBar = document.createElement('div');
		progressBar.className = 'ac-panel__progress-bar ac-panel__progress-bar--indeterminate';
		this.progressContainer.appendChild(progressBar);

		header.append(brand, title, this.statusBadge, minimizeBtn, this.progressContainer);
		return header;
	}

	private buildToggleRow(): HTMLDivElement {
		const row = document.createElement('div');
		row.className = 'ac-toggle-row';
		row.setAttribute('role', 'switch');
		row.setAttribute('aria-checked', 'false');
		row.setAttribute('aria-label', 'Enable or disable Auto-Coursera');
		row.setAttribute('tabindex', '0');

		const label = document.createElement('span');
		label.className = 'ac-toggle-row__label';
		label.textContent = 'Enabled';

		const toggle = document.createElement('div');
		toggle.className = 'ac-toggle';
		const thumb = document.createElement('div');
		thumb.className = 'ac-toggle__thumb';
		toggle.appendChild(thumb);

		row.append(label, toggle);

		row.addEventListener('click', () => this.handleToggle());
		row.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.handleToggle();
			}
		});

		return row;
	}

	private buildErrorBanner(): { banner: HTMLDivElement; textEl: HTMLSpanElement } {
		const banner = document.createElement('div');
		banner.className = 'ac-error-banner ac-hidden';
		banner.setAttribute('role', 'alert');
		banner.setAttribute('tabindex', '0');
		banner.setAttribute('aria-label', 'Error — click to copy');

		const icon = document.createElement('span');
		icon.className = 'ac-error-banner__icon';
		icon.textContent = '⚠️';
		icon.setAttribute('aria-hidden', 'true');

		const body = document.createElement('div');
		const textEl = document.createElement('span');
		textEl.className = 'ac-error-banner__text';

		const hint = document.createElement('span');
		hint.className = 'ac-error-banner__hint';
		hint.textContent = 'Click to copy error details';

		body.append(textEl, hint);
		banner.append(icon, body);

		banner.addEventListener('click', () => this.copyError());

		return { banner, textEl };
	}

	private buildOnboardingBanner(): HTMLDivElement {
		const banner = document.createElement('div');
		banner.className = 'ac-onboarding ac-hidden';

		const text = document.createElement('span');
		text.className = 'ac-onboarding__text';
		text.textContent = 'Set up an API key to get started';

		const cta = document.createElement('button');
		cta.className = 'ac-onboarding__cta';
		cta.textContent = '⚙️ Configure';
		cta.setAttribute('aria-label', 'Open settings to configure API keys');
		cta.addEventListener('click', () => this.onSettingsClick?.());

		banner.append(text, cta);
		return banner;
	}

	private buildActionButton(
		iconText: string,
		labelText: string,
		variant: string,
	): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.className = `ac-btn ${variant}`;

		const icon = document.createElement('span');
		icon.className = 'ac-btn__icon';
		icon.textContent = iconText;
		icon.setAttribute('aria-hidden', 'true');

		btn.appendChild(icon);
		btn.appendChild(document.createTextNode(labelText));
		return btn;
	}

	private buildFooter(): HTMLDivElement {
		const footer = document.createElement('div');
		footer.className = 'ac-panel__footer';

		const settingsLink = document.createElement('button');
		settingsLink.className = 'ac-panel__settings-link';

		const icon = document.createElement('span');
		icon.className = 'ac-panel__settings-link__icon';
		icon.textContent = '⚙️';
		icon.setAttribute('aria-hidden', 'true');

		settingsLink.appendChild(icon);
		settingsLink.appendChild(document.createTextNode(' Settings'));
		settingsLink.addEventListener('click', () => this.onSettingsClick?.());

		footer.appendChild(settingsLink);
		return footer;
	}

	/** Append a label–value row to a status section; returns the value element */
	private appendStatusRow(parent: HTMLElement, label: string): HTMLSpanElement {
		const row = document.createElement('div');
		row.className = 'ac-status__row';

		const labelEl = document.createElement('span');
		labelEl.className = 'ac-status__label';
		labelEl.textContent = label;

		const valueEl = document.createElement('span');
		valueEl.className = 'ac-status__value';
		valueEl.textContent = '--';

		row.append(labelEl, valueEl);
		parent.appendChild(row);
		return valueEl;
	}

	/** Append a stat card to the grid; returns the value element */
	private appendStatCard(
		parent: HTMLElement,
		initial: string,
		label: string,
		colorClass: string,
	): HTMLSpanElement {
		const card = document.createElement('div');
		card.className = 'ac-stat';

		const valueEl = document.createElement('span');
		valueEl.className = `ac-stat__value ${colorClass}`;
		valueEl.textContent = initial;

		const labelEl = document.createElement('span');
		labelEl.className = 'ac-stat__label';
		labelEl.textContent = label;

		card.append(valueEl, labelEl);
		parent.appendChild(card);
		return valueEl;
	}

	// ── Rendering ─────────────────────────────────────────────

	/** Full re-render of all dynamic elements from state snapshot */
	private render(state: WidgetState): void {
		// Toggle
		const isOn = state.isEnabled;
		this.toggleEl.classList.toggle('ac-toggle--on', isOn);
		this.toggleRow.setAttribute('aria-checked', String(isOn));

		// Status badge
		this.updateStatusBadge(state.status, state.isEnabled);

		// Progress bar — visible only during processing
		this.progressContainer.classList.toggle('ac-hidden', state.status !== 'processing');

		// Error banner
		if (state.status === 'error' && state.lastError) {
			this.errorBanner.classList.remove('ac-hidden');
			this.errorTextEl.textContent = getUserFriendlyError(state.lastError);
		} else {
			this.errorBanner.classList.add('ac-hidden');
		}

		// Status info
		this.providerValue.textContent = state.provider || '--';
		this.modelValue.textContent = state.model || '--';
		this.confidenceEl.textContent = state.confidence !== null ? state.confidence.toFixed(2) : '--';

		// Stats (with pop animation on change)
		this.animateStat(this.solvedEl, state.solvedCount, this.prevStats.solved);
		this.animateStat(this.failedEl, state.failedCount, this.prevStats.failed);
		this.animateStat(this.tokensEl, state.tokenCount, this.prevStats.tokens);
		this.prevStats = {
			solved: state.solvedCount,
			failed: state.failedCount,
			tokens: state.tokenCount,
		};

		// Button state
		this.scanBtn.disabled = !state.isEnabled;
		this.retryBtn.disabled = !state.isEnabled;
	}

	/** Update the status badge class and label text */
	private updateStatusBadge(status: string, enabled: boolean): void {
		const modifier = enabled ? status : 'disabled';
		this.statusBadge.className = `ac-panel__status-badge ac-panel__status-badge--${modifier}`;

		const labels: Record<string, string> = {
			active: 'Active',
			processing: 'Processing',
			error: 'Error',
			idle: 'Idle',
			disabled: 'Disabled',
		};
		this.statusLabel.textContent = labels[enabled ? status : 'disabled'] ?? 'Idle';
	}

	/** Set stat text and trigger pop animation if value changed */
	private animateStat(el: HTMLSpanElement, current: number, prev: number): void {
		el.textContent = String(current);
		if (current !== prev) {
			el.classList.add('ac-stat__value--animate');
			setTimeout(() => el.classList.remove('ac-stat__value--animate'), COUNTER_ANIM_MS);
		}
	}

	// ── Handlers ──────────────────────────────────────────────

	/** Toggle enabled state via background message */
	private async handleToggle(): Promise<void> {
		const newEnabled = !this.store.get('isEnabled');
		try {
			await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: newEnabled });
		} catch {
			// Message failed — chrome.storage.onChanged will push correct state
		}
	}

	/** Run a bridge action with loading state on the button */
	private handleAction(btn: HTMLButtonElement, action: 'scan' | 'retry'): void {
		btn.textContent = '⏳...';
		btn.disabled = true;

		if (action === 'scan') this.bridge.scan();
		else this.bridge.retry();

		setTimeout(() => {
			this.resetActionButton(btn, action);
		}, BUTTON_RESET_MS);
	}

	/** Rebuild action button content after loading state */
	private resetActionButton(btn: HTMLButtonElement, action: 'scan' | 'retry'): void {
		// Clear all child nodes
		while (btn.firstChild) btn.removeChild(btn.firstChild);

		const icon = document.createElement('span');
		icon.className = 'ac-btn__icon';
		icon.textContent = action === 'scan' ? '🔍' : '🔄';
		icon.setAttribute('aria-hidden', 'true');
		btn.appendChild(icon);
		btn.appendChild(document.createTextNode(action === 'scan' ? ' Scan Page' : ' Retry'));
		btn.disabled = !this.store.get('isEnabled');
	}

	/** Copy the error banner text to clipboard */
	private async copyError(): Promise<void> {
		const text = this.errorTextEl.textContent ?? '';
		await copyToClipboard(text);
	}

	/**
	 * Check onboarding state via the shared normalized settings view.
	 * This keeps widget behavior aligned with overlay/options semantics,
	 * including decrypt/error fallback for stored API keys.
	 */
	private async checkOnboarding(): Promise<void> {
		try {
			const view = await loadSettingsView();
			this.onboardingBanner.classList.toggle('ac-hidden', view.onboardingComplete);
		} catch {
			this.onboardingBanner.classList.add('ac-hidden');
		}
	}

	// ── Public API ────────────────────────────────────────────

	/** Show the panel with enter animation */
	show(): void {
		this.el.classList.add('ac-panel--open');
		this.checkOnboarding();
	}

	/** Hide the panel */
	hide(): void {
		this.el.classList.remove('ac-panel--open');
	}

	/** Return the root element for appending to the Shadow DOM */
	getElement(): HTMLDivElement {
		return this.el;
	}

	/** Full cleanup — unsubscribe store, remove element */
	destroy(): void {
		this.unsubscribe();
		this.el.remove();
	}
}

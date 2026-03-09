/**
 * QuestionDetector — MutationObserver + Coursera data-testid selector for question detection.
 * REQ: REQ-001, REQ-002, REQ-003
 */

import type { DetectedQuestion, QuestionType } from '../types/questions';
import { COURSERA_SELECTORS, MUTATION_DEBOUNCE_MS, QUESTION_SELECTORS } from '../utils/constants';
import { Logger } from '../utils/logger';

const logger = new Logger('QuestionDetector');

/** data-testid value fragment that marks code-expression questions (unsupported) */
const CODE_EXPRESSION_MARKER = 'CodeExpression';

export class QuestionDetector {
	private observer: MutationObserver | null = null;
	private seen: Set<string> = new Set();
	private readonly onDetect: (q: DetectedQuestion) => void;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(callback: (q: DetectedQuestion) => void) {
		this.onDetect = callback;
	}

	/**
	 * Start observing the DOM for question containers.
	 * AC-002.1: MutationObserver on document.body with {childList: true, subtree: true}
	 */
	start(): void {
		this.observer = new MutationObserver(this.handleMutations.bind(this));
		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
		// Initial scan for pre-rendered questions (AC-001.4)
		this.scanPage();
		logger.info('QuestionDetector started');
	}

	/**
	 * Public method to trigger a fresh page scan.
	 * Clears seen set so all questions are re-detected (Retry/Scan support).
	 */
	scan(): void {
		this.seen.clear();
		this.scanPage();
		logger.info(`Detected ${this.seen.size} questions on page`);
	}

	/**
	 * Stop observing.
	 */
	stop(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		logger.info('QuestionDetector stopped');
	}

	/**
	 * Handle DOM mutations with debounce.
	 * AC-002.2: 300ms debounce for rapid mutations
	 */
	private handleMutations(mutations: MutationRecord[]): void {
		const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0);
		if (!hasNewNodes) return;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.scanPage();
		}, MUTATION_DEBOUNCE_MS);
	}

	/**
	 * Scan the page for question containers using the single Coursera selector.
	 * Skips CodeExpression questions (unsupported).
	 * Deduplicates nested elements as a safety net.
	 */
	private scanPage(): void {
		const selector = COURSERA_SELECTORS.questionContainer;
		let elements: NodeListOf<HTMLElement> | HTMLElement[] =
			document.querySelectorAll<HTMLElement>(selector);

		if (elements.length > 0) {
			logger.info(`Selector "${selector}" matched ${elements.length} elements`);
		}

		// Fallback: try additional selectors if primary finds nothing
		if (elements.length === 0) {
			for (const sel of QUESTION_SELECTORS) {
				if (sel === COURSERA_SELECTORS.questionContainer) continue;
				const fallback = document.querySelectorAll<HTMLElement>(sel);
				if (fallback.length > 0) {
					logger.info(`Primary selector found 0, fallback "${sel}" matched ${fallback.length}`);
					elements = Array.from(fallback);
					break;
				}
			}
		}

		// Filter code-expression questions, deduplicate nested (keep outermost)
		const candidates = Array.from(elements).filter((el) => {
			const testId = el.getAttribute('data-testid') ?? '';
			if (testId.includes(CODE_EXPRESSION_MARKER)) {
				logger.info(`Skipping unsupported code-expression question: ${testId}`);
				return false;
			}
			return true;
		});

		const deduped = candidates.filter(
			(el, _, arr) => !arr.some((other) => other !== el && other.contains(el)),
		);

		for (let i = 0; i < deduped.length; i++) {
			this.processElement(deduped[i], i);
		}

		if (deduped.length === 0) {
			logger.warn('No questions detected. Page body classes:', document.body.className);
			logger.warn(
				'Page main content elements:',
				document.querySelector('main')?.innerHTML?.substring(0, 500) ?? 'No <main> found',
			);
		}
	}

	/**
	 * Process a single question element.
	 * UID is derived from data-testid + position index for stability.
	 * AC-002.4: Does not re-process previously detected questions.
	 */
	private processElement(el: HTMLElement, index: number): void {
		const testId = el.getAttribute('data-testid') ?? '';
		const uid = this.computeUID(`${testId}::${index}`);
		if (this.seen.has(uid)) return;
		this.seen.add(uid);

		const detected: DetectedQuestion = {
			element: el,
			type: this.classifyType(el, testId),
			uid,
			processed: false,
		};

		logger.info(`Detected ${detected.type} question: ${uid} (${testId})`);
		this.onDetect(detected);
	}

	/**
	 * Classify question type based on data-testid and DOM contents.
	 * CheckboxQuestion → multiple-choice (QuestionType has no 'checkbox' variant;
	 *   the extractor uses a separate type system for the AI prompt).
	 * MultipleChoiceQuestion → single-choice, images → image-based, else → unknown.
	 */
	private classifyType(el: HTMLElement, testId: string): QuestionType {
		// Check for images first (highest priority)
		const hasImages = el.querySelectorAll('img').length > 0;
		if (hasImages) return 'image-based';

		// Use data-testid for deterministic classification
		if (testId.includes('CheckboxQuestion')) return 'multiple-choice';
		if (testId.includes('MultipleChoiceQuestion')) return 'single-choice';

		// Fallback: inspect input types
		const checkboxes = el.querySelectorAll('input[type="checkbox"]');
		if (checkboxes.length > 0) return 'multiple-choice';

		const radios = el.querySelectorAll('input[type="radio"]');
		if (radios.length > 0) return 'single-choice';

		return 'unknown';
	}

	/**
	 * Compute FNV-1a hash for content deduplication.
	 * AC-001.3: FNV-1a dedup
	 */
	private computeUID(text: string): string {
		let hash = 2166136261; // FNV offset basis
		const cleaned = text.trim().replace(/\s+/g, ' ');
		for (let i = 0; i < cleaned.length; i++) {
			hash ^= cleaned.charCodeAt(i);
			hash = Math.imul(hash, 16777619); // FNV prime
		}
		return (hash >>> 0).toString(16);
	}
}

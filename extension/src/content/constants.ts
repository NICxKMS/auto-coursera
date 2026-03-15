/** Top-level CSS selector for detecting question containers on Coursera */
export const QUESTION_SELECTORS = [
	'div[data-testid^="part-Submission_"]',
	'div[role="group"][aria-labelledby*="-legend"]',
] as const;

/** Coursera DOM sub-element selectors (matched against the real page markup) */
export const COURSERA_SELECTORS = {
	questionContainer: 'div[data-testid^="part-Submission_"]',
	legend: 'div[data-testid="legend"]',
	questionNumber: 'h3 > span',
	questionText: 'div[data-testid="cml-viewer"]',
	image: 'img.cml-image-default',
	mathAnnotation: 'annotation[encoding="application/x-tex"]',
	aiHoneypot: 'div[data-ai-instructions="true"]',
	optionGroup: 'div[role="group"], div[role="radiogroup"]',
	option: 'div.rc-Option',
	optionInput: 'input[type="checkbox"], input[type="radio"]',
	optionText: 'div[data-testid="cml-viewer"]',
	codeEditor: 'div.rc-CodeBlock',
	numericInput: 'input[type="number"]',
	points: 'div[data-testid="part-points"] span',
} as const;

/** MutationObserver debounce time in milliseconds */
export const MUTATION_DEBOUNCE_MS = 300;

/** Data attributes used for visual feedback */
export const DATA_ATTRIBUTES = {
	SUGGESTION: 'data-auto-coursera-suggestion',
	ERROR: 'data-auto-coursera-error',
	PROCESSING: 'data-auto-coursera-processing',
} as const;

/** Debounce time for batching detected questions (ms) */
export const BATCH_DEBOUNCE_MS = 800;

/** Generate a unique identifier for content-domain entities (pages, requests). */
export function createContentId(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

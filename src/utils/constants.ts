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
	points: 'div[data-testid="part-points"] span',
} as const;

/** API endpoint base URLs */
export const API_URLS = {
	OPENROUTER: 'https://openrouter.ai/api/v1',
	NVIDIA_NIM: 'https://integrate.api.nvidia.com/v1',
} as const;

/** Gemini */
export const GEMINI_API_URL =
	'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const GEMINI_MODELS = [
	'gemini-3-flash-preview',
	'gemini-3.1-flash-lite-preview',
	'gemini-2.5-flash-lite',
	'gemini-2.5-flash',
] as const;

/** Groq */
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GROQ_MODELS = [
	'llama-3.3-70b-versatile',
	'llama-3.1-8b-instant',
	'mixtral-8x7b-32768',
	'gemma2-9b-it',
] as const;

/** Cerebras */
export const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
export const CEREBRAS_MODELS = ['llama-3.3-70b', 'llama-3.1-8b'] as const;

/** Error codes used throughout the extension */
export const ERROR_CODES = {
	NO_API_KEY: 'NO_API_KEY',
	UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
	SOLVE_FAILED: 'SOLVE_FAILED',
} as const;

/** Confidence thresholds for answer highlighting */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.5;

/** MutationObserver debounce time in milliseconds */
export const MUTATION_DEBOUNCE_MS = 300;

/** Default AI temperature for deterministic responses */
export const AI_TEMPERATURE = 0.1;

/** Default max tokens for AI responses */
export const AI_MAX_TOKENS = 32 * 1024;

/** Max retry attempts for API calls */
export const MAX_RETRIES = 2;

/** Default request timeout in ms (10 minutes) */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/** NVIDIA NIM request timeout in ms (10 minutes — large model inference) */
export const NVIDIA_NIM_TIMEOUT_MS = 10 * 60 * 1000;

/** Base backoff time in ms for exponential retry */
export const RETRY_BACKOFF_BASE_MS = 1000;

/** Jitter range in ms added to retry backoff */
export const RETRY_JITTER_MS = 500;

/** OpenRouter custom headers */
export const OPENROUTER_HEADERS = {
	HTTP_REFERER: 'chrome-extension://auto-coursera',
	X_TITLE: 'Auto-Coursera',
} as const;

/** Data attributes used for visual feedback */
export const DATA_ATTRIBUTES = {
	SUGGESTION: 'data-auto-coursera-suggestion',
	ERROR: 'data-auto-coursera-error',
	PROCESSING: 'data-auto-coursera-processing',
} as const;

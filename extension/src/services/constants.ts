/** API endpoint base URLs */
export const API_URLS = {
	OPENROUTER: 'https://openrouter.ai/api/v1',
	NVIDIA_NIM: 'https://integrate.api.nvidia.com/v1',
} as const;

/** Gemini API endpoint */
export const GEMINI_API_URL =
	'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/** Groq API endpoint */
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Cerebras API endpoint */
export const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

/** OpenRouter custom headers */
export const OPENROUTER_HEADERS = {
	HTTP_REFERER: 'chrome-extension://auto-coursera',
	X_TITLE: 'Auto-Coursera',
} as const;

/** Default AI temperature for deterministic responses */
export const AI_TEMPERATURE = 0.1;

/** Default max tokens for AI responses */
export const AI_MAX_TOKENS = 32 * 1024;

/** Default top_p (nucleus sampling) for AI requests */
export const AI_TOP_P = 0.95;

/** Max retry attempts for API calls */
export const MAX_RETRIES = 2;

/** Default request timeout in ms (10 minutes) */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/** Base backoff time in ms for exponential retry */
export const RETRY_BACKOFF_BASE_MS = 1000;

/** Jitter range in ms added to retry backoff */
export const RETRY_JITTER_MS = 500;

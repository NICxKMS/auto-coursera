/** Complete application settings */
/** Known AI provider identifiers */
export type ProviderName = 'openrouter' | 'nvidia-nim' | 'gemini' | 'groq' | 'cerebras';

export interface AppSettings {
	enabled: boolean;
	openrouterApiKey: string;
	nvidiaApiKey: string;
	geminiApiKey: string;
	groqApiKey: string;
	cerebrasApiKey: string;
	openrouterModel: string;
	nvidiaModel: string;
	geminiModel: string;
	groqModel: string;
	cerebrasModel: string;
	primaryProvider: ProviderName;
	/** Minimum confidence to auto-select (0.0 - 1.0) */
	confidenceThreshold: number;
	/** Whether to auto-click or just highlight */
	autoSelect: boolean;
	/** Whether to automatically start solving when a Coursera page loads */
	autoStartOnPageLoad: boolean;
	maxRetries: number;
	/** Requests per minute per provider */
	rateLimitRpm: number;
}

/** Default settings values */
export const DEFAULT_SETTINGS: AppSettings = {
	enabled: false,
	openrouterApiKey: '',
	nvidiaApiKey: '',
	geminiApiKey: '',
	groqApiKey: '',
	cerebrasApiKey: '',
	openrouterModel: 'openrouter/free',
	nvidiaModel: 'moonshotai/kimi-k2.5',
	geminiModel: 'gemini-2.5-flash-lite',
	groqModel: 'llama-3.3-70b-versatile',
	cerebrasModel: 'llama-3.3-70b',
	primaryProvider: 'openrouter',
	confidenceThreshold: 0.7,
	autoSelect: true,
	autoStartOnPageLoad: true,
	maxRetries: 2,
	rateLimitRpm: 20,
};

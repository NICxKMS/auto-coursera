/** Complete application settings */
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
	primaryProvider: 'openrouter' | 'nvidia-nim' | 'gemini' | 'groq' | 'cerebras';
	/** Minimum confidence to auto-select (0.0 - 1.0) */
	confidenceThreshold: number;
	/** Whether to auto-click or just highlight */
	autoSelect: boolean;
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
	maxRetries: 2,
	rateLimitRpm: 20,
};

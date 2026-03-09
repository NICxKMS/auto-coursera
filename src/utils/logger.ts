type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

const CONSOLE_METHODS: Record<LogLevel, (...args: unknown[]) => void> = {
	debug: console.log,
	info: console.log,
	warn: console.warn,
	error: console.error,
};

/** Patterns that should never appear in logs */
const SENSITIVE_PATTERNS = [
	/sk-or-[a-zA-Z0-9-]+/g, // OpenRouter API keys
	/nvapi-[a-zA-Z0-9-]+/g, // NVIDIA API keys
	/AIza[a-zA-Z0-9_-]+/g, // Google/Gemini API keys
	/gsk_[a-zA-Z0-9]+/g, // Groq API keys
	/cbs-[a-zA-Z0-9-]+/g, // Cerebras API keys
	/Bearer\s+[a-zA-Z0-9-_.]+/g, // Bearer tokens
];

export class Logger {
	private readonly component: string;
	private static minLevel: LogLevel = 'info';

	constructor(component: string) {
		this.component = component;
	}

	static setLevel(level: LogLevel): void {
		Logger.minLevel = level;
	}

	debug(message: string, data?: unknown): void {
		this.log('debug', message, data);
	}

	info(message: string, data?: unknown): void {
		this.log('info', message, data);
	}

	warn(message: string, data?: unknown): void {
		this.log('warn', message, data);
	}

	error(message: string, data?: unknown): void {
		this.log('error', message, data);
	}

	private log(level: LogLevel, message: string, data?: unknown): void {
		if (LOG_LEVELS[level] < LOG_LEVELS[Logger.minLevel]) return;

		const prefix = `[${level.toUpperCase()}] [${this.component}]`;
		const sanitizedMessage = this.sanitize(message);
		const method = CONSOLE_METHODS[level];

		if (data !== undefined) {
			method(prefix, sanitizedMessage, this.sanitizeData(data));
		} else {
			method(prefix, sanitizedMessage);
		}
	}

	private sanitize(text: string): string {
		let result = text;
		for (const pattern of SENSITIVE_PATTERNS) {
			result = result.replace(pattern, '[REDACTED]');
		}
		return result;
	}

	private sanitizeData(data: unknown): unknown {
		if (typeof data === 'string') return this.sanitize(data);
		if (data instanceof Error) {
			return {
				name: data.name,
				message: this.sanitize(data.message),
				stack: data.stack ? this.sanitize(data.stack) : undefined,
			};
		}
		if (typeof data === 'object' && data !== null) {
			try {
				return JSON.parse(this.sanitize(JSON.stringify(data)));
			} catch {
				return '[Unserializable object]';
			}
		}
		return data;
	}
}

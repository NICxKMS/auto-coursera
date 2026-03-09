import { handleDownload } from './routes/download';
import { handleReleases } from './routes/releases';
import { handleStats } from './routes/stats';
import { handleVersion } from './routes/version';
import { getCorsHeaders, handleOptions } from './utils/cors';
import { errorResponse, jsonResponse } from './utils/response';

export interface Env {
	EXTENSIONS_BUCKET: R2Bucket;
	RELEASES_BUCKET: R2Bucket;
	CURRENT_VERSION: string;
	EXTENSION_ID: string;
	ALLOWED_ORIGIN: string;
	CDN_BASE_URL: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const { pathname } = url;
		const method = request.method.toUpperCase();
		const origin = request.headers.get('Origin') ?? '';

		// Handle CORS preflight for any route
		if (method === 'OPTIONS') {
			return handleOptions(request, env.ALLOWED_ORIGIN);
		}

		let response: Response;

		try {
			if (method !== 'GET') {
				response = errorResponse('Method not allowed', 405);
			} else if (pathname === '/api/health') {
				response = jsonResponse({
					status: 'ok',
					timestamp: new Date().toISOString(),
				});
			} else if (pathname === '/api/latest-version') {
				response = handleVersion(env);
			} else if (pathname === '/api/releases') {
				response = await handleReleases(env);
			} else if (pathname.startsWith('/api/download/')) {
				const os = pathname.replace('/api/download/', '').replace(/\/$/, '');
				if (!os) {
					response = errorResponse(
						'Missing OS parameter. Use: /api/download/windows|macos|linux',
						400,
					);
				} else {
					response = await handleDownload(os, env);
				}
			} else if (pathname === '/api/stats') {
				response = await handleStats(env);
			} else {
				response = errorResponse('Not found', 404);
			}
		} catch (error) {
			console.error('Unhandled error:', error instanceof Error ? error.message : String(error));
			response = errorResponse('Internal server error', 500);
		}

		// Apply CORS headers to every response
		const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGIN);
		for (const [key, value] of corsHeaders.entries()) {
			response.headers.set(key, value);
		}

		return response;
	},
} satisfies ExportedHandler<Env>;

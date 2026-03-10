import { handleCdnRelease, handleUpdatesXml } from './routes/cdn';
import { handleDownload } from './routes/download';
import { handleReleases } from './routes/releases';
import { handleStats } from './routes/stats';
import { handleVersion } from './routes/version';
import { getCorsHeaders, handleOptions } from './utils/cors';
import { errorResponse, jsonResponse } from './utils/response';

export interface Env {
	CURRENT_VERSION: string;
	EXTENSION_ID: string;
	ALLOWED_ORIGIN: string;
	CDN_BASE_URL: string;
	GITHUB_REPO: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const { pathname, hostname } = url;
		const method = request.method.toUpperCase();
		const origin = request.headers.get('Origin') ?? '';

		try {
			// ── Required env var validation ────────────────────────────
			const requiredVars = [
				'CURRENT_VERSION',
				'EXTENSION_ID',
				'GITHUB_REPO',
				'CDN_BASE_URL',
				'ALLOWED_ORIGIN',
			] as const;
			for (const key of requiredVars) {
				if (!env[key]) {
					return errorResponse(`Server misconfiguration: missing ${key}`, 500);
				}
			}

			// ── CDN domain ────────────────────────────────────────────
			const cdnHostname = new URL(env.CDN_BASE_URL).hostname;
			if (hostname === cdnHostname) {
				if (method !== 'GET') {
					return errorResponse('Method not allowed', 405);
				}

				if (pathname === '/updates.xml') {
					return handleUpdatesXml(env);
				}

				if (pathname.startsWith('/releases/')) {
					return handleCdnRelease(pathname, env);
				}

				return errorResponse('Not found', 404);
			}

			// ── API domain: autocr-api.nicx.me ────────────────────────
			if (method === 'OPTIONS') {
				return handleOptions(request, env.ALLOWED_ORIGIN);
			}

			let response: Response;

			try {
				if (method !== 'GET') {
					response = errorResponse('Method not allowed', 405);
				} else if (pathname === '/api/health') {
					response = jsonResponse(
						{ status: 'ok', timestamp: new Date().toISOString() },
						200,
						new Headers({ 'Cache-Control': 'no-store' }),
					);
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
						response = handleDownload(os, env);
					}
				} else if (pathname === '/api/stats') {
					response = await handleStats(env);
				} else {
					response = errorResponse('Not found', 404);
				}
			} catch (innerError) {
				console.error(
					'Unhandled error:',
					innerError instanceof Error ? innerError.message : String(innerError),
				);
				response = errorResponse('Internal server error', 500);
			}

			// Apply CORS headers to API responses only
			const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGIN);
			for (const [key, value] of corsHeaders.entries()) {
				response.headers.set(key, value);
			}

			return response;
		} catch (error) {
			console.error('Fatal error:', error instanceof Error ? error.message : String(error));
			const response = errorResponse('Internal server error', 500);

			// Apply CORS headers if the request was for the API domain.
			// If we can't determine the domain (e.g. CDN_BASE_URL parse failed),
			// fail-closed: no CORS headers.
			try {
				const cdnHostname = new URL(env.CDN_BASE_URL).hostname;
				if (hostname !== cdnHostname) {
					const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGIN);
					for (const [key, value] of corsHeaders.entries()) {
						response.headers.set(key, value);
					}
				}
			} catch {
				// CDN_BASE_URL parse failed — fail-closed, no CORS headers
			}

			return response;
		}
	},
} satisfies ExportedHandler<Env>;

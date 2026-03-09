/**
 * Build CORS headers for a given origin.
 *
 * Allows the configured website domain and echoes back the origin
 * when it matches. All responses include credentials support.
 */
export function getCorsHeaders(origin: string, allowedOrigin: string): Headers {
	const headers = new Headers();

	if (origin === allowedOrigin) {
		headers.set('Access-Control-Allow-Origin', origin);
	}

	headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
	headers.set('Access-Control-Max-Age', '86400');

	return headers;
}

/**
 * Handle OPTIONS preflight requests and respond with 204 No Content.
 */
export function handleOptions(request: Request, allowedOrigin: string): Response {
	const origin = request.headers.get('Origin') ?? '';
	const headers = getCorsHeaders(origin, allowedOrigin);
	headers.set('X-Content-Type-Options', 'nosniff');

	return new Response(null, { status: 204, headers });
}

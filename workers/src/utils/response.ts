/**
 * Return a JSON response with the correct content-type header.
 */
export function jsonResponse(data: unknown, status = 200, headers?: Headers): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
	responseHeaders.set('X-Content-Type-Options', 'nosniff');

	if (!responseHeaders.has('Cache-Control')) {
		responseHeaders.set('Cache-Control', 'public, max-age=300');
	}

	return new Response(JSON.stringify(data), {
		status,
		headers: responseHeaders,
	});
}

/**
 * Return a structured JSON error response.
 */
export function errorResponse(message: string, status: number, headers?: Headers): Response {
	const errorHeaders = new Headers(headers);
	errorHeaders.set('Cache-Control', 'no-store');
	return jsonResponse({ error: message }, status, errorHeaders);
}

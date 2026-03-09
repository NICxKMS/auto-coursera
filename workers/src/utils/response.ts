/**
 * Return a JSON response with the correct content-type header.
 */
export function jsonResponse(data: unknown, status = 200, headers?: Headers): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('Content-Type', 'application/json; charset=utf-8');

	return new Response(JSON.stringify(data), {
		status,
		headers: responseHeaders,
	});
}

/**
 * Return a structured JSON error response.
 */
export function errorResponse(message: string, status: number, headers?: Headers): Response {
	return jsonResponse({ error: message }, status, headers);
}

/**
 * Return a redirect response (defaults to 302 Found).
 */
export function redirectResponse(url: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: { Location: url },
	});
}

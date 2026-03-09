import type { Env } from '../index';
import { jsonResponse } from '../utils/response';

/**
 * GET /api/latest-version
 *
 * Return the current published version and relevant download URLs.
 */
export function handleVersion(env: Env): Response {
	const version = env.CURRENT_VERSION;
	const extensionId = env.EXTENSION_ID;

	return jsonResponse({
		version,
		extensionId,
		updateUrl: `${env.CDN_BASE_URL}/updates.xml`,
		downloadUrl: `${env.CDN_BASE_URL}/releases/auto_coursera_${version}.crx`,
	});
}

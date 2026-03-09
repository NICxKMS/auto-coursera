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
		updateUrl: 'https://cdn.autocr.nicx.app/updates.xml',
		downloadUrl: `https://cdn.autocr.nicx.app/releases/auto_coursera_${version}.crx`,
	});
}

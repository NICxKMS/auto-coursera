import type { Env } from '../index';
import { jsonResponse } from '../utils/response';

/**
 * GET /api/latest-version
 *
 * Return the current published version and relevant download URLs.
 */
export function handleVersion(env: Env): Response {
	return jsonResponse({
		version: env.CURRENT_VERSION,
		extensionId: env.EXTENSION_ID,
		updateUrl: `${env.CDN_BASE_URL}/updates.xml`,
		downloadUrl: `https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/auto_coursera_${env.CURRENT_VERSION}.crx`,
	});
}

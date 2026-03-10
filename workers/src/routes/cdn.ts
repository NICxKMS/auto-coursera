import type { Env } from '../index';
import { errorResponse } from '../utils/response';

/**
 * Generate updates.xml dynamically from environment variables.
 */
export function handleUpdatesXml(env: Env): Response {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${env.EXTENSION_ID}">
    <updatecheck codebase="https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/auto_coursera_${env.CURRENT_VERSION}.crx" version="${env.CURRENT_VERSION}"/>
  </app>
</gupdate>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300',
			'X-Content-Type-Options': 'nosniff',
		},
	});
}

/**
 * Handle legacy CDN paths by redirecting to GitHub Releases.
 *
 * Supports:
 *   GET /releases/auto_coursera_X.Y.Z.crx      → 302 to GitHub
 *   GET /releases/auto_coursera_X.Y.Z.crx.sha256 → 302 to GitHub
 */
export function handleCdnRelease(pathname: string, env: Env): Response {
	const filename = pathname.replace(/^\/releases\//, '');

	if (!filename || !/^auto_coursera_[\d.]+\.crx(\.sha256)?$/.test(filename)) {
		return errorResponse('Not found', 404);
	}

	// Extract version from filename to build the correct tag
	const versionMatch = filename.match(/auto_coursera_([\d.]+)\.crx/);
	if (!versionMatch) {
		return errorResponse('Not found', 404);
	}

	const version = versionMatch[1];
	const url = `https://github.com/${env.GITHUB_REPO}/releases/download/v${version}/${filename}`;

	return new Response(null, {
		status: 302,
		headers: {
			Location: url,
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

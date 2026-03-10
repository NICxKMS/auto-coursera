import type { Env } from '../index';
import { errorResponse } from '../utils/response';

/** Map an OS identifier to the corresponding installer filename. */
const INSTALLER_MAP: Record<string, string> = {
	windows: 'installer-windows-amd64.exe',
	'windows-arm64': 'installer-windows-arm64.exe',
	macos: 'installer-macos-arm64',
	'macos-intel': 'installer-macos-amd64',
	linux: 'installer-linux-amd64',
	'linux-arm64': 'installer-linux-arm64',
};

const SUPPORTED_PLATFORMS = Object.keys(INSTALLER_MAP).join(', ');

/**
 * GET /api/download/:os
 *
 * Redirect to the platform-specific installer binary on GitHub Releases.
 */
export function handleDownload(os: string, env: Env): Response {
	const filename = INSTALLER_MAP[os.toLowerCase()];

	if (!filename) {
		return errorResponse(`Unsupported platform. Supported values: ${SUPPORTED_PLATFORMS}`, 404);
	}

	const url = `https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/${filename}`;

	return new Response(null, {
		status: 302,
		headers: {
			Location: url,
			'Cache-Control': 'public, max-age=3600',
		},
	});
}

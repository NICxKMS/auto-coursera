import type { Env } from '../index';
import { getObject } from '../utils/r2';
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
 * Stream the platform-specific installer binary from the releases bucket.
 * Returns 404 when the OS is unsupported or the file doesn't exist.
 */
export async function handleDownload(os: string, env: Env): Promise<Response> {
	const filename = INSTALLER_MAP[os.toLowerCase()];

	if (!filename) {
		return errorResponse(`Unsupported platform. Supported values: ${SUPPORTED_PLATFORMS}`, 404);
	}

	try {
		const object = await getObject(env.RELEASES_BUCKET, filename);

		if (!object) {
			return errorResponse('Installer not found', 404);
		}

		const headers = new Headers();
		headers.set('Content-Type', 'application/octet-stream');
		headers.set('Content-Disposition', `attachment; filename="${filename}"`);
		headers.set('Content-Length', object.size.toString());
		headers.set('Cache-Control', 'public, max-age=86400, immutable');
		headers.set('X-Content-Type-Options', 'nosniff');

		if (object.etag) {
			headers.set('ETag', object.etag);
		}

		return new Response(object.body, { status: 200, headers });
	} catch (error) {
		console.error(
			'Failed to download installer:',
			error instanceof Error ? error.message : String(error),
		);
		return errorResponse('Failed to retrieve installer', 500);
	}
}

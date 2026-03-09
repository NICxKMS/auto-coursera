import type { Env } from '../index';
import { getObject } from '../utils/r2';
import { errorResponse } from '../utils/response';

/** Map an OS identifier to the corresponding installer filename. */
const INSTALLER_MAP: Record<string, string> = {
	windows: 'installer-windows-amd64.exe',
	macos: 'installer-macos-arm64',
	linux: 'installer-linux-amd64',
};

/** Map an OS identifier to the correct Content-Type. */
const CONTENT_TYPE_MAP: Record<string, string> = {
	windows: 'application/octet-stream',
	macos: 'application/octet-stream',
	linux: 'application/octet-stream',
};

/**
 * GET /api/download/:os
 *
 * Stream the platform-specific installer binary from the releases bucket.
 * Returns 404 when the OS is unsupported or the file doesn't exist.
 */
export async function handleDownload(os: string, env: Env): Promise<Response> {
	const filename = INSTALLER_MAP[os.toLowerCase()];

	if (!filename) {
		return errorResponse(`Unsupported OS: ${os}. Supported: windows, macos, linux`, 404);
	}

	try {
		const object = await getObject(env.RELEASES_BUCKET, filename);

		if (!object) {
			return errorResponse(`Installer not found for ${os}`, 404);
		}

		const headers = new Headers();
		headers.set('Content-Type', CONTENT_TYPE_MAP[os] ?? 'application/octet-stream');
		headers.set('Content-Disposition', `attachment; filename="${filename}"`);
		headers.set('Content-Length', object.size.toString());

		if (object.etag) {
			headers.set('ETag', object.etag);
		}

		return new Response(object.body, { status: 200, headers });
	} catch (error) {
		console.error(`Failed to download installer for ${os}:`, error);
		return errorResponse('Failed to retrieve installer', 500);
	}
}

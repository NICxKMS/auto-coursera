import type { Env } from '../index';
import { listObjects } from '../utils/r2';
import { errorResponse, jsonResponse } from '../utils/response';

/** Parse a semver-like version string into comparable numeric parts. */
function parseVersion(version: string): number[] {
	return version.split('.').map((part) => {
		const num = Number.parseInt(part, 10);
		return Number.isNaN(num) ? 0 : num;
	});
}

/** Compare two semver strings in descending order. */
function compareVersionsDesc(a: string, b: string): number {
	const partsA = parseVersion(a);
	const partsB = parseVersion(b);
	const len = Math.max(partsA.length, partsB.length);

	for (let i = 0; i < len; i++) {
		const diff = (partsB[i] ?? 0) - (partsA[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

interface Release {
	version: string;
	file: string;
	size: number;
	date: string;
	url: string;
}

/**
 * GET /api/releases
 *
 * List all .crx releases in the extensions bucket, sorted by version
 * descending (newest first).
 */
export async function handleReleases(env: Env): Promise<Response> {
	try {
		const objects = await listObjects(env.EXTENSIONS_BUCKET, 'releases/');

		const versionPattern = /auto_coursera_([\d.]+)\.crx$/;

		const releases: Release[] = objects.objects
			.map((obj) => {
				const match = obj.key.match(versionPattern);
				if (!match) return null;

				const version = match[1];
				const filename = obj.key.split('/').pop() ?? obj.key;

				return {
					version,
					file: filename,
					size: obj.size,
					date: obj.uploaded.toISOString(),
					url: `https://cdn.autocr.nicx.app/${obj.key}`,
				};
			})
			.filter((release): release is Release => release !== null)
			.sort((a, b) => compareVersionsDesc(a.version, b.version));

		return jsonResponse({ releases });
	} catch (error) {
		console.error('Failed to list releases:', error);
		return errorResponse('Failed to retrieve releases', 500);
	}
}

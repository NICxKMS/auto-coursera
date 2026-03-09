import type { Env } from '../index';
import { listObjects } from '../utils/r2';
import { errorResponse, jsonResponse } from '../utils/response';

/**
 * GET /api/stats
 *
 * Return aggregate statistics about published releases:
 * total count, latest version, and last updated timestamp.
 */
export async function handleStats(env: Env): Promise<Response> {
	try {
		const objects = await listObjects(env.EXTENSIONS_BUCKET, 'releases/');

		const versionPattern = /auto_coursera_([\d.]+)\.crx$/;

		const releases = objects
			.map((obj) => {
				const match = obj.key.match(versionPattern);
				if (!match) return null;
				return {
					version: match[1],
					uploaded: obj.uploaded,
				};
			})
			.filter((r): r is { version: string; uploaded: Date } => r !== null);

		if (releases.length === 0) {
			return jsonResponse({
				totalReleases: 0,
				latestVersion: env.CURRENT_VERSION,
				lastUpdated: null,
			});
		}

		// Find the latest by upload date
		const latest = releases.reduce((acc, r) => (r.uploaded > acc.uploaded ? r : acc));

		return jsonResponse({
			totalReleases: releases.length,
			latestVersion: latest.version,
			lastUpdated: latest.uploaded.toISOString(),
		});
	} catch (error) {
		console.error(
			'Failed to compute stats:',
			error instanceof Error ? error.message : String(error),
		);
		return errorResponse('Failed to retrieve stats', 500);
	}
}

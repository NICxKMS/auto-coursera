import type { Env } from '../index';
import { fetchGitHubReleases } from '../utils/github';
import { errorResponse, jsonResponse } from '../utils/response';

/**
 * GET /api/stats
 *
 * Return aggregate statistics from GitHub Releases.
 * Same JSON shape as before for backwards compatibility.
 */
export async function handleStats(env: Env): Promise<Response> {
	try {
		const ghReleases = await fetchGitHubReleases(env);

		const versionPattern = /auto_coursera_([\d.]+)\.crx$/;

		const crxReleases = ghReleases
			.filter((r) => r.assets.some((a) => versionPattern.test(a.name)))
			.map((r) => ({
				version: r.tag_name.replace(/^v/, ''),
				published: new Date(r.published_at),
			}));

		if (crxReleases.length === 0) {
			return jsonResponse({
				totalReleases: 0,
				latestVersion: env.CURRENT_VERSION,
				lastUpdated: null,
			});
		}

		const latest = crxReleases.reduce((acc, r) => (r.published > acc.published ? r : acc));

		return jsonResponse({
			totalReleases: crxReleases.length,
			latestVersion: latest.version,
			lastUpdated: latest.published.toISOString(),
		});
	} catch (error) {
		console.error(
			'Failed to compute stats:',
			error instanceof Error ? error.message : String(error),
		);
		return errorResponse('Failed to retrieve stats', 500);
	}
}

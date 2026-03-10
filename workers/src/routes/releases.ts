import type { Env } from '../index';
import { fetchGitHubReleases } from '../utils/github';
import { errorResponse, jsonResponse } from '../utils/response';

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
 * List all .crx releases by querying GitHub Releases API (cached 5min).
 * Returns same JSON shape as before for backwards compatibility.
 */
export async function handleReleases(env: Env): Promise<Response> {
	try {
		const ghReleases = await fetchGitHubReleases(env);

		const versionPattern = /auto_coursera_([\d.]+)\.crx$/;

		const releases: Release[] = ghReleases
			.flatMap((release) =>
				release.assets
					.filter((asset) => versionPattern.test(asset.name))
					.map((asset) => {
						const match = asset.name.match(versionPattern);
						if (!match) return null;
						return {
							version: match[1],
							file: asset.name,
							size: asset.size,
							date: asset.updated_at || release.published_at,
							url: asset.browser_download_url,
						};
					})
					.filter((r): r is Release => r !== null),
			)
			.sort((a, b) => {
				// Descending semver sort
				const pa = a.version.split('.').map(Number);
				const pb = b.version.split('.').map(Number);
				for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
					const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
					if (diff !== 0) return diff;
				}
				return 0;
			});

		return jsonResponse({ releases });
	} catch (error) {
		console.error(
			'Failed to list releases:',
			error instanceof Error ? error.message : String(error),
		);
		return errorResponse('Failed to retrieve releases', 500);
	}
}

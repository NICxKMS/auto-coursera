import type { Env } from '../index';

export interface GitHubReleaseAsset {
	name: string;
	size: number;
	browser_download_url: string;
	created_at: string;
	updated_at: string;
}

export interface GitHubRelease {
	tag_name: string;
	name: string;
	published_at: string;
	assets: GitHubReleaseAsset[];
}

const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Fetch releases from the GitHub API with Cloudflare edge caching.
 *
 * Uses the Cache API to avoid hitting GitHub's rate limits.
 * GitHub allows 60 unauthenticated requests/hour per IP.
 * With 5-min cache TTL, each edge location makes ≤12 calls/hour.
 */
export async function fetchGitHubReleases(env: Env): Promise<GitHubRelease[]> {
	const apiUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/releases?per_page=50`;

	// Use Cloudflare Cache API
	const cache = caches.default;
	const cacheKey = new Request(apiUrl, { method: 'GET' });

	const cached = await cache.match(cacheKey);
	if (cached) {
		return cached.json();
	}

	const headers: Record<string, string> = {
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'auto-coursera-worker/1.0',
	};

	const response = await fetch(apiUrl, { headers });

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
	}

	const data: GitHubRelease[] = await response.json();

	// Cache the response at the edge
	const cacheResponse = new Response(JSON.stringify(data), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
		},
	});
	cache.put(cacheKey, cacheResponse).catch(() => {});

	return data;
}

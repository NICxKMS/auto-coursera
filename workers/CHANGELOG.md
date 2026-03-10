# Changelog — Auto-Coursera API Worker

All notable changes to the Cloudflare Worker API are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.8.0] — 2026-03-10

### Fixed
- **(C1) Outer catch now returns CORS headers** — Fatal errors on API-domain requests previously returned 500 without `Access-Control-Allow-Origin`, causing browsers to block the response from JS callers. The outer catch in `index.ts` now applies CORS headers when the request was for the API domain, with fail-closed behavior (no CORS) if the CDN hostname cannot be determined.
- **(C2) `cache.put()` failure no longer discards valid data** — In `utils/github.ts`, `cache.put()` was `await`ed after successfully fetching GitHub release data. If the edge cache write threw, the valid data was lost. Changed to fire-and-forget (`.catch(() => {})`) so valid data is always returned.
- **(S4) `updates.xml` `Cache-Control` aligned to 300s** — `cdn.ts` previously set `max-age=3600` (1 hour) while the Cloudflare Cache Rule was documented at 300s. Changed to `max-age=300` for defense-in-depth so behavior is correct even without the Cache Rule.
- **(S5) `/api/health` no longer uselessly cached** — The health endpoint's `timestamp` field was stale for up to 5 minutes due to the default `max-age=300`. Now explicitly passes `Cache-Control: no-store`.
- **(S8) Required env var validation on every request** — Empty or undefined `CURRENT_VERSION`, `EXTENSION_ID`, `GITHUB_REPO`, `CDN_BASE_URL`, or `ALLOWED_ORIGIN` now return a clear 500 error instead of silently serving broken 200 responses with empty strings.

### Added
- **Dual-domain routing** — Worker now handles both `autocr-api.nicx.me` (API) and `autocr-cdn.nicx.me` (CDN) domains
- **Dynamic `updates.xml` generation** (`routes/cdn.ts`) — Chrome update manifest generated from environment variables, replacing static R2 file
- **CDN release redirects** (`routes/cdn.ts`) — `/releases/auto_coursera_X.Y.Z.crx` paths 302 redirect to GitHub Releases for backwards compatibility
- **GitHub Releases API client** (`utils/github.ts`) — Fetches release data from GitHub API with Cloudflare Cache API (5-min TTL)
- **`GITHUB_REPO` environment variable** — Repository identifier for GitHub API and download URL construction

### Changed
- **Worker README release docs** — `/api/releases` documentation now matches current behavior by showing GitHub `browser_download_url` values for release assets and clarifying that CDN `/releases/*.crx` paths are compatibility redirects, not the API payload
- **`/api/download/:os`** — Now returns 302 redirects to GitHub Releases instead of streaming binaries from R2
- **CDN hostname routing** — Derived from `env.CDN_BASE_URL` instead of hardcoded `'autocr-cdn.nicx.me'` (single-source-of-truth)
- **`handleDownload()`** — Removed unnecessary `async` keyword (no `await` after R2 removal)
- **`/api/releases`** — Sources release data from GitHub Releases API (cached) instead of R2 `listObjects()`
- **`/api/stats`** — Computes statistics from GitHub Releases API instead of R2
- **`/api/latest-version`** — `downloadUrl` now points to GitHub Releases
- **CORS headers** — Only applied to API domain responses, not CDN domain responses
- **`Env` interface** — Removed `EXTENSIONS_BUCKET` and `RELEASES_BUCKET` R2 types, added `GITHUB_REPO`

### Removed
- **`utils/r2.ts`** — R2 helper functions (`getObject`, `listObjects`) deleted
- **R2 bucket bindings** — `EXTENSIONS_BUCKET` and `RELEASES_BUCKET` removed from `wrangler.toml`

## [1.7.5] — 2026-03-09

### Added
- **`GET /api/latest-version`** — returns current version, extension ID, update & download URLs
- **`GET /api/releases`** — lists all CRX releases from R2 bucket, sorted newest-first
- **`GET /api/download/:os`** — streams installer binaries (windows, macos, linux) from R2 with attachment headers
- **`GET /api/stats`** — total release count, latest version, last updated timestamp
- **CORS handling** — `OPTIONS` preflight for all routes, restricted to `https://autocr.nicx.me`
- Standard error response builder (`utils/response.ts`)
- R2 bucket integrations: `EXTENSIONS_BUCKET` (CRX files), `RELEASES_BUCKET` (installer binaries)
- Environment configuration via `wrangler.toml` (extension ID, version, allowed origin)
- Production route mapping to `autocr-api.nicx.me`

### Changed
- **Domain migration** — Worker route updated from `api.autocr.nicx.me` to `autocr-api.nicx.me` (flat subdomain for SSL compatibility)

### Technical
- Cloudflare Workers with `nodejs_compat` flag
- TypeScript with `@cloudflare/workers-types`
- Wrangler 3.x for development and deployment

# Changelog — Auto-Coursera API Worker

All notable changes to the Cloudflare Worker API are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

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
- Production route mapping to `api.autocr.nicx.me`

### Technical
- Cloudflare Workers with `nodejs_compat` flag
- TypeScript with `@cloudflare/workers-types`
- Wrangler 3.x for development and deployment

# Auto-Coursera API Worker

Cloudflare Workers API and CDN that serves version info, release listings, installer download redirects, and Chrome update manifests for the Auto-Coursera Assistant distribution platform. All binary artifacts are stored on GitHub Releases — the Worker proxies the GitHub API and redirects download requests.

**Production:**
- **API:** [autocr-api.nicx.me](https://autocr-api.nicx.me) — REST endpoints for the website
- **CDN:** [autocr-cdn.nicx.me](https://autocr-cdn.nicx.me) — Chrome update manifest + CRX download redirects

---

## Stack

| Technology | Version | Purpose |
|---|---|---|
| [Cloudflare Workers](https://workers.cloudflare.com/) | — | Serverless runtime |
| TypeScript | 5.x | Type-safe request handling |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | 3.x | Development & deployment CLI |
| [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github) | — | Binary artifact storage (CRX + installers) |

## Development

```bash
pnpm install
pnpm dev              # Local dev server (wrangler dev)
pnpm deploy           # Deploy to Cloudflare
pnpm deploy:prod      # Deploy with production routes
```

## Dual-Domain Routing

The Worker handles two domains in a single deployment:

| Domain | Purpose |
|---|---|
| `autocr-api.nicx.me` | REST API — version info, releases, stats, installer redirects. CORS enabled. |
| `autocr-cdn.nicx.me` | CDN — dynamically generated `updates.xml`, CRX download redirects. No CORS. |

The router in `index.ts` inspects the `Host` header and dispatches to the appropriate handler.

## API Endpoints (`autocr-api.nicx.me`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/latest-version` | Current version, extension ID, update/download URLs |
| `GET` | `/api/releases` | All CRX releases (from GitHub Releases API, cached 5 min) |
| `GET` | `/api/download/:os` | 302 redirect to GitHub Release installer binary |
| `GET` | `/api/stats` | Aggregate stats from GitHub Releases API |
| `OPTIONS` | `/*` | CORS preflight handler |

### GET `/api/latest-version`

Returns the current extension version and download URLs pointing to GitHub Releases.

```json
{
  "version": "1.8.0",
  "extensionId": "alojpdnpiddmekflpagdblmaehbdfcge",
  "updateUrl": "https://autocr-cdn.nicx.me/updates.xml",
  "downloadUrl": "https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx"
}
```

### GET `/api/releases`

Lists all CRX releases from the GitHub Releases API. Responses are cached for 5 minutes via the Cloudflare Cache API.

The `url` field is the GitHub asset `browser_download_url`, not the CDN compatibility alias. Use the CDN `/releases/*.crx` routes only when you specifically need the legacy `autocr-cdn.nicx.me` path shape.

```json
{
  "releases": [
    { "version": "1.8.0", "file": "auto_coursera_1.8.0.crx", "size": 123456, "date": "2026-03-01", "url": "https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx" }
  ]
}
```

### GET `/api/download/:os`

Returns a `302` redirect to the installer binary on GitHub Releases.

| OS Parameter | Binary Redirected To |
|---|---|
| `windows` | `installer-windows-amd64.exe` |
| `windows-arm64` | `installer-windows-arm64.exe` |
| `macos` | `installer-macos-arm64` |
| `macos-intel` | `installer-macos-amd64` |
| `linux` | `installer-linux-amd64` |
| `linux-arm64` | `installer-linux-arm64` |

### GET `/api/stats`

Aggregate statistics computed from the GitHub Releases API.

```json
{
  "totalReleases": 1,
  "latestVersion": "1.8.0",
  "lastUpdated": "2026-03-01T00:00:00.000Z"
}
```

## CDN Endpoints (`autocr-cdn.nicx.me`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/updates.xml` | Dynamically generated Chrome update manifest |
| `GET` | `/releases/auto_coursera_X.Y.Z.crx` | 302 redirect to GitHub Release CRX |
| `GET` | `/releases/auto_coursera_X.Y.Z.crx.sha256` | 302 redirect to GitHub Release checksum |

### GET `/updates.xml`

Dynamically generates the Chrome extension update manifest from the `CURRENT_VERSION` and `EXTENSION_ID` environment variables. Browsers poll this URL to discover new versions.

### GET `/releases/auto_coursera_X.Y.Z.crx`

Returns a `302` redirect to `https://github.com/NICxKMS/auto-coursera/releases/download/vX.Y.Z/auto_coursera_X.Y.Z.crx`. This provides backwards-compatible URLs for browser policies that reference the CDN domain.

## Project Structure

```
workers/
├── src/
│   ├── index.ts           # Entry point — dual-domain request router
│   ├── routes/
│   │   ├── cdn.ts         # CDN handlers: updates.xml + CRX redirects
│   │   ├── version.ts     # /api/latest-version handler
│   │   ├── releases.ts    # /api/releases handler (GitHub API)
│   │   ├── download.ts    # /api/download/:os handler (302 redirects)
│   │   └── stats.ts       # /api/stats handler (GitHub API)
│   └── utils/
│       ├── cors.ts        # CORS headers + OPTIONS handler
│       ├── github.ts      # GitHub Releases API client with Cache API
│       └── response.ts    # Standard error/success response builders
├── wrangler.toml          # Worker config (routes, env vars)
├── tsconfig.json
└── package.json
```

## Configuration

### Environment Variables (`wrangler.toml`)

| Variable | Value | Description |
|---|---|---|
| `EXTENSION_ID` | `alojpdnpiddmekflpagdblmaehbdfcge` | Chrome extension ID (from signing key) |
| `CURRENT_VERSION` | `1.8.0` | Current extension version |
| `ALLOWED_ORIGIN` | `https://autocr.nicx.me` | CORS allowed origin (API domain only) |
| `CDN_BASE_URL` | `https://autocr-cdn.nicx.me` | Base URL for CDN-domain responses |
| `GITHUB_REPO` | `NICxKMS/auto-coursera` | GitHub repository for Releases API |

### Production Routes

```toml
[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

## CORS

CORS headers are applied **only to API domain** (`autocr-api.nicx.me`) responses:

- `Access-Control-Allow-Origin: https://autocr.nicx.me`
- `Access-Control-Allow-Methods: GET, OPTIONS`

CDN domain responses (`autocr-cdn.nicx.me`) do not include CORS headers — browsers fetch `updates.xml` and CRX files directly, not via JavaScript `fetch()`.

Preflight requests (`OPTIONS`) return `204 No Content` with CORS headers.

## Deployment

```bash
# Standard deployment
pnpm deploy

# Production (with dual-domain route mapping)
pnpm deploy:prod
```

See [`docs/CLOUDFLARE-SETUP.md`](../docs/CLOUDFLARE-SETUP.md#6-worker-deployment) for full deployment and route configuration instructions.

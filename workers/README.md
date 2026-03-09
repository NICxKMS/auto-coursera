# Auto-Coursera API Worker

Cloudflare Workers API that serves version info, release listings, and proxied installer downloads for the Auto-Coursera Assistant distribution platform.

**Production:** [api.autocr.nicx.me](https://api.autocr.nicx.me)

---

## Stack

| Technology | Version | Purpose |
|---|---|---|
| [Cloudflare Workers](https://workers.cloudflare.com/) | — | Serverless runtime |
| TypeScript | 5.x | Type-safe request handling |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | 3.x | Development & deployment CLI |
| Cloudflare R2 | — | Object storage for CRX files + installers |

## Development

```bash
pnpm install
pnpm dev              # Local dev server (wrangler dev)
pnpm deploy           # Deploy to Cloudflare
pnpm deploy:prod      # Deploy with production routes
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/latest-version` | Current version, extension ID, update/download URLs |
| `GET` | `/api/releases` | All CRX releases from R2, sorted newest-first |
| `GET` | `/api/download/:os` | Stream installer binary (windows, macos, linux) |
| `GET` | `/api/stats` | Total releases, latest version, last updated date |
| `OPTIONS` | `/*` | CORS preflight handler |

### GET `/api/latest-version`

Returns the current extension version and related URLs.

```json
{
  "version": "1.7.5",
  "extensionId": "alojpdnpiddmekflpagdblmaehbdfcge",
  "updateUrl": "https://cdn.autocr.nicx.me/updates.xml",
  "downloadUrl": "https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx"
}
```

### GET `/api/releases`

Lists all CRX releases from the R2 extensions-bucket.

```json
{
  "releases": [
    { "version": "1.7.5", "file": "auto_coursera_1.7.5.crx", "size": 123456, "date": "2026-03-01", "url": "https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx" }
  ]
}
```

### GET `/api/download/:os`

Streams an installer binary from R2 with `Content-Disposition: attachment`.

| OS Parameter | Binary Served |
|---|---|
| `windows` | `installer-windows-amd64.exe` |
| `windows-arm64` | `installer-windows-arm64.exe` |
| `macos` | `installer-macos-arm64` |
| `macos-intel` | `installer-macos-amd64` |
| `linux` | `installer-linux-amd64` |

### GET `/api/stats`

```json
{
  "totalReleases": 1,
  "latestVersion": "1.7.5",
  "lastUpdated": "2026-03-01T00:00:00.000Z"
}
```

## Project Structure

```
workers/
├── src/
│   ├── index.ts           # Entry point — request router
│   ├── routes/
│   │   ├── version.ts     # /api/latest-version handler
│   │   ├── releases.ts    # /api/releases handler
│   │   ├── download.ts    # /api/download/:os handler
│   │   └── stats.ts       # /api/stats handler
│   └── utils/
│       ├── cors.ts        # CORS headers + OPTIONS handler
│       ├── r2.ts          # R2 bucket helper utilities
│       └── response.ts    # Standard error/success response builders
├── wrangler.toml          # Worker config (bindings, routes, env vars)
├── tsconfig.json
└── package.json
```

## Configuration

### Environment Variables (`wrangler.toml`)

| Variable | Value | Description |
|---|---|---|
| `EXTENSION_ID` | `alojpdnpiddmekflpagdblmaehbdfcge` | Chrome extension ID (from signing key) |
| `CURRENT_VERSION` | `1.7.5` | Current extension version |
| `ALLOWED_ORIGIN` | `https://autocr.nicx.me` | CORS allowed origin |

### R2 Bindings

| Binding | Bucket | Contents |
|---|---|---|
| `EXTENSIONS_BUCKET` | `extensions-bucket` | `updates.xml`, `releases/*.crx`, checksums |
| `RELEASES_BUCKET` | `releases-bucket` | Installer binaries for all platforms |

### Production Routes

```toml
[env.production]
routes = [
  { pattern = "api.autocr.nicx.me/*", zone_name = "nicx.me" }
]
```

## CORS

The Worker returns CORS headers allowing requests from the website origin:

- `Access-Control-Allow-Origin: https://autocr.nicx.me`
- `Access-Control-Allow-Methods: GET, OPTIONS`

Preflight requests (`OPTIONS`) return `204 No Content` with CORS headers.

## Deployment

```bash
# Standard deployment
pnpm deploy

# Production (with route mapping to api.autocr.nicx.me)
pnpm deploy:prod
```

See [`docs/CLOUDFLARE-SETUP.md`](../docs/CLOUDFLARE-SETUP.md#6-worker-deployment) for full deployment and route configuration instructions.

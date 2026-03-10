> ✅ **IMPLEMENTED** — This plan was fully implemented on 2026-03-10. See CHANGELOG.md for details.

# Plan: Eliminate R2 — Option E Implementation

> **Date**: 2026-03-10
> **Research**: [`docs/research/GITHUB-RELEASES-VS-R2.md`](../research/GITHUB-RELEASES-VS-R2.md)
> **Goal**: Remove both R2 buckets. All binaries (CRX + installers) live on GitHub Releases. The Worker generates `updates.xml` dynamically and proxies GitHub's Releases API for the website.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Phase 1 — Move Installers to GitHub Releases](#phase-1--move-installers-to-github-releases)
- [Phase 2 — Move CRX to GitHub Releases & Eliminate R2](#phase-2--move-crx-to-github-releases--eliminate-r2)
- [File Change Inventory](#file-change-inventory)
- [DNS & Infrastructure Changes](#dns--infrastructure-changes)
- [Rollback Plan](#rollback-plan)
- [Risk Assessment](#risk-assessment)

---

## Architecture Overview

### Before (Current)

```
┌──────────────┐  updates.xml     ┌─────────────────────┐
│  Chrome      │◄────────────────│  R2: extensions-     │
│  (Policy)    │  CRX download    │  bucket              │
│              │◄────────────────│  (autocr-cdn.nicx.me)│
└──────────────┘                  └─────────────────────┘

┌──────────────┐  /api/download/* ┌─────────────────────┐  stream binary  ┌───────────────┐
│  Website     │────────────────►│  Worker              │◄──────────────►│  R2: releases- │
│  (Pages)     │  /api/releases   │  (autocr-api.nicx.me)│  list objects   │  bucket        │
│              │  /api/stats      │                      │◄──────────────►│               │
│              │  /api/version    │                      │                │               │
│  autocr.     │                  │                      │                └───────────────┘
│  nicx.me     │                  │                      │◄──────────────►┌───────────────┐
└──────────────┘                  └─────────────────────┘  list releases   │  R2: extensions│
                                                                           │  bucket        │
                                                                           └───────────────┘
```

### After (Option E)

```
┌──────────────┐  updates.xml     ┌─────────────────────┐
│  Chrome      │◄────────────────│  Worker              │  generates XML dynamically
│  (Policy)    │  codebase→GH     │                      │
│              │  ─────────────►  │  Routes:             │
└──────┬───────┘  download CRX    │  • autocr-api.nicx.me│
       │                          │  • autocr-cdn.nicx.me│
       ▼                          │                      │
┌──────────────┐                  │  No R2 bindings!     │
│  GitHub      │◄─────────────── │                      │
│  Releases    │  302 redirect    └──────────┬───────────┘
│              │  (installers)               │
└──────────────┘                             │ fetch + cache
                                             ▼
┌──────────────┐                  ┌─────────────────────┐
│  Website     │  same API as    │  GitHub Releases API │
│  (Pages)     │  before          │  (cached 5min)       │
│  autocr.     │                  └─────────────────────┘
│  nicx.me     │
└──────────────┘
```

---

## Phase 1 — Move Installers to GitHub Releases

**Scope**: Eliminate `releases-bucket`. Installer downloads redirect to GitHub Releases instead of streaming from R2. CRX pipeline unchanged.

### 1.1 Add `contents: write` Permission to CI

**File**: `.github/workflows/deploy.yml`

The top-level `permissions` block currently has `contents: read`. The `build-installers` job needs `contents: write` to create a GitHub Release and upload assets.

```yaml
# Change at top level OR per-job
permissions:
  contents: write  # was: read
```

> **Decision**: Per-job permissions are more secure. Add `permissions: { contents: write }` only to `build-installers`.

### 1.2 Create GitHub Release with Installer Assets

**File**: `.github/workflows/deploy.yml` — `build-installers` job

Replace the "Upload binaries to R2" step with a GitHub Release step:

```yaml
# REMOVE this step:
- name: Upload binaries to R2
  run: |
    for file in installer/dist/*; do
      filename=$(basename "$file")
      echo "Uploading $filename..."
      npx wrangler r2 object put \
        "releases-bucket/${filename}" \
        --file="$file"
    done
  env:
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

# ADD this step:
- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    tag_name: ${{ github.ref_name }}
    name: Release ${{ github.ref_name }}
    draft: false
    prerelease: false
    files: |
      installer/dist/installer-*
      installer/dist/checksums.sha256
    generate_release_notes: true
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 1.3 Add `GITHUB_REPO` Env Var to Worker

**File**: `workers/wrangler.toml`

```toml
[vars]
EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
CURRENT_VERSION = "1.8.0"
ALLOWED_ORIGIN = "https://autocr.nicx.me"
CDN_BASE_URL = "https://autocr-cdn.nicx.me"
GITHUB_REPO = "NICxKMS/auto-coursera"   # NEW
```

> **Note**: `GITHUB_REPO` is set to the verified repository name `NICxKMS/auto-coursera`.

### 1.4 Update Worker `Env` Interface

**File**: `workers/src/index.ts`

```typescript
export interface Env {
  EXTENSIONS_BUCKET: R2Bucket;     // Keep for Phase 1
  // RELEASES_BUCKET: R2Bucket;    // REMOVE
  CURRENT_VERSION: string;
  EXTENSION_ID: string;
  ALLOWED_ORIGIN: string;
  CDN_BASE_URL: string;
  GITHUB_REPO: string;             // NEW
}
```

### 1.5 Rewrite `routes/download.ts` — Redirect to GitHub

**File**: `workers/src/routes/download.ts`

Replace R2 streaming with 302 redirects to GitHub Releases:

```typescript
import type { Env } from '../index';
import { errorResponse } from '../utils/response';

/** Map an OS identifier to the corresponding installer filename. */
const INSTALLER_MAP: Record<string, string> = {
  windows: 'installer-windows-amd64.exe',
  'windows-arm64': 'installer-windows-arm64.exe',
  macos: 'installer-macos-arm64',
  'macos-intel': 'installer-macos-amd64',
  linux: 'installer-linux-amd64',
  'linux-arm64': 'installer-linux-arm64',
};

const SUPPORTED_PLATFORMS = Object.keys(INSTALLER_MAP).join(', ');

/**
 * GET /api/download/:os
 *
 * Redirect to the platform-specific installer binary on GitHub Releases.
 */
export async function handleDownload(os: string, env: Env): Promise<Response> {
  const filename = INSTALLER_MAP[os.toLowerCase()];

  if (!filename) {
    return errorResponse(
      `Unsupported platform. Supported values: ${SUPPORTED_PLATFORMS}`,
      404,
    );
  }

  const url = `https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/${filename}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

### 1.6 Remove `RELEASES_BUCKET` R2 Binding

**File**: `workers/wrangler.toml`

```toml
# REMOVE this block:
[[r2_buckets]]
binding = "RELEASES_BUCKET"
bucket_name = "releases-bucket"
```

### 1.7 Delete `releases-bucket` from Cloudflare Dashboard

After confirming the release works:
1. Go to Cloudflare Dashboard → R2 → `releases-bucket`
2. Delete all objects
3. Delete bucket

### 1.8 Validation Checklist — Phase 1

- [ ] Tag a test release (e.g., `v1.7.6-rc.1`)
- [ ] Verify GitHub Release is created with all 6 installer binaries + checksums
- [ ] Verify `autocr-api.nicx.me/api/download/windows` returns 302 → GitHub
- [ ] Verify `autocr-api.nicx.me/api/download/linux` returns 302 → GitHub
- [ ] Verify `autocr.nicx.me/download/windows` (Pages redirect) → API → GitHub
- [ ] Verify `updates.xml` still works (no change in Phase 1)
- [ ] Verify `autocr-cdn.nicx.me/updates.xml` returns valid XML (no change)
- [ ] Verify website `install.astro`, `downloads.astro` download links work
- [ ] Delete `releases-bucket` from Cloudflare

---

## Phase 2 — Move CRX to GitHub Releases & Eliminate R2

**Scope**: Eliminate `extensions-bucket`. Worker generates `updates.xml` dynamically. CRX is uploaded as a GitHub Release asset. Worker also routes `autocr-cdn.nicx.me`.

### 2.1 Upload CRX to GitHub Release (CI)

**File**: `.github/workflows/deploy.yml` — `build-extension` job

```yaml
# REMOVE these three steps:
- name: Upload CRX to R2 ...
- name: Upload updates.xml to R2 ...
- name: Upload checksum to R2 ...

# The CRX artifact upload step stays (for CI visibility).
# CRX will be uploaded to GitHub Release in the build-installers job.
```

Modify `build-installers` (or create a new dedicated `create-release` job that runs after both `build-extension` and `build-installers`) to include CRX assets:

```yaml
create-release:
  if: startsWith(github.ref, 'refs/tags/v')
  needs: [build-extension, build-installers]
  runs-on: ubuntu-latest
  permissions:
    contents: write
  timeout-minutes: 5
  steps:
    - name: Download CRX artifact
      uses: actions/download-artifact@v4
      with:
        name: crx-package

    - name: Download installer artifacts
      uses: actions/download-artifact@v4
      with:
        name: installers

    - name: Create GitHub Release
      uses: softprops/action-gh-release@v2
      with:
        tag_name: ${{ github.ref_name }}
        name: Release ${{ github.ref_name }}
        draft: false
        prerelease: false
        files: |
          auto_coursera_*.crx
          auto_coursera_*.crx.sha256
          updates.xml
          installer-*
          checksums.sha256
        generate_release_notes: true
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

> **Note**: `updates.xml` is still generated in CI for this transitional step, but its `codebase` URL now points to GitHub. Once the Worker generates `updates.xml` dynamically (step 2.3), the `generate-updates-xml.sh` step and `updates.xml` upload can be removed entirely.

### 2.2 Update `generate-updates-xml.sh` Invocation (Transitional)

**File**: `.github/workflows/deploy.yml` — `build-extension` job

Change the CRX URL to point to GitHub Releases:

```yaml
- name: Generate updates.xml
  run: |
    ./scripts/generate-updates-xml.sh \
      -i "${{ secrets.EXTENSION_ID }}" \
      -v "${{ steps.version.outputs.VERSION }}" \
      -u "https://github.com/${{ github.repository }}/releases/download/${{ github.ref_name }}/auto_coursera_${{ steps.version.outputs.VERSION }}.crx" \
      -o updates.xml
```

> This is only needed until step 2.3 (dynamic `updates.xml`) is deployed. After that, `generate-updates-xml.sh` can be deleted.

### 2.3 Add CDN Route to Worker

**File**: `workers/wrangler.toml`

```toml
[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }   # NEW
]
```

### 2.4 DNS: Remove R2 Custom Domain, Add Worker Route

**Cloudflare Dashboard**:

1. Remove the R2 custom domain from `extensions-bucket` (this is what currently routes `autocr-cdn.nicx.me` → R2)
2. The Worker route `autocr-cdn.nicx.me/*` will automatically be handled once the R2 custom domain is removed — Cloudflare's Worker routes take precedence
3. The CNAME/A record for `autocr-cdn.nicx.me` may need to be a proxied record pointing to the Worker (check if Cloudflare automatically handles this with Worker routes)

> ⚠️ **Critical**: The DNS change and Worker deployment must be coordinated. Deploy the Worker with CDN routes first, then remove the R2 custom domain. There may be a brief gap — test in staging first.

### 2.5 Create CDN Route Handler in Worker

**New file**: `workers/src/routes/cdn.ts`

```typescript
import type { Env } from '../index';
import { errorResponse } from '../utils/response';

/**
 * Generate updates.xml dynamically from environment variables.
 *
 * This replaces the static updates.xml file that was previously
 * uploaded to R2 by the CI pipeline.
 */
export function handleUpdatesXml(env: Env): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${env.EXTENSION_ID}">
    <updatecheck codebase="https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/auto_coursera_${env.CURRENT_VERSION}.crx" version="${env.CURRENT_VERSION}"/>
  </app>
</gupdate>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * Handle legacy CDN paths by redirecting to GitHub Releases.
 *
 * Supports:
 *   GET /releases/auto_coursera_X.Y.Z.crx      → 302 to GitHub
 *   GET /releases/auto_coursera_X.Y.Z.crx.sha256 → 302 to GitHub
 */
export function handleCdnRelease(pathname: string, env: Env): Response {
  const filename = pathname.replace(/^\/releases\//, '');

  if (!filename || !/^auto_coursera_[\d.]+\.crx(\.sha256)?$/.test(filename)) {
    return errorResponse('Not found', 404);
  }

  // Extract version from filename to build the correct tag
  const versionMatch = filename.match(/auto_coursera_([\d.]+)\.crx/);
  if (!versionMatch) {
    return errorResponse('Not found', 404);
  }

  const version = versionMatch[1];
  const url = `https://github.com/${env.GITHUB_REPO}/releases/download/v${version}/${filename}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
```

### 2.6 Update Worker Router for Dual-Domain

**File**: `workers/src/index.ts`

The Worker must detect which domain the request is for and route accordingly:

```typescript
import { handleCdnRelease, handleUpdatesXml } from './routes/cdn';
import { handleDownload } from './routes/download';
import { handleReleases } from './routes/releases';
import { handleStats } from './routes/stats';
import { handleVersion } from './routes/version';
import { getCorsHeaders, handleOptions } from './utils/cors';
import { errorResponse, jsonResponse } from './utils/response';

export interface Env {
  CURRENT_VERSION: string;
  EXTENSION_ID: string;
  ALLOWED_ORIGIN: string;
  CDN_BASE_URL: string;
  GITHUB_REPO: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, hostname } = url;
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin') ?? '';

    // ── CDN domain: autocr-cdn.nicx.me ────────────────────────
    if (hostname === 'autocr-cdn.nicx.me') {
      if (method !== 'GET') {
        return errorResponse('Method not allowed', 405);
      }

      if (pathname === '/updates.xml') {
        return handleUpdatesXml(env);
      }

      if (pathname.startsWith('/releases/')) {
        return handleCdnRelease(pathname, env);
      }

      return errorResponse('Not found', 404);
    }

    // ── API domain: autocr-api.nicx.me ────────────────────────
    if (method === 'OPTIONS') {
      return handleOptions(request, env.ALLOWED_ORIGIN);
    }

    let response: Response;

    try {
      if (method !== 'GET') {
        response = errorResponse('Method not allowed', 405);
      } else if (pathname === '/api/health') {
        response = jsonResponse({
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
      } else if (pathname === '/api/latest-version') {
        response = handleVersion(env);
      } else if (pathname === '/api/releases') {
        response = await handleReleases(env);
      } else if (pathname.startsWith('/api/download/')) {
        const os = pathname.replace('/api/download/', '').replace(/\/$/, '');
        if (!os) {
          response = errorResponse(
            'Missing OS parameter. Use: /api/download/windows|macos|linux',
            400,
          );
        } else {
          response = await handleDownload(os, env);
        }
      } else if (pathname === '/api/stats') {
        response = await handleStats(env);
      } else {
        response = errorResponse('Not found', 404);
      }
    } catch (error) {
      console.error('Unhandled error:', error instanceof Error ? error.message : String(error));
      response = errorResponse('Internal server error', 500);
    }

    // Apply CORS headers to API responses only
    const corsHeaders = getCorsHeaders(origin, env.ALLOWED_ORIGIN);
    for (const [key, value] of corsHeaders.entries()) {
      response.headers.set(key, value);
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
```

### 2.7 Create GitHub API Client with Caching

**New file**: `workers/src/utils/github.ts`

Used by the refactored `releases.ts` and `stats.ts` endpoints:

```typescript
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
  await cache.put(cacheKey, cacheResponse);

  return data;
}
```

### 2.8 Rewrite `routes/releases.ts` — Use GitHub API

**File**: `workers/src/routes/releases.ts`

```typescript
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
```

### 2.9 Rewrite `routes/stats.ts` — Use GitHub API

**File**: `workers/src/routes/stats.ts`

```typescript
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

    const latest = crxReleases.reduce((acc, r) =>
      r.published > acc.published ? r : acc,
    );

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
```

### 2.10 Update `routes/version.ts` — CRX URL points to GitHub

**File**: `workers/src/routes/version.ts`

```typescript
import type { Env } from '../index';
import { jsonResponse } from '../utils/response';

/**
 * GET /api/latest-version
 *
 * Return the current published version and relevant download URLs.
 */
export function handleVersion(env: Env): Response {
  return jsonResponse({
    version: env.CURRENT_VERSION,
    extensionId: env.EXTENSION_ID,
    updateUrl: `${env.CDN_BASE_URL}/updates.xml`,
    downloadUrl: `https://github.com/${env.GITHUB_REPO}/releases/download/v${env.CURRENT_VERSION}/auto_coursera_${env.CURRENT_VERSION}.crx`,
  });
}
```

### 2.11 Delete R2 Utility Module

**Delete file**: `workers/src/utils/r2.ts`

This file is no longer imported by any route after the rewrites.

### 2.12 Remove `EXTENSIONS_BUCKET` R2 Binding

**File**: `workers/wrangler.toml` — Final state

```toml
name = "auto-coursera-api"
main = "src/index.ts"
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]

[vars]
EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
CURRENT_VERSION = "1.8.0"
ALLOWED_ORIGIN = "https://autocr.nicx.me"
CDN_BASE_URL = "https://autocr-cdn.nicx.me"
GITHUB_REPO = "NICxKMS/auto-coursera"
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

### 2.13 Clean Up CI Pipeline

**File**: `.github/workflows/deploy.yml` — `build-extension` job

Remove all R2 upload steps:

```yaml
# DELETE these steps entirely:
- name: Upload CRX to R2 ...
- name: Upload updates.xml to R2 ...
- name: Upload checksum to R2 ...
```

The `generate-updates-xml.sh` step can also be removed once the Worker serves `updates.xml` dynamically. Keep the CRX artifact upload for CI visibility.

### 2.14 Delete R2 Buckets

After Phase 2 is validated:
1. Delete `extensions-bucket` from Cloudflare Dashboard
2. The `releases-bucket` should already be gone (Phase 1)

### 2.15 Optionally Remove `generate-updates-xml.sh`

**File**: `scripts/generate-updates-xml.sh`

This script is no longer needed. The Worker generates `updates.xml` dynamically. Keep it around for a release or two in case of rollback, then delete.

### 2.16 Validation Checklist — Phase 2

- [ ] Deploy Worker with CDN routes (`autocr-cdn.nicx.me/*`)
- [ ] Verify `autocr-cdn.nicx.me/updates.xml` returns valid XML with GitHub `codebase` URL
- [ ] Verify Chrome can fetch the `updates.xml` and download the CRX
- [ ] Verify `autocr-cdn.nicx.me/releases/auto_coursera_1.8.0.crx` → 302 to GitHub (backwards compat)
- [ ] Verify `autocr-api.nicx.me/api/releases` returns correct data (from GitHub API)
- [ ] Verify `autocr-api.nicx.me/api/stats` returns correct data
- [ ] Verify `autocr-api.nicx.me/api/latest-version` returns GitHub-based URLs
- [ ] Verify `autocr-api.nicx.me/api/download/windows` still works (from Phase 1)
- [ ] Verify website `releases.astro` page renders correctly
- [ ] Verify website `VersionBadge.astro` shows correct version
- [ ] Test a fresh install via `curl | bash` install scripts
- [ ] Verify the install scripts' `UPDATE_URL` still resolves
- [ ] Monitor GitHub API rate limit usage via Worker logs
- [ ] Delete `extensions-bucket` from Cloudflare

---

## File Change Inventory

### Files Modified

| File | Phase | Change |
|------|-------|--------|
| `.github/workflows/deploy.yml` | 1+2 | Remove R2 uploads, add GitHub Release step, add `create-release` job |
| `workers/wrangler.toml` | 1+2 | Remove R2 bindings, add `GITHUB_REPO` var, add CDN route |
| `workers/src/index.ts` | 1+2 | Remove R2 types from `Env`, add CDN routing, add `GITHUB_REPO` |
| `workers/src/routes/download.ts` | 1 | Replace R2 streaming with 302 redirect to GitHub |
| `workers/src/routes/releases.ts` | 2 | Replace R2 listing with GitHub Releases API + cache |
| `workers/src/routes/stats.ts` | 2 | Replace R2 listing with GitHub Releases API + cache |
| `workers/src/routes/version.ts` | 2 | Change `downloadUrl` to GitHub Releases URL |

### Files Created

| File | Phase | Purpose |
|------|-------|---------|
| `workers/src/routes/cdn.ts` | 2 | `handleUpdatesXml()`, `handleCdnRelease()` |
| `workers/src/utils/github.ts` | 2 | `fetchGitHubReleases()` with Cloudflare Cache API |

### Files Deleted

| File | Phase | Reason |
|------|-------|--------|
| `workers/src/utils/r2.ts` | 2 | No longer used — R2 bindings removed |

### Files Optionally Deleted (After Stabilization)

| File | When | Reason |
|------|------|--------|
| `scripts/generate-updates-xml.sh` | After Phase 2 stable | Worker generates `updates.xml` dynamically |

### Files Unchanged (No Edits Needed)

| File | Why |
|------|-----|
| `installer/config.go` | `UpdateURL` = `autocr-cdn.nicx.me/updates.xml` — same URL, now served by Worker |
| `website/public/scripts/install.sh` | Same `UPDATE_URL`, now resolved by Worker |
| `website/public/scripts/install.ps1` | Same `UPDATE_URL`, now resolved by Worker |
| `website/public/scripts/install-mac.sh` | Same `UPDATE_URL`, now resolved by Worker |
| `website/public/_redirects` | Still redirects to `autocr-api.nicx.me/api/download/*` |
| `website/public/_headers` | Still allows `connect-src` to `autocr-api.nicx.me` |
| `website/src/pages/docs/manual.astro` | Still references `autocr-cdn.nicx.me/updates.xml` |
| `website/src/pages/install.astro` | API URLs unchanged |
| `website/src/pages/downloads.astro` | API URLs unchanged |
| `website/src/components/VersionBadge.astro` | API URL unchanged |
| `version.json` | CDN and API domains unchanged |
| `extension/manifest.json` | No `update_url` field (set via policy) |

---

## DNS & Infrastructure Changes

### Phase 1

No DNS changes. Only R2 bucket `releases-bucket` gets deleted after validation.

### Phase 2

| Change | Detail |
|--------|--------|
| **Remove R2 Custom Domain** | `autocr-cdn.nicx.me` currently routes to `extensions-bucket` via R2 custom domain. Remove this in Cloudflare Dashboard → R2 → extensions-bucket → Settings → Custom Domains |
| **Verify DNS Record** | `autocr-cdn.nicx.me` needs a proxied DNS record that Cloudflare can route to the Worker. The Worker route `autocr-cdn.nicx.me/*` handles the rest. May need to add a proxied AAAA record pointing to `100::` (dummy) if the R2 custom domain removal deletes the DNS record. |
| **Delete R2 Buckets** | Delete `extensions-bucket` and `releases-bucket` (if not already deleted in Phase 1) |

### Cloudflare Secrets

| Secret | Change |
|--------|--------|
| `CF_ACCOUNT_ID` | Keep (needed for Worker + Pages deploy) |
| `CF_API_TOKEN` | Keep (needed for Worker + Pages deploy) |
| `EXTENSION_PRIVATE_KEY` | Keep (CRX signing still happens in CI) |
| `EXTENSION_ID` | Keep |

### GitHub Token

`GITHUB_TOKEN` is automatically available in GitHub Actions — no new secrets needed. The Worker doesn't need a GitHub token (it uses unauthenticated API with edge caching).

---

## Rollback Plan

### Phase 1 Rollback

1. Re-add `RELEASES_BUCKET` binding to `wrangler.toml`
2. Revert `download.ts` to R2 streaming version
3. Re-upload installer binaries to `releases-bucket`
4. Deploy Worker

### Phase 2 Rollback

1. Re-add `EXTENSIONS_BUCKET` binding to `wrangler.toml`
2. Revert `releases.ts`, `stats.ts`, `version.ts` to R2 versions
3. Remove CDN route from `wrangler.toml`
4. Re-add R2 custom domain for `autocr-cdn.nicx.me`
5. Re-upload `updates.xml` and CRX to `extensions-bucket`
6. Deploy Worker

> **Tip**: Keep the R2 buckets around (empty) for 1-2 releases after Phase 2 goes live. This makes rollback faster since you just need to re-upload files.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub API rate limit (60/hr unauthenticated) | LOW | MEDIUM | Cloudflare Cache API caches for 5 min → ≤12 calls/hr per edge. Monitor in logs. Add `GITHUB_TOKEN` secret to Worker if needed (5000/hr). |
| GitHub outage → no downloads | LOW | HIGH | GitHub has 99.95% uptime SLA. Same risk as using GitHub for source code. Installer binaries are cached by browsers. |
| DNS propagation gap during CDN migration | MEDIUM | LOW | Deploy Worker with CDN routes first, verify locally via `curl --resolve`, then remove R2 custom domain. Expected gap: <5 minutes. |
| Chrome rejects GitHub-hosted CRX | VERY LOW | HIGH | Enterprise policy updates use Omaha protocol, not web install. Browser follows redirects. Test with a canary install before full rollout. |
| GitHub download URL changes | VERY LOW | MEDIUM | GitHub's release asset URL format has been stable for 10+ years. It's part of their public API contract. |
| Cloudflare Cache API inconsistency across edge locations | LOW | LOW | Each edge caches independently (no global replication). First request per edge is slow, then cached. Acceptable for this use case. |

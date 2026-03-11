> ✅ **IMPLEMENTED** — This plan was fully implemented on 2026-03-10. See CHANGELOG.md for details.
>
> ⚠️ **SUPERSEDED** — The Cloudflare Worker described here was itself eliminated in a later migration. All infrastructure now runs on static Cloudflare Pages at `autocr.nicx.me`. Domain references below are historical.

# Research: GitHub Releases as Alternative to Cloudflare R2

> **Date**: 2026-03-10  
> **Confidence**: HIGH (architecture analysis), MEDIUM-HIGH (GitHub CRX via policy update), MEDIUM (GitHub CRX via manual install)  
> **Status**: Comprehensive analysis with phased recommendation — includes R2 elimination path

---

## Table of Contents

- [1. Current R2 Pipeline — Full Map](#1-current-r2-pipeline--full-map)
- [2. GitHub Releases Capabilities](#2-github-releases-capabilities)
- [3. Critical Compatibility Issues](#3-critical-compatibility-issues)
- [4. Comparison: R2 vs GitHub Releases](#4-comparison-r2-vs-github-releases)
- [5. Recommended Hybrid Approach](#5-recommended-hybrid-approach)
- [6. Implementation Sketch](#6-implementation-sketch)
- [7. Extended Analysis: CRX on GitHub / Website](#7-extended-analysis-crx-on-github--website)
- [Sources](#sources)

---

## 1. Current R2 Pipeline — Full Map

### Two R2 Buckets

| Bucket | Access | Custom Domain | Contents |
|--------|--------|---------------|----------|
| `extensions-bucket` | Public | `autocr-cdn.nicx.me` | `updates.xml`, `releases/auto_coursera_*.crx`, `releases/*.crx.sha256` |
| `releases-bucket` | Private (Worker R2 binding only) | None | `installer-{os}-{arch}.*`, `checksums.sha256` |

### Worker API (`autocr-api.nicx.me`)

| Endpoint | Purpose | Data Source |
|----------|---------|-------------|
| `GET /api/health` | Health check | Static |
| `GET /api/latest-version` | Returns version, extension ID, update URL, download URL | `CURRENT_VERSION` env var + `CDN_BASE_URL` |
| `GET /api/releases` | Lists all CRX releases sorted by version | `EXTENSIONS_BUCKET` R2 listing |
| `GET /api/download/:os` | Streams installer binary | `RELEASES_BUCKET` R2 `getObject()` |
| `GET /api/stats` | Total releases count, latest version, last updated | `EXTENSIONS_BUCKET` R2 listing |

### Chrome Auto-Update Mechanism

The project uses **enterprise policy-based installation**, NOT manifest `update_url`:

1. The Go installer writes browser policies: `ExtensionInstallForcelist = ["EXTENSION_ID;UPDATE_URL"]`
2. Chrome periodically fetches `https://autocr-cdn.nicx.me/updates.xml`
3. `updates.xml` contains `<updatecheck codebase="https://autocr-cdn.nicx.me/releases/auto_coursera_X.Y.Z.crx" version="X.Y.Z"/>`
4. Chrome downloads the CRX from the `codebase` URL if the version is newer

**The `updates.xml` URL is baked into:**
- `installer/config.go` → `UpdateURL = "https://autocr-cdn.nicx.me/updates.xml"`
- `website/public/scripts/install.sh`
- `website/public/scripts/install-mac.sh`
- `website/public/scripts/install.ps1`
- Browser policies on every existing user's machine

### CI/CD Pipeline (deploy.yml, tag push)

```
v* tag push
├── version-check (validates version.json consistency)
├── build-extension
│   ├── Build CRX
│   ├── Generate updates.xml
│   ├── Upload CRX → R2 extensions-bucket/releases/
│   ├── Upload updates.xml → R2 extensions-bucket/
│   └── Upload checksum → R2 extensions-bucket/releases/
├── build-installers
│   ├── Cross-compile 6 Go binaries
│   ├── Generate checksums
│   └── Upload all files → R2 releases-bucket/ (loop)
├── deploy-website-release (after extension + installers)
└── deploy-worker (after extension)
```

### Website API Usage

| Page | API Call | Method |
|------|----------|--------|
| `VersionBadge.astro` | `fetch('/api/latest-version')` | JavaScript `fetch()` (CORS required) |
| `releases.astro` | `fetch('/api/releases')` | JavaScript `fetch()` (CORS required) |
| `downloads.astro` | `fetch('/api/latest-version')` | JavaScript `fetch()` (CORS required) |
| `install.astro` | `<a href="/api/download/:os">` | Direct link (no CORS needed) |
| `downloads.astro` | `<a href="/api/download/:os">` | Direct link (no CORS needed) |

---

## 2. GitHub Releases Capabilities

### Key Specifications (as of March 2026)

| Feature | Value | Source |
|---------|-------|--------|
| Max assets per release | 1,000 | [GitHub Docs: About releases] |
| Max file size per asset | 2 GiB | [GitHub Docs: About releases] |
| Total release size limit | None | [GitHub Docs: About releases] |
| Bandwidth limit | **None documented** | [GitHub Docs: About releases] |
| Download counting | Built-in (`download_count` per asset) | [GitHub API: Release assets] |
| Cost | Free (public repos) | — |

### Download URL Pattern

```
https://github.com/{owner}/{repo}/releases/download/{tag}/{filename}
```

Example:
```
https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-windows-amd64.exe
```

These URLs are **stable and predictable** — if you know the tag and filename, you know the URL.

### API Rate Limits

| Authentication | Rate Limit |
|----------------|------------|
| Unauthenticated | 60 requests/hour (per IP) |
| Personal access token | 5,000 requests/hour |
| `GITHUB_TOKEN` in Actions | 1,000 requests/hour/repository |
| GitHub App installation | 5,000+ per hour (scales with org size) |

**Important**: These limits apply to **API calls** (e.g., `GET /repos/.../releases`), NOT to release asset downloads. Asset downloads via `browser_download_url` are served by GitHub's CDN and are **not rate-limited by the API rate limiter**.

### CORS Support

**⚠️ CRITICAL FINDING: GitHub Releases DO NOT include CORS headers.**

- `https://github.com/.../releases/download/...` → 302 redirect to `objects.githubusercontent.com`
- Neither `github.com` nor `objects.githubusercontent.com` sends `Access-Control-Allow-Origin` headers
- **Result**: Browser JavaScript `fetch()` to GitHub release assets will be **blocked by CORS policy**

| Access Method | Works? | Reason |
|---------------|--------|--------|
| `<a href="...">` (user click) | ✅ Yes | Browser navigation, CORS doesn't apply |
| `curl` / `wget` / server-side | ✅ Yes | No CORS enforcement |
| JavaScript `fetch()` from website | ❌ No | No CORS headers → blocked |
| Chrome update mechanism | ✅ Yes | Browser-level fetch, not JS (see §3) |

### CI/CD Integration

The `softprops/action-gh-release@v2` Action (5.5k ⭐, actively maintained):
- Creates GitHub Release from a tag
- Uploads binary assets via glob patterns
- Supports append/overwrite
- Requires `contents: write` permission
- Uses `GITHUB_TOKEN` (no extra secrets needed)

```yaml
- uses: softprops/action-gh-release@v2
  with:
    files: |
      installer/dist/*
      auto_coursera_*.crx
      auto_coursera_*.crx.sha256
```

---

## 3. Critical Compatibility Issues

### Issue 1: Chrome CRX Hosting Requirements

Chrome's docs state a `.crx` file is installable if:
- Content-Type is `application/x-chrome-extension`, OR
- File has `.crx` extension AND `X-Content-Type-Options: nosniff` is **NOT** set AND Content-Type is one of: empty, `text/plain`, `application/octet-stream`, `unknown/unknown`, `application/unknown`, `*/*`

GitHub serves release assets with `application/octet-stream` and **does set** `X-Content-Type-Options: nosniff`.

**However**: This restriction applies to **user-initiated installs** (clicking a link to install). For **enterprise policy auto-updates**, Chrome knows the URL is a CRX because it's fetching it through the update mechanism — the Content-Type check likely doesn't apply.

**Confidence**: MEDIUM — Chrome's update mechanism code path is different from manual install. Policy-forced updates should work, but this has not been verified empirically with GitHub-hosted CRX files.

### Issue 2: `updates.xml` URL is Immutable for Existing Users

The URL `https://autocr-cdn.nicx.me/updates.xml` is written into browser policies by the installer. Changing this URL would:
- Break auto-updates for **every existing user**
- Require users to run the installer again to update their policy
- There is no way to migrate existing installations silently

**This URL cannot change.** The CDN must continue serving `updates.xml`.

### Issue 3: No JSON API on GitHub

GitHub Releases provides an API, but it returns GitHub's verbose JSON schema, not the project's custom API shape. The website expects:

```json
// /api/latest-version
{ "version": "1.8.0", "extensionId": "...", "updateUrl": "...", "downloadUrl": "..." }

// /api/releases  
{ "releases": [{ "version": "1.8.0", "file": "...", "size": 123, "date": "...", "url": "..." }] }
```

GitHub's API returns completely different structures and requires either:
- A proxy/adapter (defeats the purpose of eliminating the Worker)
- Rewriting the website to consume GitHub's API directly (CORS still blocks this)

---

## 4. Comparison: R2 vs GitHub Releases

### Option A: Full R2 (Current)

| Aspect | Assessment |
|--------|------------|
| **Reliability** | Excellent — Cloudflare's global CDN |
| **CORS** | Fully controlled via bucket CORS config + Worker |
| **Custom domain** | ✅ `autocr-cdn.nicx.me` |
| **Auto-update** | ✅ Full control over `updates.xml` and CRX hosting |
| **API surface** | ✅ Custom JSON API for version, releases, stats, downloads |
| **CI/CD complexity** | Moderate — requires `CF_ACCOUNT_ID`, `CF_API_TOKEN` secrets, `wrangler` CLI |
| **Monthly cost** | **$0** — well within R2 free tier (10 GB storage, 1M Class A ops, 10M Class B ops) |
| **Download analytics** | Manual (must implement in Worker) |
| **Infrastructure** | 2 R2 buckets + 1 Worker + Cloudflare Pages |

### Option B: Full GitHub Releases (Replace Everything)

| Aspect | Assessment |
|--------|------------|
| **Reliability** | Good — GitHub CDN |
| **CORS** | ❌ **Broken** — website `fetch()` calls fail |
| **Custom domain** | ❌ URLs are `github.com/...` |
| **Auto-update** | ⚠️ **Risky** — uncertain CRX installability + breaking existing installs |
| **API surface** | ❌ **Broken** — no custom JSON API, website must be rewritten |
| **CI/CD complexity** | Simple — `softprops/action-gh-release` + `GITHUB_TOKEN` |
| **Monthly cost** | **$0** |
| **Download analytics** | ✅ Built-in `download_count` per asset |
| **Infrastructure** | None beyond GitHub |

**Verdict**: ❌ **Not viable as a full replacement.** Breaks CORS, breaks the website, risks breaking auto-updates for existing users.

### Option C: Hybrid — GitHub Releases for Installers, R2 for CRX

| Aspect | Assessment |
|--------|------------|
| **Reliability** | Excellent — split across two CDNs |
| **CORS** | ✅ Worker still handles CORS for API calls |
| **Custom domain** | ✅ CDN domain retained for CRX |
| **Auto-update** | ✅ Unchanged — `updates.xml` + CRX stay on R2 |
| **API surface** | ✅ Worker API retained; `/api/download/:os` redirects to GitHub |
| **CI/CD complexity** | **Simplified** — installer upload via `action-gh-release` replaces wrangler loop |
| **Monthly cost** | **$0** |
| **Download analytics** | ✅ Installer downloads tracked by GitHub; CRX tracked by R2/Worker |
| **Infrastructure** | 1 R2 bucket + 1 Worker + Cloudflare Pages + GitHub Releases |

**Verdict**: ✅ **Recommended approach.** Best of both worlds.

---

## 5. Recommended Hybrid Approach

### What Moves to GitHub Releases

| Asset | Current Location | New Location |
|-------|-----------------|--------------|
| `installer-windows-amd64.exe` | `releases-bucket` | GitHub Release asset |
| `installer-windows-arm64.exe` | `releases-bucket` | GitHub Release asset |
| `installer-macos-arm64` | `releases-bucket` | GitHub Release asset |
| `installer-macos-amd64` | `releases-bucket` | GitHub Release asset |
| `installer-linux-amd64` | `releases-bucket` | GitHub Release asset |
| `installer-linux-arm64` | `releases-bucket` | GitHub Release asset |
| `checksums.sha256` | `releases-bucket` | GitHub Release asset |

### What Stays on R2

| Asset | Location | Reason |
|-------|----------|--------|
| `updates.xml` | `extensions-bucket` | Immutable URL baked into all installs |
| `auto_coursera_*.crx` | `extensions-bucket/releases/` | Referenced by `updates.xml` codebase |
| `*.crx.sha256` | `extensions-bucket/releases/` | Accompanies CRX files |

### What Gets Eliminated

| Resource | Status |
|----------|--------|
| `releases-bucket` R2 bucket | **Deleted** — no longer needed |
| `RELEASES_BUCKET` Worker binding | **Removed** from `wrangler.toml` |
| Installer upload loop in CI | **Replaced** by `softprops/action-gh-release` |

### What Gets Modified

| Component | Change |
|-----------|--------|
| Worker `/api/download/:os` | Redirects (302) to GitHub Releases instead of streaming from R2 |
| Worker `wrangler.toml` | Remove `releases-bucket` binding, add `GITHUB_REPO` var |
| `deploy.yml` build-installers | Replace R2 upload loop with `action-gh-release` |
| `deploy.yml` permissions | Add `contents: write` for release creation |

---

## 6. Implementation Sketch

### A. Worker Changes

**`/api/download/:os` — Redirect to GitHub**

```typescript
// Instead of streaming from R2:
export async function handleDownload(os: string, env: Env): Promise<Response> {
  const filename = INSTALLER_MAP[os.toLowerCase()];
  if (!filename) return errorResponse(`Unsupported platform...`, 404);
  
  const tag = `v${env.CURRENT_VERSION}`;
  const url = `https://github.com/${env.GITHUB_REPO}/releases/download/${tag}/${filename}`;
  
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}
```

**`wrangler.toml` — Remove releases-bucket**

```diff
 [[r2_buckets]]
 binding = "EXTENSIONS_BUCKET"
 bucket_name = "extensions-bucket"
 
-[[r2_buckets]]
-binding = "RELEASES_BUCKET"
-bucket_name = "releases-bucket"
 
 [vars]
 EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
 CURRENT_VERSION = "1.8.0"
 ALLOWED_ORIGIN = "https://autocr.nicx.me"
 CDN_BASE_URL = "https://autocr-cdn.nicx.me"
+GITHUB_REPO = "NICxKMS/auto-coursera"
```

### B. CI/CD Changes

**`deploy.yml` build-installers job**

```yaml
build-installers:
  if: startsWith(github.ref, 'refs/tags/v')
  needs: [version-check]
  runs-on: ubuntu-latest
  permissions:
    contents: write  # Required for creating releases
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version: '1.22'
        cache-dependency-path: 'installer/go.sum'
    
    - name: Build all platforms
      run: cd installer && make build-all
    
    - name: Generate checksums
      run: cd installer/dist && sha256sum * > checksums.sha256
    
    - name: Create GitHub Release & Upload Installers
      uses: softprops/action-gh-release@v2
      with:
        files: installer/dist/*
        generate_release_notes: true
    
    # Keep artifact upload for CI visibility
    - uses: actions/upload-artifact@v4
      with:
        name: installers
        path: installer/dist/
        retention-days: 90
```

### C. What's NOT Touched

- Extension build + R2 upload (CRX, updates.xml, checksums) — **unchanged**
- Website deploy — **unchanged**
- `update_url` in installers/scripts — **unchanged**
- Worker API for `/api/releases`, `/api/stats`, `/api/latest-version` — **unchanged**
- `extensions-bucket` — **unchanged**
- CORS configuration — **unchanged**

---

## Summary Decision Matrix

| Criterion | Full R2 (Current) | Full GitHub | Hybrid (Recommended) |
|-----------|-------------------|-------------|---------------------|
| Breaks existing installs | No | **YES** | No |
| Breaks website CORS | No | **YES** | No |
| Monthly cost | $0 | $0 | $0 |
| CI/CD simplicity | Moderate | Simple | **Improved** |
| Download analytics | Manual | Built-in | **Better** (GitHub for installers) |
| Infrastructure burden | 2 buckets + Worker | None | **1 bucket** + Worker |
| Nice release page | No | Yes | **Yes** |
| Risk level | None (status quo) | **High** | **Low** |

**Recommendation**: Implement the **Hybrid Approach** (Option C). It eliminates the `releases-bucket`, simplifies CI/CD, provides a GitHub Releases page with download counts, while preserving the reliable CRX auto-update mechanism that existing users depend on.

---

## 7. Extended Analysis: CRX on GitHub / Website

### Can the CRX Go on GitHub Releases Too?

**Short answer: Yes, with a caveat.** The CRX can live on GitHub Releases if `updates.xml` stays available at the canonical URL (`autocr-cdn.nicx.me/updates.xml`). Chrome's enterprise policy update mechanism fetches `updates.xml` from the policy-configured URL, then downloads the CRX from whatever URL is in the `codebase` attribute.

**How Chrome's policy update works (reminder):**
1. Browser policy says: check `https://autocr-cdn.nicx.me/updates.xml`
2. Chrome fetches that XML (browser-level, not JS — no CORS issue)
3. XML contains: `<updatecheck codebase="https://some-url/file.crx" version="X.Y.Z"/>`
4. Chrome downloads the CRX from the `codebase` URL

The `codebase` URL can be **anything** — R2 CDN, GitHub Releases, a different host. Chrome follows redirects. So if `codebase` points to `https://github.com/owner/repo/releases/download/v1.8.0/auto_coursera_1.8.0.crx`, Chrome will follow the 302 → `objects.githubusercontent.com` and download the CRX.

**Why the Content-Type / nosniff concern is irrelevant for policy updates:**
Chrome's CRX installability rules (`application/x-chrome-extension` or `.crx` without `nosniff`) apply to **user-initiated installs** (clicking a link on a webpage). For enterprise policy auto-updates, Chrome already knows the download is a CRX — it's fetching it through the Omaha-style update pipeline, not rendering a web page. The content-type check does not apply.

**Confidence**: MEDIUM-HIGH — architecturally sound based on Chrome's update protocol documentation. The policy update code path is distinct from the manual install path.

---

### Three Architecture Options (Beyond the Base Hybrid)

#### Option D: CRX on GitHub, `updates.xml` on R2 (Minimal Change)

```
updates.xml (R2, CDN domain):
  codebase → https://github.com/owner/repo/releases/download/v1.8.0/auto_coursera_1.8.0.crx

Chrome → autocr-cdn.nicx.me/updates.xml (R2) → GitHub (CRX download)
```

| What changes | Detail |
|--------------|--------|
| `generate-updates-xml.sh` | `-u` parameter now uses GitHub URL instead of CDN URL |
| `deploy.yml` build-extension | Uploads **only** `updates.xml` to R2 (no CRX upload) |
| GitHub Release | Gets CRX + checksum as assets (alongside installers) |
| `extensions-bucket` | Retains only `updates.xml` (~500 bytes) |
| `releases-bucket` | Deleted |

**Pro**: Minimal Worker changes, simple migration.
**Con**: Still need R2 extensions-bucket (even though it only holds one file).

---

#### Option E: Eliminate R2 Entirely — Worker Generates `updates.xml` Dynamically ⭐

**The most elegant approach.** Route `autocr-cdn.nicx.me` through the existing Worker instead of R2, and have the Worker generate `updates.xml` on the fly.

```
Chrome → autocr-cdn.nicx.me/updates.xml → Worker (generates XML dynamically)
         codebase → github.com/.../auto_coursera_1.8.0.crx
Chrome → github.com/.../auto_coursera_1.8.0.crx → 302 → objects.githubusercontent.com
```

**What this eliminates:**
- `extensions-bucket` R2 bucket → **DELETED**
- `releases-bucket` R2 bucket → **DELETED**
- All `wrangler r2 object put` commands in CI → **REMOVED**
- `generate-updates-xml.sh` script → **REMOVED** (Worker generates XML)
- R2 CORS configuration → **REMOVED**
- All R2 bindings in `wrangler.toml` → **REMOVED**

**What this requires:**
1. **Worker routes both domains:**
   ```toml
   [env.production]
   routes = [
     { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
     { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
   ]
   ```

2. **Worker generates `updates.xml` dynamically:**
   ```typescript
   function handleUpdatesXml(env: Env): Response {
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
       },
     });
   }
   ```

3. **Worker handles CDN paths:**
   - `GET autocr-cdn.nicx.me/updates.xml` → generates XML
   - `GET autocr-cdn.nicx.me/releases/*.crx` → 302 redirect to GitHub release asset (backwards compatibility)
   - `GET autocr-api.nicx.me/api/*` → existing API behavior

4. **GitHub Release hosts all binaries:**
   - CRX + checksum
   - Installer binaries + checksums

5. **Worker's `/api/releases` and `/api/stats` adapted:**
   - Use Cloudflare Cache API to cache GitHub Releases API responses (5-min TTL)
   - Transforms GitHub's JSON to the project's API shape
   - Rate limit concern: GitHub allows 60 unauthenticated API requests/hour per IP. With Cloudflare Cache, the Worker makes at most ~12 calls/hour per edge location → safe.
   - If heavier traffic is expected, add a `GITHUB_TOKEN` secret for 5,000 req/hour.

**wrangler.toml after migration:**
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

**deploy.yml simplification:**
```yaml
build-extension:
  steps:
    - Build CRX (unchanged)
    # Removed: generate-updates-xml.sh
    # Removed: Upload CRX to R2
    # Removed: Upload updates.xml to R2
    # Removed: Upload checksum to R2
    - Upload CRX artifact (keep for CI visibility)

build-installers:
  steps:
    - Build all platforms (unchanged)
    - Create GitHub Release & upload ALL assets
      uses: softprops/action-gh-release@v2
      with:
        files: |
          installer/dist/*
          auto_coursera_*.crx
          auto_coursera_*.crx.sha256
```

**Pro**: Eliminates ALL R2 infrastructure. Simplest possible architecture. No storage to manage.
**Con**: Worker becomes dual-purpose (API + CDN). `updates.xml` is dynamic, not cached at R2 edge (but Cloudflare Cache API mitigates this). Small latency increase for first `updates.xml` request per edge location.

---

#### Option F: CRX on Cloudflare Pages (Website)

Put CRX files in the website build so `autocr-cdn.nicx.me` points to Cloudflare Pages.

| Aspect | Assessment |
|--------|------------|
| File size | CRX ~1-5 MB, well under Pages' 25 MiB limit |
| Deployment coupling | ❌ **Fragile** — every website deploy (including content-only changes) must include the CRX |
| Build pipeline | Complex — website build needs to download CRX artifact before building |
| Old versions | Lost on redeploy (Pages deployments are immutable snapshots) |
| DNS change | `autocr-cdn.nicx.me` must move from R2 custom domain to Pages custom domain |

**Verdict**: ❌ **Not recommended.** Pages deployments are immutable snapshots — a content-only website update would wipe the CRX files unless the build explicitly re-includes them. This couples every website deploy to the extension release pipeline.

---

### Recommendation Matrix (Updated)

| Option | R2 Buckets | Infrastructure | Complexity | Risk |
|--------|-----------|---------------|------------|------|
| **C** (Hybrid — installers on GH) | 1 (extensions) | Worker + R2 + GH Releases | Low change | Low |
| **D** (CRX on GH, updates.xml on R2) | 1 (extensions, tiny) | Worker + R2 + GH Releases | Low change | Medium |
| **E** (Eliminate R2 entirely) ⭐ | **0** | Worker + GH Releases | Medium change | Medium |
| **F** (CRX on Pages) | 0 | Worker + Pages | High coupling | High |

### Final Recommendation

> 🎯 **Decision**: Option E was chosen and fully implemented on 2026-03-10. Both R2 buckets were eliminated. The Worker generates `updates.xml` dynamically, all binaries live on GitHub Releases, and the architecture matches the "After (Option E)" diagram in `docs/plans/ELIMINATE-R2.md`.

**If conservative**: Start with **Option C** (hybrid — installers on GitHub). It's the safest change with clear benefits.

**If optimizing for simplicity**: Go to **Option E** (eliminate R2). It's more work upfront (Worker refactoring) but results in the cleanest architecture — zero storage infrastructure, everything is either computed by the Worker or hosted on GitHub Releases. The Worker already exists and is deployed anyway.

**Phased approach**:
1. **Phase 1**: Option C — move installers to GitHub Releases, eliminate `releases-bucket`
2. **Phase 2**: Option E — move CRX to GitHub Releases, generate `updates.xml` in Worker, eliminate `extensions-bucket`

This gives you validation at each step. If Phase 1 works perfectly, Phase 2 is a natural evolution.

---

## Sources

1. [GitHub Docs: About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) — Storage and bandwidth quotas
2. [GitHub Docs: REST API - Releases](https://docs.github.com/en/rest/releases/releases) — API endpoints for creating releases
3. [GitHub Docs: REST API - Release Assets](https://docs.github.com/en/rest/releases/assets) — Upload/download asset endpoints
4. [GitHub Docs: Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — API rate limits by auth method
5. [Chrome: Self-host for Linux](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux) — CRX hosting requirements, updates.xml format
6. [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — Free tier details
7. [softprops/action-gh-release](https://github.com/softprops/action-gh-release) — GitHub Action for releasing (v2.5.0, 5.5k ⭐)
8. [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) — Edge caching via `cache.put()` / `cache.match()`, per-datacenter
9. [Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) — 25 MiB max file size, 20k files (free), 500 builds/month
10. Project source: `deploy.yml`, `wrangler.toml`, `workers/src/`, `installer/config.go`, `version.json`

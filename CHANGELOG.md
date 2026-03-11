# Changelog — Auto-Coursera

All notable changes to the Auto-Coursera distribution platform are documented in this file.  
For component-specific changes, see the changelogs in each directory:

- [`extension/CHANGELOG.md`](extension/CHANGELOG.md) — Browser extension
- [`website/CHANGELOG.md`](website/CHANGELOG.md) — Website (Astro)
- [`workers/CHANGELOG.md`](workers/CHANGELOG.md) — API Worker (Cloudflare)
- [`installer/CHANGELOG.md`](installer/CHANGELOG.md) — Native installer (Go)

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- **Cloudflare Pages production branch targeting** — `.github/workflows/deploy.yml` now passes `--branch=master` on both Pages deploy paths so CI deployments attach to the production Pages branch/custom-domain environment instead of creating detached deployments
- **Worker production environment vars** — `workers/wrangler.toml` now duplicates required runtime values under `[env.production.vars]` because Wrangler does not inherit top-level `[vars]` into named environments
- **Cloudflare deployment docs** — Root README plus setup guides now document the explicit Pages branch flag and the requirement to duplicate production Worker vars

## [1.8.0] — 2026-03-10

### Added
- **Extension UI redesign release line** — `v1.8.0` carries the floating contextual widget, in-page settings overlay, context-aware popup, Shadow DOM isolation, and reactive state store as first-class release features (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Extension: Scoped runtime-state lifecycle** — Service worker now owns per-page runtime scopes, batch solve messages carry page/request context, and settings connection tests run through an isolated `TEST_CONNECTION` path without polluting live runtime state (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Eliminate R2 — GitHub Releases migration** — All binary artifacts (CRX extension + Go installers) are now served via GitHub Releases instead of Cloudflare R2 buckets
- **`create-release` CI job** — New GitHub Actions job that creates a GitHub Release with all assets (CRX, checksums, installers) after both `build-extension` and `build-installers` complete
- **CDN domain routing in Worker** — `autocr-cdn.nicx.me` is now handled by the Worker (dual-domain routing), generating `updates.xml` dynamically and redirecting CRX downloads to GitHub Releases
- **`workers/src/routes/cdn.ts`** — New route handler for `handleUpdatesXml()` (dynamic Chrome update XML) and `handleCdnRelease()` (302 redirects to GitHub)
- **`workers/src/utils/github.ts`** — New GitHub Releases API client with Cloudflare Cache API (5-min TTL) for `/api/releases` and `/api/stats` endpoints
- **`githubRepo` field in `version.json`** — Single source of truth for the GitHub repository identifier (`NICxKMS/auto-coursera`)
- **`GITHUB_REPO` sync and check** — `sync-constants.sh` propagates and `check-version.sh` validates the GitHub repo field across `wrangler.toml`
- **Centralized project constants** — `version.json` is now the single source of truth for `extensionId`, `extensionName`, `updateUrl`, and `domains` (website, cdn, api), in addition to the existing `version` field
- **`scripts/sync-constants.sh`** — Standalone script that reads ALL fields from `version.json` and propagates them to every file in the monorepo (installer, workers, website, install/uninstall scripts)
- **`sync-constants.sh` schema validation guard** — `jq -e` validates all required `version.json` fields before any sed operations run; individual null/empty guards prevent silent `"null"` propagation to 7+ files
- **`manifest.json` name field sync** — `sync-constants.sh` now syncs `extension/manifest.json`'s `"name"` field from `version.json`'s `extensionName`
- **Expanded `scripts/check-version.sh`** — CI guard now validates 40+ constant references across 20+ files: version, extension ID, extension name, update URL, and domain names across config files, .astro pages, CSP headers, and route config
- **`manifest.json` name field check** — `check-version.sh` validates that `manifest.json`'s `"name"` matches `extensionName` (check #42)
- **Check count assertion in `check-version.sh`** — Reports the final `N/51 checks passed` total on success and fails if the actual count doesn't match expected (catches silently deleted checks)
- **`domains.api` drift detection** — `check-version.sh` now validates that `domains.api` from `version.json` appears in all expected files: VersionBadge.astro, install.astro, downloads.astro, releases.astro, `_headers` CSP, and wrangler.toml route pattern
- **`domains.website` and `domains.cdn` page-level checks** — `check-version.sh` validates website domain in install/downloads/troubleshoot pages and CDN domain in manual.astro documentation
- **`extensionId` and `updateUrl` in docs pages** — `check-version.sh` validates that the extension ID appears in manual.astro and troubleshoot.astro, and the update URL in manual.astro
- **`check_contains()` helper** in `check-version.sh` — grep-based presence check for values embedded in varied URL contexts (vs the existing `check()` which extracts and compares exact values)
- **Extension: Settings overlay wiring** — `OPEN_SETTINGS` message type enables popup to open the in-page settings overlay on Coursera tabs, with fallback to options page on non-Coursera tabs (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))

### Changed
- **Operational branch truth cleanup** — Active setup/architecture docs, website README, and deploy workflow comments now consistently describe `master` as the current production branch, matching the repository's actual tracked branch and Pages trigger
- **Install/distribution docs and website copy cleanup** — Architecture, setup, troubleshooting, website pages, and component READMEs now consistently describe the real policy-based install/update flow (`ExtensionInstallForcelist` → Worker-served `updates.xml` → GitHub Release assets), keep native installers as the primary path, and frame terminal/manual paths as advanced options
- **`.github/workflows/deploy.yml` static update-manifest cleanup** — Tagged releases no longer generate, upload as artifacts, or attach a static `updates.xml`; the canonical production manifest remains the Worker-served `https://autocr-cdn.nicx.me/updates.xml`
- **Release/docs/script guidance for `updates.xml`** — Root README, scripts docs, signing docs, architecture docs, shell-script review notes, and script help/output now consistently describe `generate-updates-xml.sh` as local/manual testing-only instead of a normal production release step
- **Version-truth documentation surfaces** — Root README, extension README, architecture examples, and changelog wording now consistently point at the published `1.8.0` release line
- **Extension: scoped runtime cleanup** — Popup and floating widget now read scoped runtime state directly, and the extension README no longer describes a temporary compatibility bridge that no longer exists (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Extension: Runtime-state cleanup follow-up** — Scoped batch solves keep direct contract coverage, stale scopes are cleaned on closed tabs / missing apply outcomes, and the remaining flattened runtime projection has now been removed entirely in favor of scoped-only UI/runtime reads (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Extension: shared settings-domain cleanup** — Settings overlay, fallback options page, and widget onboarding now share one canonical settings-domain module for provider catalogs, masked-key resolution, staged save/test payloads, and onboarding semantics (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **`check-version.sh` — 51 checks** — Expanded the release-truth guardrail to the current 51-check surface, including fallback version, policy filename, branch/source-link, and constant-drift validation
- **`sync-constants.sh` — downloads.astro sync** — Now syncs the fallback version in `downloads.astro` alongside `VersionBadge.astro`
- **`workers/src/routes/download.ts`** — Installer downloads now return 302 redirects to GitHub Releases instead of streaming from R2; removed unnecessary `async` keyword (no `await` after R2 removal)
- **`workers/src/routes/releases.ts`** — Lists CRX releases from GitHub Releases API (cached) instead of R2 `listObjects()`
- **`workers/src/routes/stats.ts`** — Computes release statistics from GitHub Releases API instead of R2
- **`workers/src/routes/version.ts`** — `downloadUrl` now points to GitHub Releases URL
- **`workers/src/index.ts`** — Dual-domain router: CDN domain serves updates.xml + CRX redirects, API domain serves existing endpoints; CORS headers only applied to API domain; CDN hostname derived from `env.CDN_BASE_URL` instead of hardcoded string
- **`workers/wrangler.toml`** — Added `GITHUB_REPO` var, added `autocr-cdn.nicx.me` route, removed all R2 bucket bindings
- **`.github/workflows/deploy.yml`** — Removed all R2 upload steps, added `create-release` job for GitHub Releases, updated `generate-updates-xml.sh` CRX URL to point to GitHub
- **`scripts/generate-updates-xml.sh` invocation** — CRX URL in CI now points to GitHub Releases instead of R2/CDN
- **`scripts/bump-version.sh`** — Simplified to update `version.json` then delegate to `sync-constants.sh` for all propagation (version + extensionId + extensionName + updateUrl + domains)
- **`website/src/components/VersionBadge.astro`** — Hardcoded fallback version in error handler is now synced from `version.json` via `sync-constants.sh`
- **`scripts/sync-constants.sh`** — Replaced deferred `domains.api` note with clear documentation: API/website/CDN domains in page content are validated by `check-version.sh` but not auto-synced (too many varied URL contexts for safe sed patterns)
- **`scripts/check-version.sh`** — Expanded header comment to reflect coverage of .astro pages, CSP headers, and route config; added `domains.api` to schema validation
- **`workers/README.md`** — Rewritten for GitHub Releases architecture: dual-domain routing, CDN endpoints, GitHub API caching, 302 redirects, updated project structure and env vars table
- **`README.md` (root)** — Updated architecture diagram (R2 → GitHub Releases), configuration variables table, deployment summary
- **`docs/ARCHITECTURE.md`** — Updated all Mermaid diagrams (component, install flow, release flow, API flow), Worker description, CI pipeline table, domain structure table
- **`docs/CLOUDFLARE-SETUP.md`** — Removed R2 bucket creation, custom domain, and CORS sections; renumbered remaining sections; updated wrangler.toml example, DNS, cache rules, SSL, and API token tables
- **`docs/SETUP.md`** — Removed R2 bucket creation and custom domain sections; renumbered remaining sections; updated verification commands, CI pipeline description, and configuration variables table
- **Plan documents cleanup** — Added ✅ IMPLEMENTED banners to `docs/plans/ELIMINATE-R2-BRIEFING.md`, `docs/plans/ELIMINATE-R2.md`, and `docs/research/GITHUB-RELEASES-VS-R2.md`; fixed GitHub repo name from `nicx/auto-coursera` to `NICxKMS/auto-coursera` throughout

### Removed
- **`workers/src/utils/r2.ts`** — R2 utility module deleted (no longer used)
- **Extension: legacy runtime bridge projection and dead message contracts** — Removed flattened `_last*`/counter runtime writes plus unused `GET_STATUS`, `SOLVE_QUESTION`, and `SOLVE_IMAGE_QUESTION` product contracts in favor of scoped-only runtime state (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Extension: dead `GET_SETTINGS` contract** — Removed the unused settings-fetch message after both first-party settings surfaces moved to the shared settings-domain owner (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **R2 bucket bindings** — `EXTENSIONS_BUCKET` and `RELEASES_BUCKET` removed from `wrangler.toml`
- **R2 upload CI steps** — "Upload CRX to R2", "Upload updates.xml to R2", "Upload checksum to R2", and "Upload binaries to R2" all removed from `deploy.yml`
- **`R2_EXTENSIONS_BUCKET` and `R2_RELEASES_BUCKET`** — Removed from root README configuration variables table

### Fixed
- **`scripts/check-version.sh` false-fail guard** — `check_contains()` now passes `--` to `grep` before expected strings, so checks for docs lines beginning with `-` no longer fail even when the content is correct
- **Worker setup/deploy truth** — `docs/SETUP.md` now points production Worker deploys at `pnpm run deploy:prod` / `wrangler deploy --env production`, matching the routed production environment in `workers/package.json` and `wrangler.toml`
- **Extension runtime tombstone cleanup wording/code alignment** — removed the remaining write-time deletion of legacy `_last*` / aggregate session keys in the background runtime manager now that scoped runtime maps are the only live runtime source of truth
- **Install/distribution documentation drift** — Corrected Linux managed-policy filename references to `auto_coursera.json`, updated stale `website/public/_headers` / `website/public/_redirects` path references, aligned `/api/releases` docs with GitHub `browser_download_url` output, and removed stale website README claims about checksums and a nonexistent `ReleaseCard.astro`
- **Branch/link documentation drift** — Corrected stale `main` branch references in active docs/workflow commentary and updated the website footer source link from `blob/main/LICENSE` to `blob/master/LICENSE`
- **`scripts/check-version.sh` branch/source guardrail** — Added small CI checks for deployment-branch truth in workflow/docs/website README plus the website footer license link so future doc drift is caught earlier
- **Extension: runtimeContext validation hardening** — `SOLVE_BATCH` and optional `SOLVE_QUESTION` runtime contexts now reject malformed scope fields cleanly before any background runtime-state mutation (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Policy filename mismatch (B1, BLOCKING)** — Go installer creates `auto_coursera.json` but shell scripts created `auto_coursera_policy.json` on Linux; aligned both `install.sh` and `uninstall.sh` to `auto_coursera.json` so cross-method install/uninstall no longer fails silently
- **Windows PowerShell missing Chromium support (B2)** — `install.ps1` and `uninstall.ps1` only defined Chrome, Edge, Brave; added Chromium browser definitions (registry detect paths + policy path) and added `chromium` to the `ValidateSet` parameter
- **`downloads.astro` fallback version sync gap (S3)** — The hardcoded downloads-page fallback version is now updated by `sync-constants.sh` and validated by `check-version.sh`, so release-truth bumps cannot drift there silently
- **Go macOS detection missing `~/Applications/` (S9)** — `detect_unix.go` only checked `/Applications/` for `.app` bundles; now also checks `os.UserHomeDir()/Applications/` where some users install browsers
- **`check-version.sh` doesn't verify policy filename consistency (S10)** — Added a check that extracts the Go policy filename from `policy_linux.go` and the shell policy filename from `install.sh`, asserting they match
- **Worker hardening (5 issues)** — See [`workers/CHANGELOG.md`](workers/CHANGELOG.md) for details: outer catch CORS headers (C1), `cache.put()` resilience (C2), `updates.xml` cache-control alignment (S4), health endpoint caching (S5), and env var validation (S8)
- **OpenRouter URL inconsistency (C4)** — `callAPI()` override hardcoded URL via template literal instead of using `this.apiUrl` like every other provider; now sets `protected apiUrl` class field and `displayName` consistent with Cerebras, Groq, Gemini, and NVIDIA NIM (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Filename typos in script help text** — `verify-crx.sh` and `generate-updates-xml.sh` referenced `auto-coursera_` (hyphen) instead of `auto_coursera_` (underscore) in examples; `generate-updates-xml.sh` examples updated to use GitHub Releases URL pattern
- **Incorrect `generate-key.sh` step 3** — Told users to set `update_url` in `manifest.json`, but the architecture uses browser policy (`ExtensionInstallForcelist`); corrected the guidance
- **`workers/src/index.ts` uncaught `new URL()` exception** — `new URL(env.CDN_BASE_URL)` was outside the try/catch; malformed or missing `CDN_BASE_URL` now returns a structured 500 JSON error instead of Cloudflare's default error page
- **`docs/TROUBLESHOOTING.md`** — Rewrote all R2-referencing sections for the GitHub Releases + Worker redirect architecture: CRX download diagnostics now check GitHub Release assets and 302 redirect chain; `updates.xml` section documents dynamic Worker generation from `Env` vars; replaced R2 access denied section with GitHub API rate-limiting guide; updated Worker deployment, GitHub Actions secrets, and extension ID mismatch sections to reflect current `Env` interface and CI pipeline
- **Website downloads page — macOS label correction** — Replaced misleading "macOS Universal" label with "macOS (Apple Silicon)" and added separate "macOS (Intel)" download card
- **Website install page — macOS label correction** — Same fix; added macOS Intel install button
- **Install/distribution wording alignment** — `/install` now explicitly routes Windows ARM64 and Linux ARM64 users to the full downloads matrix, `installer/README.md` documents `build-linux-arm64`, PowerShell script help text names Chromium wherever supported, and the root README clarifies the dual-domain Worker + GitHub Releases architecture
- **Website releases page — JSON shape mismatch** — Client now unwraps `data.releases` instead of treating wrapper object as array
- **Website releases page — field name mismatch** — Updated `ReleaseData` interface to match API shape (`url` not `downloadUrl`, `size` as number), added human-readable size formatting
- **CI race condition** — `deploy-worker` now depends on `create-release` instead of `build-extension`, ensuring GitHub Release assets exist before the Worker advertises the new version
- **`GITHUB_REPO` value** — Corrected from `nicx/auto-coursera` to `NICxKMS/auto-coursera` in root README
- **`scripts/sync-constants.sh`** — Replaced `jq` with `sed` for JSON version updates to prevent reformatting (indentation changes, array expansion) that caused noisy diffs
- **`scripts/bump-version.sh`** — Fixed crash when called without arguments under `set -u` (nounset) — now shows usage message instead of unbound variable error
- **`scripts/bump-version.sh`** — Replaced hardcoded `version.json.tmp` with `mktemp` to prevent race conditions and orphaned temp files on interruption
- **`scripts/sync-constants.sh`** — Removed dead `DOMAIN_API` extraction that was printed but never used in any sync operation
- **`scripts/README.md`** — Corrected claim that uninstall scripts sync `UPDATE_URL` — they only use `EXTENSION_ID` and `EXTENSION_NAME`
- **`scripts/check-version.sh`** — Added upfront `version.json` schema validation to catch missing fields before they silently propagate as `"null"`
- **Workers Biome formatting** — Auto-formatted `download.ts` (collapsed multi-line `errorResponse()` call) and `stats.ts` (collapsed multi-line `reduce()` callback) to pass `biome check`
- **`docs/SIGNING.md` stale R2 reference** — Removed sentence referencing "R2 storage infrastructure" that was missed in the initial documentation sweep
- **Extension: 7 widget reliability fixes** — FAB visibility on storage sync failure, `derivePillState` crash on unexpected status, session storage failure, enabled state after session restart, popup Settings response handling, URL detection mismatch, widget host reference timing (see [`extension/CHANGELOG.md`](extension/CHANGELOG.md))
- **Release-facing documentation wording** — Removed remaining `v1.8.0` pre-release wording from active public docs and aligned the extension README's license and lint-tool references with the current MIT/Biome setup

### Security
- **SHA-pin all GitHub Actions (S6)** — All 33 third-party action references across 4 workflow files (`deploy.yml`, `build-extension.yml`, `build-installers.yml`, `deploy-worker.yml`) are now pinned to exact commit SHAs instead of mutable major version tags, preventing supply-chain attacks via compromised upstream maintainers
- **Create Dependabot configuration (S7)** — Added `.github/dependabot.yml` with weekly update checks for GitHub Actions, npm (extension, website, workers), and monthly for Go modules (installer)
- **Remove committed Go binaries (S1)** — Untracked `installer/installer` (2.5 MB) and `installer/installer.exe` (2.8 MB) from git; added to `.gitignore` to prevent re-commit of build artifacts
- **Fix Python code injection in `verify-crx.sh` (C3)** — CRX filename was string-interpolated into inline Python (`open('${CRX_FILE}', 'rb')`), allowing code injection via filenames containing single quotes. Now passes the filename via `sys.argv[1]` with a quoted heredoc (`<< 'PYEOF'`) to prevent shell expansion

---

## [1.7.5] — 2026-03-09

### Added
- **Centralized version management** — Single `version.json` at project root as the source of truth for all component versions
- **`scripts/bump-version.sh`** — Atomically updates version across all 6+ files (extension, website, workers, installer, wrangler.toml)
- **`scripts/check-version.sh`** — CI guard that validates all version references match `version.json` (including git tag validation)
- **CI version-check job** — `deploy.yml` now runs version consistency check before all build/deploy jobs
- **Go ldflags injection** — Installer Makefile reads version from `version.json` and injects via `-X main.AppVersion`
- **Chrome extension** (v1.7.5) — AI-powered quiz assistant with 5 LLM providers (OpenRouter, NVIDIA NIM, Gemini, Groq, Cerebras)
- **Landing website** — Astro static site with OS detection, download pages, and install scripts
- **API worker** — Cloudflare Workers API for version info, release listings, and binary downloads via R2
- **Native installer** — Cross-platform Go CLI for browser policy configuration (Chrome, Edge, Brave, Chromium)
- **CRX packaging** — Shell scripts for signing, packaging, and verifying `.crx` files
- **CI/CD pipeline** — GitHub Actions workflows for extension build, installer compilation, worker deployment, and website deployment
- **Documentation** — Architecture overview, Cloudflare setup guide, CRX signing guide, setup instructions, troubleshooting guide
- **Infrastructure** — Cloudflare Pages (website), Workers (API), R2 (storage), custom domains (`autocr.nicx.me`, `autocr-cdn.nicx.me`, `autocr-api.nicx.me`)

### Changed
- **Go installer `AppVersion`** — Changed from `const` to `var` to support build-time injection via ldflags
- **Domain migration** — Replaced nested subdomains with flat subdomains for SSL compatibility: `api.autocr.nicx.me` → `autocr-api.nicx.me`, `cdn.autocr.nicx.me` → `autocr-cdn.nicx.me` (133 replacements across 27 files)
- **Domain migration fix** — Fixed extensionless files (`_headers`, `_redirects`) missed by sed migration; merged dead `website/_headers` and `website/_redirects` into deployed `website/public/` equivalents (added HSTS, X-XSS-Protection, /scripts/* cache headers, base platform download redirects, install script shortcuts); deleted dead files

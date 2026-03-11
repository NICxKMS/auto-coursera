# Changelog — Auto-Coursera Website

All notable changes to the website are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Public docs summaries** — Added live `/docs/setup` and `/docs/architecture` routes and surfaced them from the docs hub so setup and architecture links no longer fall through to unrelated pages

### Fixed
- **Windows script elevation UX** — `public/scripts/install.ps1` now relaunches through the standard Administrator UAC prompt instead of immediately failing when not elevated
- **Linux script elevation UX** — `public/scripts/install.sh` now re-runs through `sudo` when launched from a saved file without preserving the caller `PATH`, and gives clearer guidance for stdin/piped invocations that still need `| sudo bash`
- **Install/docs copy alignment** — Install, downloads, support, and troubleshooting pages now explain the updated privilege flow without implying that macOS requires admin access

## [1.9.1] — 2026-03-11

### Fixed
- **Master website release gate** — `deploy-website-main` now skips Cloudflare Pages publishes until the current `version.json` already has a matching published GitHub Release with the expected CRX/installer assets, preventing release-link drift on `master`
- **Website download hotfix hardening** — `/install` and `/downloads` now derive their GitHub Release URLs from root `version.json` at build time instead of embedding a specific release tag in page source
- **Static Pages release artifacts** — `public/_redirects` and `public/updates.xml` are now regenerated from `version.json` by `scripts/sync-constants.sh`, keeping shortcut downloads and browser auto-update discovery aligned for the current hotfix release
- **Website release-truth validation** — `scripts/check-version.sh` now verifies the generated `_redirects` targets, `updates.xml` contents, and the install/download page wiring so release-surface drift is caught before deploy

## [1.8.0] — 2026-03-10

### Changed
- **Install/download/docs copy cleanup** — Install and downloads pages now keep native installers primary, relabel terminal/script paths as advanced/manual options, and explain that installers/scripts all write the same browser-policy mechanism
- **Manual installation docs** — Expanded browser coverage documentation for Chrome, Edge, Brave, and Chromium across Windows, Linux, and macOS; corrected the Linux managed-policy filename to `auto_coursera.json`
- **Operational branch/source truth** — Website docs now describe `master` as the active production branch, and the footer license link now targets the repository's live `master` branch instead of `main`

### Fixed
- **Website README drift** — Corrected stale path references (`website/public/_headers`, `website/public/_redirects`), removed the nonexistent `ReleaseCard.astro`, and updated route descriptions so `/downloads` no longer overclaims checksums UI
- **Downloads page — macOS label correction** — Replaced misleading “macOS Universal (Intel + Apple Silicon)” label with “macOS (Apple Silicon)” since the `macos` download key maps to ARM64 only; added separate “macOS (Intel)” card linking to `/api/download/macos-intel`
- **Install page — macOS label correction** — Same label fix as downloads; added macOS (Intel) install button alongside Apple Silicon
- **Releases page — JSON shape mismatch** — API returns `{ releases: [...] }` but client assigned the wrapper object directly; now correctly unwraps `data.releases`
- **Releases page — field name mismatch** — API returns `url` (not `downloadUrl`) and `size` as bytes (not optional string); updated `ReleaseData` interface and added `formatSize()` to render human-readable file sizes

## [1.7.5] — 2026-03-09

### Added
- **Landing page** (`/`) — hero section, feature highlights, call to action
- **Install page** (`/install`) — OS auto-detection, one-liner install commands, download buttons
- **Downloads page** (`/downloads`) — all platform binaries with details
- **Releases page** (`/releases`) — version history fetched from API worker
- **Support page** (`/support`) — help and contact information
- **Privacy page** (`/privacy`) — privacy policy
- **Documentation** — manual install guide (`/docs/manual`), troubleshooting (`/docs/troubleshoot`)
- Reusable components: Header, Footer, InstallButton, ScriptBlock, OSDetector, ReleaseCard, VersionBadge
- Base layout with responsive design
- **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- **Download redirects** — `/download/windows`, `/download/macos`, `/download/linux` → API
- **Script shortcuts** — `/ps` → `install.ps1`, `/sh` → `install.sh`
- Install scripts: `install.sh` (Linux), `install-mac.sh` (macOS), `install.ps1` (Windows), uninstall scripts
- Custom Tailwind color theme (primary purple, accent teal)
- **Tech stack** — Astro 4.x static site generator with Tailwind CSS 3.x, deployed to Cloudflare Pages at `autocr.nicx.me`

### Changed
- **Domain migration** — All API and CDN URLs updated from nested subdomains (`api.autocr.nicx.me`, `cdn.autocr.nicx.me`) to flat subdomains (`autocr-api.nicx.me`, `autocr-cdn.nicx.me`) for SSL compatibility
- **Domain migration fix** — Fixed stale domains in `_headers` CSP and `_redirects` rules; merged dead root-level `_headers`/`_redirects` into `public/` (added HSTS, X-XSS-Protection, `/scripts/*` cache headers, base platform redirects, install script shortcuts); deleted dead files

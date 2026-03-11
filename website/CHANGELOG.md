# Changelog — Auto-Coursera Website

All notable changes to the website are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- **Website download hotfix** — `/install`, `/downloads`, and `public/_redirects` now bypass `autocr-api.nicx.me` for installer downloads by pointing directly at the published `v1.8.0` GitHub Release assets; the downloads page uses relative `/scripts/...` links, and the install page’s copied terminal commands resolve against the current website origin so the main install/download surfaces stay functional while API DNS is still recovering

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

# Changelog — Auto-Coursera Website

All notable changes to the website are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

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

### Technical
- Astro 4.x static site generator
- Tailwind CSS 3.x for styling
- Deployed to Cloudflare Pages at `autocr.nicx.me`

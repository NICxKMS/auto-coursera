# Changelog — Auto-Coursera

All notable changes to the Auto-Coursera distribution platform are documented in this file.  
For component-specific changes, see the changelogs in each directory:

- [`extension/CHANGELOG.md`](extension/CHANGELOG.md) — Browser extension
- [`website/CHANGELOG.md`](website/CHANGELOG.md) — Website (Astro)
- [`workers/CHANGELOG.md`](workers/CHANGELOG.md) — API Worker (Cloudflare)
- [`installer/CHANGELOG.md`](installer/CHANGELOG.md) — Native installer (Go)

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.7.5] — 2026-03-09

### Added
- **Chrome extension** (v1.7.5) — AI-powered quiz assistant with 5 LLM providers (OpenRouter, NVIDIA NIM, Gemini, Groq, Cerebras)
- **Landing website** — Astro static site with OS detection, download pages, and install scripts
- **API worker** — Cloudflare Workers API for version info, release listings, and binary downloads via R2
- **Native installer** — Cross-platform Go CLI for browser policy configuration (Chrome, Edge, Brave, Chromium)
- **CRX packaging** — Shell scripts for signing, packaging, and verifying `.crx` files
- **CI/CD pipeline** — GitHub Actions workflows for extension build, installer compilation, worker deployment, and website deployment
- **Documentation** — Architecture overview, Cloudflare setup guide, CRX signing guide, setup instructions, troubleshooting guide
- **Infrastructure** — Cloudflare Pages (website), Workers (API), R2 (storage), custom domains (`autocr.nicx.me`, `cdn.autocr.nicx.me`, `api.autocr.nicx.me`)

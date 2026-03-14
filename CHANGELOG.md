# Changelog — Auto-Coursera

All notable changes to the Auto-Coursera distribution platform are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [2.0.0] — 2026-03-14

### Added

#### Extension
- NumericQuestion support for Coursera quizzes
- Code block extraction for programming questions
- Auto-update mechanism with manual check from popup

#### Website
- Ground-up redesign with "Midnight Engineering" dark aesthetic and scroll narrative homepage
- 11 pages: install, downloads, docs (5), releases, support, privacy, terms
- Platform-aware install commands with OS detection and copy-to-clipboard
- Releases timeline auto-generated from CHANGELOG at build time
- Full keyboard and screen-reader accessibility (WCAG AA)
- Structured data (JSON-LD) for SEO

#### Infrastructure
- OpenCode agent definitions (13 agents)
- Version endpoint for extension update poller
- CI version-sync enforcement across all workflows

### Changed

#### Extension
- AI token budget raised from 384 to 1,024 per question
- Background service worker split into focused modules
- Provider system replaced with config-driven registry
- Popup and widget share unified runtime projection
- First-install flow opens Coursera directly

#### Website
- Rebuilt from scratch on Astro 6 with self-hosted fonts via Fontsource
- All design tokens defined as CSS custom properties with fluid typography
- Downloads page focuses on binaries; script installers moved to install page

#### Infrastructure
- `sync-constants.sh` gained `--bump` flag, replacing `bump-version.sh`
- Explicit `update_url` in manifest with CI enforcement

### Removed

#### Extension
- Options page (replaced by in-page settings overlay)

#### Infrastructure
- Dead scripts, stale configs, and component-level changelogs (merged into root)

### Fixed

#### Extension
- Array-wrapped numeric answers from OpenRouter now routed correctly
- Batch solve validates selection before mutating state
- Image pipeline hosts match manifest permissions

#### Website
- Encryption claims accurately scoped; honest disclosure of limitations
- WCAG AA contrast compliance across all text elements
- Reduced-motion support for all animations and transitions

#### Infrastructure
- Release-tag CI reruns full checks before packaging
- Windows/Linux install scripts handle privilege escalation automatically
- Version consistency script false-positives removed

### Security

#### Website
- Content Security Policy headers with strict defaults
- Changelog renderer only allows http/https URLs to prevent injection

#### Infrastructure
- All third-party GitHub Actions pinned to commit SHAs
- Dependabot configured for Actions, npm, and Go modules

---

## [1.9.1] — 2026-03-11

### Removed

#### Infrastructure
- Cloudflare Worker infrastructure replaced with static files

### Changed

#### Infrastructure
- All update URLs consolidated to a single endpoint

### Fixed

#### Infrastructure
- Version references realigned across deployment surfaces
- Website deploy waits for GitHub Release before deploying

#### Website
- Install and download pages read release data at build time

---

## [1.8.0] — 2026-03-10

### Added

#### Extension
- Floating contextual widget on Coursera pages
- In-page settings overlay for API keys and behavior
- Context-aware popup with compact controls
- Shadow DOM isolation for all injected UI

#### Infrastructure
- GitHub Releases as sole distribution channel
- Centralized version management with CI validation

### Changed

#### Infrastructure
- Install flow uses browser policy with native installers

### Fixed

#### Extension
- OpenRouter provider using incorrect API endpoint
- Widget reliability improvements

#### Website
- Website release page data and download labels corrected

#### Infrastructure
- Cross-platform installer fixes for Linux, Windows, and macOS

### Security

#### Infrastructure
- CRX signing key injection vulnerability fixed

---

## [1.7.5] — 2026-03-09

### Added

#### Extension
- Chrome extension with AI-powered quiz assistance (5 LLM providers)

#### Website
- Landing website with OS detection and install scripts

#### Infrastructure
- Native installer for cross-platform browser policy configuration
- CRX signing and packaging scripts
- CI/CD pipeline for builds, compilation, and deployment
- Project documentation for architecture, setup, and troubleshooting

### Changed

#### Infrastructure
- Domain structure migrated to flat subdomains for SSL

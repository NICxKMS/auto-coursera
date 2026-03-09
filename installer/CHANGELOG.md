# Changelog — Auto-Coursera Installer

All notable changes to the cross-platform installer are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.7.5] — 2026-03-09

### Added
- **Cross-platform browser policy installer** for Chrome, Edge, Brave, and Chromium
- CLI flags: `--browser` (target specific browser or `all`), `--uninstall`, `--quiet`
- **Windows**: registry policy writer (`HKLM\SOFTWARE\Policies\...`)
- **Linux**: managed policy JSON writer (`/etc/opt/.../policies/managed/`)
- **macOS**: `defaults write` plist policy writer
- Automatic browser detection per platform
  - Linux/macOS: `exec.LookPath` scan
  - Windows: registry key scan
- Policy verification after install/uninstall
- Colored terminal UI with banners, step indicators, and results table
- 5 cross-compilation targets via Makefile (windows amd64/arm64, macos arm64/amd64, linux amd64)
- Static binaries with `CGO_ENABLED=0`

### Technical
- Go 1.22+ with `golang.org/x/sys` for Windows registry access
- Platform-specific files via Go build tags
- Zero runtime dependencies on Linux/macOS

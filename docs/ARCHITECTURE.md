# Architecture

> Public summary: [`/docs/architecture`](https://autocr.nicx.me/docs/architecture) provides a shorter live overview; this file remains the full repository reference.

> Auto-Coursera Assistant — Extension Distribution Platform

---

## Table of Contents

- [System Overview](#system-overview)
- [Component Diagram](#component-diagram)
- [Component Descriptions](#component-descriptions)
  - [Chrome Extension](#chrome-extension)
  - [Website](#website-cloudflare-pages)
  - [Native Installer](#native-installer-go)
  - [Terminal Scripts](#terminal-install-scripts)
  - [CRX Packaging Scripts](#crx-packaging-scripts)
  - [CI/CD Pipeline](#cicd-pipeline-github-actions)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Install Flow](#install-flow)
  - [Release Flow](#release-flow)
- [Domain Structure](#domain-structure)
- [Browser Policy Mechanism](#browser-policy-mechanism)
  - [Windows — Registry](#windows--registry)
  - [Linux — Managed Policy JSON](#linux--managed-policy-json)
  - [macOS — User Defaults (plist)](#macos--user-defaults-plist)
  - [Supported Browsers](#supported-browsers)

---

## System Overview

**Auto-Coursera Assistant** is an AI-powered Chrome extension that assists users on Coursera. The extension itself (Manifest V3, TypeScript, Webpack) is already built and lives in `extension/`.

This repository wraps it in a **complete distribution platform** so the extension can be self-hosted, installed via browser policy, automatically updated, and built/released through CI/CD — all without the Chrome Web Store.

The platform answers three questions:

1. **How does a user install the extension?** — Via a website that leads with native installer binaries. Advanced users can also use terminal scripts or manual policy steps. All three paths configure browser *policy* to force-install the extension from a self-hosted update URL.
2. **Where does the extension binary live?** — As a signed CRX3 file on GitHub Releases. The static Astro website on Cloudflare Pages serves `updates.xml`, which points browsers to the GitHub-hosted CRX.
3. **How are new versions released?** — A developer pushes a `v*` tag. GitHub Actions builds the CRX, builds cross-platform installers, uploads everything to a GitHub Release, and deploys the website.

---

## Component Diagram

```mermaid
flowchart TD
    subgraph repo["GitHub Repository — NICxKMS/auto-coursera"]
        ext["extension/ (MV3 TS)"]
        inst["installer/ (Go)"]
        web["website/ (Astro)"]
        scr["scripts/ (Bash)"]
    end

    ext --> ci1["CI: build-extension"]
    inst --> ci2["CI: build-installers"]
    web --> ci3["CI: deploy website"]
    scr -.->|"used by"| ci1

    ci1 --> ghrel["GitHub Release\n(CRX + checksums)"]
    ci2 --> ghrel
    ci3 --> pages["Cloudflare Pages\nautocr.nicx.me"]

    pages --> site["autocr.nicx.me\n(site + updates.xml)"]

    site --> user["End User"]

    user -->|"1. Visits autocr.nicx.me\n2. Downloads installer OR runs script\n3. Browser policy configured"| browser["Chromium-based Browser"]
    site -->|"Reads policy → fetches updates.xml\n→ downloads GitHub CRX → installs"| browser
```

---

## Component Descriptions

### Chrome Extension

| | |
|---|---|
| **Location** | `extension/` (source in `extension/src/`) |
| **Stack** | Manifest V3, TypeScript, Webpack |
| **Version** | 1.9.1 |

The extension is an AI-powered assistant for Coursera. It uses a background service worker, content scripts injected into `coursera.org`, a popup UI, and an options page. It communicates with multiple AI providers (OpenRouter, Gemini, Groq, Cerebras, NVIDIA NIM) to process quiz questions.

Key release/distribution facts for the extension:

- `version` — stamped by CI during the build.
- Install and update discovery are **policy-driven**, not packaging-driven. The installer, terminal scripts, and manual steps all write `<extension-id>;<update-url>` into `ExtensionInstallForcelist`, and browsers then poll `https://autocr.nicx.me/updates.xml`.

The extension source code is **not modified** by this platform beyond the normal release build/signing flow. The platform wraps it for distribution.

---

### Website (Cloudflare Pages)

| | |
|---|---|
| **Location** | `website/` |
| **Stack** | Astro, Tailwind CSS, Cloudflare Pages adapter |
| **Domain** | `autocr.nicx.me` |
| **Build** | `pnpm build` → static output in `website/dist/` |

The website is the user-facing entry point. It provides:

- **Landing page** — what the extension does, supported browsers, CTA to install
- **Install page** — OS detection, native installers as the recommended path, with advanced terminal commands for scripted installs
- **Downloads page** — native installers first, plus advanced scripts and direct download shortcuts
- **Releases page** — version history fetched from the GitHub API at build time, rendered as static HTML
- **Documentation** — public setup and architecture summaries, advanced manual install steps, troubleshooting guides, and policy file paths
- **Static install scripts** — served from `/scripts/` (install.ps1, install.sh, install-mac.sh, uninstall.ps1, uninstall.sh)

Security headers are configured in `website/public/_headers` (HSTS, CSP, X-Frame-Options).
Redirect shortcuts are defined in `website/public/_redirects` (e.g., `/download/windows` → API).

---

### Native Installer (Go)

| | |
|---|---|
| **Location** | `installer/` |
| **Language** | Go 1.22+ |
| **Dependencies** | `golang.org/x/sys` (Windows registry) |
| **Build** | `make build-all` → binaries in `installer/dist/` |

A cross-platform CLI tool that configures browser policies to force-install the extension. The installer:

1. Detects the operating system (`runtime.GOOS`)
2. Scans for installed Chromium-based browsers (registry on Windows, `exec.LookPath` on Linux, `/Applications/*.app` + PATH on macOS)
3. Presents a selection prompt (or accepts `--browser` flag)
4. Writes the `ExtensionInstallForcelist` policy for each selected browser
5. Verifies the policy was written correctly
6. Prints a colored summary table

**Build targets** (from `Makefile`):

| Target | GOOS/GOARCH | Output |
|---|---|---|
| `build-windows` | windows/amd64 | `installer-windows-amd64.exe` |
| `build-windows-arm` | windows/arm64 | `installer-windows-arm64.exe` |
| `build-macos` | darwin/arm64 | `installer-macos-arm64` |
| `build-macos-intel` | darwin/amd64 | `installer-macos-amd64` |
| `build-linux` | linux/amd64 | `installer-linux-amd64` |
| `build-linux-arm64` | linux/arm64 | `installer-linux-arm64` |

**CLI flags:**

```
--browser <name>   Target a specific browser (chrome, edge, brave, chromium, all)
--uninstall        Remove extension policies instead of installing
--quiet            Non-interactive mode, skip prompts
--help             Show usage
```

---

### Terminal Install Scripts

| | |
|---|---|
| **Location** | `website/public/scripts/` |
| **Served at** | `https://autocr.nicx.me/scripts/` |

Advanced one-liner scripts for users who prefer the terminal, need automation, or are working in shell-first environments instead of downloading a binary.

| Script | Platform | Invocation |
|---|---|---|
| `install.ps1` | Windows (PowerShell) | `irm https://autocr.nicx.me/scripts/install.ps1 \| iex` |
| `install.sh` | Linux (Bash) | `curl -fsSL https://autocr.nicx.me/scripts/install.sh \| sudo bash` |
| `install-mac.sh` | macOS (Bash) | `curl -fsSL https://autocr.nicx.me/scripts/install-mac.sh \| bash` |
| `uninstall.ps1` | Windows (PowerShell) | `irm https://autocr.nicx.me/scripts/uninstall.ps1 \| iex` |
| `uninstall.sh` | Linux/macOS (Bash) | `curl -fsSL https://autocr.nicx.me/scripts/uninstall.sh \| sudo bash` |

Each script:

- Checks for required privileges and requests elevation where practical (Windows relaunches through UAC, saved local Linux scripts can hand off to `sudo`, piped Linux one-liners should still start with `sudo`)
- Detects installed browsers
- Writes browser policy (registry on Windows, JSON on Linux, `defaults write` on macOS)
- Handles idempotency — skips if the policy already exists
- Supports `--uninstall` / `-Uninstall` to reverse the operation
- Prints colored status output

---

### CRX Packaging Scripts

| | |
|---|---|
| **Location** | `scripts/` |
| **Dependencies** | `openssl`, `xxd`, `npx crx3` |

Shell scripts that handle extension signing, packaging, and verification.

| Script | Purpose |
|---|---|
| `generate-key.sh` | Generate RSA 2048 private key (`extension-key.pem`), print derived extension ID |
| `derive-extension-id.sh` | Derive the 32-character extension ID from an existing private key |
| `package-crx.sh` | Build a signed CRX3 file from `extension/dist/` using `npx crx3`, generate SHA256 checksum |
| `generate-updates-xml.sh` | Produce a local/manual `updates.xml` fixture for testing; production uses a static `updates.xml` on Cloudflare Pages, generated by `sync-constants.sh` |
| `verify-crx.sh` | Validate a CRX3 file: magic bytes, format version, manifest, file size, checksum |

See [SIGNING.md](./SIGNING.md) for the full cryptographic details.

---

### CI/CD Pipeline (GitHub Actions)

| | |
|---|---|
| **Location** | `.github/workflows/` |
| **Triggers** | Push to the website deployment branch (`master` in the current setup), push `v*` tag (full release) |

**Workflows:**

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy.yml` | website-branch push (`master` in the current setup) + `v*` tag | Orchestrates the full pipeline. Contains jobs: `build-extension`, `build-installers`, `create-release`, `deploy-website-main`, `deploy-website-release`; the master website job only publishes when the current `version.json` already has a matching published GitHub Release with the expected assets |
| `build-extension.yml` | `pull_request` + `workflow_dispatch` | CI build & test for PRs touching `extension/` (no secrets, no release) |
| `build-installers.yml` | `pull_request` + `workflow_dispatch` | CI build for PRs touching `installer/` (no secrets, no release) |

**Required GitHub Secrets:**

| Secret | Purpose |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare account identifier |
| `CF_API_TOKEN` | Cloudflare API token (Pages permissions) |
| `EXTENSION_PRIVATE_KEY` | PEM private key content for CRX signing |
| `EXTENSION_ID` | Derived 32-character extension ID |

---

## Data Flow Diagrams

### Install Flow

```mermaid
flowchart TD
    START["User visits autocr.nicx.me"] --> CHOICE{"Install method?"}

    CHOICE -->|"Option A: Native installer"| DL["User downloads installer\nfrom GitHub Releases"]
    DL --> RUN["User runs installer"]
    RUN --> DETECT["Installer detects OS +\ninstalled browsers"]
    DETECT --> WRITE_A["Writes ExtensionInstallForcelist policy"]

    CHOICE -->|"Option B: Advanced terminal script"| CURL["curl/irm downloads script\nfrom autocr.nicx.me/scripts/"]
    CURL --> WRITE_B["Script writes\nExtensionInstallForcelist policy"]

    WRITE_A --> POLICY["Policy written"]
    WRITE_B --> POLICY

    POLICY --> RESTART["User restarts browser"]
    RESTART --> READ["Browser reads policy on startup"]
    READ --> FETCH["Fetches autocr.nicx.me/updates.xml\n(static file on Cloudflare Pages)"]
    FETCH --> DOWNLOAD["Downloads CRX from GitHub Releases\n(URL in updates.xml codebase attribute)"]
    DOWNLOAD --> INSTALLED["Extension installed and active"]

    WRITE_A -.- |"Windows: HKLM registry\nLinux: /etc/opt/.../managed/*.json\nmacOS: defaults write plist"| POLICY
```

### Release Flow

```mermaid
flowchart TD
    TAG["Developer pushes git tag vX.Y.Z"] --> BUILD["CI: build-extension"]
    TAG --> INST["CI: build-installers"]
    TAG --> DWEB["CI: deploy-website"]

    BUILD --> VER["Extract version from tag → X.Y.Z"]
    VER --> CRX["package-crx.sh → auto_coursera_X.Y.Z.crx + .sha256"]
    CRX --> GHREL["Upload CRX + checksums\nto GitHub Release vX.Y.Z"]

    INST --> MAKE["make build-all → 6 binaries"]
    MAKE --> SHA["Generate SHA256 checksums"]
    SHA --> GHREL

    DWEB --> PAGES["Build & deploy Astro site\nto Cloudflare Pages\n(includes static updates.xml)"]

    GHREL --> AUTO["Browsers auto-update"]
    AUTO --> CHECK["Check autocr.nicx.me/updates.xml"]
    CHECK --> XML["Static updates.xml\n(generated by sync-constants.sh)"]
    XML --> NEWER["X.Y.Z > installed version\n→ download GitHub CRX"]
    NEWER --> UPDATED["Extension updated silently"]
```

---

## Domain Structure

All domains are subdomains of `nicx.me`, managed in Cloudflare DNS.

| Domain | Service | Purpose |
|---|---|---|
| `autocr.nicx.me` | Cloudflare Pages | User-facing website, documentation, install scripts (`/scripts/`), releases page (build-time GitHub API data), and static `updates.xml` update manifest. Browsers poll `updates.xml` to discover new versions. This URL is embedded in browser policies. |

The entire platform runs on a single domain backed by Cloudflare Pages. All binary artifacts (CRX, installers) are hosted on GitHub Releases. The website fetches release data from the GitHub API at build time and renders it as static HTML. The `updates.xml` manifest is a static file generated by `sync-constants.sh` from `version.json`.

---

## Browser Policy Mechanism

Chromium-based browsers support enterprise policies that can **force-install** extensions without user interaction. The `ExtensionInstallForcelist` policy tells the browser: *"Install this extension from this URL and keep it updated."*

The policy value format is:

```
<extension-id>;<update-url>
```

For this project:

```
alojpdnpiddmekflpagdblmaehbdfcge;https://autocr.nicx.me/updates.xml
```

Once the policy is set, the browser:

1. Reads the policy on startup
2. Fetches the `updates.xml` from the update URL
3. Compares the version in `updates.xml` to any installed version
4. Downloads the CRX file if the remote version is newer (or not yet installed)
5. Verifies the CRX signature matches the extension ID
6. Installs or updates the extension silently

Users can verify policies are active by visiting `chrome://policy` in their browser.

---

### Windows — Registry

Policy is stored as a numbered string value under an `ExtensionInstallForcelist` registry key in `HKEY_LOCAL_MACHINE`.

| Browser | Registry Path |
|---|---|
| Chrome | `HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` |
| Edge | `HKLM\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist` |
| Brave | `HKLM\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist` |
| Chromium | `HKLM\SOFTWARE\Policies\Chromium\ExtensionInstallForcelist` |

Each extension is a numbered value (`1`, `2`, `3`, ...) containing the policy string.

**Requires Administrator privileges** to write to HKLM.

---

### Linux — Managed Policy JSON

Policy is a JSON file in the browser's managed policy directory. The file must be readable by the browser process (permissions `644`).

| Browser | Policy Directory |
|---|---|
| Chrome | `/etc/opt/chrome/policies/managed/` |
| Edge | `/etc/opt/edge/policies/managed/` |
| Brave | `/etc/brave/policies/managed/` |
| Chromium | `/etc/chromium/policies/managed/` |

The installer and Linux shell scripts both write `auto_coursera.json`:

```json
{
    "ExtensionInstallForcelist": [
        "alojpdnpiddmekflpagdblmaehbdfcge;https://autocr.nicx.me/updates.xml"
    ]
}
```

Multiple extensions can coexist in the array. Existing policy files are read and merged — the installer never overwrites other extensions' policies.

**Requires root** because `/etc` is owned by root.

---

### macOS — User Defaults (plist)

Policy is set via the `defaults` command, which writes to the user's `~/Library/Preferences/` plist files.

| Browser | Plist Domain |
|---|---|
| Chrome | `com.google.Chrome` |
| Edge | `com.microsoft.Edge` |
| Brave | `com.brave.Browser` |
| Chromium | `org.chromium.Chromium` |

Commands used:

```bash
# Create new policy array
defaults write com.google.Chrome ExtensionInstallForcelist -array "EXTENSION_ID;https://autocr.nicx.me/updates.xml"

# Append to existing array
defaults write com.google.Chrome ExtensionInstallForcelist -array-add "EXTENSION_ID;https://autocr.nicx.me/updates.xml"

# Read current policy
defaults read com.google.Chrome ExtensionInstallForcelist

# Remove policy
defaults delete com.google.Chrome ExtensionInstallForcelist
```

**Does not require root** — user-level plist preferences.

---

### Supported Browsers

| Browser | Windows | Linux | macOS |
|---|---|---|---|
| Google Chrome | ✓ | ✓ | ✓ |
| Microsoft Edge | ✓ | ✓ | ✓ |
| Brave | ✓ | ✓ | ✓ |
| Chromium | ✓ | ✓ | ✓ |

All four browsers use the same Chromium policy mechanism. The only differences are the registry paths (Windows), policy directories (Linux), and plist domains (macOS).

# Auto-Coursera Assistant — Distribution Platform

A complete browser extension distribution platform for **Auto-Coursera Assistant**, an AI-powered Chrome extension that helps with Coursera quizzes. This monorepo contains the extension source, CRX packaging scripts, installer service, Worker-routed update/download infrastructure, and landing website.

> **Current release:** **`v1.8.0`** includes the floating widget redesign, in-page settings overlay, slim popup fallback, scoped runtime-state lifecycle, and the GitHub Releases distribution migration.

## Architecture

```mermaid
flowchart LR
    EXT["Extension\n(extension/src/)"] --> CRX["CRX Packaging\n(scripts/)"]
    CRX --> GH["GitHub Releases\nNICxKMS/auto-coursera"]
    GH --> WORKER["Cloudflare Worker\nAPI + CDN domains"]
    WORKER --> XML["updates.xml\n(dynamic)"]
    WORKER --> WEB["Website\nautocr.nicx.me"]
    XML --> BROWSER["Browser Policy\nInstall / Update"]
    WEB --> BROWSER
    CICD["CI/CD\nGitHub Actions"] -.->|"Build + Package"| CRX
    CICD -.->|"Upload"| GH
    CICD -.->|"Deploy"| WEB
```

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/nicxkms/auto-coursera.git
cd auto-coursera

# 2. Install extension dependencies
cd extension && pnpm install && cd ..

# 3. Build the extension
cd extension && pnpm build && cd ..

# 4. Generate a signing key (first time only)
bash scripts/generate-key.sh

# 5. Package as CRX
bash scripts/package-crx.sh -v <version> -k extension-key.pem -s extension/dist
```

## Prerequisites

| Requirement          | Version  | Purpose                              |
|----------------------|----------|--------------------------------------|
| Node.js              | 20+      | Extension build, CRX packaging       |
| pnpm                 | 9+       | Package manager                      |
| Go                   | 1.22+    | Installer service                    |
| Cloudflare account   | —        | Workers, Pages                       |
| GitHub account       | —        | Source control, CI/CD, Releases      |
| OpenSSL              | 3+       | CRX signing, key generation          |

## Components

| Component        | Path             | Description                                          |
|------------------|------------------|------------------------------------------------------|
| **Extension**    | `extension/`     | Chrome MV3 extension with multi-provider AI, floating widget controls, in-page settings overlay, slim popup fallback, and scoped runtime-state UX for the `v1.8.0` release line |
| **Source**       | `extension/src/` | Extension TypeScript source files                    |
| **Scripts**      | `scripts/`       | CRX packaging, key generation, and local/manual update XML tooling |
| **Website**      | `website/`       | Installer-first Astro landing page, advanced script/manual docs, and download portal at autocr.nicx.me |
| **Installer**    | `installer/`     | Go-based browser-policy installer binaries           |
| **Workers**      | `workers/`       | Cloudflare Worker deployment that serves the API at `autocr-api.nicx.me` and the CDN/update routes at `autocr-cdn.nicx.me` |
| **Docs**         | `docs/`          | Architecture, deployment, and operations guides      |
| **CI/CD**        | `.github/`       | GitHub Actions workflows and agent definitions       |

## Development

### Extension

```bash
cd extension
pnpm install
pnpm dev          # Build in watch mode
pnpm build        # Production build
pnpm test         # Run tests
pnpm typecheck    # TypeScript type checking
pnpm lint         # Biome lint
```

### CRX Packaging Scripts

```bash
# Generate a new signing key
bash scripts/generate-key.sh

# Derive extension ID from existing key
bash scripts/derive-extension-id.sh extension-key.pem

# Package extension as CRX3
bash scripts/package-crx.sh -v <version> -k extension-key.pem -s extension/dist

# Optional: generate a local/manual updates.xml fixture for testing
bash scripts/generate-updates-xml.sh -i <extension-id> -v <version> -u <crx-url>

# Verify a CRX file
bash scripts/verify-crx.sh <file.crx>
```

### Website

```bash
cd website
pnpm install
pnpm dev          # Dev server at localhost:4321
pnpm build        # Production build
```

### Installer

```bash
cd installer
go build -o dist/installer .

# Build all platforms
make build-all
```

## Deployment

Deployment guides are available in the `docs/` directory:

- **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — System architecture details
- **[`docs/SETUP.md`](docs/SETUP.md)** — Full deployment walkthrough
- **[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)** — Troubleshooting common issues

### Quick Deployment Summary

1. **Build extension** → `cd extension && pnpm build`
2. **Package CRX** → `bash scripts/package-crx.sh -v <ver> -k extension-key.pem`
3. **Upload to GitHub Releases** → CI/CD creates a GitHub Release with the CRX, CRX checksum, installers, and installer checksums
4. **Deploy website** → CI runs `wrangler pages deploy website/dist --project-name=auto-coursera --branch=master` so the deployment stays attached to the production Pages branch/custom domain
5. **Deploy workers** → `cd workers && wrangler deploy --env production` (production `vars` are duplicated under `[env.production.vars]` because Wrangler does not inherit them)

GitHub Releases stores the CRX and installer binaries, while the dual-domain Cloudflare Worker fronts `autocr-api.nicx.me` for website/download APIs and `autocr-cdn.nicx.me` for the canonical `updates.xml` and compatibility download routes.

Production browser updates continue to use the canonical Worker-served endpoint at `https://autocr-cdn.nicx.me/updates.xml`; the repository does not publish a static `updates.xml` release asset anymore.

End-user installs and updates are driven by browser policy entries (`ExtensionInstallForcelist`) written by the native installer, install scripts, or manual policy steps. The site intentionally treats installers as the primary path; scripts and manual steps remain available for advanced or automated environments.

## Configuration Variables

| Variable               | Value                       | Description                         |
|------------------------|-----------------------------|-------------------------------------|
| `PROJECT_NAME`         | `auto-coursera`             | Repository and project name         |
| `EXTENSION_NAME`       | `Auto-Coursera Assistant`   | Chrome extension display name       |
| `EXTENSION_ID`         | `alojpdnpiddmekflpagdblmaehbdfcge`  | Chrome extension ID (from key)      |
| `DOMAIN_WEBSITE`       | `autocr.nicx.me`          | Landing page domain                 |
| `DOMAIN_EXTENSIONS`    | `autocr-cdn.nicx.me`       | CDN / update domain served by the Worker |
| `DOMAIN_API`           | `autocr-api.nicx.me`       | API domain on the same Worker deployment |
| `GITHUB_REPO`          | `NICxKMS/auto-coursera`    | GitHub repository (Releases host)   |

## License

[MIT](LICENSE) © 2024-2026 nicx

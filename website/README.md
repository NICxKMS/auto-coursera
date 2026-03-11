# Auto-Coursera Website

Installer-first landing page, download portal, and documentation hub for the Auto-Coursera Assistant browser extension.

**Live:** [autocr.nicx.me](https://autocr.nicx.me)

---

## Stack

| Technology | Version | Purpose |
|---|---|---|
| [Astro](https://astro.build/) | 4.x | Static site generator |
| [Tailwind CSS](https://tailwindcss.com/) | 3.x | Utility-first CSS |
| Cloudflare Pages | — | Hosting & CDN |

## Development

```bash
pnpm install
pnpm dev          # Dev server at localhost:4321
pnpm build        # Production build → dist/
pnpm preview      # Preview production build locally
```

## Pages

| Route | File | Description |
|---|---|---|
| `/` | `src/pages/index.astro` | Landing page — hero, features, CTA |
| `/install` | `src/pages/install.astro` | OS detection, recommended installer downloads pinned directly to the `v1.8.0` GitHub Release, advanced terminal one-liners resolved against the current website host |
| `/downloads` | `src/pages/downloads.astro` | Native installers pinned directly to the `v1.8.0` GitHub Release, plus advanced scripts and direct download shortcuts |
| `/releases` | `src/pages/releases.astro` | Version history fetched from API |
| `/support` | `src/pages/support.astro` | Help and contact info |
| `/privacy` | `src/pages/privacy.astro` | Privacy policy |
| `/docs/` | `src/pages/docs/index.astro` | Documentation index |
| `/docs/manual` | `src/pages/docs/manual.astro` | Advanced browser-policy installation steps |
| `/docs/troubleshoot` | `src/pages/docs/troubleshoot.astro` | Troubleshooting guide |

## Components

| Component | Purpose |
|---|---|
| `Header.astro` | Navigation bar |
| `Footer.astro` | Site footer |
| `InstallButton.astro` | OS-specific download button |
| `ScriptBlock.astro` | Copy-to-clipboard terminal one-liner |
| `OSDetector.astro` | Client-side OS detection for smart defaults |
| `VersionBadge.astro` | Fetches & displays current version from API |

## Project Structure

```
website/
├── src/
│   ├── pages/           # Route pages
│   │   └── docs/        # Documentation sub-pages
│   ├── components/      # Reusable Astro components
│   ├── layouts/
│   │   └── Base.astro   # Root HTML layout
│   └── styles/
│       └── global.css   # Global styles + Tailwind imports
├── public/
│   ├── _headers         # Cloudflare Pages security headers
│   ├── _redirects       # Cloudflare Pages redirect shortcuts
│   └── scripts/         # Static install scripts (served as text/plain)
│       ├── install.ps1
│       ├── install.sh
│       ├── install-mac.sh
│       ├── uninstall.ps1
│       └── uninstall.sh
├── astro.config.mjs     # Astro config (static output, site URL)
├── tailwind.config.mjs  # Tailwind theme + custom colors
├── tsconfig.json
└── package.json
```

## Configuration

### astro.config.mjs

- `output: 'static'` — fully static, no SSR
- `site: 'https://autocr.nicx.me'` — canonical URL

### public/_headers

Security headers applied to all routes:

- `Strict-Transport-Security` — HSTS with preload
- `Content-Security-Policy` — restricts scripts, styles, API connections
- `X-Frame-Options: DENY` — prevents framing

Scripts under `/scripts/*` are served as `text/plain` so `curl` users see raw content.

### public/_redirects

Shortcut URLs:

| Shortcut | Target | Status |
|---|---|---|
| `/download/windows` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-windows-amd64.exe` | 302 |
| `/download/macos` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-macos-arm64` | 302 |
| `/download/linux` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-linux-amd64` | 302 |
| `/download/windows-arm64` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-windows-arm64.exe` | 302 |
| `/download/macos-intel` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-macos-amd64` | 302 |
| `/download/linux-arm64` | `github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/installer-linux-arm64` | 302 |
| `/ps` | `/scripts/install.ps1` | 200 (rewrite) |
| `/sh` | `/scripts/install.sh` | 200 (rewrite) |

The current outage hotfix deliberately pins installer links to the published `v1.8.0` GitHub Release assets so the website can keep serving working downloads even while `autocr-api.nicx.me` remains degraded externally.

## Deployment

Deployed automatically via Cloudflare Pages GitHub integration:

- **Production branch:** `master`
- **Build command:** `cd website && pnpm install && pnpm build`
- **Output directory:** `website/dist`
- **Custom domain:** `autocr.nicx.me`

See [`docs/CLOUDFLARE-SETUP.md`](../docs/CLOUDFLARE-SETUP.md#2-cloudflare-pages-setup) for full setup instructions.

The website keeps native installers as the default path. Terminal scripts and `/docs/manual` exist for advanced/manual deployments, and all three paths target the same supported browser set: Google Chrome, Microsoft Edge, Brave, and Chromium.

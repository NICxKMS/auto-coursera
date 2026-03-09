# Auto-Coursera Website

Landing page and install portal for the Auto-Coursera Assistant browser extension.

**Live:** [autocr.nicx.app](https://autocr.nicx.app)

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
| `/install` | `src/pages/install.astro` | OS detection, installer downloads, terminal one-liners |
| `/downloads` | `src/pages/downloads.astro` | All binaries with version, size, checksums |
| `/releases` | `src/pages/releases.astro` | Version history fetched from API |
| `/support` | `src/pages/support.astro` | Help and contact info |
| `/privacy` | `src/pages/privacy.astro` | Privacy policy |
| `/docs/` | `src/pages/docs/index.astro` | Documentation index |
| `/docs/manual` | `src/pages/docs/manual.astro` | Manual installation steps |
| `/docs/troubleshoot` | `src/pages/docs/troubleshoot.astro` | Troubleshooting guide |

## Components

| Component | Purpose |
|---|---|
| `Header.astro` | Navigation bar |
| `Footer.astro` | Site footer |
| `InstallButton.astro` | OS-specific download button |
| `ScriptBlock.astro` | Copy-to-clipboard terminal one-liner |
| `OSDetector.astro` | Client-side OS detection for smart defaults |
| `ReleaseCard.astro` | Version release entry |
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
│   └── scripts/         # Static install scripts (served as text/plain)
│       ├── install.ps1
│       ├── install.sh
│       ├── install-mac.sh
│       ├── uninstall.ps1
│       └── uninstall.sh
├── _headers             # Cloudflare Pages security headers (HSTS, CSP)
├── _redirects           # Shortcut redirects (/download/windows → API)
├── astro.config.mjs     # Astro config (static output, site URL)
├── tailwind.config.mjs  # Tailwind theme + custom colors
├── tsconfig.json
└── package.json
```

## Configuration

### astro.config.mjs

- `output: 'static'` — fully static, no SSR
- `site: 'https://autocr.nicx.app'` — canonical URL

### _headers

Security headers applied to all routes:

- `Strict-Transport-Security` — HSTS with preload
- `Content-Security-Policy` — restricts scripts, styles, API connections
- `X-Frame-Options: DENY` — prevents framing

Scripts under `/scripts/*` are served as `text/plain` so `curl` users see raw content.

### _redirects

Shortcut URLs:

| Shortcut | Target | Status |
|---|---|---|
| `/download/windows` | `api.autocr.nicx.app/api/download/windows` | 302 |
| `/download/macos` | `api.autocr.nicx.app/api/download/macos` | 302 |
| `/download/linux` | `api.autocr.nicx.app/api/download/linux` | 302 |
| `/ps` | `/scripts/install.ps1` | 200 (rewrite) |
| `/sh` | `/scripts/install.sh` | 200 (rewrite) |

## Deployment

Deployed automatically via Cloudflare Pages GitHub integration:

- **Production branch:** `main`
- **Build command:** `cd website && pnpm install && pnpm build`
- **Output directory:** `website/dist`
- **Custom domain:** `autocr.nicx.app`

See [`docs/CLOUDFLARE-SETUP.md`](../docs/CLOUDFLARE-SETUP.md#5-cloudflare-pages-setup) for full setup instructions.

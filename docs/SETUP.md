# Setup Guide

> Step-by-step instructions to deploy the Auto-Coursera Assistant distribution platform from scratch.

---

## Table of Contents

- [Prerequisites](#1-prerequisites)
- [Clone Repository](#2-clone-repository)
- [Generate Extension Signing Key](#3-generate-extension-signing-key)
- [Configure Extension ID](#4-configure-extension-id)
- [Create Cloudflare Account](#5-create-cloudflare-account)
- [Create Cloudflare Pages Project](#6-create-cloudflare-pages-project)
- [Configure Custom Domain for Pages](#7-configure-custom-domain-for-pages)
- [Deploy Worker](#8-deploy-worker)
- [Configure GitHub Secrets](#9-configure-github-secrets)
- [Update Configuration Variables](#10-update-configuration-variables)
- [First Deployment](#11-first-deployment)
- [Verification](#12-verification)

---

## 1. Prerequisites

Install these tools before proceeding:

| Tool | Minimum Version | Purpose | Install |
|---|---|---|---|
| **Node.js** | 20+ | Website build, CRX packaging | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | Package manager | `npm install -g pnpm` |
| **Go** | 1.22+ | Native installer build | [go.dev/dl](https://go.dev/dl/) |
| **openssl** | 3.x | Key generation, CRX signing | Pre-installed on most systems |
| **xxd** | any | Hex conversion for extension ID | Usually bundled with `vim` |
| **Wrangler** | 3+ | Cloudflare Workers CLI | `pnpm install -g wrangler` |
| **Git** | 2.x | Version control | [git-scm.com](https://git-scm.com/) |

Verify all tools are available:

```bash
node --version       # v20.x.x or higher
pnpm --version       # 9.x.x or higher
go version           # go1.22.x or higher
openssl version      # OpenSSL 3.x.x
xxd -v               # xxd V1.x
wrangler --version   # 3.x.x
git --version        # git version 2.x
```

You also need:

- A **Cloudflare account** (free tier works)
- A **domain** added to Cloudflare DNS (this guide uses `nicx.me`)
- A **GitHub account** with the repository pushed

---

## 2. Clone Repository

```bash
git clone https://github.com/nicxkms/auto-coursera.git
cd auto-coursera
```

Install extension dependencies (needed for CRX packaging):

```bash
cd extension && pnpm install && cd ..
```

---

## 3. Generate Extension Signing Key

The extension needs an RSA 2048 private key for CRX3 signing. This key **determines the extension ID** — the same key always produces the same ID.

```bash
bash scripts/generate-key.sh
```

This will:

1. Generate `extension-key.pem` in the project root
2. Print the derived **extension ID** (32 lowercase letters a–p)

```
✓ Private key generated: /path/to/auto-coursera/extension-key.pem
✓ Extension ID: abcdefghijklmnopabcdefghijklmnop
```

**Save both values.** You need them for the next step and for GitHub Secrets later.

To re-derive the extension ID from an existing key at any time:

```bash
bash scripts/derive-extension-id.sh extension-key.pem
```

> ⚠️ **Never commit `extension-key.pem` to the repository.** It is already in `.gitignore`. Store it in a secure location and back it up. If the key is lost, the extension ID changes and all deployed policies become invalid.

---

## 4. Configure Extension ID

Replace the placeholder `alojpdnpiddmekflpagdblmaehbdfcge` with your actual extension ID across the entire project.

Using `sed` (Linux/macOS):

```bash
EXTENSION_ID="your-actual-extension-id-here"

# Find all occurrences first (dry run)
grep -rn "alojpdnpiddmekflpagdblmaehbdfcge" --include="*.go" --include="*.ts" --include="*.sh" --include="*.ps1" --include="*.toml" --include="*.json" --include="*.mjs" --include="*.astro" .

# Replace everywhere
find . -type f \( \
  -name "*.go" -o -name "*.ts" -o -name "*.sh" -o -name "*.ps1" \
  -o -name "*.toml" -o -name "*.json" -o -name "*.mjs" -o -name "*.astro" \
  \) -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i "s/alojpdnpiddmekflpagdblmaehbdfcge/${EXTENSION_ID}/g" {} +
```

**Files that contain `alojpdnpiddmekflpagdblmaehbdfcge`:**

| File | Context |
|---|---|
| `installer/config.go` | `ExtensionID` constant |
| `workers/wrangler.toml` | `EXTENSION_ID` env var |
| `website/public/scripts/install.ps1` | `$EXTENSION_ID` variable |
| `website/public/scripts/install.sh` | `EXTENSION_ID` variable |
| `website/public/scripts/install-mac.sh` | `EXTENSION_ID` variable |
| `website/public/scripts/uninstall.ps1` | `$EXTENSION_ID` variable |
| `website/public/scripts/uninstall.sh` | `EXTENSION_ID` variable |

After replacing, verify no placeholders remain:

```bash
grep -rn "alojpdnpiddmekflpagdblmaehbdfcge" . --include="*.go" --include="*.ts" --include="*.sh" --include="*.ps1" --include="*.toml" --include="*.json"
# Should return no results
```

---

## 5. Create Cloudflare Account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and create an account
2. Add your domain (e.g., `nicx.me`) to Cloudflare
3. Update your domain registrar's nameservers to Cloudflare's (shown after adding the domain)
4. Wait for DNS propagation (usually 5–30 minutes, can take up to 24 hours)

---

## 6. Create Cloudflare Pages Project

The website can be deployed via GitHub integration or direct upload.

### Option A: GitHub integration (recommended)

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create**
2. Select **Pages** → **Connect to Git**
3. Select the `NICxKMS/auto-coursera` repository
4. Configure build settings:

| Setting | Value |
|---|---|
| **Project name** | `auto-coursera` |
| **Production branch** | `master` |
| **Framework preset** | Astro |
| **Build command** | `cd website && pnpm install && pnpm build` |
| **Build output directory** | `website/dist` |

5. Click **Save and Deploy**

### Option B: Direct upload via Wrangler

```bash
cd website
pnpm install
pnpm build
wrangler pages deploy dist --project-name auto-coursera
```

---

## 7. Configure Custom Domain for Pages

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **auto-coursera** → **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `autocr.nicx.me`
4. Cloudflare will add the required DNS record (CNAME to the Pages project)
5. SSL certificate is provisioned automatically

Verify:

```bash
curl -I https://autocr.nicx.me/
# Should return 200 with the website content
```

---

## 8. Deploy Worker

The Workers API serves version info, release listings, and redirects installer downloads to GitHub Releases.

```bash
cd workers
pnpm install
```

Login to Cloudflare (if not already):

```bash
wrangler login
```

Deploy the production Worker environment (the one with the configured `autocr-api.nicx.me` and `autocr-cdn.nicx.me` routes):

```bash
pnpm run deploy:prod
```

Equivalent direct Wrangler command:

```bash
wrangler deploy --env production
```

This production deploy uses the `routes` declared in `workers/wrangler.toml`, so the Worker will answer on both `autocr-api.nicx.me` and `autocr-cdn.nicx.me` without a separate manual route step.

If you prefer to manage routes in the Cloudflare dashboard instead, configure the same production routes there:

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → **auto-coursera-api**
2. Go to **Settings** → **Triggers** → **Routes**
3. Add routes:
  - `autocr-api.nicx.me/*` → zone: `nicx.me`
  - `autocr-cdn.nicx.me/*` → zone: `nicx.me`

Alternatively, the `[env.production]` section in `wrangler.toml` already defines this:

```toml
[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

Deploy with the production environment:

```bash
wrangler deploy --env production
```

Verify:

```bash
curl https://autocr-api.nicx.me/api/latest-version
# Should return JSON with version info

curl -I https://autocr-cdn.nicx.me/updates.xml
# Should return 200 OK with an XML content type
```

---

## 9. Configure GitHub Secrets

Go to **GitHub** → **NICxKMS/auto-coursera** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add these four secrets:

| Secret Name | Value | How to get it |
|---|---|---|
| `CF_ACCOUNT_ID` | Cloudflare account ID | Dashboard → any Workers page → URL contains account ID, or **Account Home** → **Account ID** in the sidebar |
| `CF_API_TOKEN` | API token string | See [token creation](#create-cloudflare-api-token) below |
| `EXTENSION_PRIVATE_KEY` | Full PEM key content | `cat extension-key.pem` — copy everything including `-----BEGIN` and `-----END` lines |
| `EXTENSION_ID` | 32-character extension ID | Output from step 3, or run `bash scripts/derive-extension-id.sh extension-key.pem` |

### Create Cloudflare API Token

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Custom token** template
4. Configure permissions:

| Scope | Resource | Permission |
|---|---|---|
| Account | Cloudflare Pages | Edit |
| Account | Workers Scripts | Edit |

5. Under **Account Resources**, select your account
6. Under **Zone Resources**, select your zone (`nicx.me`)
7. Click **Continue to summary** → **Create Token**
8. Copy the token immediately (it's shown only once)

---

## 10. Update Configuration Variables

Beyond `alojpdnpiddmekflpagdblmaehbdfcge`, verify these values are correct across the project:

| Variable | Expected Value | Files |
|---|---|---|
| Domain: website | `autocr.nicx.me` | `website/public/_headers`, `website/public/_redirects`, install scripts, website pages |
| Domain: extensions | `autocr-cdn.nicx.me` | `installer/config.go`, install scripts, `workers/wrangler.toml` |
| Domain: API | `autocr-api.nicx.me` | `website/public/_redirects`, `workers/wrangler.toml`, website pages |
| GitHub repo | `NICxKMS/auto-coursera` | `installer/go.mod`, CI workflow files, `workers/wrangler.toml` |
| Extension name | `Auto-Coursera Assistant` | `installer/config.go`, install scripts |

These are already set to their correct production values. If you forked the project or use different domains, update them accordingly.

---

## 11. First Deployment

### Deploy website (push to master)

```bash
git add .
git commit -m "Initial platform setup"
git push auto-coursera master
```

If GitHub integration is configured for Pages, this triggers a website build and deploy.

### Trigger full release (push a tag)

```bash
# Build the extension first
cd extension && pnpm build && cd ..

# Tag and push
git tag v1.8.0
git push auto-coursera v1.8.0
```

This triggers the full CI/CD pipeline:

1. `build-extension` — packages CRX, generates checksums
2. `build-installers` — compiles Go binaries for all platforms, generates checksums
3. `create-release` — uploads all artifacts to GitHub Releases
4. `deploy-website` — rebuilds and deploys Cloudflare Pages
5. `deploy-worker` — deploys the Workers API

---

## 12. Verification

After deployment completes, verify each component:

### Website

```bash
curl -s -o /dev/null -w "%{http_code}" https://autocr.nicx.me/
# Expected: 200
```

### API

```bash
curl -s https://autocr-api.nicx.me/api/latest-version | jq .
# Expected: { "version": "1.8.0", "extensionId": "...", ... }

curl -s https://autocr-api.nicx.me/api/releases | jq .
# Expected: { "releases": [...] }

curl -s https://autocr-api.nicx.me/api/stats | jq .
# Expected: { "totalReleases": 1, "latestVersion": "1.8.0", ... }
```

### Extension files (CDN)

```bash
curl -I https://autocr-cdn.nicx.me/updates.xml
# Expected: 200, Content-Type: application/xml (dynamically generated by Worker)

curl -sI https://autocr-cdn.nicx.me/releases/auto_coursera_1.8.0.crx
# Expected: 302, Location: https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx
```

### Installer downloads

```bash
curl -sI https://autocr-api.nicx.me/api/download/linux
# Expected: 302, Location: https://github.com/NICxKMS/auto-coursera/releases/download/v.../installer-linux-amd64

curl -sI https://autocr-api.nicx.me/api/download/windows
# Expected: 302, Location: https://github.com/NICxKMS/auto-coursera/releases/download/v.../installer-windows-amd64.exe

curl -sI https://autocr-api.nicx.me/api/download/macos
# Expected: 302, Location: https://github.com/NICxKMS/auto-coursera/releases/download/v.../installer-macos-arm64
```

### Install scripts

```bash
curl -s https://autocr.nicx.me/scripts/install.sh | head -5
# Expected: #!/usr/bin/env bash ...

curl -s https://autocr.nicx.me/scripts/install.ps1 | head -5
# Expected: <# .SYNOPSIS ...
```

### Browser policy (end-to-end)

After running the installer or a script on a test machine:

1. Open the browser
2. Navigate to `chrome://policy` (or `edge://policy`, `brave://policy`)
3. Look for `ExtensionInstallForcelist` in the policy list
4. Verify the value matches `<your-extension-id>;https://autocr-cdn.nicx.me/updates.xml`
5. Navigate to `chrome://extensions`
6. The extension should appear as installed (may require a browser restart)

---

### Troubleshooting first deployment

If something fails, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues. The most frequent first-deployment problems:

- **GitHub Actions fails** — secrets not set or token permissions insufficient
- **updates.xml 404** — Worker not deployed yet or CDN route not configured
- **API CORS error** — `ALLOWED_ORIGIN` in `wrangler.toml` doesn't match actual website domain

# Troubleshooting

> Solutions for common issues with the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Extension not appearing after install](#1-extension-not-appearing-after-install)
- [CRX download fails](#2-crx-download-fails)
- [updates.xml returns 404 or wrong content](#3-updatesxml-returns-404-or-wrong-content)
- [CORS errors on API](#4-cors-errors-on-api)
- [Worker deployment fails](#5-worker-deployment-fails)
- [GitHub API rate limited or unreachable](#6-github-api-rate-limited-or-unreachable)
- [GitHub Actions fails](#7-github-actions-fails)
- [Extension ID mismatch](#8-extension-id-mismatch)
- [Browser not reading policy](#9-browser-not-reading-policy)
- [PowerShell execution policy blocking script](#10-powershell-execution-policy-blocking-script)
- [Linux script needs root](#11-linux-script-needs-root)
- [macOS installer not signed warning](#12-macos-installer-not-signed-warning)
- [Go installer build fails](#13-go-installer-build-fails)
- [Website build fails](#14-website-build-fails)

---

## 1. Extension not appearing after install

### Symptom

You ran the installer or script successfully (all green "OK" messages), but the extension does not appear in the browser's extension list.

### Cause

Browsers read policies on startup. If the browser was running when the policy was written, it has not picked up the change yet. Alternatively, the browser has read the policy but has not yet downloaded the CRX from `updates.xml`.

### Fix

**Step 1: Restart the browser completely.**

Close all browser windows and background processes:

- **Windows**: Check Task Manager (Ctrl+Shift+Esc) for lingering Chrome/Edge/Brave processes. End them, then reopen the browser.
- **Linux**: `killall google-chrome` (or `microsoft-edge`, `brave-browser`), then reopen.
- **macOS**: Cmd+Q the browser, wait a moment, reopen.

**Step 2: Verify the policy is active.**

Open the browser and navigate to:

| Browser | URL |
|---|---|
| Chrome | `chrome://policy` |
| Edge | `edge://policy` |
| Brave | `brave://policy` |
| Chromium | `chrome://policy` |

Look for `ExtensionInstallForcelist` in the policy table. Its value should be:

```
alojpdnpiddmekflpagdblmaehbdfcge;https://autocr-cdn.nicx.me/updates.xml
```

If the policy does not appear, see issue [#9: Browser not reading policy](#9-browser-not-reading-policy).

**Step 3: Check the extensions page.**

Navigate to `chrome://extensions` (or the browser's equivalent). If the extension appears but is disabled or has errors, check for:

- "Download error" — the browser could not reach `autocr-cdn.nicx.me` (see issue [#2](#2-crx-download-fails))
- "CRX verification failed" — the CRX was signed with a different key than the extension ID in the policy (see issue [#8](#8-extension-id-mismatch))

**Step 4: Wait.**

After the policy is confirmed active, the browser may take a few minutes to fetch `updates.xml` and download the CRX. Force the check by navigating to `chrome://extensions`, enabling **Developer mode**, and clicking **Update**.

### Verify

- `chrome://extensions` shows "Auto-Coursera Assistant" as installed and enabled
- `chrome://policy` shows the policy with status "OK"

---

## 2. CRX download fails

### Symptom

The browser shows the extension in `chrome://extensions` with a "Download error" or "Update failed" message. Or, manually fetching the CRX URL returns an error.

### Cause

The CRX file is not accessible at the URL specified in `updates.xml`. In the current architecture, `autocr-cdn.nicx.me/releases/*.crx` is served by the Cloudflare Worker, which returns a **302 redirect** to GitHub Releases. Possible reasons:

- The CRX asset was not uploaded to the GitHub Release
- The GitHub Release tag does not exist
- The GitHub repository is private or inaccessible
- The Worker is not deployed or the CDN route is misconfigured
- DNS for `autocr-cdn.nicx.me` has not propagated

### Fix

**Step 1: Check if the CRX file exists on GitHub Releases.**

```bash
# List assets for the latest release
gh release view --repo NICxKMS/auto-coursera --json assets \
  --jq '.assets[].name' | grep '.crx'

# Or check a specific version
gh release view v1.8.0 --repo NICxKMS/auto-coursera --json assets \
  --jq '.assets[].name'
```

If `gh` CLI is not installed, check manually at:

```
https://github.com/NICxKMS/auto-coursera/releases
```

You should see files like `auto_coursera_1.8.0.crx` and `auto_coursera_1.8.0.crx.sha256` attached to the release.

**Step 2: Test the CDN redirect chain.**

The Worker redirects `/releases/*.crx` to GitHub Releases via 302:

```bash
# Check the redirect (should return 302 → GitHub)
curl -sI https://autocr-cdn.nicx.me/releases/auto_coursera_1.8.0.crx
```

Expected:

```
HTTP/2 302
location: https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx
cache-control: public, max-age=86400
```

If you get:

- **404 Not Found** — the filename does not match the expected pattern (`auto_coursera_X.Y.Z.crx`)
- **DNS resolution error** — the Worker route or DNS record is misconfigured (see [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md#4-dns-configuration))
- **SSL error** — certificate not provisioned yet (wait a few minutes)

**Step 3: Verify the final GitHub download works.**

```bash
# Follow the redirect and download
curl -sIL https://autocr-cdn.nicx.me/releases/auto_coursera_1.8.0.crx | head -10
```

If the redirect succeeds but the GitHub URL returns 404, the asset was not uploaded to the release. Re-run the CI pipeline or upload manually:

```bash
gh release upload v1.8.0 auto_coursera_1.8.0.crx \
  --repo NICxKMS/auto-coursera
```

**Step 4: Check updates.xml points to the correct version and URL.**

```bash
curl -s https://autocr-cdn.nicx.me/updates.xml
```

The `codebase` attribute should point to a GitHub Releases URL.

### Verify

```bash
# Full chain: CDN → 302 → GitHub → 200
curl -sIL https://autocr-cdn.nicx.me/releases/auto_coursera_1.8.0.crx | grep -E "^HTTP|^location"
# HTTP/2 302
# location: https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx
# HTTP/2 200
```

---

## 3. updates.xml returns 404 or wrong content

### Symptom

Fetching `https://autocr-cdn.nicx.me/updates.xml` returns 404, an error page, or XML with incorrect content. The browser cannot discover extension updates.

### Cause

The `updates.xml` endpoint is **dynamically generated** by the Cloudflare Worker using environment variables (`EXTENSION_ID`, `CURRENT_VERSION`, `GITHUB_REPO`). It is not a static file. Possible reasons:

- The Worker is not deployed to the production environment
- The CDN domain route (`autocr-cdn.nicx.me/*`) is not configured in `wrangler.toml`
- The `CURRENT_VERSION` or `EXTENSION_ID` environment variables are wrong
- DNS for `autocr-cdn.nicx.me` does not point to the Worker

### Fix

**Step 1: Check if the Worker is deployed and the CDN route is active.**

```bash
wrangler deployments list --env production
```

Confirm the latest deployment is recent and successful. Then verify the route exists:

```bash
# Check wrangler.toml for the CDN route
grep -A2 'routes' workers/wrangler.toml
```

Expected:

```toml
[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

Both domains must be listed. If the CDN route is missing, add it and redeploy.

**Step 2: Verify the Worker environment variables.**

The Worker generates `updates.xml` from these `Env` values:

| Variable | Purpose | Example |
|---|---|---|
| `CURRENT_VERSION` | Version in the `<updatecheck>` tag | `1.8.0` |
| `EXTENSION_ID` | The `appid` in the `<app>` tag | `alojpdnpiddmekflpagdblmaehbdfcge` |
| `GITHUB_REPO` | Used to build the GitHub Releases codebase URL | `NICxKMS/auto-coursera` |

Check values:

```bash
grep -E 'CURRENT_VERSION|EXTENSION_ID|GITHUB_REPO' workers/wrangler.toml
```

If `CURRENT_VERSION` does not match the latest release, update it and redeploy:

```bash
cd workers
# Edit wrangler.toml with the correct version
wrangler deploy --env production
```

**Step 3: Test the endpoint directly.**

```bash
curl -s https://autocr-cdn.nicx.me/updates.xml
```

Expected output:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="alojpdnpiddmekflpagdblmaehbdfcge">
    <updatecheck codebase="https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx" version="1.8.0"/>
  </app>
</gupdate>
```

Key things to verify:

- `appid` matches the extension ID derived from the signing key
- `codebase` points to a GitHub Releases download URL (not an R2 URL)
- `version` matches the latest release

**Step 4: If using CI/CD, check the deploy-worker job.**

The `deploy.yml` workflow deploys the Worker after the GitHub Release is created. Verify:

1. The `deploy-worker` job ran successfully
2. `CURRENT_VERSION` in `wrangler.toml` was bumped before tagging

### Verify

```bash
curl -s https://autocr-cdn.nicx.me/updates.xml | grep -oP 'version="\K[^"]+'
# Should return the current version, e.g., 1.8.0
```

---

## 4. CORS errors on API

### Symptom

The website shows errors in the browser console like:

```
Access to fetch at 'https://autocr-api.nicx.me/api/latest-version' from origin
'https://autocr.nicx.me' has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Cause

The Workers API is not returning the correct CORS headers for the website's origin. Possible reasons:

- `ALLOWED_ORIGIN` in `wrangler.toml` does not match the actual website URL
- The Worker was deployed without the production environment (missing env vars)
- The Worker code has a bug in CORS handling

### Fix

**Step 1: Check `ALLOWED_ORIGIN` in `wrangler.toml`.**

```toml
[vars]
ALLOWED_ORIGIN = "https://autocr.nicx.me"
```

The value must exactly match the website origin — including the `https://` scheme and no trailing slash.

**Step 2: Verify the Worker returns CORS headers.**

```bash
curl -sI -H "Origin: https://autocr.nicx.me" \
  https://autocr-api.nicx.me/api/latest-version
```

The response should include:

```
Access-Control-Allow-Origin: https://autocr.nicx.me
Access-Control-Allow-Methods: GET, OPTIONS
```

If these headers are missing, the Worker is not applying CORS correctly.

**Step 3: Test the OPTIONS preflight.**

```bash
curl -sI -X OPTIONS \
  -H "Origin: https://autocr.nicx.me" \
  -H "Access-Control-Request-Method: GET" \
  https://autocr-api.nicx.me/api/latest-version
```

Should return `204 No Content` with CORS headers.

**Step 4: Redeploy with correct configuration.**

```bash
cd workers
wrangler deploy --env production
```

### Verify

Open the website in a browser, open DevTools (F12) → Network tab, and confirm API requests succeed without CORS errors.

---

## 5. Worker deployment fails

### Symptom

Running `wrangler deploy` fails with an error. Common error messages:

- `Authentication error` or `Code: 10000`
- `Could not route to ... no zone found`
- TypeScript compilation errors

### Cause

| Error | Cause |
|---|---|
| Authentication error | Invalid or missing API token. Wrangler is not logged in. |
| No zone found | The `zone_name` in the route configuration does not match your Cloudflare zone |
| TypeScript errors | Source code issue — check the specific file and line |

### Fix

**Authentication error:**

```bash
# Re-login
wrangler login

# Or use an API token directly
export CLOUDFLARE_API_TOKEN="your-token-here"
wrangler deploy
```

**No zone found:**

Check the `zone_name` in `workers/wrangler.toml`:

```toml
[env.production]
routes = [
  { pattern = "autocr-api.nicx.me/*", zone_name = "nicx.me" },
  { pattern = "autocr-cdn.nicx.me/*", zone_name = "nicx.me" }
]
```

The `zone_name` must match the domain added to your Cloudflare account. Verify the domain is active in Cloudflare Dashboard → **Websites**. Both `autocr-api.nicx.me` and `autocr-cdn.nicx.me` routes must be present for dual-domain routing.

**Check Worker environment variables:**

The Worker requires these variables in `wrangler.toml`:

```toml
[vars]
EXTENSION_ID = "alojpdnpiddmekflpagdblmaehbdfcge"
CURRENT_VERSION = "1.8.0"
ALLOWED_ORIGIN = "https://autocr.nicx.me"
CDN_BASE_URL = "https://autocr-cdn.nicx.me"
GITHUB_REPO = "NICxKMS/auto-coursera"
```

If any are missing, the Worker compiles but routes fail at runtime.

### Verify

```bash
wrangler deploy --env production --dry-run
# Should show no errors

wrangler deploy --env production
# Should deploy successfully
```

---

## 6. GitHub API rate limited or unreachable

### Symptom

The `/api/releases` or `/api/stats` endpoints return `500 Internal server error`. Worker logs show:

```
GitHub API error: 403 Forbidden
```

Or:

```
GitHub API error: 403 rate limit exceeded
```

### Cause

The Worker queries the GitHub Releases API (unauthenticated) to list releases and compute statistics. GitHub allows **60 unauthenticated requests per hour per IP**. The Worker uses the Cloudflare Cache API with a 5-minute TTL to reduce calls, so each edge location makes ≤12 calls/hour.

This issue typically occurs when:

- Many Cloudflare edge locations simultaneously cache-miss (e.g., after a deployment purge)
- A new Worker deployment clears the cache across all edges
- The GitHub repository is private (unauthenticated API returns 404, not 403)

### Fix

**Step 1: Confirm the issue is rate limiting.**

```bash
curl -sI https://api.github.com/repos/NICxKMS/auto-coursera/releases | \
  grep -iE "x-ratelimit|status"
```

Check:

- `x-ratelimit-remaining: 0` — rate limited, wait for `x-ratelimit-reset`
- `status: 404` — repository is private or does not exist

**Step 2: Verify the repository is public.**

Navigate to `https://github.com/NICxKMS/auto-coursera`. If the page returns 404, the repo is private. The GitHub API requires the repo to be public for unauthenticated access.

**Step 3: Check Worker cache behavior.**

The cache is managed by `workers/src/utils/github.ts` with a 5-minute TTL. After a fresh deploy, caches across edge locations are cold and all miss simultaneously. This is expected and resolves within minutes.

**Step 4: Verify the `GITHUB_REPO` env var is correct.**

```bash
grep GITHUB_REPO workers/wrangler.toml
# GITHUB_REPO = "NICxKMS/auto-coursera"
```

A wrong value (e.g., `nicx/auto-coursera` instead of `NICxKMS/auto-coursera`) causes 404 responses from GitHub.

**Step 5: Wait and retry.**

Rate limits reset hourly. The 5-minute Cloudflare cache TTL means the issue self-resolves quickly once a single request succeeds.

### Verify

```bash
curl -s https://autocr-api.nicx.me/api/releases | head -20
# Should return JSON with a "releases" array

curl -s https://autocr-api.nicx.me/api/stats
# Should return JSON with release statistics
```

---

## 7. GitHub Actions fails

### Symptom

A GitHub Actions workflow run shows ❌ failure. Common failures: secrets not set, permissions errors, build failures.

### Cause

Multiple potential causes. Check the workflow logs for the specific error.

### Fix

**Missing secrets:**

1. Go to **GitHub** → **Settings** → **Secrets and variables** → **Actions**
2. Verify all required secrets exist:
   - `CF_ACCOUNT_ID` — Cloudflare account ID
   - `CF_API_TOKEN` — Cloudflare API token
   - `EXTENSION_PRIVATE_KEY` — PEM content of the CRX signing key
   - `EXTENSION_ID` — 32-character extension ID
3. Secrets are case-sensitive. Check for typos.
4. If a secret value contains special characters, ensure it was pasted correctly — GitHub trims trailing whitespace.

**API token permissions insufficient:**

The `CF_API_TOKEN` needs these permissions:

- Account → Cloudflare Pages → Edit
- Account → Workers Scripts → Edit

If the token lacks any permission, the corresponding step fails. Create a new token with all permissions (see [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md#8-api-token-permissions)).

**GitHub Release creation fails:**

The `create-release` job in `deploy.yml` uses `softprops/action-gh-release@v2` to upload all assets (CRX, checksums, installers) to a GitHub Release. This requires:

- `contents: write` permission on the workflow
- The tag must follow the `v*` pattern (e.g., `v1.8.0`)
- No existing release with the same tag (or use `--clobber` to overwrite)

**Extension private key format:**

The `EXTENSION_PRIVATE_KEY` secret must contain the **full PEM file content**, including:

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkq...
-----END PRIVATE KEY-----
```

If the `-----BEGIN` or `-----END` lines are missing, signing fails. Re-copy the full content from `cat extension-key.pem`.

**CRX build fails — `crx3` not found:**

The CI workflow needs `crx3` installed. Ensure the step includes:

```bash
npx crx3 --help  # or: pnpm install in extension/ directory
```

**Go build fails:**

Ensure the workflow uses Go 1.22+ and runs `go mod download` in the `installer/` directory.

### Verify

After fixing, re-run the failed workflow from GitHub Actions → select run → **Re-run all jobs**.

---

## 8. Extension ID mismatch

### Symptom

The browser downloads the CRX but fails to install it. `chrome://extensions` shows "CRX_REQUIRED_PROOF_MISSING" or "CRX verification failed". Or the extension ID in the policy does not match the actual extension ID.

### Cause

The extension ID configured in the policy (registry, JSON file, or plist) does not match the ID derived from the CRX's signing key. This happens when:

- The `alojpdnpiddmekflpagdblmaehbdfcge` was not replaced consistently across all files
- A different key was used for signing than the one the ID was derived from
- The key was regenerated, changing the ID, but not all references were updated

### Fix

**Step 1: Determine the correct extension ID from the key.**

```bash
bash scripts/derive-extension-id.sh extension-key.pem
```

**Step 2: Check what ID is in the policy.**

- **Windows**: Open Registry Editor → navigate to `HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` → check the value
- **Linux**: `cat /etc/opt/chrome/policies/managed/auto_coursera*.json`
- **macOS**: `defaults read com.google.Chrome ExtensionInstallForcelist`

**Step 3: Check what ID is in updates.xml (dynamically generated by the Worker).**

```bash
curl -s https://autocr-cdn.nicx.me/updates.xml | grep appid
```

This value comes from the `EXTENSION_ID` variable in `wrangler.toml`.

**Step 4: Check what ID is in wrangler.toml and the install scripts.**

```bash
grep -rn "EXTENSION_ID" workers/wrangler.toml installer/config.go \
  website/public/scripts/install.ps1 website/public/scripts/install.sh \
  website/public/scripts/install-mac.sh
```

**Step 5: If IDs don't match, update them all.**

All of the above must contain the same 32-character extension ID. The recommended approach is to update `version.json` and run the sync script:

```bash
# Update extensionId in version.json, then propagate everywhere
bash scripts/sync-constants.sh
```

For the full manual procedure, see [SETUP.md](./SETUP.md).

### Verify

```bash
# All should return the same ID
bash scripts/derive-extension-id.sh extension-key.pem
curl -s https://autocr-cdn.nicx.me/updates.xml | grep -oP 'appid="\K[^"]+'
grep EXTENSION_ID workers/wrangler.toml | head -1
```

---

## 9. Browser not reading policy

### Symptom

The policy was written (installer/script reported success), but `chrome://policy` shows no `ExtensionInstallForcelist` entry, or the entry is missing the extension.

### Cause

The policy file or registry key exists but is not being read by the browser. Common reasons per platform:

### Windows

- The registry key is under `HKCU` instead of `HKLM` (user-level vs. machine-level — the installer uses HKLM)
- The browser was not restarted after writing the policy
- Group Policy override: a domain GPO might be clearing local policies

**Fix:**

```powershell
# Verify the registry key exists
Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"

# Check if the value is there
Get-ChildItem -Path "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
```

### Linux

- Policy file has incorrect permissions (must be readable by the browser user)
- Policy file has invalid JSON
- Policy file is in the wrong directory

**Fix:**

```bash
# Check file exists
ls -la /etc/opt/chrome/policies/managed/

# Check permissions (should be 644)
stat -c "%a %U:%G %n" /etc/opt/chrome/policies/managed/auto_coursera*.json

# Fix permissions if needed
sudo chmod 644 /etc/opt/chrome/policies/managed/auto_coursera*.json

# Validate JSON
cat /etc/opt/chrome/policies/managed/auto_coursera*.json | python3 -m json.tool
```

If JSON validation fails, the file is malformed. Regenerate it:

```bash
sudo bash -c 'cat > /etc/opt/chrome/policies/managed/auto_coursera.json << EOF
{
    "ExtensionInstallForcelist": [
        "YOUR_EXTENSION_ID;https://autocr-cdn.nicx.me/updates.xml"
    ]
}
EOF'
sudo chmod 644 /etc/opt/chrome/policies/managed/auto_coursera.json
```

### macOS

- The `defaults write` command succeeded but the browser caches the plist
- The plist domain name is wrong

**Fix:**

```bash
# Verify the plist value
defaults read com.google.Chrome ExtensionInstallForcelist

# If it returns an error ("does not exist"), the write failed
# Re-write it:
defaults write com.google.Chrome ExtensionInstallForcelist -array \
  "YOUR_EXTENSION_ID;https://autocr-cdn.nicx.me/updates.xml"

# Force macOS to re-read preferences
killall cfprefsd 2>/dev/null
```

### Verify

Restart the browser, then navigate to `chrome://policy`. The `ExtensionInstallForcelist` policy should appear with status "OK".

---

## 10. PowerShell execution policy blocking script

### Symptom

Running the install script on Windows fails with:

```
install.ps1 cannot be loaded because running scripts is disabled on this system.
```

### Cause

Windows PowerShell's execution policy defaults to `Restricted` on some systems, which prevents running any `.ps1` scripts.

### Fix

**Option 1: Bypass for this session only (recommended for one-liners)**

The `irm | iex` pattern (Invoke-RestMethod piped to Invoke-Expression) avoids execution policy because it evaluates the script as an expression — it does not run a `.ps1` file. If users are running this way, this error should not occur.

If running the script as a file:

```powershell
# Allow scripts for this PowerShell session only
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process

# Then run the script
.\install.ps1
```

**Option 2: Bypass on the command line**

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

**Option 3: Set policy permanently (requires admin)**

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
```

### Verify

```powershell
Get-ExecutionPolicy
# Should return "RemoteSigned" or "Bypass" or "Unrestricted"
```

---

## 11. Linux script needs root

### Symptom

Running the install script fails with:

```
[ERR]  This script must be run as root. Use: sudo ./install.sh
```

### Cause

On Linux, managed browser policies live under `/etc/`, which is owned by root. Writing files to `/etc/opt/chrome/policies/managed/` requires root privileges.

### Fix

Run with `sudo`:

```bash
# One-liner install
curl -fsSL https://autocr.nicx.me/scripts/install.sh | sudo bash

# If already downloaded
sudo bash install.sh

# With arguments
sudo bash install.sh chrome
sudo bash install.sh --uninstall
```

**Why does it need root?**

The policy directories (`/etc/opt/chrome/policies/managed/`, etc.) do not exist by default and must be created with proper ownership (root:root). The JSON policy files must be readable by the browser (permissions `644`), but only root can write to `/etc/`.

**MacOS note:** The `install-mac.sh` script does **not** require root. It uses `defaults write`, which writes to the current user's `~/Library/Preferences/` — no elevated privileges needed.

### Verify

```bash
ls -la /etc/opt/chrome/policies/managed/
# Should show files owned by root:root with permissions 644
```

---

## 12. macOS installer not signed warning

### Symptom

When running the native Go installer on macOS, Gatekeeper shows:

> "installer-macos-arm64" can't be opened because Apple cannot check it for malicious software.

Or:

> "installer-macos-arm64" is from an unidentified developer.

### Cause

The Go installer binary is not signed with an Apple Developer certificate. macOS Gatekeeper blocks unsigned binaries downloaded from the internet by default.

### Fix

**Option 1: Use the terminal script instead**

The `install-mac.sh` script does not trigger Gatekeeper because `curl | bash` executes it as a shell command, not as a signed binary:

```bash
curl -fsSL https://autocr.nicx.me/scripts/install-mac.sh | bash
```

**Option 2: Remove the quarantine attribute**

```bash
# Remove the quarantine flag that macOS applies to downloaded files
xattr -d com.apple.quarantine ./installer-macos-arm64

# Make it executable
chmod +x ./installer-macos-arm64

# Run it
./installer-macos-arm64
```

**Option 3: Allow in System Settings**

1. Try to open the installer (it will be blocked)
2. Go to **System Settings** → **Privacy & Security**
3. Scroll down — a message about the blocked app appears
4. Click **Open Anyway**
5. Confirm in the dialog

**Option 4: Sign with an Apple Developer certificate (for production)**

If you have a paid Apple Developer account ($99/year):

```bash
# Sign the binary
codesign --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --options runtime \
  installer-macos-arm64

# Notarize with Apple
xcrun notarytool submit installer-macos-arm64 \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password" \
  --wait

# Staple the notarization ticket
xcrun stapler staple installer-macos-arm64
```

### Verify

The installer runs without Gatekeeper warnings.

---

## 13. Go installer build fails

### Symptom

Running `make build-all` in the `installer/` directory fails with a compilation error.

### Cause

| Error | Cause |
|---|---|
| `go: go.mod requires go >= 1.22` | Go version too old. Install Go 1.22+. |
| `cannot find module providing package golang.org/x/sys/...` | Dependencies not downloaded |
| `build constraints exclude all Go files` | Cross-compiling to an OS that has build tags not matching the current GOOS |
| Syntax errors | Go code issue — check the specific file and line |

### Fix

**Check Go version:**

```bash
go version
# Should be go1.22.x or later
```

If older, update Go from [go.dev/dl](https://go.dev/dl/).

**Download dependencies:**

```bash
cd installer
go mod download
go mod verify
```

**Cross-compilation note:**

The Makefile uses `CGO_ENABLED=0` for all cross-compilation targets, which avoids C compiler requirements. All targets should build from any OS.

**Test a single build:**

```bash
cd installer
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /tmp/test-installer .
echo $?  # Should be 0
```

If a specific platform fails, check the build-tag-constrained files:

- `policy_windows.go` — `//go:build windows`
- `policy_linux.go` — `//go:build linux`
- `policy_macos.go` — `//go:build darwin`
- `detect_windows.go` — `//go:build windows`
- `detect_unix.go` — `//go:build linux || darwin`

These files are only included in builds targeting their respective OS. The Go compiler selects the correct files automatically based on `GOOS`.

### Verify

```bash
cd installer
make clean && make build-all
ls -la dist/
# Should list all 5 binaries
```

---

## 14. Website build fails

### Symptom

Running the website build (`cd website && pnpm build`) fails.

### Cause

| Error | Cause |
|---|---|
| `pnpm: command not found` | pnpm not installed |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Lockfile out of date, run `pnpm install` first |
| `Cannot find module 'astro'` | Dependencies not installed |
| Node.js version errors | Node.js version < 20 |
| `@astrojs/cloudflare` compatibility error | Astro/adapter version mismatch |

### Fix

**Check Node.js version:**

```bash
node --version
# Must be v20.x.x or later
```

**Install dependencies:**

```bash
cd website
pnpm install
```

**Build:**

```bash
pnpm build
```

**Clear cache if build is corrupted:**

```bash
rm -rf website/node_modules website/.astro
cd website
pnpm install
pnpm build
```

**Check for Astro compatibility:**

If the Astro version in `package.json` is incompatible with the Cloudflare adapter:

```bash
cd website
pnpm update astro @astrojs/cloudflare @astrojs/tailwind
pnpm build
```

**Cloudflare Pages build environment:**

When deploying via Pages, set environment variables:

| Variable | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `PNPM_VERSION` | `9` |

These ensure the Pages build environment uses the correct tool versions.

### Verify

```bash
cd website
pnpm build
ls dist/
# Should contain index.html and other built files
```

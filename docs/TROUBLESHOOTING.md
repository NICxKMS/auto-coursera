# Troubleshooting

> Solutions for common issues with the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Extension not appearing after install](#1-extension-not-appearing-after-install)
- [CRX download fails](#2-crx-download-fails)
- [updates.xml returns 404](#3-updatesxml-returns-404)
- [CORS errors on API](#4-cors-errors-on-api)
- [Worker deployment fails](#5-worker-deployment-fails)
- [R2 access denied](#6-r2-access-denied)
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
alojpdnpiddmekflpagdblmaehbdfcge;https://cdn.autocr.nicx.me/updates.xml
```

If the policy does not appear, see issue [#9: Browser not reading policy](#9-browser-not-reading-policy).

**Step 3: Check the extensions page.**

Navigate to `chrome://extensions` (or the browser's equivalent). If the extension appears but is disabled or has errors, check for:

- "Download error" — the browser could not reach `cdn.autocr.nicx.me` (see issue [#2](#2-crx-download-fails))
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

The CRX file is not accessible at the URL specified in `updates.xml`. Possible reasons:

- The `extensions-bucket` R2 bucket does not contain the CRX file
- The custom domain `cdn.autocr.nicx.me` is not configured
- DNS has not propagated
- SSL certificate is not provisioned

### Fix

**Step 1: Check if the CRX file exists in R2.**

```bash
wrangler r2 object list extensions-bucket --prefix releases/
```

You should see files like `releases/auto_coursera_1.7.5.crx`.

**Step 2: Check the custom domain.**

```bash
curl -I https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx
```

Expected: `200 OK` with the file. If you get:

- **404 Not Found** — the file path is wrong or the file does not exist in the bucket
- **403 Forbidden** — custom domain is not properly connected to the bucket
- **DNS resolution error** — the CNAME record is missing or not propagated
- **SSL error** — certificate not provisioned yet (wait a few minutes)

**Step 3: Verify the CORS configuration.**

```bash
curl -I -H "Origin: https://autocr.nicx.me" \
  https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx
```

CORS headers should be present if configured (see [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md#4-r2-cors-configuration)).

**Step 4: Check updates.xml URL is correct.**

```bash
curl https://cdn.autocr.nicx.me/updates.xml
```

Verify the `codebase` attribute points to the correct CRX URL and version.

### Verify

```bash
curl -sI https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx | head -5
# HTTP/2 200
# content-type: application/octet-stream
```

---

## 3. updates.xml returns 404

### Symptom

Fetching `https://cdn.autocr.nicx.me/updates.xml` returns 404. The browser cannot discover extension updates.

### Cause

The `updates.xml` file has not been uploaded to the R2 bucket, or it was uploaded to the wrong path.

### Fix

**Step 1: Check if updates.xml exists in R2.**

```bash
wrangler r2 object list extensions-bucket --prefix updates
```

The file should be at the bucket root: `updates.xml` (not `releases/updates.xml` or any other path).

**Step 2: Generate and upload manually (if missing).**

```bash
bash scripts/generate-updates-xml.sh \
  -i YOUR_EXTENSION_ID \
  -v 1.7.5 \
  -u https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx \
  -o /tmp/updates.xml

# Upload to bucket root
wrangler r2 object put extensions-bucket/updates.xml --file /tmp/updates.xml \
  --content-type "application/xml"
```

**Step 3: Verify the custom domain resolves.**

```bash
curl https://cdn.autocr.nicx.me/updates.xml
```

Should return valid XML with the extension ID and version.

**Step 4: If using CI/CD, check the build logs.**

The `build-extension` workflow should upload `updates.xml` after building the CRX. Verify the workflow ran successfully and the upload step completed.

### Verify

```bash
curl -s https://cdn.autocr.nicx.me/updates.xml
```

Expected output:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="your-extension-id-here">
    <updatecheck codebase="https://cdn.autocr.nicx.me/releases/auto_coursera_1.7.5.crx" version="1.7.5"/>
  </app>
</gupdate>
```

---

## 4. CORS errors on API

### Symptom

The website shows errors in the browser console like:

```
Access to fetch at 'https://api.autocr.nicx.me/api/latest-version' from origin
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
  https://api.autocr.nicx.me/api/latest-version
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
  https://api.autocr.nicx.me/api/latest-version
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
- `R2 bucket not found`
- `Could not route to ... no zone found`

### Cause

| Error | Cause |
|---|---|
| Authentication error | Invalid or missing API token. Wrangler is not logged in. |
| R2 bucket not found | The bucket name in `wrangler.toml` does not match an existing bucket |
| No zone found | The `zone_name` in the route configuration does not match your Cloudflare zone |

### Fix

**Authentication error:**

```bash
# Re-login
wrangler login

# Or use an API token directly
export CLOUDFLARE_API_TOKEN="your-token-here"
wrangler deploy
```

**R2 bucket not found:**

```bash
# List existing buckets
wrangler r2 bucket list

# Check wrangler.toml bucket names match
grep bucket_name workers/wrangler.toml
```

Ensure the `bucket_name` values in `wrangler.toml` exactly match the R2 bucket names.

**No zone found:**

Check the `zone_name` in `workers/wrangler.toml`:

```toml
[env.production]
routes = [
  { pattern = "api.autocr.nicx.me/*", zone_name = "nicx.me" }
]
```

The `zone_name` must match the domain added to your Cloudflare account. Verify the domain is active in Cloudflare Dashboard → **Websites**.

### Verify

```bash
wrangler deploy --env production --dry-run
# Should show no errors

wrangler deploy --env production
# Should deploy successfully
```

---

## 6. R2 access denied

### Symptom

Accessing `https://cdn.autocr.nicx.me/updates.xml` returns `403 Forbidden` or an access denied XML error.

### Cause

- The R2 bucket's custom domain is not properly configured
- The SSL certificate for the custom domain is still provisioning
- Cloudflare proxy is not enabled for the DNS record

### Fix

**Step 1: Check R2 custom domain status.**

Go to **R2** → **extensions-bucket** → **Settings** → **Custom domains**. The status should be **Active**.

If the status is "Initializing" or "Pending", wait a few minutes.

**Step 2: Check DNS record.**

Go to **DNS** → **Records** and find the CNAME for `extensions`. Ensure:

- The record exists
- The **Proxy status** is "Proxied" (orange cloud ☁️)
- The target is the R2-generated value (not manually set to an IP)

**Step 3: Check SSL.**

```bash
curl -vI https://cdn.autocr.nicx.me/ 2>&1 | grep "SSL certificate"
```

If there is an SSL error, the certificate may not be provisioned yet. Edge Certificates in **SSL/TLS** → **Edge Certificates** should show the certificate.

**Step 4: Upload a test file and retry.**

```bash
echo "test" | wrangler r2 object put extensions-bucket/test.txt --pipe
curl https://cdn.autocr.nicx.me/test.txt
wrangler r2 object delete extensions-bucket/test.txt
```

### Verify

```bash
curl -s https://cdn.autocr.nicx.me/updates.xml | head -3
# Should return XML content, not an error page
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
2. Verify all four secrets exist:
   - `CF_ACCOUNT_ID`
   - `CF_API_TOKEN`
   - `EXTENSION_PRIVATE_KEY`
   - `EXTENSION_ID`
3. Secrets are case-sensitive. Check for typos.
4. If a secret value contains special characters, ensure it was pasted correctly — GitHub trims trailing whitespace.

**API token permissions insufficient:**

The `CF_API_TOKEN` needs these permissions:

- Account → Cloudflare Pages → Edit
- Account → Workers R2 Storage → Edit
- Account → Workers Scripts → Edit

If the token lacks any permission, the corresponding step fails. Create a new token with all permissions (see [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md#11-api-token-permissions)).

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

**Step 3: Check what ID is in updates.xml.**

```bash
curl -s https://cdn.autocr.nicx.me/updates.xml | grep appid
```

**Step 4: Check what ID is in wrangler.toml and the install scripts.**

```bash
grep -rn "EXTENSION_ID" workers/wrangler.toml installer/config.go \
  website/public/scripts/install.ps1 website/public/scripts/install.sh \
  website/public/scripts/install-mac.sh
```

**Step 5: If IDs don't match, update them all.**

All of the above must contain the same 32-character extension ID. See [SETUP.md step 4](./SETUP.md#4-configure-extension-id) for the full replacement procedure.

### Verify

```bash
# All should return the same ID
bash scripts/derive-extension-id.sh extension-key.pem
curl -s https://cdn.autocr.nicx.me/updates.xml | grep -oP 'appid="\K[^"]+'
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
sudo bash -c 'cat > /etc/opt/chrome/policies/managed/auto_coursera_policy.json << EOF
{
    "ExtensionInstallForcelist": [
        "YOUR_EXTENSION_ID;https://cdn.autocr.nicx.me/updates.xml"
    ]
}
EOF'
sudo chmod 644 /etc/opt/chrome/policies/managed/auto_coursera_policy.json
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
  "YOUR_EXTENSION_ID;https://cdn.autocr.nicx.me/updates.xml"

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

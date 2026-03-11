# Troubleshooting

> Solutions for common issues with the Auto-Coursera Assistant distribution platform.

---

## Table of Contents

- [Extension not appearing after install](#1-extension-not-appearing-after-install)
- [CRX download fails](#2-crx-download-fails)
- [updates.xml returns 404 or wrong content](#3-updatesxml-returns-404-or-wrong-content)
- [GitHub Actions fails](#4-github-actions-fails)
- [Extension ID mismatch](#5-extension-id-mismatch)
- [Browser not reading policy](#6-browser-not-reading-policy)
- [PowerShell execution policy blocking script](#7-powershell-execution-policy-blocking-script)
- [Linux script needs root](#8-linux-script-needs-root)
- [macOS installer not signed warning](#9-macos-installer-not-signed-warning)
- [Go installer build fails](#10-go-installer-build-fails)
- [Website build fails](#11-website-build-fails)

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
alojpdnpiddmekflpagdblmaehbdfcge;https://autocr.nicx.me/updates.xml
```

If the policy does not appear, see issue [#9: Browser not reading policy](#9-browser-not-reading-policy).

**Step 3: Check the extensions page.**

Navigate to `chrome://extensions` (or the browser's equivalent). If the extension appears but is disabled or has errors, check for:

- "Download error" — the browser could not reach `autocr.nicx.me` (see issue [#2](#2-crx-download-fails))
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

The CRX file is not accessible at the URL specified in `updates.xml`. In the current architecture, `updates.xml` points browsers directly to GitHub Releases. Possible reasons:

- The CRX asset was not uploaded to the GitHub Release
- The GitHub Release tag does not exist
- The GitHub repository is private or inaccessible
- The `codebase` URL in `updates.xml` is outdated or incorrect

### Fix

**Step 1: Check if the CRX file exists on GitHub Releases.**

```bash
# List assets for the latest release
gh release view --repo NICxKMS/auto-coursera --json assets \
  --jq '.assets[].name' | grep '.crx'

# Or check the current version from version.json
VERSION=$(jq -r .version version.json)
gh release view "v${VERSION}" --repo NICxKMS/auto-coursera --json assets \
  --jq '.assets[].name'
```

If `gh` CLI is not installed, check manually at:

```
https://github.com/NICxKMS/auto-coursera/releases
```

You should see files like `auto_coursera_<version>.crx` and `auto_coursera_<version>.crx.sha256` attached to the release.

**Step 2: Test the CRX download URL from updates.xml.**

```bash
# Get the codebase URL from updates.xml
curl -s https://autocr.nicx.me/updates.xml | grep codebase

# Test the GitHub Releases URL directly
VERSION=$(jq -r .version version.json)
curl -sI "https://github.com/NICxKMS/auto-coursera/releases/download/v${VERSION}/auto_coursera_${VERSION}.crx"
```

Expected: HTTP 302 redirect to the GitHub CDN, then 200 for the actual download.

If you get:

- **404 Not Found** — the CRX asset was not uploaded or the version in `updates.xml` doesn't match the release tag
- **SSL error** — certificate issue (unlikely with GitHub)

**Step 3: Verify the CRX URL in updates.xml matches the actual release.**

```bash
curl -s https://autocr.nicx.me/updates.xml
```

The `codebase` attribute should point to a URL like:
`https://github.com/NICxKMS/auto-coursera/releases/download/v<version>/auto_coursera_<version>.crx`

If `updates.xml` has the wrong version, update `version.json` and run `sync-constants.sh` to regenerate it.

**Step 4: Check updates.xml points to the correct version and URL.**

```bash
curl -s https://autocr.nicx.me/updates.xml
```

The `codebase` attribute should point to a GitHub Releases URL.

### Verify

```bash
# Verify CRX exists on GitHub Releases
VERSION=$(jq -r .version version.json)
curl -sI "https://github.com/NICxKMS/auto-coursera/releases/download/v${VERSION}/auto_coursera_${VERSION}.crx" | grep -E "^HTTP|^location"
# Should return 302 to GitHub CDN, then 200
```

---

## 3. updates.xml returns 404 or wrong content

### Symptom

Fetching `https://autocr.nicx.me/updates.xml` returns 404, an error page, or XML with incorrect content. The browser cannot discover extension updates.

### Cause

The `updates.xml` file is a **static file** served by Cloudflare Pages from `website/public/updates.xml`. It is generated by `sync-constants.sh` from `version.json`. Possible reasons:

- The file does not exist in `website/public/updates.xml`
- The website has not been deployed after a version bump
- The `version.json` was not updated before running `sync-constants.sh`
- DNS for `autocr.nicx.me` has not propagated

### Fix

**Step 1: Check if the file exists locally.**

```bash
cat website/public/updates.xml
```

If the file does not exist, generate it:

```bash
bash scripts/sync-constants.sh
```

**Step 2: Verify the file content.**

```bash
cat website/public/updates.xml
```

Expected output:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="alojpdnpiddmekflpagdblmaehbdfcge">
    <updatecheck codebase="https://github.com/NICxKMS/auto-coursera/releases/download/v<version>/auto_coursera_<version>.crx" version="<version>"/>
  </app>
</gupdate>
```

Key things to verify:

- `appid` matches the extension ID derived from the signing key
- `codebase` points to a GitHub Releases download URL
- `version` matches the latest release

**Step 3: If the version is wrong, update version.json and regenerate.**

```bash
# Update version in version.json, then regenerate all derived files
bash scripts/sync-constants.sh
```

**Step 4: Deploy the website.**

After updating the file locally, deploy to Cloudflare Pages:

```bash
cd website && pnpm build
wrangler pages deploy dist --project-name=auto-coursera --branch=master
```

Or push to the `master` branch to trigger CI deployment.

### Verify

```bash
curl -s https://autocr.nicx.me/updates.xml | grep -oP 'version="\K[^"]+'
# Should return the current version, e.g., 1.9.1
```

---

## 4. GitHub Actions fails

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

The `CF_API_TOKEN` needs:

- Account → Cloudflare Pages → Edit

If the token lacks the permission, the website deployment step fails. Create a new token with the correct permissions (see [CLOUDFLARE-SETUP.md](./CLOUDFLARE-SETUP.md#7-api-token-permissions)).

**GitHub Release creation fails:**

The `create-release` job in `deploy.yml` uses `softprops/action-gh-release@v2` to upload all assets (CRX, checksums, installers) to a GitHub Release. This requires:

- `contents: write` permission on the workflow
- The tag must follow the `v*` pattern (e.g., `v1.9.1`)
- No existing release with the same tag (or use `--clobber` to overwrite)

**Master website deploy is skipped on purpose:**

`deploy-website-main` now refuses to publish a new Pages state from `master` until the current `version.json` already has a matching **published** GitHub Release with the expected CRX + installer assets. If the job logs a notice about skipping deploy, create/publish the release first, then push again (or re-run the workflow) once the assets exist.

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

## 5. Extension ID mismatch

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

**Step 3: Check what ID is in updates.xml (static file on Cloudflare Pages).**

```bash
curl -s https://autocr.nicx.me/updates.xml | grep appid
```

This value comes from `version.json`, propagated by `sync-constants.sh`.

**Step 4: Check what ID is in the install scripts and config.**

```bash
grep -rn "EXTENSION_ID" installer/config.go \
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
curl -s https://autocr.nicx.me/updates.xml | grep -oP 'appid="\K[^"]+'
grep EXTENSION_ID installer/config.go | head -1
```

---

## 6. Browser not reading policy

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
        "YOUR_EXTENSION_ID;https://autocr.nicx.me/updates.xml"
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
  "YOUR_EXTENSION_ID;https://autocr.nicx.me/updates.xml"

# Force macOS to re-read preferences
killall cfprefsd 2>/dev/null
```

### Verify

Restart the browser, then navigate to `chrome://policy`. The `ExtensionInstallForcelist` policy should appear with status "OK".

---

## 7. PowerShell execution policy blocking script

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

## 8. Linux script needs root

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

## 9. macOS installer not signed warning

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

## 10. Go installer build fails

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

## 11. Website build fails

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

# Auto-Coursera Scripts

Build, signing, and packaging scripts for the CRX extension pipeline. These scripts are used both locally and by CI/CD workflows.

---

## Scripts

### 🔑 `generate-key.sh` — Generate Signing Key

Creates an RSA 2048 private key for CRX signing and derives the extension ID.

```bash
./scripts/generate-key.sh                 # Outputs extension-key.pem
./scripts/generate-key.sh -o my-key.pem   # Custom output path
```

| Flag | Default | Description |
|---|---|---|
| `-o <file>` | `extension-key.pem` | Output file path |
| `-h` | — | Show help |

**Requires:** `openssl`, `xxd`

---

### 🆔 `derive-extension-id.sh` — Derive Extension ID

Computes the 32-character Chrome extension ID from an existing private key.

```bash
./scripts/derive-extension-id.sh extension-key.pem
# → abcdefghijklmnopabcdefghijklmnop
```

The algorithm:
1. Extract public key in DER format
2. SHA256 hash of the DER bytes
3. First 32 hex characters → mapped `0-f` → `a-p`

**Requires:** `openssl`, `xxd`

---

### 📦 `package-crx.sh` — Package CRX3

Builds a signed CRX3 file from the extension dist directory using `npx crx3`.

```bash
./scripts/package-crx.sh -v 1.8.0 -k extension-key.pem
./scripts/package-crx.sh -v 1.8.0 -k extension-key.pem -s extension/dist -o releases/
```

| Flag | Default | Description |
|---|---|---|
| `-v <version>` | *required* | Extension version |
| `-k <key-file>` | *required* | RSA private key PEM file |
| `-s <source-dir>` | `extension/dist` | Extension source directory |
| `-o <output-dir>` | project root | Output directory |
| `-h` | — | Show help |

**Output:**
- `auto_coursera_<version>.crx` — signed CRX3 file
- `auto_coursera_<version>.crx.sha256` — SHA256 checksum

**Requires:** `openssl`, `npx crx3`, `sha256sum`

---

### ✅ `verify-crx.sh` — Verify CRX3

Validates a CRX file by checking magic bytes, format version, manifest, and checksum.

```bash
./scripts/verify-crx.sh auto_coursera_1.8.0.crx
```

**Checks performed:**
1. File exists and is readable
2. CRX3 magic bytes (`Cr24`)
3. CRX format version
4. Embedded manifest version
5. File size
6. SHA256 checksum

**Requires:** `xxd`, `sha256sum`, `unzip`

---

### 📋 `generate-updates-xml.sh` — Generate Update Manifest

Produces a local/manual `updates.xml` fixture for testing browser policy installs.
Production does **not** upload or attach a static `updates.xml` file; the canonical endpoint is `https://autocr-cdn.nicx.me/updates.xml`, which is generated dynamically by the Cloudflare Worker.

```bash
./scripts/generate-updates-xml.sh \
  -i abcdefghijklmnopabcdefghijklmnop \
  -v 1.8.0 \
  -u https://github.com/NICxKMS/auto-coursera/releases/download/v1.8.0/auto_coursera_1.8.0.crx

# Write to file
./scripts/generate-updates-xml.sh -i <id> -v 1.8.0 -u <url> -o updates.xml
```

| Flag | Default | Description |
|---|---|---|
| `-i <extension-id>` | *required* | 32-character extension ID |
| `-v <version>` | *required* | Extension version |
| `-u <crx-url>` | *required* | Full URL to the CRX file |
| `-o <output-file>` | stdout | Output file path |
| `-h` | — | Show help |

**Output format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="EXTENSION_ID">
    <updatecheck codebase="CRX_URL" version="VERSION"/>
  </app>
</gupdate>
```

Use this script only for local/manual validation or troubleshooting. Tagged releases rely on the Worker route to serve `updates.xml` dynamically from Worker configuration.

---

### 🎨 `generate-icons.js` — Generate Icon Placeholders

Creates minimal valid PNG icon placeholders in Coursera-blue (`#0056D2`) for all required sizes.

```bash
node scripts/generate-icons.js
```

Generates `16×16`, `32×32`, `48×48`, and `128×128` PNGs to `extension/assets/icons/`.

**Requires:** Node.js (no external dependencies — uses `zlib` from stdlib)

---

### 🔄 `bump-version.sh` — Bump Version & Sync All Constants

Updates the version in `version.json`, then delegates to `sync-constants.sh` to propagate **all constants** (version, extensionId, extensionName, updateUrl, domains) across the entire monorepo.

```bash
./scripts/bump-version.sh <new-version>
```

**Requires:** `jq`, `sed`

---

### 🔁 `sync-constants.sh` — Sync All Constants from `version.json`

Reads **every field** from `version.json` (version, extensionId, extensionName, updateUrl, domains) and propagates them to all target files. Idempotent — safe to run multiple times.

```bash
./scripts/sync-constants.sh
```

**Syncs to:**
- `extension/package.json`, `extension/manifest.json`, `workers/package.json`, `website/package.json` (version)
- `installer/config.go` (AppVersion, ExtensionID, ExtensionName, UpdateURL)
- `workers/wrangler.toml` (CURRENT_VERSION, EXTENSION_ID, ALLOWED_ORIGIN, CDN_BASE_URL)
- `website/public/scripts/install.sh`, `install-mac.sh` (EXTENSION_ID, EXTENSION_NAME, UPDATE_URL)
- `website/public/scripts/uninstall.sh`, `uninstall.ps1` (EXTENSION_ID, EXTENSION_NAME)
- `website/public/scripts/install.ps1` (EXTENSION_ID, EXTENSION_NAME, UPDATE_URL)
- `website/astro.config.mjs` (site domain)
- `website/src/components/VersionBadge.astro` (fallback version)

**Requires:** `jq`, `sed`

---

### ✅ `check-version.sh` — Verify All Constants Match `version.json`

CI guard that validates **all constants** — version, extension ID, extension name, update URL, and domains — are consistent across every file in the monorepo, plus a few operational truth guards for the deployment branch and website source links. Runs 50+ checks across 20+ files.

```bash
./scripts/check-version.sh
```

**Checks:**
- **Version** — JSON packages, Go config, TOML, VersionBadge fallback
- **Extension ID** — Go config, TOML, 3 install scripts, 2 uninstall scripts, 2 docs pages
- **Extension Name** — Go config, 3 install scripts, 2 uninstall scripts
- **Update URL** — Go config, 3 install scripts, 1 docs page
- **Domains (structured)** — TOML (ALLOWED_ORIGIN, CDN_BASE_URL), Astro config (site)
- **Domains (page-level)** — API domain in 4 Astro pages + `_headers` + wrangler.toml route; website domain in 3 pages; CDN domain in 1 docs page
- **Operational truth guards** — deployment branch references in workflow/docs/website README, plus the website footer GitHub license link branch
- **Git tag** — Validates against `version.json` in CI

**Requires:** `jq`, `grep`, `sed`

---

## Typical Workflow

```mermaid
flowchart LR
    V["bump-version.sh"] -->|version.json| A
    V -->|updates all files| C
    A["generate-key.sh"] -->|key.pem| B["derive-extension-id.sh"]
    B -->|extension ID| C["webpack build"]
    C -->|extension/dist/| D["package-crx.sh"]
    D -->|.crx file| E["verify-crx.sh"]
  D -.->|optional local/manual testing| F["generate-updates-xml.sh"]
  D -->|.crx + .sha256| G["Upload to GitHub Releases"]
  G --> H["Worker serves canonical\n/updates.xml dynamically"]
```

`generate-updates-xml.sh` is retained as a manual/testing helper and is no longer part of the production release workflow in `deploy.yml`.

## Prerequisites

All scripts require a Unix shell (bash). On Windows, use WSL or Git Bash.

| Tool | Used By | Install |
|---|---|---|
| `openssl` | key, id, package | Pre-installed on most systems |
| `xxd` | id, verify | Usually bundled with `vim` |
| `sha256sum` | package, verify | Pre-installed on Linux; `shasum -a 256` on macOS |
| `npx crx3` | package | `npm install -g crx3` or use `npx` |
| `jq` | bump-version, sync-constants, check-version | `apt install jq` / `brew install jq` |
| `Node.js` | icons | v18+ recommended |

## Related Documentation

- [`docs/SIGNING.md`](../docs/SIGNING.md) — Full explanation of CRX3 signing and extension ID derivation
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#release-flow) — How scripts fit into the release pipeline

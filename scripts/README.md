# Auto-Coursera Scripts

Build, signing, and packaging scripts for the CRX extension pipeline. These scripts are used both locally and by CI/CD workflows.

---

## Scripts

### 🔑 `generate-key.sh` — Generate Signing Key

Creates an RSA 2048 private key for CRX signing and derives the extension ID. If a key already exists, it displays the current extension ID and asks before overwriting.

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

### 📦 `package-crx.sh` — Package CRX3

Builds a signed CRX3 file from the extension dist directory using `npx crx3`.

```bash
./scripts/package-crx.sh -v <version> -k extension-key.pem
./scripts/package-crx.sh -v <version> -k extension-key.pem -s extension/dist -o releases/
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
./scripts/verify-crx.sh auto_coursera_<version>.crx
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

### 🔁 `sync-constants.sh` — Sync All Constants from `version.json`

Reads **every field** from `version.json` (version, extensionId, extensionName, updateUrl, domains) and propagates them to all target files. Idempotent — safe to run multiple times.

Also supports bumping the version in `version.json` before syncing:

```bash
./scripts/sync-constants.sh                  # Sync only
./scripts/sync-constants.sh --bump 1.9.2     # Bump version.json, then sync
```

**Syncs to:**
- `extension/package.json`, `extension/manifest.json`, `website/package.json` (version)
- `installer/config.go` (AppVersion, ExtensionID, ExtensionName, UpdateURL)
- `website/public/scripts/install.sh`, `install-mac.sh` (EXTENSION_ID, EXTENSION_NAME, UPDATE_URL)
- `website/public/scripts/uninstall.sh`, `uninstall.ps1` (EXTENSION_ID, EXTENSION_NAME)
- `website/public/scripts/install.ps1` (EXTENSION_ID, EXTENSION_NAME, UPDATE_URL)
- `website/astro.config.mjs` (site domain)
- `website/public/_redirects` (generated installer shortcut URLs)
- `website/public/updates.xml` (generated from extensionId, version, githubRepo)

The website's `/install` and `/downloads` pages are not directly rewritten by `sync-constants.sh`; they read the root `version.json` at build time so their GitHub Release links stay canonical without a manual edit step.

**Requires:** `jq`, `sed`

---

### ✅ `check-version.sh` — Verify All Constants Match `version.json`

CI guard that validates **all constants** — version, extension ID, extension name, update URL, and domains — are consistent across every file in the monorepo, plus a few operational truth guards for the deployment branch and website source links. Runs **57 checks**.

```bash
./scripts/check-version.sh
```

**Checks:**
- **Version** — JSON packages and Go config
- **Extension ID** — Go config, 3 install scripts, 2 uninstall scripts, 2 docs pages
- **Extension Name** — Go config, manifest.json, 3 install scripts, 2 uninstall scripts
- **Update URL** — Go config, 3 install scripts, 1 docs page
- **Domains** — Astro config (site), website domain in docs pages
- **Static website release surfaces** — `website/public/updates.xml` contents, `website/public/_redirects` targets, install/download page version-truth wiring, domain references in manual docs
- **Policy filename consistency** — Go installer matches shell install script
- **Operational truth guards** — deployment branch references in workflow/docs/website README, plus the website footer GitHub license link branch
- **Git tag** — Validates against `version.json` in CI

**Requires:** `jq`, `grep`, `sed`

---

## Typical Workflow

```mermaid
flowchart LR
    V["sync-constants.sh --bump"] -->|version.json| S["sync-constants.sh"]
    S -->|syncs all files| C["webpack build"]
    S -->|generates| U["website/public/updates.xml"]
    S -->|generates| R["website/public/_redirects"]
    A["generate-key.sh"] -->|key.pem + ID| C
    C -->|extension/dist/| D["package-crx.sh"]
    D -->|.crx file| E["verify-crx.sh"]
    D -->|.crx + .sha256| G["Upload to GitHub Releases"]
    U -->|static file| P["Cloudflare Pages\nautocr.nicx.me/updates.xml"]
```

## Prerequisites

All scripts require a Unix shell (bash). On Windows, use WSL or Git Bash.

| Tool | Used By | Install |
|---|---|---|
| `openssl` | key, package | Pre-installed on most systems |
| `xxd` | key, verify | Usually bundled with `vim` |
| `sha256sum` | package, verify | Pre-installed on Linux; `shasum -a 256` on macOS |
| `npx crx3` | package | `npm install -g crx3` or use `npx` |
| `jq` | sync-constants, check-version | `apt install jq` / `brew install jq` |

## Related Documentation

- [`docs/SIGNING.md`](../docs/SIGNING.md) — Full explanation of CRX3 signing and extension ID derivation
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#release-flow) — How scripts fit into the release pipeline

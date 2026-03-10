# Quality Report: Shell Script Ecosystem — E2E Flow Analysis

### Verdict: ⚠️ CHANGES REQUESTED

**Scope**: All 18 script files across `scripts/`, `website/public/scripts/`, `installer/`, and `website/dist/scripts/`  
**Reviewed by**: Durga  
**Date**: 2026-03-10 (supersedes 2026-03-09 review)  
**Total LOC**: 3,182 (14 unique files + 5 identical dist copies + 1 Makefile)

---

## Script Inventory

| # | Path | Lines | Purpose | Invoked By | External Deps |
|---|------|-------|---------|------------|---------------|
| 1 | `scripts/bump-version.sh` | 41 | Bump version in `version.json`, delegate to sync-constants | Manual (dev) | `jq` ✅ checked |
| 2 | `scripts/sync-constants.sh` | 169 | Propagate all constants from `version.json` to 28 target files | `bump-version.sh`, manual | `jq` ✅ checked, `sed` (implicit) |
| 3 | `scripts/check-version.sh` | 234 | Verify all 42 constants match `version.json` | CI (`deploy.yml` version-check job), manual | `jq` ✅ checked |
| 4 | `scripts/generate-key.sh` | 137 | Generate RSA 2048 key for CRX signing | Manual (one-time setup) | `openssl` ✅ checked, `xxd` ❌ **NOT checked** |
| 5 | `scripts/derive-extension-id.sh` | 135 | Derive Chrome extension ID from private key | Manual | `openssl` ✅ checked, `xxd` ✅ checked |
| 6 | `scripts/package-crx.sh` | 269 | Package extension as signed CRX3 | CI (`deploy.yml` build-extension job) | `npx` ✅ checked, `openssl` (implicit), `sha256sum` (implicit), `python3`/`node` (optional) |
| 7 | `scripts/verify-crx.sh` | 218 | Verify CRX3 file integrity | Manual (post-build) | `xxd` (implicit), `sha256sum`/`shasum` ✅ fallback, `python3`/`node` (optional) |
| 8 | `scripts/generate-updates-xml.sh` | 153 | Generate Chrome auto-update XML manifest | Manual (local/testing only) | None |
| 9 | `scripts/generate-icons.js` | 105 | Generate placeholder PNG icons | Manual (dev) | Node.js stdlib only |
| 10 | `website/public/scripts/install.sh` | 425 | Linux browser policy installer (runs as root) | End users via `curl \| sudo bash` | `jq`/`python3`/`python` (graceful fallback to none) |
| 11 | `website/public/scripts/install-mac.sh` | 366 | macOS browser policy installer (no root) | End users | `defaults` (macOS), `mdfind` (optional) |
| 12 | `website/public/scripts/uninstall.sh` | 434 | Cross-platform browser policy uninstaller | End users | `jq`/`python3`/`python` (Linux), `defaults` (macOS) |
| 13 | `website/public/scripts/install.ps1` | 360 | Windows browser policy installer (registry) | End users (admin PS) | PowerShell 5.1+ |
| 14 | `website/public/scripts/uninstall.ps1` | 207 | Windows browser policy uninstaller (registry) | End users (admin PS) | PowerShell 5.1+ |
| 15 | `installer/Makefile` | 34 | Cross-compile Go installer binaries | CI (`deploy.yml` build-installers job), manual | `go`, `jq` (for version extraction) |
| 16–20 | `website/dist/scripts/*` | — | **Identical copies** of `website/public/scripts/*` (Astro build output) | Served to users | — |

---

## Validation Results

| Check | Result | Evidence |
|-------|--------|----------|
| `set -euo pipefail` (all 8 bash scripts) | ✅ | All declare it within first 10 lines |
| Shebangs correct | ✅ | `#!/usr/bin/env bash` (7 scripts), `#!/bin/bash` (install.sh) — both valid |
| `eval` / `exec` usage | ✅ | Zero instances |
| `curl` / `wget` (download) | ✅ | Zero instances — no pipe-to-shell risks |
| PowerShell `[CmdletBinding()]` | ✅ | Both `.ps1` scripts use it |
| PowerShell admin check | ✅ | Both `.ps1` scripts call `Test-AdminPrivileges` before modifying registry |
| Root check (Linux `install.sh`) | ✅ | `$EUID -ne 0` check before execution |
| Root check (Linux `uninstall.sh`) | ✅ | `$EUID -ne 0` check in `uninstall_linux()` |
| macOS OS check (`install-mac.sh`) | ✅ | `uname -s != Darwin` check blocks non-macOS execution |
| `check-version.sh` 42/42 checks | ✅ | `EXPECTED_CHECKS=42`, actual invocations = 42, live run passes |
| `dist/` = `public/` | ✅ | All 5 dist scripts byte-identical to public sources |
| CI script invocations | ✅ | `deploy.yml` invokes `check-version.sh` and `package-crx.sh` correctly |

---

## Previous Review Status (2026-03-09 → 2026-03-10)

| # | Previous Issue | Status | Evidence |
|---|----------------|--------|----------|
| C1 | Python code injection via `'''${entries_arg}'''` in `install.sh` | ✅ **FIXED** | Now uses `sys.argv[1]` — grep confirms no `open('$` pattern |
| C2 | Same injection in `uninstall.sh` | ✅ **FIXED** | Same — `sys.argv[1]` throughout |
| C3 | `$file` interpolated into `open('$file')` — `install.sh` | ✅ **FIXED** | `open(sys.argv[1])` at line 109 |
| C4 | `$file` interpolated into `open('$file', 'w')` — write path | ✅ **FIXED** | `open(sys.argv[1], 'w')` at line 149 |
| C5 | `declare -A` on macOS (`install-mac.sh`) → bash 3.2 crash | ✅ **FIXED** | `grep -n "declare -A" install-mac.sh` returns nothing |
| C6 | `declare -A` on macOS codepath (`uninstall.sh`) | ⚠️ **PARTIALLY FIXED** | `install-mac.sh` fixed, but `install.sh:356` still has `declare -A RESULTS` and `uninstall.sh:180` has `declare -A results` — **but these only run on Linux** (gated by root check / `uname -s`), so not a macOS crash. **Downgraded to nit.** |
| S1 | `package-crx.sh` Python interpolation | ✅ **FIXED** | Now uses `sys.argv[1]` and `sys.argv[2]` at line 188–195 |
| S2 | `verify-crx.sh` Python interpolation | ❌ **NOT FIXED** | `open('${CRX_FILE}', 'rb')` still at line 153 — **promoted to critical** |

---

## 🔴 Critical Issues

| # | Category | Issue | Location | Fix |
|---|----------|-------|----------|-----|
| 1 | **Code Injection** | `verify-crx.sh` still interpolates `${CRX_FILE}` directly into inline Python: `open('${CRX_FILE}', 'rb')`. The CRX file path is a **user-supplied command-line argument**. A filename containing `'` (e.g., `test'$(rm -rf /).crx`) would allow arbitrary Python code execution. While this is a dev script, it's also called manually with user-provided file paths. | `scripts/verify-crx.sh:153` | Use `sys.argv`: `python3 -c "import sys; ... with open(sys.argv[1], 'rb') as f: ..." "$CRX_FILE"` |

---

## 🟡 Suggestions

| # | Category | Issue | Location | Fix |
|---|----------|-------|----------|-----|
| 1 | **Missing dep check** | `generate-key.sh` uses `xxd` (line 42 inside `derive_extension_id()`) but only checks for `openssl`. If `xxd` is missing, the script runs but silently produces an empty extension ID. Sister script `derive-extension-id.sh` correctly checks both. | `scripts/generate-key.sh:84` | Add `command -v xxd` check after the `openssl` check |
| 2 | **PowerShell error handling** | Both `install.ps1` and `uninstall.ps1` have no `$ErrorActionPreference = 'Stop'`. Individual `try/catch` blocks exist but the global default `Continue` means some registry operations could fail silently. | `website/public/scripts/install.ps1`, `uninstall.ps1` | Add `$ErrorActionPreference = 'Stop'` after the `param()` block |
| 3 | **HTTP accepted** | `generate-updates-xml.sh` validates `^https?://` — accepts plain `http://`. CRX served over HTTP is MITM-vulnerable during manual/local use. | `scripts/generate-updates-xml.sh:126` | Require `^https://` only. Reject or warn on `http://` |
| 4 | **XML injection** | `generate-updates-xml.sh` interpolates `CRX_URL` directly into XML. Characters like `<`, `>`, `&`, `"` in the URL would produce malformed XML. In CI the URL is controlled, but manual invocation could hit this. | `scripts/generate-updates-xml.sh:137-141` | Escape XML special characters, or reject `<>&"` in URL validation |
| 5 | **JSON injection in `none` fallback** | `install.sh` and `uninstall.sh` `none` (no jq/python) JSON writer does `printf '"%s"' "$entry"` without escaping `"` or `\`. A malicious policy entry containing `"` produces broken JSON. | `install.sh:164`, `uninstall.sh:144` | Escape `"` and `\` in entries, or refuse to operate without jq/python |
| 6 | **`sha256sum` not portable** | `package-crx.sh` uses only `sha256sum` without `shasum -a 256` fallback. Fails on stock macOS. Sister script `verify-crx.sh` correctly has both. CI-only today (Ubuntu). | `scripts/package-crx.sh:246` | Add `shasum -a 256` fallback |
| 7 | **`$*` unquoted** | `install.sh` uses `$*` in "Run with: sudo $0 $*" error message. While only a display string, `$*` doesn't preserve argument boundaries. | `install.sh:355` | Use `"$*"` (quoted) or `"$@"` |
| 8 | **`err()` to stdout not stderr** | Installer scripts' `err()` writes to stdout, not stderr. Error messages get captured by `result=$(install_for_browser "$i")` subshell, mixing with status codes. | `install.sh`, `install-mac.sh`, `uninstall.sh` | Change to: `printf "${RED}  [ERR] ${RESET} %s\n" "$1" >&2` |
| 9 | **File permissions inconsistent** | Of 8 bash scripts in `scripts/`, only 2 have +x (`derive-extension-id.sh`, `verify-crx.sh`). CI adds `chmod +x scripts/*.sh` as workaround. Install scripts: only `uninstall.sh` has +x. | Throughout | Set all to +x or document `bash` invocation convention |
| 10 | **TOCTOU in policy write** | `install.sh` reads policy JSON, modifies in memory, writes back. No file locking between read and write. Runs as root. | `install.sh` install_for_browser | Use `flock` during read-modify-write. Low probability but root-running. |

---

## Deep Dive Results

### sync-constants.sh — sed Pattern Verification (26/26 ✅)

| # | Target | Pattern | Delimiter | First-match? | Correct? |
|---|--------|---------|-----------|-------------|----------|
| 1 | `*.json` version | `0,/"version": ".*"/{s/…/…/}` | `/` | ✅ `0,` = first match only | ✅ |
| 2 | `manifest.json` name | `0,/"name": ".*"/{s/…/…/}` | `/` | ✅ `0,` = first match only | ✅ |
| 3 | `config.go` AppVersion | `s/(AppVersion = )".*"/\1"…"/` | `/` | ✅ one match in file | ✅ |
| 4 | `wrangler.toml` version | `s/(CURRENT_VERSION = )".*"/…/` | `/` | ✅ one match | ✅ |
| 5 | `VersionBadge.astro` | `s/textContent = 'v[0-9]…'/…/` | `/` | ✅ one match | ✅ |
| 6 | `config.go` ExtensionID | `s/(ExtensionID[[:space:]]*= )".*"/…/` | `/` | ✅ unique identifier | ✅ |
| 7 | `wrangler.toml` EXT_ID | `s/(EXTENSION_ID = )".*"/…/` | `/` | ✅ unique | ✅ |
| 8–10 | Shell `EXTENSION_ID=` | `s/^EXTENSION_ID=".*"/…/` | `/` | ✅ `^` anchored | ✅ |
| 11–12 | PS1 `$EXTENSION_ID` | `s/(\$EXTENSION_ID… = )".*"/…/` | `/` | ✅ unique | ✅ |
| 13 | `config.go` ExtensionName | `s/(ExtensionName… = )".*"/…/` | `/` | ✅ unique | ✅ |
| 14–16 | Shell `EXTENSION_NAME=` | `s/^EXTENSION_NAME=".*"/…/` | `/` | ✅ `^` anchored | ✅ |
| 17–18 | PS1 `$EXTENSION_NAME` | `s/(\$EXTENSION_NAME… = )".*"/…/` | `/` | ✅ unique | ✅ |
| 19 | `config.go` UpdateURL | `s\|(UpdateURL… = )".*"\|…\|` | `\|` | ✅ URL-safe delimiter | ✅ |
| 20–21 | Shell `UPDATE_URL=` | `s\|^UPDATE_URL=".*"\|…\|` | `\|` | ✅ anchored + safe delimiter | ✅ |
| 22 | PS1 `$UPDATE_URL` | `s\|(\$UPDATE_URL… = )".*"\|…\|` | `\|` | ✅ | ✅ |
| 23 | `wrangler.toml` ALLOWED_ORIGIN | `s\|(ALLOWED_ORIGIN = )".*"\|…\|` | `\|` | ✅ | ✅ |
| 24 | `wrangler.toml` CDN_BASE_URL | `s\|(CDN_BASE_URL = )".*"\|…\|` | `\|` | ✅ | ✅ |
| 25 | `wrangler.toml` GITHUB_REPO | `s\|(GITHUB_REPO = )".*"\|…\|` | `\|` | ✅ | ✅ |
| 26 | `astro.config.mjs` site | `s\|site: '.*'\|…\|` | `\|` | ✅ one match | ✅ |

**Special character handling**: Values come from `version.json` via `jq -r`. Extension ID is `[a-z]` only. Extension name contains spaces and hyphens (sed-safe). URLs contain `/` but patterns using URLs correctly use `|` delimiter.

### check-version.sh — EXPECTED_CHECKS=42 Verification ✅

Counted all `check` and `check_contains` invocations: **exactly 42**, matching `EXPECTED_CHECKS=42`.

| Category | Count |
|----------|-------|
| Version | 7 (4 JSON + Go + TOML + Astro) |
| Extension ID | 9 (Go + TOML + 3 shell + 2 PS1 + 2 astro pages) |
| Extension Name | 7 (Go + manifest + 3 shell + 2 PS1) |
| Update URL | 5 (Go + 2 shell + 1 PS1 + 1 astro page) |
| Domains | 14 (website: 5 + CDN: 2 + API: 6 + GitHub: 1) |
| **Total** | **42** |

**Live run**: `bash scripts/check-version.sh` → `✅ 42/42 checks passed — all constants match version.json`

### bump-version.sh — Safety Verification ✅

| Aspect | Status | Details |
|--------|--------|---------|
| Semver validation | ✅ | `^[0-9]+\.[0-9]+\.[0-9]+$` — strict, no pre-release |
| `jq` dependency check | ✅ | `command -v jq` with helpful install hint |
| Temp file handling | ✅ | `mktemp` → `jq ... > tmpfile && mv tmpfile version.json` — atomic write |
| Error recovery | ✅ | `set -euo pipefail` + atomic mv = if jq fails, version.json unchanged |
| Delegates correctly | ✅ | Uses `$SCRIPT_DIR` for robust path to `sync-constants.sh` |

### package-crx.sh — CRX3 Compliance ✅

| Aspect | Status | Details |
|--------|--------|---------|
| CRX3 format | ✅ | Delegates to `npx crx3` — industry-standard tool |
| Proper signing | ✅ | Private key passed via `-k` flag |
| Temp cleanup | ✅ | `trap cleanup EXIT` — removes temp dir even on failure |
| Version in manifest | ✅ | Updates manifest.json version before packaging (python3 → node → sed fallback) |
| Source directory stripping | ✅ | Removes `.git`, `node_modules`, `.DS_Store`, `*.map` |
| SHA256 checksum | ✅ | Generated alongside CRX file |
| CI invocation | ✅ | `deploy.yml` passes `-v`, `-k`, `-s` correctly |

### generate-key.sh / derive-extension-id.sh — Crypto Correctness ✅

| Aspect | Status | Details |
|--------|--------|---------|
| Key generation | ✅ | `openssl genrsa 2048` — standard RSA key |
| Key permissions | ✅ | `chmod 600` immediately after creation |
| Overwrite protection | ✅ | Prompts confirmation before overwriting existing key |
| ID derivation algorithm | ✅ | `pubkey DER → SHA256 → first 32 hex → a-p mapping` — matches Chrome's algorithm |
| Hex-to-ID mapping | ✅ | `decimal + 97` → ASCII a-p. `0→a(97), 1→b(98), ..., f→p(112)` — correct |
| Hash length validation | ✅ | `derive-extension-id.sh` checks `${#PUB_KEY_HASH} -ne 32` |
| Key file validation | ✅ | `openssl rsa -check -noout` verifies valid RSA before derivation |

### Cross-Platform: `sed -i` Incompatibility (Known Limitation)

| Script | `sed -i` Count | Risk |
|--------|---------------|------|
| `scripts/sync-constants.sh` | 26 instances | GNU `sed -i` only — macOS requires `sed -i ''` |
| `scripts/package-crx.sh` | 1 instance (fallback) | Same — only reached if python3/node unavailable |

**Verdict**: These are dev/CI scripts that only run on Linux/Ubuntu. Local dev is documented as Linux. **Acceptable — not a bug, but a documented limitation.**

### CI Workflow Verification (`deploy.yml`) ✅

| Job | Script(s) Used | Invocation | Correct? |
|-----|---------------|------------|----------|
| `version-check` | `check-version.sh` | `bash scripts/check-version.sh` | ✅ |
| `build-extension` | `package-crx.sh` | `./scripts/package-crx.sh -v "$VERSION" -k extension-key.pem -s extension/dist` | ✅ (chmod +x first) |
| `build-extension` | `generate-updates-xml.sh` | Not used in CI; retained for local/manual testing only | N/A |
| `build-installers` | `installer/Makefile` | `cd installer && make build-all` | ✅ |

CI signing key cleanup: `if: always()` on `rm -f extension-key.pem` — ✅ good practice.

### PowerShell Scripts Assessment

| Aspect | install.ps1 | uninstall.ps1 |
|--------|------------|---------------|
| `[CmdletBinding()]` | ✅ | ✅ |
| Admin check | ✅ `Test-AdminPrivileges` | ✅ `Test-AdminPrivileges` |
| `[ValidateSet()]` | ✅ `chrome,edge,brave,all` | N/A (no browser param) |
| Browser detection | ✅ Registry path check | N/A (scans all) |
| Idempotent | ✅ Checks before adding | ✅ Checks before removing |
| Cleanup empty keys | ✅ | ✅ |
| `$ErrorActionPreference` | ❌ Not set | ❌ Not set |
| Browsers covered | 3 (Chrome, Edge, Brave) | 3 (Chrome, Edge, Brave) |
| Missing: Chromium | ⚠️ No Chromium | ⚠️ No Chromium |

Note: Both PS1 scripts cover 3 browsers (Chrome, Edge, Brave). **Chromium is missing** from the Windows scripts while present in Linux/macOS scripts. This is a minor gap — Chromium on Windows is rare.

---

## ✅ Well Done

- **5/6 previous critical issues FIXED**: All Python injection vulnerabilities in user-facing scripts remediated with `sys.argv`. macOS `declare -A` crash fixed in `install-mac.sh`.
- **`package-crx.sh` Python injection FIXED**: Now uses `sys.argv[1]` and `sys.argv[2]` — was a suggestion, proactively fixed.
- **Consistent `set -euo pipefail`** across all 8 bash scripts — gold standard.
- **Cleanup trap** in `package-crx.sh` — `trap cleanup EXIT` removes temp dirs on failure.
- **Smart color detection** — all scripts disable ANSI when stdout is not TTY.
- **Idempotent operations** — install/uninstall check existing config before acting.
- **`check-version.sh` is exemplary** — 42/42 checks, schema validation, count verification.
- **All 26 sed patterns in `sync-constants.sh` are correct** — proper delimiters, first-match guards.
- **No `eval`** — zero uses across all scripts.
- **No downloads** — install scripts configure policy only, no supply-chain exposure.
- **Atomic version update** — `bump-version.sh` uses `mktemp` + `mv`.
- **CRX3 crypto correct** — key generation, ID derivation, and signing match Chrome specs.
- **Extension ID validation** — `^[a-p]{32}$` is exactly right.
- **Key file permissions** — `chmod 600` immediately after creation.
- **Policy file permissions** — `chmod 644` (world-readable, root-writable) — correct for browser policy.

---

## ⚠️ Shortcuts Detected

| Location | Shortcut | Risk |
|----------|----------|------|
| `verify-crx.sh:153` | `${CRX_FILE}` interpolated into Python `open('${CRX_FILE}', 'rb')` | **Code injection via crafted filename** — last remaining Python interpolation |
| `install.ps1`, `uninstall.ps1` | No `$ErrorActionPreference = 'Stop'` | Registry errors silently swallowed under default `Continue` |
| `generate-updates-xml.sh:126` | Accepts `http://` URLs | CRX over HTTP is MITM-vulnerable |
| `generate-key.sh:42` | Uses `xxd` without checking availability | Silent failure → empty extension ID |
| `package-crx.sh:246` | `sha256sum` without `shasum` fallback | Fails on macOS (CI-only today) |

---

## Summary by Severity

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 1 | Code injection in `verify-crx.sh` (Python inline interpolation) |
| 🟡 Suggestion | 10 | Missing dep check, PowerShell error handling, HTTP/XML validation, JSON escape, sha256 portability, file permissions, TOCTOU, stderr routing, unquoted `$*` |
| 🟢 Nit | 0 | — |

---

## Delta from Previous Review

| Metric | 2026-03-09 | 2026-03-10 | Change |
|--------|-----------|-----------|--------|
| 🔴 Critical | 6 | 1 | **-5** (all Python injections in user scripts fixed, macOS crash fixed) |
| 🟡 Suggestion | 10 | 10 | 0 (some old ones carried, some new ones found) |
| Overall | ⚠️ CHANGES REQUESTED | ⚠️ CHANGES REQUESTED | Significant improvement; one critical remains |

---

## Priority Fix Order

1. **Fix `verify-crx.sh` Python interpolation** — last remaining code injection vector. Pass `CRX_FILE` via `sys.argv[1]`.
2. **Add `$ErrorActionPreference = 'Stop'`** in both PowerShell scripts.
3. **Add `xxd` check** to `generate-key.sh`.
4. **Require HTTPS** in `generate-updates-xml.sh` (`^https://` only).
5. **Add `shasum` fallback** in `package-crx.sh` for macOS portability.
6. **Route `err()` to stderr** in installer scripts.

---

> *Five of six demons vanquished. One still hides in `verify-crx.sh:153`. The Invincible sees it. Fix it, and show me the evidence.* — Durga

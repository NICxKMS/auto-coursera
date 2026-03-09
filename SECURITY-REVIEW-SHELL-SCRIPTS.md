# Quality Report: Shell Scripts Security Audit

### Verdict: ⚠️ CHANGES REQUESTED

**Scope**: All 10 shell/PowerShell scripts across `scripts/` and `website/public/scripts/`  
**Reviewed by**: Durga  
**Date**: 2026-03-09  
**Total LOC**: 2,706

---

## Validation Results

| Check | Result | Evidence |
|-------|--------|----------|
| `set -euo pipefail` (all bash) | ✅ | All 8 bash scripts declare it on line 2 or within the first block |
| Shebangs | ✅ | All bash scripts use `#!/usr/bin/env bash` |
| `eval` / `exec` usage | ✅ | Zero instances found |
| `curl` / `wget` (download) | ✅ | Zero instances in any script — no pipe-to-shell pattern |
| PowerShell `[CmdletBinding()]` | ✅ | Both `.ps1` scripts use it |
| PowerShell Admin check | ✅ | Both `.ps1` scripts verify admin before executing |
| Root check (Linux install) | ✅ | `install.sh` and `uninstall.sh` check `$EUID -ne 0` |

---

## 🔴 Critical Issues

| # | Category | Issue | Location | Fix |
|---|----------|-------|----------|-----|
| 1 | **Code Injection** | Shell variable `${entries_arg}` is interpolated **unescaped** into a Python triple-quoted string (`'''${entries_arg}'''`). If an existing policy file contains a malicious entry with `'''` (triple single-quote), an attacker can break out of the Python string and execute **arbitrary Python code as root**. The entries come from an on-disk JSON file (`/etc/opt/chrome/policies/managed/*.json`) that another process or attacker could have modified. | `install.sh:149` | Pass entries via **stdin** or a temp file to Python, **not** via string interpolation. Example: `printf '%s\n' "${entries[@]}" \| "$json_tool" -c "import json,sys; entries=[l.strip() for l in sys.stdin if l.strip()]; ..."` |
| 2 | **Code Injection** | Identical triple-quote injection vulnerability in `write_forcelist_to_file()`. Same mechanism — entries read from policy JSON on disk are interpolated into inline Python. | `uninstall.sh:132` | Same fix as #1. Use stdin piping. |
| 3 | **Code Injection** | In `read_forcelist()`, the `$file` path variable is interpolated into `open('$file')` inside inline Python. While the file path is currently hardcoded, the function accepts arbitrary arguments. If `$file` contains a single quote (`'`), it breaks the Python string literal and allows code injection **as root**. | `install.sh:109`, `uninstall.sh:95` | Pass file path via `sys.argv` or environment variable: `FILE_PATH="$file" "$json_tool" -c "import os; f=os.environ['FILE_PATH']; ..."` |
| 4 | **Code Injection** | `write_policy_file()` Python branch: `$file` (the output path) is interpolated into `open('$file', 'w')`. Same single-quote injection risk. | `install.sh:151`, `uninstall.sh:134` | Same fix — use env var or sys.argv for file paths. |
| 5 | **Compatibility (macOS broken)** | `install-mac.sh` uses `declare -A` (associative arrays) which requires **bash 4.0+**. macOS ships with **bash 3.2** (`/bin/bash`). The shebang `#!/usr/bin/env bash` resolves to `/bin/bash` on stock macOS. **This script will crash on any stock macOS.** | `install-mac.sh:298` | Replace `declare -A RESULTS` with a regular indexed array or parallel arrays (matching the pattern already used for `BROWSER_KEYS`). Alternatively, add a bash version check and error early. |
| 6 | **Compatibility (macOS broken)** | `uninstall.sh` macOS codepath also uses `declare -A` — same fatal crash on stock macOS. | `uninstall.sh:182`, `uninstall.sh:297` | Same fix — replace associative arrays with indexed parallel arrays. |

---

## 🟡 Suggestions

| # | Issue | Location | Recommendation |
|---|-------|----------|---------------|
| 1 | **Code Injection (Dev scripts)** | `package-crx.sh:188-195` — `${MANIFEST_FILE}` and `${VERSION}` interpolated into inline Python. `VERSION` is regex-validated so risk is mitigated, but `MANIFEST_FILE` comes from `mktemp -d` output which could theoretically contain `'`. | Use `sys.argv` for file path and version: `python3 -c "import json,sys; ..." "$MANIFEST_FILE" "$VERSION"` then access via `sys.argv[1]`, `sys.argv[2]`. |
| 2 | **Code Injection (Dev scripts)** | `verify-crx.sh:153` — `${CRX_FILE}` (user-supplied arg) interpolated into inline Python `open('${CRX_FILE}', 'rb')`. A filename with `'` allows code injection. | Pass via `sys.argv`: `python3 -c "import sys; f=sys.argv[1]; ..." "$CRX_FILE"`. |
| 3 | **XML Injection** | `generate-updates-xml.sh:137-141` — `CRX_URL` is interpolated directly into XML output. URL is only validated for `^https?://` prefix. Characters like `"`, `<`, `>`, `&` in the URL would produce malformed/exploitable XML. | XML-encode the URL value, or validate it more strictly (e.g., disallow `<>&"` characters). |
| 4 | **Accepts HTTP URLs** | `generate-updates-xml.sh:126` — The CRX URL validation accepts `http://`, not just `https://`. CRX served over HTTP is vulnerable to MITM. | Require `^https://` only. Warn or fail on plain HTTP. |
| 5 | **Missing `xxd` check** | `generate-key.sh` uses `xxd` (line 44) but only checks for `openssl`. The sister script `derive-extension-id.sh` properly checks for both. | Add `command -v xxd` check alongside the `openssl` check. |
| 6 | **PowerShell `$ErrorActionPreference` not set** | `install.ps1` and `uninstall.ps1` rely on default `Continue` behavior. Registry operations that fail silently could leave the system in an inconsistent state. | Add `$ErrorActionPreference = 'Stop'` near the top of both scripts, and wrap the main body in a `try/finally`. |
| 7 | **JSON injection in `none` fallback** | `install.sh:162`, `uninstall.sh:145` — The `none` (no jq/python) JSON writer does `printf '"%s"' "$entry"` without escaping `"` or `\` in entry values. A malicious policy entry containing `"` would produce broken JSON. | Escape `"` and `\` in entries before writing, or refuse to operate without jq/python for safety. |
| 8 | **Error messages not always to stderr** | Several functions in install scripts use `err()` which writes to stdout via `printf`. While `err` has `[ERR]` prefix, the output goes to stdout, not stderr. The CRX scripts are better — they use `>&2`. | Change `err()` in `install.sh`, `install-mac.sh`, `uninstall.sh` to: `printf "${RED} [ERR] ${RESET} %s\n" "$1" >&2` |
| 9 | **`stat` portability** | `verify-crx.sh:92` — Uses `stat -c%s` (Linux) with fallback to `stat -f%z` (macOS). This is fine, but the `|| echo "0"` fallback means a genuinely unreadable file shows as 0 bytes rather than erroring. | Fail explicitly if stat returns no output, rather than defaulting to 0. |
| 10 | **TOCTOU in policy file writes** | `install.sh` reads the policy JSON file, processes it, then writes it back. Between read and write, another process could modify the file. Running as root with no file locking. | Use `flock` on Linux for the policy file during read-modify-write. Low probability but worth hardening for a root-running script. |

---

## 🟢 Nits

| # | Issue | Location | Note |
|---|-------|----------|------|
| 1 | `install.sh:355` uses `$*` (unquoted) in the "Run with sudo" hint | `install.sh:355` | Use `"$@"` — `$*` doesn't preserve argument boundaries with spaces |
| 2 | `package-crx.sh:246` — `sha256sum` fallback for macOS not provided | `package-crx.sh:246` | Script only uses `sha256sum`. Add `shasum -a 256` fallback like `verify-crx.sh` does. |
| 3 | Color variables use unquoted `$RESET` etc. in `printf` format strings | Throughout install scripts | These work because they're in the format string, but `printf "%s\n" "${CYAN}..."` would be safer if color vars ever contained `%`. |

---

## ✅ Well Done

- **Consistent `set -euo pipefail`** across all 8 bash scripts. This is the gold standard.
- **Cleanup trap** in `package-crx.sh` — `trap cleanup EXIT` properly removes temp directories even on failure.
- **Smart color detection** — all install scripts disable ANSI colors when stdout is not a TTY (`[[ -t 1 ]]`). This means piped output and logs are clean.
- **Idempotent operations** — all install/uninstall scripts check for existing configuration before acting, preventing duplicate entries.
- **Existing policy preservation** — the install scripts correctly read, modify, and write back existing policy entries rather than clobbering them. This respects other extensions' policies.
- **Version format validation** — `package-crx.sh` and `generate-updates-xml.sh` both enforce semver regex, which eliminates most injection risk through the version parameter.
- **Extension ID validation** — `generate-updates-xml.sh` validates `^[a-p]{32}$`, which is exactly correct for Chrome extension IDs.
- **Key file permissions** — `generate-key.sh` sets `chmod 600` immediately after creation.
- **Policy file permissions** — `install.sh` sets `chmod 644` on policy JSON files (world-readable, root-writable), which is correct for browser policy files.
- **No `eval`** — zero uses of `eval` or `exec` across all scripts.
- **No downloads** — install scripts configure browser policy only; they don't download binaries, eliminating supply-chain risk.
- **PowerShell parameter validation** — `install.ps1` uses `[ValidateSet()]` for the browser parameter.
- **Admin privilege verification** — both PowerShell scripts check for Administrator before modifying the registry.
- **Cross-platform `stat`** — `verify-crx.sh` handles both Linux and macOS `stat` syntax.

---

## ⚠️ Shortcuts Detected

| Location | Shortcut | Risk |
|----------|----------|------|
| `install.sh:149` | Shell→Python string interpolation instead of proper IPC (stdin/argv) | **Root-level code execution** if policy file is attacker-controlled |
| `uninstall.sh:132` | Same pattern | Same risk |
| `package-crx.sh:205` | `sed -i` fallback for manifest version update — no quoting of `${VERSION}` in sed pattern | Mitigated by prior regex validation, but sed should use a different delimiter if version contained `/` |
| `install-mac.sh:298` | `declare -A` on macOS (bash 3.2 default) | **Script will not run** on stock macOS without Homebrew bash |
| `uninstall.sh:182,297` | Same `declare -A` on macOS codepath | Same — crashes on stock macOS |
| `install.ps1`, `uninstall.ps1` | No `$ErrorActionPreference = 'Stop'` | Registry errors silently swallowed under default `Continue` |

---

## Summary by Severity

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 6 | 4 code injection (Python inline), 2 macOS compatibility (script won't run) |
| 🟡 Suggestion | 10 | Injection hardening (dev scripts), XML injection, HTTP URLs, missing tool checks, error handling |
| 🟢 Nit | 3 | Minor quoting, cross-platform sha256, printf safety |

---

## Priority Fix Order

1. **Fix all Python inline interpolation** in `install.sh` and `uninstall.sh` — these run as root on user machines. Use `sys.stdin` or `sys.argv` instead of string interpolation. This is the single most important fix.
2. **Fix `declare -A` on macOS** — `install-mac.sh` and `uninstall.sh` macOS codepath are completely broken on stock macOS.
3. **Harden dev scripts** (`package-crx.sh`, `verify-crx.sh`) — pass file paths via `sys.argv` to Python.
4. **Set `$ErrorActionPreference = 'Stop'`** in both PowerShell scripts.
5. **Fix XML injection** in `generate-updates-xml.sh`.
6. **Add `xxd` check** to `generate-key.sh`.

---

> *Every line of code is guilty until proven correct. Six lines were found guilty. The evidence is above. Fix them, and then show me the evidence again.* — Durga

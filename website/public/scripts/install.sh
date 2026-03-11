#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-Coursera Assistant — Linux Browser Extension Policy Installer
#
# Configures managed browser policies to force-install the Auto-Coursera
# Assistant extension for Chromium-based browsers on Linux.
#
# Usage:
#   ./install.sh [chrome|edge|brave|chromium|all] [--uninstall]
#
# If run from a saved file without root privileges, the script will request
# sudo and relaunch itself. Piped one-liners should still use `| sudo bash`.
#
# Author:  nicx
# Project: Auto-Coursera Assistant
# Website: https://autocr.nicx.me
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

EXTENSION_NAME="Auto-Coursera Assistant"
EXTENSION_ID="alojpdnpiddmekflpagdblmaehbdfcge"
UPDATE_URL="https://autocr.nicx.me/updates.xml"
POLICY_VALUE="${EXTENSION_ID};${UPDATE_URL}"
POLICY_FILENAME="auto_coursera.json"

# ── Colors ───────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# ── Output Helpers ───────────────────────────────────────────────────────────

info()    { printf "${CYAN}  [INFO]${RESET} %s\n" "$1"; }
success() { printf "${GREEN}  [OK]  ${RESET} %s\n" "$1"; }
warn()    { printf "${YELLOW}  [WARN]${RESET} %s\n" "$1"; }
err()     { printf "${RED}  [ERR] ${RESET} %s\n" "$1"; }

banner() {
    echo ""
    printf "${CYAN}  ╔══════════════════════════════════════════════════╗${RESET}\n"
    printf "${CYAN}  ║       Auto-Coursera Assistant Installer          ║${RESET}\n"
    printf "${CYAN}  ║     Linux Browser Extension Policy Tool          ║${RESET}\n"
    printf "${CYAN}  ╚══════════════════════════════════════════════════╝${RESET}\n"
    echo ""
}

usage() {
    echo "Usage: $0 [browser] [--uninstall]"
    echo ""
    echo "Browsers:  chrome, edge, brave, chromium, all (default: all)"
    echo "Options:   --uninstall   Remove the extension policy"
    echo ""
    echo "Examples:"
    echo "  $0                      # Install for all detected browsers (sudo requested if needed)"
    echo "  $0 chrome               # Install for Chrome only"
    echo "  $0 --uninstall          # Remove from all browsers"
    echo "  $0 edge --uninstall"
    echo "  curl -fsSL https://autocr.nicx.me/scripts/install.sh | sudo bash"
    echo ""
}

resolve_script_path() {
    local candidate="${BASH_SOURCE[0]:-${0:-}}"

    if [[ -n "$candidate" && -f "$candidate" ]]; then
        printf '%s\n' "$candidate"
        return 0
    fi

    return 1
}

ensure_root() {
    if [[ $EUID -eq 0 ]]; then
        return 0
    fi

    err "Root privileges are required to write managed browser policy files under /etc."

    if ! command -v sudo &>/dev/null; then
        echo ""
        echo "  'sudo' is not available on this system."
        echo "  Re-run this script as root or use 'su -c \"bash ./install.sh $*\"'."
        echo ""
        exit 1
    fi

    local script_path
    if script_path=$(resolve_script_path); then
        local bash_path="${BASH:-/bin/bash}"
        info "Requesting sudo so the installer can continue..."
        exec sudo "$bash_path" "$script_path" "$@"
    fi

    warn "This shell is running the script from stdin, so it cannot safely relaunch itself with sudo."
    echo ""
    echo "  Re-run the one-liner like this:"
    echo "    curl -fsSL https://autocr.nicx.me/scripts/install.sh | sudo bash"
    echo ""
    echo "  Or save the script first, then run it normally and let it request sudo:"
    echo "    curl -fsSLO https://autocr.nicx.me/scripts/install.sh"
    echo "    chmod +x install.sh"
    echo "    ./install.sh"
    echo ""
    exit 1
}

# ── Browser Definitions ─────────────────────────────────────────────────────

# Parallel arrays for browser definitions
BROWSER_KEYS=("chrome" "edge" "brave" "chromium")
BROWSER_NAMES=("Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium")
BROWSER_COMMANDS=("google-chrome google-chrome-stable" "microsoft-edge microsoft-edge-stable" "brave-browser brave-browser-stable" "chromium chromium-browser")
BROWSER_POLICY_DIRS=("/etc/opt/chrome/policies/managed" "/etc/opt/edge/policies/managed" "/etc/brave/policies/managed" "/etc/chromium/policies/managed")

# ── JSON Helpers ─────────────────────────────────────────────────────────────

# Choose the best available JSON tool
json_tool=""
detect_json_tool() {
    if command -v jq &>/dev/null; then
        json_tool="jq"
    elif command -v python3 &>/dev/null; then
        json_tool="python3"
    elif command -v python &>/dev/null; then
        json_tool="python"
    else
        json_tool="none"
    fi
}

# Read ExtensionInstallForcelist from a policy file, outputs one entry per line
read_forcelist() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        return
    fi

    case "$json_tool" in
        jq)
            jq -r '.ExtensionInstallForcelist[]? // empty' "$file" 2>/dev/null || true
            ;;
        python3|python)
            "$json_tool" -c "
import json, sys
try:
    data = json.load(open(sys.argv[1]))
    for item in data.get('ExtensionInstallForcelist', []):
        print(item)
except Exception:
    pass
" "$file" 2>/dev/null || true
            ;;
        none)
            # Fallback: grep-based extraction (handles simple single-line arrays)
            grep -oP '"[^"]*;[^"]*"' "$file" 2>/dev/null | tr -d '"' || true
            ;;
    esac
}

# Write a complete policy file with the given forcelist entries (one per line via stdin)
write_policy_file() {
    local file="$1"
    local entries=()

    while IFS= read -r line; do
        [[ -n "$line" ]] && entries+=("$line")
    done

    if [[ ${#entries[@]} -eq 0 ]]; then
        # Nothing to write — remove file if it exists
        rm -f "$file"
        return
    fi

    case "$json_tool" in
        jq)
            local json_array
            json_array=$(printf '%s\n' "${entries[@]}" | jq -R . | jq -s '.')
            echo "{\"ExtensionInstallForcelist\": ${json_array}}" | jq '.' > "$file"
            ;;
        python3|python)
            printf '%s\n' "${entries[@]}" | "$json_tool" -c "
import json, sys
entries = [line.strip() for line in sys.stdin if line.strip()]
data = {'ExtensionInstallForcelist': entries}
with open(sys.argv[1], 'w') as f:
    json.dump(data, f, indent=4)
    f.write('\n')
" "$file" 2>/dev/null
            ;;
        none)
            # Manual JSON construction
            {
                echo '{'
                echo '    "ExtensionInstallForcelist": ['
                local i=0
                for entry in "${entries[@]}"; do
                    if (( i > 0 )); then
                        echo ","
                    fi
                    printf '        "%s"' "$entry"
                    ((i++))
                done
                echo ""
                echo '    ]'
                echo '}'
            } > "$file"
            ;;
    esac

    chmod 644 "$file"
}

# ── Browser Detection ────────────────────────────────────────────────────────

is_browser_installed() {
    local idx="$1"
    local cmds="${BROWSER_COMMANDS[$idx]}"

    for cmd in $cmds; do
        if command -v "$cmd" &>/dev/null; then
            return 0
        fi
    done
    return 1
}

# ── Install Logic ────────────────────────────────────────────────────────────

install_for_browser() {
    local idx="$1"
    local name="${BROWSER_NAMES[$idx]}"
    local policy_dir="${BROWSER_POLICY_DIRS[$idx]}"
    local policy_file="${policy_dir}/${POLICY_FILENAME}"

    if ! is_browser_installed "$idx"; then
        warn "${name} is not installed — skipping"
        echo "skipped:not_installed"
        return
    fi

    info "Configuring ${name}..."

    # Create policy directory
    if [[ ! -d "$policy_dir" ]]; then
        mkdir -p "$policy_dir"
        chmod 0755 "$policy_dir"
        info "  Created policy directory: ${policy_dir}"
    fi

    # Read existing entries
    local existing_entries=()
    if [[ -f "$policy_file" ]]; then
        while IFS= read -r line; do
            [[ -n "$line" ]] && existing_entries+=("$line")
        done < <(read_forcelist "$policy_file")
    fi

    # Check if already configured
    for entry in "${existing_entries[@]+"${existing_entries[@]}"}"; do
        if [[ "$entry" == *"${EXTENSION_ID}"* ]]; then
            warn "  ${EXTENSION_NAME} is already in ${name} policy — skipping"
            echo "skipped:already_configured"
            return
        fi
    done

    # Add our extension
    existing_entries+=("$POLICY_VALUE")

    # Write the policy file
    printf '%s\n' "${existing_entries[@]}" | write_policy_file "$policy_file"

    if [[ -f "$policy_file" ]]; then
        success "${name} — policy installed (${policy_file})"
        echo "installed"
    else
        err "  Failed to write policy for ${name}"
        echo "failed"
    fi
}

# ── Uninstall Logic ──────────────────────────────────────────────────────────

uninstall_for_browser() {
    local idx="$1"
    local name="${BROWSER_NAMES[$idx]}"
    local policy_dir="${BROWSER_POLICY_DIRS[$idx]}"
    local policy_file="${policy_dir}/${POLICY_FILENAME}"

    info "Checking ${name}..."

    if [[ ! -f "$policy_file" ]]; then
        warn "  No policy file found for ${name} — skipping"
        echo "skipped:no_policy"
        return
    fi

    # Read existing entries
    local existing_entries=()
    local found=false
    while IFS= read -r line; do
        [[ -n "$line" ]] && existing_entries+=("$line")
    done < <(read_forcelist "$policy_file")

    # Filter out our extension
    local remaining=()
    for entry in "${existing_entries[@]+"${existing_entries[@]}"}"; do
        if [[ "$entry" == *"${EXTENSION_ID}"* ]]; then
            found=true
        else
            remaining+=("$entry")
        fi
    done

    if [[ "$found" != true ]]; then
        warn "  ${EXTENSION_NAME} not found in ${name} policy"
        echo "skipped:not_found"
        return
    fi

    if [[ ${#remaining[@]} -eq 0 ]]; then
        # No entries left — remove the file
        rm -f "$policy_file"
        success "${name} — policy file removed (was only entry)"
    else
        # Write back remaining entries
        printf '%s\n' "${remaining[@]}" | write_policy_file "$policy_file"
        success "${name} — extension removed from policy"
    fi

    echo "removed"
}

# ── Argument Parsing ─────────────────────────────────────────────────────────

TARGET="all"
UNINSTALL=false

for arg in "$@"; do
    case "$arg" in
        --uninstall|-u)
            UNINSTALL=true
            ;;
        --help|-h)
            banner
            usage
            exit 0
            ;;
        chrome|edge|brave|chromium|all)
            TARGET="$arg"
            ;;
        *)
            err "Unknown argument: $arg"
            usage
            exit 1
            ;;
    esac
done

# ── Main Execution ───────────────────────────────────────────────────────────

banner

# Check root
ensure_root "$@"

# Detect JSON tool
detect_json_tool
info "JSON tool: ${json_tool}"

# Determine mode
if [[ "$UNINSTALL" == true ]]; then
    info "Mode: Uninstall"
else
    info "Mode: Install"
fi

if [[ "$TARGET" == "all" ]]; then
    info "Target: All detected browsers"
else
    info "Target: ${TARGET}"
fi
echo ""

# Determine which browsers to process
declare -A RESULTS

for i in "${!BROWSER_KEYS[@]}"; do
    key="${BROWSER_KEYS[$i]}"

    if [[ "$TARGET" != "all" && "$TARGET" != "$key" ]]; then
        continue
    fi

    if [[ "$UNINSTALL" == true ]]; then
        result=$(uninstall_for_browser "$i")
    else
        result=$(install_for_browser "$i")
    fi

    # Get the last line as the status (output helpers go to stderr workaround)
    status=$(echo "$result" | tail -n1)
    RESULTS[$key]="$status"
done

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
printf "${CYAN}  ── Summary ──────────────────────────────────────────${RESET}\n"
echo ""

any_action=false

for i in "${!BROWSER_KEYS[@]}"; do
    key="${BROWSER_KEYS[$i]}"
    name="${BROWSER_NAMES[$i]}"

    if [[ -z "${RESULTS[$key]+x}" ]]; then
        continue
    fi

    status="${RESULTS[$key]}"

    case "$status" in
        installed)
            printf "${GREEN}    ✓ ${RESET}%s: Extension policy installed\n" "$name"
            any_action=true
            ;;
        removed)
            printf "${GREEN}    ✓ ${RESET}%s: Extension policy removed\n" "$name"
            any_action=true
            ;;
        skipped:*)
            reason="${status#skipped:}"
            reason="${reason//_/ }"
            printf "${YELLOW}    - ${RESET}%s: Skipped (%s)\n" "$name" "$reason"
            ;;
        failed)
            printf "${RED}    ✗ ${RESET}%s: Failed\n" "$name"
            ;;
    esac
done

echo ""

if [[ "$any_action" == true ]]; then
    printf "${YELLOW}  ┌──────────────────────────────────────────────────┐${RESET}\n"
    printf "${YELLOW}  │  Please restart your browser(s) for changes to   │${RESET}\n"
    printf "${YELLOW}  │  take effect.                                    │${RESET}\n"
    printf "${YELLOW}  └──────────────────────────────────────────────────┘${RESET}\n"
else
    info "No changes were made."
fi

echo ""

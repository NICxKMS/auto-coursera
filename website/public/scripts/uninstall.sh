#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-Coursera Assistant — Cross-Platform Browser Extension Policy Uninstaller
#
# Removes the Auto-Coursera Assistant extension from browser force-install
# policies on both Linux and macOS.
#
# Usage:
#   Linux: sudo ./uninstall.sh
#   macOS: ./uninstall.sh
#
# Author:  nicx
# Project: Auto-Coursera Assistant
# Website: https://autocr.nicx.me
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

EXTENSION_NAME="Auto-Coursera Assistant"
EXTENSION_ID="alojpdnpiddmekflpagdblmaehbdfcge"
POLICY_FILENAME="auto_coursera.json"
PLIST_KEY="ExtensionInstallForcelist"

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
    printf "${CYAN}  ║      Auto-Coursera Assistant Uninstaller         ║${RESET}\n"
    printf "${CYAN}  ║    Browser Extension Policy Removal Tool         ║${RESET}\n"
    printf "${CYAN}  ╚══════════════════════════════════════════════════╝${RESET}\n"
    echo ""
}

usage() {
    echo "Usage:"
    echo "  Linux: sudo $0"
    echo "  macOS: $0"
    echo ""
    echo "Removes the ${EXTENSION_NAME} from all browser force-install policies."
    echo ""
}

# ── Detect OS ────────────────────────────────────────────────────────────────

OS="$(uname -s)"

# ── JSON Helper (Linux) ─────────────────────────────────────────────────────

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

read_forcelist_from_file() {
    local file="$1"
    [[ -f "$file" ]] || return 0

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
            grep -oP '"[^"]*;[^"]*"' "$file" 2>/dev/null | tr -d '"' || true
            ;;
    esac
}

write_forcelist_to_file() {
    local file="$1"
    local entries=()

    while IFS= read -r line; do
        [[ -n "$line" ]] && entries+=("$line")
    done

    if [[ ${#entries[@]} -eq 0 ]]; then
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
            {
                echo '{'
                echo '    "ExtensionInstallForcelist": ['
                local i=0
                for entry in "${entries[@]}"; do
                    if (( i > 0 )); then echo ","; fi
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

# ══════════════════════════════════════════════════════════════════════════════
# LINUX UNINSTALL
# ══════════════════════════════════════════════════════════════════════════════

LINUX_BROWSER_NAMES=("Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium")
LINUX_POLICY_DIRS=("/etc/opt/chrome/policies/managed" "/etc/opt/edge/policies/managed" "/etc/brave/policies/managed" "/etc/chromium/policies/managed")

uninstall_linux() {
    # Check root
    if [[ $EUID -ne 0 ]]; then
        err "On Linux, this script must be run as root."
        echo ""
        echo "  Run with: sudo $0"
        echo ""
        exit 1
    fi

    detect_json_tool
    info "JSON tool: ${json_tool}"
    echo ""

    local total_found=0
    local total_removed=0
    declare -A results

    for i in "${!LINUX_BROWSER_NAMES[@]}"; do
        local name="${LINUX_BROWSER_NAMES[$i]}"
        local policy_dir="${LINUX_POLICY_DIRS[$i]}"
        local policy_file="${policy_dir}/${POLICY_FILENAME}"

        info "Checking ${name}..."

        if [[ ! -f "$policy_file" ]]; then
            warn "  No policy file found — skipping"
            results[$name]="no_policy"
            continue
        fi

        # Read existing entries
        local entries=()
        while IFS= read -r line; do
            [[ -n "$line" ]] && entries+=("$line")
        done < <(read_forcelist_from_file "$policy_file")

        # Filter out our extension
        local found=false
        local remaining=()
        for entry in "${entries[@]+"${entries[@]}"}"; do
            if [[ "$entry" == *"${EXTENSION_ID}"* ]]; then
                found=true
                ((total_found++))
            else
                remaining+=("$entry")
            fi
        done

        if [[ "$found" != true ]]; then
            warn "  ${EXTENSION_NAME} not found in policy"
            results[$name]="not_found"
            continue
        fi

        if [[ ${#remaining[@]} -eq 0 ]]; then
            rm -f "$policy_file"
            success "${name} — policy file removed (was only entry)"

            # Clean up empty directory
            if [[ -d "$policy_dir" ]] && [[ -z "$(ls -A "$policy_dir" 2>/dev/null)" ]]; then
                rmdir "$policy_dir" 2>/dev/null || true
                info "  Cleaned up empty policy directory"
            fi
        else
            printf '%s\n' "${remaining[@]}" | write_forcelist_to_file "$policy_file"
            success "${name} — extension removed from policy (${#remaining[@]} entries remain)"
        fi

        ((total_removed++))
        results[$name]="removed"
    done

    # Summary
    echo ""
    printf "${CYAN}  ── Summary (Linux) ──────────────────────────────────${RESET}\n"
    echo ""

    for name in "${LINUX_BROWSER_NAMES[@]}"; do
        if [[ -z "${results[$name]+x}" ]]; then
            continue
        fi

        local status="${results[$name]}"
        case "$status" in
            removed)
                printf "${GREEN}    ✓ ${RESET}%s: Extension policy removed\n" "$name"
                ;;
            not_found)
                printf "${YELLOW}    - ${RESET}%s: Extension not found in policy\n" "$name"
                ;;
            no_policy)
                printf "${YELLOW}    - ${RESET}%s: No policy file exists\n" "$name"
                ;;
        esac
    done

    echo ""
    info "Found ${total_found}, removed from ${total_removed} browser(s)."

    if [[ $total_removed -gt 0 ]]; then
        echo ""
        printf "${YELLOW}  ┌──────────────────────────────────────────────────┐${RESET}\n"
        printf "${YELLOW}  │  Please restart your browser(s) for changes to   │${RESET}\n"
        printf "${YELLOW}  │  take effect.                                    │${RESET}\n"
        printf "${YELLOW}  └──────────────────────────────────────────────────┘${RESET}\n"
    else
        info "No changes were made."
    fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MACOS UNINSTALL
# ══════════════════════════════════════════════════════════════════════════════

MACOS_BROWSER_NAMES=("Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium")
MACOS_DOMAINS=("com.google.Chrome" "com.microsoft.Edge" "com.brave.Browser" "org.chromium.Chromium")

read_forcelist_from_defaults() {
    local domain="$1"
    local raw

    raw=$(defaults read "$domain" "$PLIST_KEY" 2>/dev/null) || return 0
    echo "$raw" | grep -oE '"[^"]*"' | tr -d '"' || true
}

uninstall_macos() {
    echo ""

    local total_found=0
    local total_removed=0
    local result_values=()

    for i in "${!MACOS_BROWSER_NAMES[@]}"; do
        local name="${MACOS_BROWSER_NAMES[$i]}"
        local domain="${MACOS_DOMAINS[$i]}"

        info "Checking ${name} (${domain})..."

        # Check if key exists
        if ! defaults read "$domain" "$PLIST_KEY" &>/dev/null; then
            warn "  No policy key found — skipping"
            result_values[$i]="no_policy"
            continue
        fi

        # Read current entries
        local entries=()
        while IFS= read -r line; do
            [[ -n "$line" ]] && entries+=("$line")
        done < <(read_forcelist_from_defaults "$domain")

        # Filter out our extension
        local found=false
        local remaining=()
        for entry in "${entries[@]+"${entries[@]}"}"; do
            if [[ "$entry" == *"${EXTENSION_ID}"* ]]; then
                found=true
                ((total_found++))
            else
                remaining+=("$entry")
            fi
        done

        if [[ "$found" != true ]]; then
            warn "  ${EXTENSION_NAME} not found in policy"
            result_values[$i]="not_found"
            continue
        fi

        if [[ ${#remaining[@]} -eq 0 ]]; then
            # Only entry — delete key entirely
            defaults delete "$domain" "$PLIST_KEY" 2>/dev/null || true
            success "${name} — policy key removed (was only entry)"
        else
            # Rebuild array without our extension
            defaults delete "$domain" "$PLIST_KEY" 2>/dev/null || true

            local args=("$domain" "$PLIST_KEY" "-array")
            for entry in "${remaining[@]}"; do
                args+=("$entry")
            done
            defaults write "${args[@]}"

            success "${name} — extension removed from policy (${#remaining[@]} entries remain)"
        fi

        ((total_removed++))
        result_values[$i]="removed"
    done

    # Summary
    echo ""
    printf "${CYAN}  ── Summary (macOS) ──────────────────────────────────${RESET}\n"
    echo ""

    for i in "${!MACOS_BROWSER_NAMES[@]}"; do
        local name="${MACOS_BROWSER_NAMES[$i]}"
        if [[ -z "${result_values[$i]+x}" ]]; then
            continue
        fi

        local status="${result_values[$i]}"
        case "$status" in
            removed)
                printf "${GREEN}    ✓ ${RESET}%s: Extension policy removed\n" "$name"
                ;;
            not_found)
                printf "${YELLOW}    - ${RESET}%s: Extension not found in policy\n" "$name"
                ;;
            no_policy)
                printf "${YELLOW}    - ${RESET}%s: No policy key exists\n" "$name"
                ;;
        esac
    done

    echo ""
    info "Found ${total_found}, removed from ${total_removed} browser(s)."

    if [[ $total_removed -gt 0 ]]; then
        echo ""
        printf "${YELLOW}  ┌──────────────────────────────────────────────────┐${RESET}\n"
        printf "${YELLOW}  │  Please restart your browser(s) for changes to   │${RESET}\n"
        printf "${YELLOW}  │  take effect.                                    │${RESET}\n"
        printf "${YELLOW}  └──────────────────────────────────────────────────┘${RESET}\n"
    else
        info "No changes were made."
    fi
}

# ── Argument Parsing ─────────────────────────────────────────────────────────

for arg in "$@"; do
    case "$arg" in
        --help|-h)
            banner
            usage
            exit 0
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

case "$OS" in
    Linux)
        info "Detected OS: Linux"
        uninstall_linux
        ;;
    Darwin)
        info "Detected OS: macOS"
        uninstall_macos
        ;;
    *)
        err "Unsupported OS: ${OS}"
        echo ""
        echo "  This script supports Linux and macOS."
        echo "  For Windows, use: .\\uninstall.ps1"
        echo ""
        exit 1
        ;;
esac

echo ""

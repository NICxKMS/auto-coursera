#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auto-Coursera Assistant — macOS Browser Extension Policy Installer
#
# Configures macOS user defaults (preferences) to force-install the
# Auto-Coursera Assistant extension for Chromium-based browsers.
#
# Does NOT require root — uses `defaults write` for the current user.
#
# Usage:
#   ./install-mac.sh [chrome|edge|brave|chromium|all] [--uninstall]
#
# Author:  nicx
# Project: Auto-Coursera Assistant
# Website: https://autocr.nicx.app
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

EXTENSION_NAME="Auto-Coursera Assistant"
EXTENSION_ID="EXTENSION_ID_PLACEHOLDER"
UPDATE_URL="https://cdn.autocr.nicx.app/updates.xml"
POLICY_VALUE="${EXTENSION_ID};${UPDATE_URL}"
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
    printf "${CYAN}  ║       Auto-Coursera Assistant Installer          ║${RESET}\n"
    printf "${CYAN}  ║     macOS Browser Extension Policy Tool          ║${RESET}\n"
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
    echo "  $0                     # Install for all detected browsers"
    echo "  $0 chrome              # Install for Chrome only"
    echo "  $0 --uninstall         # Remove from all browsers"
    echo "  $0 edge --uninstall    # Remove from Edge only"
    echo ""
    echo "Note: Does not require root/sudo."
    echo ""
}

# ── Browser Definitions ─────────────────────────────────────────────────────

BROWSER_KEYS=("chrome" "edge" "brave" "chromium")
BROWSER_NAMES=("Google Chrome" "Microsoft Edge" "Brave Browser" "Chromium")
BROWSER_APP_NAMES=("Google Chrome.app" "Microsoft Edge.app" "Brave Browser.app" "Chromium.app")
BROWSER_DOMAINS=("com.google.Chrome" "com.microsoft.Edge" "com.brave.Browser" "org.chromium.Chromium")

# ── Browser Detection ────────────────────────────────────────────────────────

is_browser_installed() {
    local idx="$1"
    local app_name="${BROWSER_APP_NAMES[$idx]}"

    # Check standard locations
    if [[ -d "/Applications/${app_name}" ]]; then
        return 0
    fi
    if [[ -d "${HOME}/Applications/${app_name}" ]]; then
        return 0
    fi

    # Also check via mdfind (Spotlight) as a fallback
    if command -v mdfind &>/dev/null; then
        local found
        found=$(mdfind "kMDItemCFBundleIdentifier == '${BROWSER_DOMAINS[$idx]}'" 2>/dev/null | head -n1)
        if [[ -n "$found" ]]; then
            return 0
        fi
    fi

    return 1
}

# ── Defaults Helpers ─────────────────────────────────────────────────────────

# Read the ExtensionInstallForcelist array from a domain.
# Outputs one entry per line. Returns nothing if key doesn't exist.
read_forcelist() {
    local domain="$1"
    local raw

    # defaults read outputs a plist-style array like:
    #   (
    #       "value1",
    #       "value2"
    #   )
    raw=$(defaults read "$domain" "$PLIST_KEY" 2>/dev/null) || return 0

    # Parse the output — extract quoted strings
    echo "$raw" | grep -oE '"[^"]*"' | tr -d '"' || true
}

# Check if our extension is already in the forcelist
is_extension_in_list() {
    local domain="$1"
    local entries

    entries=$(read_forcelist "$domain")
    if [[ -z "$entries" ]]; then
        return 1
    fi

    echo "$entries" | grep -qF "$EXTENSION_ID"
}

# ── Install Logic ────────────────────────────────────────────────────────────

install_for_browser() {
    local idx="$1"
    local name="${BROWSER_NAMES[$idx]}"
    local domain="${BROWSER_DOMAINS[$idx]}"

    if ! is_browser_installed "$idx"; then
        warn "${name} is not installed — skipping"
        echo "skipped:not_installed"
        return
    fi

    info "Configuring ${name} (${domain})..."

    # Check if already configured
    if is_extension_in_list "$domain"; then
        warn "  ${EXTENSION_NAME} is already in ${name} policy — skipping"
        echo "skipped:already_configured"
        return
    fi

    # Check if the key exists at all
    if defaults read "$domain" "$PLIST_KEY" &>/dev/null; then
        # Key exists — add to existing array
        defaults write "$domain" "$PLIST_KEY" -array-add "$POLICY_VALUE"
        info "  Added to existing policy array"
    else
        # Key doesn't exist — create new array
        defaults write "$domain" "$PLIST_KEY" -array "$POLICY_VALUE"
        info "  Created new policy array"
    fi

    # Verify
    if is_extension_in_list "$domain"; then
        success "${name} — policy installed"
        echo "installed"
    else
        err "  Failed to verify policy for ${name}"
        echo "failed"
    fi
}

# ── Uninstall Logic ──────────────────────────────────────────────────────────

uninstall_for_browser() {
    local idx="$1"
    local name="${BROWSER_NAMES[$idx]}"
    local domain="${BROWSER_DOMAINS[$idx]}"

    info "Checking ${name} (${domain})..."

    # Check if key exists at all
    if ! defaults read "$domain" "$PLIST_KEY" &>/dev/null; then
        warn "  No policy key found for ${name} — skipping"
        echo "skipped:no_policy"
        return
    fi

    # Read current entries
    local entries=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && entries+=("$line")
    done < <(read_forcelist "$domain")

    # Check if our extension is in the list
    local found=false
    local remaining=()
    for entry in "${entries[@]+"${entries[@]}"}"; do
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
        # Our extension was the only entry — delete the key entirely
        defaults delete "$domain" "$PLIST_KEY" 2>/dev/null || true
        success "${name} — policy key removed (was only entry)"
    else
        # Rebuild the array without our extension
        # First, delete the old key
        defaults delete "$domain" "$PLIST_KEY" 2>/dev/null || true

        # Then write a fresh array with remaining entries
        # `defaults write` with -array takes multiple values
        local args=("$domain" "$PLIST_KEY" "-array")
        for entry in "${remaining[@]}"; do
            args+=("$entry")
        done
        defaults write "${args[@]}"

        success "${name} — extension removed from policy (${#remaining[@]} entries remain)"
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

# Verify we're on macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
    err "This script is for macOS only."
    echo ""
    echo "  For Linux, use: sudo ./install.sh"
    echo "  For Windows, use: .\\install.ps1"
    echo ""
    exit 1
fi

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

# Process browsers
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

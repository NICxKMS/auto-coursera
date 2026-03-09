#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# derive-extension-id.sh — Derive Chrome extension ID from a private key
# ============================================================================
#
# Chrome extension IDs are derived from the public key:
#   1. Extract the public key in DER format
#   2. Compute SHA256 hash of the public key
#   3. Take the first 32 hex characters (16 bytes)
#   4. Convert each hex digit to a-p (0→a, 1→b, ..., f→p)
#
# This produces the 32-character extension ID used in chrome://extensions

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

usage() {
    echo -e "${BOLD}Usage:${NC} $0 <private-key-file>"
    echo ""
    echo "Derive the Chrome extension ID from an RSA private key."
    echo ""
    echo -e "${BOLD}Arguments:${NC}"
    echo "  <private-key-file>   Path to the RSA private key PEM file"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0 extension-key.pem"
    echo "  $0 /path/to/key.pem"
    echo ""
    echo -e "${BOLD}How it works:${NC}"
    echo "  1. Extract public key in DER format from the private key"
    echo "  2. Compute SHA256 hash of the DER-encoded public key"
    echo "  3. Take the first 32 hex characters (16 bytes)"
    echo "  4. Map each hex digit 0-f → a-p to produce the 32-char ID"
}

hex_to_extension_id() {
    local hex_string="$1"
    local extension_id=""

    for (( i=0; i<${#hex_string}; i++ )); do
        local hex_char="${hex_string:$i:1}"
        local decimal
        decimal=$(printf '%d' "0x${hex_char}")
        # Map 0-15 to a-p (ASCII 97-112)
        local letter
        letter=$(printf "\\x$(printf '%02x' $((decimal + 97)))")
        extension_id+="$letter"
    done

    echo "$extension_id"
}

# ── Argument validation ──────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
    echo -e "${RED}Error: Missing required argument <private-key-file>${NC}" >&2
    echo ""
    usage
    exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
fi

KEY_FILE="$1"

# Check openssl availability
if ! command -v openssl &>/dev/null; then
    echo -e "${RED}Error: openssl is required but not found in PATH${NC}" >&2
    exit 1
fi

# Check xxd availability
if ! command -v xxd &>/dev/null; then
    echo -e "${RED}Error: xxd is required but not found in PATH${NC}" >&2
    echo -e "${YELLOW}Hint: Install xxd (usually part of vim or xxd package)${NC}" >&2
    exit 1
fi

# Check key file exists
if [[ ! -f "$KEY_FILE" ]]; then
    echo -e "${RED}Error: Key file not found: ${KEY_FILE}${NC}" >&2
    exit 1
fi

# Check key file is readable
if [[ ! -r "$KEY_FILE" ]]; then
    echo -e "${RED}Error: Key file is not readable: ${KEY_FILE}${NC}" >&2
    exit 1
fi

# Validate that the file is actually a PEM private key
if ! openssl rsa -in "$KEY_FILE" -check -noout 2>/dev/null; then
    echo -e "${RED}Error: File is not a valid RSA private key: ${KEY_FILE}${NC}" >&2
    exit 1
fi

# ── Derivation ───────────────────────────────────────────────────────────────

# Step 1: Extract public key in DER format and hash it
PUB_KEY_HASH=$(openssl rsa -in "$KEY_FILE" -pubout -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary \
    | xxd -p \
    | tr -d '\n' \
    | head -c 32)

if [[ -z "$PUB_KEY_HASH" ]]; then
    echo -e "${RED}Error: Failed to derive public key hash${NC}" >&2
    exit 1
fi

if [[ ${#PUB_KEY_HASH} -ne 32 ]]; then
    echo -e "${RED}Error: Expected 32 hex characters, got ${#PUB_KEY_HASH}${NC}" >&2
    exit 1
fi

# Step 2: Convert hex to extension ID (a-p encoding)
EXTENSION_ID=$(hex_to_extension_id "$PUB_KEY_HASH")

# ── Output ───────────────────────────────────────────────────────────────────

echo -e "${GREEN}Extension ID: ${BOLD}${EXTENSION_ID}${NC}"
echo ""
echo -e "${CYAN}Key file:     ${KEY_FILE}${NC}"
echo -e "${CYAN}Hex prefix:   ${PUB_KEY_HASH}${NC}"
echo -e "${CYAN}ID length:    ${#EXTENSION_ID} characters${NC}"

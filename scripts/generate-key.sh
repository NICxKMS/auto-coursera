#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# generate-key.sh — Generate a new RSA 2048 private key for CRX signing
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

KEY_FILE="extension-key.pem"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
    echo -e "${BOLD}Usage:${NC} $0 [-o <output-file>] [-h]"
    echo ""
    echo "Generate an RSA 2048 private key for Chrome extension CRX signing."
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo "  -o <file>   Output file path (default: extension-key.pem)"
    echo "  -h          Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0"
    echo "  $0 -o my-key.pem"
}

derive_extension_id() {
    local key_file="$1"

    # Extract the public key in DER format, compute SHA256, take first 32 hex chars,
    # and convert to a-p encoding (Chrome extension ID format)
    local pub_key_hash
    pub_key_hash=$(openssl rsa -in "$key_file" -pubout -outform DER 2>/dev/null \
        | openssl dgst -sha256 -binary \
        | xxd -p \
        | tr -d '\n' \
        | head -c 32)

    # Convert hex to a-p encoding: 0→a, 1→b, ..., 9→j, a→k, b→l, ..., f→p
    local extension_id=""
    for (( i=0; i<${#pub_key_hash}; i++ )); do
        local hex_char="${pub_key_hash:$i:1}"
        local decimal
        decimal=$(printf '%d' "0x${hex_char}")
        local letter
        letter=$(printf "\\x$(printf '%02x' $((decimal + 97)))")
        extension_id+="$letter"
    done

    echo "$extension_id"
}

# Parse arguments
while getopts ":o:h" opt; do
    case $opt in
        o)
            KEY_FILE="$OPTARG"
            ;;
        h)
            usage
            exit 0
            ;;
        \?)
            echo -e "${RED}Error: Invalid option -$OPTARG${NC}" >&2
            usage
            exit 1
            ;;
        :)
            echo -e "${RED}Error: Option -$OPTARG requires an argument${NC}" >&2
            usage
            exit 1
            ;;
    esac
done

# Check for openssl
if ! command -v openssl &>/dev/null; then
    echo -e "${RED}Error: openssl is required but not found in PATH${NC}" >&2
    exit 1
fi

# Resolve key file path relative to project root
if [[ "$KEY_FILE" != /* ]]; then
    KEY_FILE="${PROJECT_DIR}/${KEY_FILE}"
fi

# Check if key already exists
if [[ -f "$KEY_FILE" ]]; then
    echo -e "${YELLOW}Warning: Key file already exists at ${KEY_FILE}${NC}"
    echo -e "${YELLOW}Existing extension ID: $(derive_extension_id "$KEY_FILE")${NC}"
    echo ""
    read -rp "Overwrite? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo -e "${CYAN}Aborted. Existing key preserved.${NC}"
        exit 0
    fi
fi

echo -e "${CYAN}Generating RSA 2048 private key...${NC}"

# Generate the key
openssl genrsa -out "$KEY_FILE" 2048 2>/dev/null

# Restrict permissions
chmod 600 "$KEY_FILE"

echo -e "${GREEN}✓ Private key generated: ${KEY_FILE}${NC}"

# Derive and display extension ID
EXTENSION_ID=$(derive_extension_id "$KEY_FILE")

echo ""
echo -e "${GREEN}✓ Extension ID: ${BOLD}${EXTENSION_ID}${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. ${YELLOW}Save the private key to GitHub Secrets:${NC}"
echo -e "     Secret name: ${BOLD}EXTENSION_PRIVATE_KEY${NC}"
echo -e "     Value: contents of ${KEY_FILE}"
echo ""
echo -e "  2. ${YELLOW}Save the extension ID to GitHub Secrets:${NC}"
echo -e "     Secret name: ${BOLD}EXTENSION_ID${NC}"
echo -e "     Value: ${BOLD}${EXTENSION_ID}${NC}"
echo ""
echo -e "  3. ${YELLOW}Add to your extension's update_url in manifest.json:${NC}"
echo -e "     \"update_url\": \"https://cdn.autocr.nicx.me/updates.xml\""
echo ""
echo -e "${RED}⚠  NEVER commit extension-key.pem to version control!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

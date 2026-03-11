#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# generate-updates-xml.sh — Generate Chrome extension auto-update manifest
# ============================================================================
#
# Produces a local/manual updates.xml fixture for enterprise policy installs
# or self-hosted extension testing.
# Production serves the static updates.xml via https://autocr.nicx.me/updates.xml
# on Cloudflare Pages. This script generates a local fixture for testing.
# See: https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Defaults
EXTENSION_ID=""
VERSION=""
CRX_URL=""
OUTPUT_FILE=""

usage() {
    echo -e "${BOLD}Usage:${NC} $0 -i <extension-id> -v <version> -u <crx-url> [-o <output-file>] [-h]"
    echo ""
    echo "Generate a Chrome extension updates.xml auto-update manifest for local/manual testing."
    echo "Production serves updates.xml via https://autocr.nicx.me/updates.xml (Cloudflare Pages)."
    echo "This helper is not used by the tagged-release CI workflow."
    echo ""
    echo -e "${BOLD}Required:${NC}"
    echo "  -i <extension-id>   Chrome extension ID (32 lowercase letters a-p)"
    echo "  -v <version>        Extension version (e.g., 1.9.1)"
    echo "  -u <crx-url>        Full URL to the CRX file"
    echo ""
    echo -e "${BOLD}Optional:${NC}"
    echo "  -o <output-file>    Output file path (default: stdout)"
    echo "  -h                  Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0 -i abcdefghijklmnopabcdefghijklmnop -v <version> -u https://github.com/NICxKMS/auto-coursera/releases/download/v<version>/auto_coursera_<version>.crx"
    echo "  $0 -i abcdefghijklmnopabcdefghijklmnop -v <version> -u https://github.com/NICxKMS/auto-coursera/releases/download/v<version>/auto_coursera_<version>.crx -o updates.xml"
    echo ""
    echo -e "${BOLD}Output format:${NC}"
    echo '  <?xml version="1.0" encoding="UTF-8"?>'
    echo '  <gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">'
    echo '    <app appid="EXTENSION_ID">'
    echo '      <updatecheck codebase="CRX_URL" version="VERSION"/>'
    echo '    </app>'
    echo '  </gupdate>'
}

log_info() {
    echo -e "${CYAN}ℹ ${NC}$1" >&2
}

log_success() {
    echo -e "${GREEN}✓ ${NC}$1" >&2
}

log_error() {
    echo -e "${RED}✗ ${NC}$1" >&2
}

# ── Parse arguments ──────────────────────────────────────────────────────────

while getopts ":i:v:u:o:h" opt; do
    case $opt in
        i) EXTENSION_ID="$OPTARG" ;;
        v) VERSION="$OPTARG" ;;
        u) CRX_URL="$OPTARG" ;;
        o) OUTPUT_FILE="$OPTARG" ;;
        h) usage; exit 0 ;;
        \?)
            log_error "Invalid option: -$OPTARG"
            usage
            exit 1
            ;;
        :)
            log_error "Option -$OPTARG requires an argument"
            usage
            exit 1
            ;;
    esac
done

# ── Validate inputs ─────────────────────────────────────────────────────────

if [[ -z "$EXTENSION_ID" ]]; then
    log_error "Extension ID is required (-i)"
    echo ""
    usage
    exit 1
fi

if [[ -z "$VERSION" ]]; then
    log_error "Version is required (-v)"
    echo ""
    usage
    exit 1
fi

if [[ -z "$CRX_URL" ]]; then
    log_error "CRX URL is required (-u)"
    echo ""
    usage
    exit 1
fi

# Validate extension ID format (32 lowercase letters a-p)
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
    log_error "Invalid extension ID format: ${EXTENSION_ID}"
    echo -e "${YELLOW}Extension ID must be exactly 32 lowercase characters from a-p.${NC}" >&2
    echo -e "${YELLOW}Use 'bash scripts/derive-extension-id.sh <key-file>' to get your ID.${NC}" >&2
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    log_error "Invalid version format: ${VERSION}"
    echo -e "${YELLOW}Expected format: X.Y.Z or X.Y.Z.W (e.g., 1.9.1)${NC}" >&2
    exit 1
fi

# Validate URL format (basic check)
if [[ ! "$CRX_URL" =~ ^https?:// ]]; then
    log_error "Invalid CRX URL: ${CRX_URL}"
    echo -e "${YELLOW}URL must start with http:// or https://${NC}" >&2
    exit 1
fi

# ── Generate XML ─────────────────────────────────────────────────────────────

XML_CONTENT='<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="'"${EXTENSION_ID}"'">
    <updatecheck codebase="'"${CRX_URL}"'" version="'"${VERSION}"'"/>
  </app>
</gupdate>'

# ── Output ───────────────────────────────────────────────────────────────────

if [[ -n "$OUTPUT_FILE" ]]; then
    # Ensure parent directory exists
    mkdir -p "$(dirname "$OUTPUT_FILE")"

    echo "$XML_CONTENT" > "$OUTPUT_FILE"
    log_success "Local/manual updates.xml written to: ${OUTPUT_FILE}"
    log_info "Extension ID: ${EXTENSION_ID}"
    log_info "Version:      ${VERSION}"
    log_info "CRX URL:      ${CRX_URL}"
else
    echo "$XML_CONTENT"
fi
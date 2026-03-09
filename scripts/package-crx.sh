#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# package-crx.sh — Package a Chrome extension as CRX3
# ============================================================================
#
# Creates a signed CRX3 file from an extension directory using npx crx3.
# Also generates SHA256 checksum file for verification.

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
VERSION=""
KEY_FILE=""
SOURCE_DIR="${PROJECT_DIR}/extension/dist"
OUTPUT_DIR="${PROJECT_DIR}"

usage() {
    echo -e "${BOLD}Usage:${NC} $0 -v <version> -k <key-file> [-s <source-dir>] [-o <output-dir>] [-h]"
    echo ""
    echo "Package a Chrome extension directory as a signed CRX3 file."
    echo ""
    echo -e "${BOLD}Required:${NC}"
    echo "  -v <version>     Extension version (e.g., 1.7.5)"
    echo "  -k <key-file>    Path to RSA private key PEM file"
    echo ""
    echo -e "${BOLD}Optional:${NC}"
    echo "  -s <source-dir>  Extension source directory (default: extension/dist)"
    echo "  -o <output-dir>  Output directory for CRX file (default: project root)"
    echo "  -h               Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0 -v 1.7.5 -k extension-key.pem"
    echo "  $0 -v 1.7.5 -k extension-key.pem -s extension/dist -o releases/"
    echo ""
    echo -e "${BOLD}Output:${NC}"
    echo "  <output-dir>/auto_coursera_<version>.crx"
    echo "  <output-dir>/auto_coursera_<version>.crx.sha256"
}

log_info() {
    echo -e "${CYAN}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

log_warn() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

log_error() {
    echo -e "${RED}✗ ${NC}$1" >&2
}

cleanup() {
    if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR:-}" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

# ── Parse arguments ──────────────────────────────────────────────────────────

while getopts ":v:k:s:o:h" opt; do
    case $opt in
        v) VERSION="$OPTARG" ;;
        k) KEY_FILE="$OPTARG" ;;
        s) SOURCE_DIR="$OPTARG" ;;
        o) OUTPUT_DIR="$OPTARG" ;;
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

if [[ -z "$VERSION" ]]; then
    log_error "Version is required (-v)"
    echo ""
    usage
    exit 1
fi

if [[ -z "$KEY_FILE" ]]; then
    log_error "Key file is required (-k)"
    echo ""
    usage
    exit 1
fi

# Validate version format (semver-like: X.Y.Z or X.Y.Z.W)
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    log_error "Invalid version format: ${VERSION}"
    echo -e "${YELLOW}Expected format: X.Y.Z or X.Y.Z.W (e.g., 1.7.5)${NC}"
    exit 1
fi

# Resolve relative paths
if [[ "$KEY_FILE" != /* ]]; then
    KEY_FILE="${PROJECT_DIR}/${KEY_FILE}"
fi

if [[ "$SOURCE_DIR" != /* ]]; then
    SOURCE_DIR="${PROJECT_DIR}/${SOURCE_DIR}"
fi

if [[ "$OUTPUT_DIR" != /* ]]; then
    OUTPUT_DIR="${PROJECT_DIR}/${OUTPUT_DIR}"
fi

# Check key file
if [[ ! -f "$KEY_FILE" ]]; then
    log_error "Key file not found: ${KEY_FILE}"
    echo -e "${YELLOW}Run 'bash scripts/generate-key.sh' to create one.${NC}"
    exit 1
fi

# Check source directory
if [[ ! -d "$SOURCE_DIR" ]]; then
    log_error "Source directory not found: ${SOURCE_DIR}"
    echo -e "${YELLOW}Run 'cd extension && pnpm build' to create the dist directory.${NC}"
    exit 1
fi

# Check manifest.json exists in source
if [[ ! -f "${SOURCE_DIR}/manifest.json" ]]; then
    log_error "No manifest.json found in source directory: ${SOURCE_DIR}"
    exit 1
fi

# Check Node.js / npx availability
if ! command -v npx &>/dev/null; then
    log_error "npx is required but not found in PATH"
    echo -e "${YELLOW}Install Node.js 20+ to get npx.${NC}"
    exit 1
fi

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# ── Packaging ────────────────────────────────────────────────────────────────

CRX_FILENAME="auto_coursera_${VERSION}.crx"
CRX_PATH="${OUTPUT_DIR}/${CRX_FILENAME}"
SHA256_PATH="${CRX_PATH}.sha256"

echo ""
echo -e "${BOLD}CRX3 Packaging${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log_info "Version:    ${VERSION}"
log_info "Source:     ${SOURCE_DIR}"
log_info "Key:        ${KEY_FILE}"
log_info "Output:     ${CRX_PATH}"
echo ""

# Step 1: Create temp directory with copy of extension
log_info "Preparing extension source..."
TEMP_DIR=$(mktemp -d)
cp -r "${SOURCE_DIR}/"* "$TEMP_DIR/"

# Step 2: Update version in manifest.json
log_info "Updating manifest.json version to ${VERSION}..."
MANIFEST_FILE="${TEMP_DIR}/manifest.json"

if command -v python3 &>/dev/null; then
    python3 -c "
import json, sys
with open(sys.argv[1], 'r') as f:
    manifest = json.load(f)
manifest['version'] = sys.argv[2]
with open(sys.argv[1], 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
" "$MANIFEST_FILE" "$VERSION"
elif command -v node &>/dev/null; then
    node -e "
const fs = require('fs');
const path = process.argv[1];
const version = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
manifest.version = version;
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
" "$MANIFEST_FILE" "$VERSION"
else
    # Fallback: sed-based replacement (less safe but works)
    sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"${VERSION}\"/" "$MANIFEST_FILE"
fi

log_success "Manifest version updated"

# Step 3: Remove unnecessary files from temp copy
log_info "Cleaning temp directory..."
(
    cd "$TEMP_DIR"
    rm -rf .git .github .gitignore node_modules .DS_Store *.map 2>/dev/null || true
)

# Step 4: Package CRX3 using npx crx3
log_info "Packaging CRX3..."

# Remove existing CRX if present
rm -f "$CRX_PATH"

if npx crx3 "$TEMP_DIR" -o "$CRX_PATH" -k "$KEY_FILE" 2>/dev/null; then
    log_success "CRX3 file created"
else
    log_error "Failed to create CRX3 file"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  - Ensure Node.js 20+ is installed"
    echo "  - Try running: npx crx3 --help"
    echo "  - Check that the key file is a valid RSA private key"
    exit 1
fi

# Step 5: Verify CRX was created
if [[ ! -f "$CRX_PATH" ]]; then
    log_error "CRX file was not created at expected path: ${CRX_PATH}"
    exit 1
fi

# Step 6: Generate SHA256 checksum
log_info "Generating SHA256 checksum..."
(cd "$(dirname "$CRX_PATH")" && sha256sum "$(basename "$CRX_PATH")" > "$(basename "$SHA256_PATH")")
log_success "SHA256 checksum generated"

# ── Summary ──────────────────────────────────────────────────────────────────

CRX_SIZE=$(du -h "$CRX_PATH" | cut -f1)
CRX_SHA256=$(cut -d' ' -f1 "$SHA256_PATH")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ CRX packaging complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}CRX file:${NC}    ${CRX_PATH}"
echo -e "  ${BOLD}Checksum:${NC}    ${SHA256_PATH}"
echo -e "  ${BOLD}Size:${NC}        ${CRX_SIZE}"
echo -e "  ${BOLD}SHA256:${NC}      ${CRX_SHA256}"
echo -e "  ${BOLD}Version:${NC}     ${VERSION}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Verify:  bash scripts/verify-crx.sh ${CRX_PATH}"
echo "  2. Upload:  Upload to https://cdn.autocr.nicx.app/releases/"
echo "  3. Update:  bash scripts/generate-updates-xml.sh -i <ext-id> -v ${VERSION} -u <crx-url>"
echo ""

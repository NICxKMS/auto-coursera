#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# verify-crx.sh — Verify a Chrome extension CRX3 file
# ============================================================================
#
# Checks that a CRX file is valid by verifying:
#   - File exists and is readable
#   - Starts with "Cr24" magic bytes (CRX3 format)
#   - Displays the CRX version number
#   - Extracts and displays the manifest version
#   - Shows file size and SHA256 checksum

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

usage() {
    echo -e "${BOLD}Usage:${NC} $0 <crx-file>"
    echo ""
    echo "Verify a Chrome extension CRX3 file and display its metadata."
    echo ""
    echo -e "${BOLD}Arguments:${NC}"
    echo "  <crx-file>   Path to the CRX file to verify"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0 auto_coursera_1.8.0.crx"
    echo "  $0 releases/auto_coursera_1.8.0.crx"
    echo ""
    echo -e "${BOLD}Checks performed:${NC}"
    echo "  1. File exists and is readable"
    echo "  2. CRX3 magic bytes (\"Cr24\")"
    echo "  3. CRX format version"
    echo "  4. Embedded manifest version"
    echo "  5. File size"
    echo "  6. SHA256 checksum"
}

log_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "  ${RED}✗${NC} $1" >&2
}

log_info() {
    echo -e "  ${CYAN}•${NC} $1"
}

# ── Argument validation ──────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
    echo -e "${RED}Error: Missing required argument <crx-file>${NC}" >&2
    echo ""
    usage
    exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
    exit 0
fi

CRX_FILE="$1"
ERRORS=0

echo ""
echo -e "${BOLD}CRX Verification: ${CRX_FILE}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Check 1: File exists ─────────────────────────────────────────────────────

if [[ ! -f "$CRX_FILE" ]]; then
    log_error "File not found: ${CRX_FILE}"
    exit 1
fi
log_success "File exists"

# ── Check 2: File is readable ───────────────────────────────────────────────

if [[ ! -r "$CRX_FILE" ]]; then
    log_error "File is not readable: ${CRX_FILE}"
    exit 1
fi
log_success "File is readable"

# ── Check 3: File is non-empty ──────────────────────────────────────────────

FILE_SIZE_BYTES=$(stat -c%s "$CRX_FILE" 2>/dev/null || stat -f%z "$CRX_FILE" 2>/dev/null || echo "0")
if [[ "$FILE_SIZE_BYTES" -eq 0 ]]; then
    log_error "File is empty"
    exit 1
fi
log_success "File is non-empty (${FILE_SIZE_BYTES} bytes)"

# ── Check 4: CRX3 magic bytes ───────────────────────────────────────────────

MAGIC=$(head -c 4 "$CRX_FILE" | cat -v 2>/dev/null || true)
MAGIC_HEX=$(xxd -l 4 -p "$CRX_FILE" 2>/dev/null || true)

# "Cr24" in hex is 43723234
if [[ "$MAGIC_HEX" == "43723234" ]]; then
    log_success "CRX magic bytes: Cr24 (valid)"
else
    log_error "Invalid magic bytes: expected 43723234 (Cr24), got ${MAGIC_HEX}"
    ERRORS=$((ERRORS + 1))
fi

# ── Check 5: CRX format version ─────────────────────────────────────────────

if [[ -n "$MAGIC_HEX" ]]; then
    # Bytes 4-7 contain the CRX version as little-endian uint32
    CRX_VERSION_HEX=$(xxd -s 4 -l 4 -p "$CRX_FILE" 2>/dev/null || true)
    if [[ -n "$CRX_VERSION_HEX" ]]; then
        # Convert little-endian hex to decimal
        # e.g., "03000000" → 3
        BYTE0=$(echo "$CRX_VERSION_HEX" | cut -c1-2)
        BYTE1=$(echo "$CRX_VERSION_HEX" | cut -c3-4)
        BYTE2=$(echo "$CRX_VERSION_HEX" | cut -c5-6)
        BYTE3=$(echo "$CRX_VERSION_HEX" | cut -c7-8)
        CRX_VERSION=$(printf '%d' "0x${BYTE3}${BYTE2}${BYTE1}${BYTE0}" 2>/dev/null || echo "unknown")

        if [[ "$CRX_VERSION" == "3" ]]; then
            log_success "CRX format version: ${CRX_VERSION} (CRX3)"
        elif [[ "$CRX_VERSION" == "2" ]]; then
            log_error "CRX format version: ${CRX_VERSION} (CRX2 — deprecated, expected CRX3)"
            ERRORS=$((ERRORS + 1))
        else
            log_error "CRX format version: ${CRX_VERSION} (unexpected)"
            ERRORS=$((ERRORS + 1))
        fi
    fi
fi

# ── Check 6: Extract manifest version from embedded ZIP ─────────────────────

# CRX3 structure: magic(4) + version(4) + header_size(4) + header(header_size) + zip
# We need to skip past the header to find the ZIP content
MANIFEST_VERSION="unknown"

if command -v python3 &>/dev/null; then
    MANIFEST_VERSION=$(python3 - "$CRX_FILE" << 'PYEOF' 2>/dev/null || echo "unknown"
import zipfile, json, io, struct, sys

try:
    crx_file = sys.argv[1]
    with open(crx_file, 'rb') as f:
        magic = f.read(4)
        version = struct.unpack('<I', f.read(4))[0]
        header_size = struct.unpack('<I', f.read(4))[0]
        f.seek(12 + header_size)
        zip_data = f.read()

    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    manifest = json.loads(zf.read('manifest.json'))
    print(manifest.get('version', 'not found'))
except Exception as e:
    print('extraction failed: ' + str(e), file=sys.stderr)
    print('unknown')
PYEOF
)
elif command -v node &>/dev/null; then
    # Fallback: try to find version string with grep in binary
    MANIFEST_VERSION=$(strings "$CRX_FILE" 2>/dev/null \
        | grep -oP '"version"\s*:\s*"\K[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?' \
        | head -1 || echo "unknown")
fi

if [[ "$MANIFEST_VERSION" != "unknown" && "$MANIFEST_VERSION" != "" ]]; then
    log_success "Manifest version: ${MANIFEST_VERSION}"
else
    log_error "Could not extract manifest version"
    ERRORS=$((ERRORS + 1))
fi

# ── Display: File size ───────────────────────────────────────────────────────

# Human readable file size
if [[ "$FILE_SIZE_BYTES" -ge 1048576 ]]; then
    FILE_SIZE_HUMAN=$(awk "BEGIN { printf \"%.2f MB\", ${FILE_SIZE_BYTES}/1048576 }")
elif [[ "$FILE_SIZE_BYTES" -ge 1024 ]]; then
    FILE_SIZE_HUMAN=$(awk "BEGIN { printf \"%.2f KB\", ${FILE_SIZE_BYTES}/1024 }")
else
    FILE_SIZE_HUMAN="${FILE_SIZE_BYTES} bytes"
fi

log_info "File size: ${FILE_SIZE_HUMAN}"

# ── Display: SHA256 checksum ─────────────────────────────────────────────────

if command -v sha256sum &>/dev/null; then
    SHA256=$(sha256sum "$CRX_FILE" | cut -d' ' -f1)
elif command -v shasum &>/dev/null; then
    SHA256=$(shasum -a 256 "$CRX_FILE" | cut -d' ' -f1)
else
    SHA256="(sha256sum not available)"
fi

log_info "SHA256: ${SHA256}"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$ERRORS" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓ CRX verification passed${NC}"
else
    echo -e "${RED}${BOLD}✗ CRX verification failed (${ERRORS} error(s))${NC}"
fi

echo ""
exit "$ERRORS"

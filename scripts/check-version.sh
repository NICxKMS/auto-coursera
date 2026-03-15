#!/bin/bash
# check-version.sh — Verify all constants match version.json
#
# Checks that version, extensionId, extensionName, updateUrl, and domains
# are consistent across every file in the monorepo — including hardcoded
# domain URLs in .astro pages, CSP headers — and also guards a few
# operational branch/source-link truths that recently drifted.
# Run from root. CI (deploy.yml) runs this as a gate before builds.
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "❌ jq is required"; exit 1; }

# Validate version.json schema — catch missing fields before they silently become "null"
jq -e '.version, .extensionId, .extensionName, .updateUrl, .githubRepo, .domains.website' version.json > /dev/null 2>&1 || {
  echo "❌ version.json is missing required fields"
  exit 1
}

ERRORS=0
CHECKS=0
EXPECTED_CHECKS=59

check() {
  local file=$1 actual=$2 actual_display
  CHECKS=$((CHECKS + 1))
  actual_display=${actual:-<missing>}
  if [[ "$actual" != "$EXPECTED" ]]; then
    echo "❌ MISMATCH: $file has '$actual_display', expected '$EXPECTED'"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $file: $actual"
  fi
}

check_contains() {
  local file=$1 expected=$2
  CHECKS=$((CHECKS + 1))
  if [[ ! -f "$file" ]]; then
    echo "❌ FILE NOT FOUND: $file"
    ERRORS=$((ERRORS + 1))
  elif grep -qF -- "$expected" "$file"; then
    echo "✅ $file contains: $expected"
  else
    echo "❌ $file missing: $expected"
    ERRORS=$((ERRORS + 1))
  fi
}

check_not_contains() {
  local file=$1 unexpected=$2
  CHECKS=$((CHECKS + 1))
  if [[ ! -f "$file" ]]; then
    echo "❌ FILE NOT FOUND: $file"
    ERRORS=$((ERRORS + 1))
  elif grep -qF -- "$unexpected" "$file"; then
    echo "❌ $file should not contain: $unexpected"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $file does not contain: $unexpected"
  fi
}

check_file_exists() {
  local file=$1
  CHECKS=$((CHECKS + 1))
  if [[ -f "$file" ]]; then
    echo "✅ $file exists"
  else
    echo "❌ FILE NOT FOUND: $file"
    ERRORS=$((ERRORS + 1))
  fi
}

extract_updates_xml_attribute() {
  local attribute=$1 file=$2
  grep -oE "${attribute}=\"[^\"]*\"" "$file" | tail -n 1 | sed -E "s/^${attribute}=\"([^\"]*)\"$/\1/"
}

# ── Version ──────────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .version version.json)
echo "Checking version ($EXPECTED)..."

check "extension/manifest.json" "$(jq -r .version extension/manifest.json)"
check "extension/package.json"  "$(jq -r .version extension/package.json)"
check "website/package.json"    "$(jq -r .version website/package.json)"

GO_VERSION=$(grep 'AppVersion\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (AppVersion)" "$GO_VERSION"

echo ""
echo "Checking website release-source wiring..."

check_contains "website/src/pages/install.astro" "versionInfo.version"
check_contains "website/src/pages/install.astro" "versionInfo.githubRepo"
check_contains "website/src/pages/downloads.astro" "versionInfo.version"
check_contains "website/src/pages/downloads.astro" "versionInfo.githubRepo"

# ── Extension ID ─────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .extensionId version.json)
echo ""
echo "Checking Extension ID ($EXPECTED)..."

GO_EXT_ID=$(grep 'ExtensionID\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (ExtensionID)" "$GO_EXT_ID"

INSTALL_SH_ID=$(grep '^EXTENSION_ID=' website/public/scripts/install.sh | sed 's/^EXTENSION_ID="\(.*\)"/\1/')
check "website/public/scripts/install.sh (EXTENSION_ID)" "$INSTALL_SH_ID"

INSTALL_MAC_ID=$(grep '^EXTENSION_ID=' website/public/scripts/install-mac.sh | sed 's/^EXTENSION_ID="\(.*\)"/\1/')
check "website/public/scripts/install-mac.sh (EXTENSION_ID)" "$INSTALL_MAC_ID"

UNINSTALL_SH_ID=$(grep '^EXTENSION_ID=' website/public/scripts/uninstall.sh | sed 's/^EXTENSION_ID="\(.*\)"/\1/')
check "website/public/scripts/uninstall.sh (EXTENSION_ID)" "$UNINSTALL_SH_ID"

INSTALL_PS1_ID=$(grep '^\$EXTENSION_ID' website/public/scripts/install.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/install.ps1 (EXTENSION_ID)" "$INSTALL_PS1_ID"

UNINSTALL_PS1_ID=$(grep '^\$EXTENSION_ID' website/public/scripts/uninstall.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/uninstall.ps1 (EXTENSION_ID)" "$UNINSTALL_PS1_ID"

# ── Extension Name ───────────────────────────────────────────────────────────

EXPECTED=$(jq -r .extensionName version.json)
echo ""
echo "Checking Extension Name ($EXPECTED)..."

GO_EXT_NAME=$(grep 'ExtensionName\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (ExtensionName)" "$GO_EXT_NAME"

MANIFEST_NAME=$(jq -r .name extension/manifest.json)
check "extension/manifest.json (name)" "$MANIFEST_NAME"

INSTALL_SH_NAME=$(grep '^EXTENSION_NAME=' website/public/scripts/install.sh | sed 's/^EXTENSION_NAME="\(.*\)"/\1/')
check "website/public/scripts/install.sh (EXTENSION_NAME)" "$INSTALL_SH_NAME"

INSTALL_MAC_NAME=$(grep '^EXTENSION_NAME=' website/public/scripts/install-mac.sh | sed 's/^EXTENSION_NAME="\(.*\)"/\1/')
check "website/public/scripts/install-mac.sh (EXTENSION_NAME)" "$INSTALL_MAC_NAME"

UNINSTALL_SH_NAME=$(grep '^EXTENSION_NAME=' website/public/scripts/uninstall.sh | sed 's/^EXTENSION_NAME="\(.*\)"/\1/')
check "website/public/scripts/uninstall.sh (EXTENSION_NAME)" "$UNINSTALL_SH_NAME"

INSTALL_PS1_NAME=$(grep '^\$EXTENSION_NAME' website/public/scripts/install.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/install.ps1 (EXTENSION_NAME)" "$INSTALL_PS1_NAME"

UNINSTALL_PS1_NAME=$(grep '^\$EXTENSION_NAME' website/public/scripts/uninstall.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/uninstall.ps1 (EXTENSION_NAME)" "$UNINSTALL_PS1_NAME"

# ── Update URL ───────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .updateUrl version.json)
echo ""
echo "Checking Update URL ($EXPECTED)..."

MANIFEST_UPDATE_URL=$(jq -r '.update_url // empty' extension/manifest.json)
check "extension/manifest.json (update_url)" "$MANIFEST_UPDATE_URL"

GO_UPDATE_URL=$(grep 'UpdateURL\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (UpdateURL)" "$GO_UPDATE_URL"

INSTALL_SH_URL=$(grep '^UPDATE_URL=' website/public/scripts/install.sh | sed 's/^UPDATE_URL="\(.*\)"/\1/')
check "website/public/scripts/install.sh (UPDATE_URL)" "$INSTALL_SH_URL"

INSTALL_MAC_URL=$(grep '^UPDATE_URL=' website/public/scripts/install-mac.sh | sed 's/^UPDATE_URL="\(.*\)"/\1/')
check "website/public/scripts/install-mac.sh (UPDATE_URL)" "$INSTALL_MAC_URL"

INSTALL_PS1_URL=$(grep '^\$UPDATE_URL' website/public/scripts/install.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/install.ps1 (UPDATE_URL)" "$INSTALL_PS1_URL"

# ── Domains ──────────────────────────────────────────────────────────────────

echo ""
echo "Checking Domains..."

EXPECTED=$(jq -r .domains.website version.json)

ASTRO_SITE=$(grep "site:" website/astro.config.mjs | sed "s/.*'\(.*\)'.*/\1/")
check "website/astro.config.mjs (site)" "$ASTRO_SITE"

# ── domains.website in pages ────────────────────────────────────────────────

DOMAIN_WEBSITE=$(jq -r '.domains.website' version.json)

echo ""
echo "Checking website domain in pages ($DOMAIN_WEBSITE)..."

check_contains "website/src/pages/install.astro" "versionInfo.domains"
check_contains "website/src/pages/downloads.astro" "versionInfo.domains"
check_contains "website/src/pages/docs/troubleshoot.astro" "versionInfo.version"
check_contains "website/src/pages/downloads.astro" "versionInfo.version"

# ── Static assets ───────────────────────────────────────────────────────────

echo ""
echo "Checking static assets..."

check_file_exists "website/public/updates.xml"
check_file_exists "website/public/_redirects"

EXPECTED=$(jq -r .version version.json)
UPDATES_XML_VERSION=$(extract_updates_xml_attribute 'version' website/public/updates.xml)
check "website/public/updates.xml (version)" "$UPDATES_XML_VERSION"

EXPECTED=$(jq -r .extensionId version.json)
UPDATES_XML_APPID=$(extract_updates_xml_attribute 'appid' website/public/updates.xml)
check "website/public/updates.xml (appid)" "$UPDATES_XML_APPID"

EXPECTED="https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/auto_coursera_$(jq -r .version version.json).crx"
UPDATES_XML_CODEBASE=$(extract_updates_xml_attribute 'codebase' website/public/updates.xml)
check "website/public/updates.xml (codebase)" "$UPDATES_XML_CODEBASE"

check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-windows-amd64.exe"
check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-macos-arm64"
check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-linux-amd64"
check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-windows-arm64.exe"
check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-linux-arm64"
check_contains "website/public/_redirects" "https://github.com/$(jq -r .githubRepo version.json)/releases/download/v$(jq -r .version version.json)/installer-macos-amd64"
check_contains "website/public/_redirects" "/ps                      /scripts/install.ps1"
check_contains "website/public/_redirects" "/sh                      /scripts/install.sh"
check_contains "website/public/_redirects" "/mac"
check_contains "website/public/_redirects" "/ps-uninstall"
check_contains "website/src/pages/docs/manual.astro" "versionInfo.domains"

# website/public/version.json — extension auto-update endpoint
WEB_PUBLIC_VERSION=$(jq -r .version website/public/version.json 2>/dev/null || echo "MISSING")
EXPECTED=$(jq -r .version version.json)
check "website/public/version.json version" "$WEB_PUBLIC_VERSION"

# ── Policy Filename Consistency ──────────────────────────────────────────────

echo ""
echo "Checking policy filename consistency..."

GO_POLICY_FILENAME=$(grep 'policyFileName\s*=' installer/policy_linux.go | sed 's/.*"\(.*\)".*/\1/')
SHELL_POLICY_FILENAME=$(grep '^POLICY_FILENAME=' website/public/scripts/install.sh | sed 's/^POLICY_FILENAME="\(.*\)"/\1/')
EXPECTED="$GO_POLICY_FILENAME"
check "website/public/scripts/install.sh (POLICY_FILENAME vs Go)" "$SHELL_POLICY_FILENAME"

# ── Branch / docs / source-link drift guards ────────────────────────────────

echo ""
echo "Checking deployment branch and source-link truth..."

check_contains ".github/workflows/deploy.yml" "push to master"
check_contains "docs/SETUP.md" '| **Production branch** | `master` |'
check_contains "docs/SETUP.md" "git push auto-coursera master"
check_contains "docs/CLOUDFLARE-SETUP.md" '| **Production branch** | `master` |'
check_contains "docs/ARCHITECTURE.md" 'website deployment branch (`master` in the current setup)'
check_contains "website/README.md" '- **Production branch:** `master`'
check_contains "website/src/components/Footer.astro" "blob/master/LICENSE"
check_contains "website/src/components/Footer.astro" "versionInfo.version"
check_contains ".github/workflows/deploy.yml" "needs: [create-release]"
check_contains ".github/workflows/deploy.yml" "Gate master Pages deploy on published GitHub Release assets"

# ── Git Tag (CI only) ───────────────────────────────────────────────────────

EXPECTED=$(jq -r .version version.json)

if [[ -n "${GITHUB_REF_NAME:-}" ]] && [[ "$GITHUB_REF_NAME" == v* ]]; then
  TAG_VERSION="${GITHUB_REF_NAME#v}"
  if [[ "$TAG_VERSION" != "$EXPECTED" ]]; then
    echo ""
    echo "❌ Git tag v$TAG_VERSION doesn't match version.json $EXPECTED"
    ERRORS=$((ERRORS + 1))
  else
    echo ""
    echo "✅ Git tag: v$TAG_VERSION"
  fi
fi

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "❌ $ERRORS constant mismatch(es) found!"
  exit 1
fi

if [[ $CHECKS -ne $EXPECTED_CHECKS ]]; then
  echo "❌ Expected $EXPECTED_CHECKS checks, but ran $CHECKS — update EXPECTED_CHECKS!"
  exit 1
fi

echo "✅ All $CHECKS checks passed!"

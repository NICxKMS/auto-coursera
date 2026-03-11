#!/bin/bash
# check-version.sh — Verify all constants match version.json
#
# Checks that version, extensionId, extensionName, updateUrl, and domains
# are consistent across every file in the monorepo — including hardcoded
# domain URLs in .astro pages, CSP headers, and route config — and also
# guards a few operational branch/source-link truths that recently drifted.
# Run from root. CI (deploy.yml) runs this as a gate before builds.
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "❌ jq is required"; exit 1; }

# Validate version.json schema — catch missing fields before they silently become "null"
jq -e '.version, .extensionId, .extensionName, .updateUrl, .githubRepo, .domains.website, .domains.cdn, .domains.api' version.json > /dev/null 2>&1 || {
  echo "❌ version.json is missing required fields"
  exit 1
}

ERRORS=0
CHECKS=0
EXPECTED_CHECKS=51

check() {
  local file=$1 actual=$2
  CHECKS=$((CHECKS + 1))
  if [[ "$actual" != "$EXPECTED" ]]; then
    echo "❌ MISMATCH: $file has '$actual', expected '$EXPECTED'"
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

extract_unique_toml_var_values() {
  local key=$1 file=$2
  grep -E -- "^[[:space:]]*$key[[:space:]]*=" "$file" \
    | sed -n 's/^[^"]*"\([^"]*\)".*$/\1/p' \
    | awk '!seen[$0]++'
}

# ── Version ──────────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .version version.json)
echo "Checking version ($EXPECTED)..."

check "extension/manifest.json" "$(jq -r .version extension/manifest.json)"
check "extension/package.json"  "$(jq -r .version extension/package.json)"
check "workers/package.json"    "$(jq -r .version workers/package.json)"
check "website/package.json"    "$(jq -r .version website/package.json)"

GO_VERSION=$(grep 'AppVersion\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (AppVersion)" "$GO_VERSION"

TOML_VERSION=$(extract_unique_toml_var_values 'CURRENT_VERSION' workers/wrangler.toml)
check "workers/wrangler.toml (CURRENT_VERSION)" "$TOML_VERSION"

BADGE_VERSION=$(grep "textContent = 'v" website/src/components/VersionBadge.astro | sed "s/.*'v\(.*\)'.*/\1/")
check "website/src/components/VersionBadge.astro (fallback)" "$BADGE_VERSION"

DL_VERSION=$(grep "textContent = 'v" website/src/pages/downloads.astro | sed "s/.*'v\(.*\)'.*/\1/")
check "website/src/pages/downloads.astro (fallback)" "$DL_VERSION"

# ── Extension ID ─────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .extensionId version.json)
echo ""
echo "Checking Extension ID ($EXPECTED)..."

GO_EXT_ID=$(grep 'ExtensionID\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (ExtensionID)" "$GO_EXT_ID"

TOML_EXT_ID=$(extract_unique_toml_var_values 'EXTENSION_ID' workers/wrangler.toml)
check "workers/wrangler.toml (EXTENSION_ID)" "$TOML_EXT_ID"

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

echo ""
echo "Checking Extension ID in website docs..."

check_contains "website/src/pages/docs/manual.astro" "$EXPECTED"
check_contains "website/src/pages/docs/troubleshoot.astro" "$EXPECTED"

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

GO_UPDATE_URL=$(grep 'UpdateURL\s*=' installer/config.go | sed 's/.*"\(.*\)".*/\1/')
check "installer/config.go (UpdateURL)" "$GO_UPDATE_URL"

INSTALL_SH_URL=$(grep '^UPDATE_URL=' website/public/scripts/install.sh | sed 's/^UPDATE_URL="\(.*\)"/\1/')
check "website/public/scripts/install.sh (UPDATE_URL)" "$INSTALL_SH_URL"

INSTALL_MAC_URL=$(grep '^UPDATE_URL=' website/public/scripts/install-mac.sh | sed 's/^UPDATE_URL="\(.*\)"/\1/')
check "website/public/scripts/install-mac.sh (UPDATE_URL)" "$INSTALL_MAC_URL"

INSTALL_PS1_URL=$(grep '^\$UPDATE_URL' website/public/scripts/install.ps1 | head -1 | sed 's/.*"\(.*\)".*/\1/')
check "website/public/scripts/install.ps1 (UPDATE_URL)" "$INSTALL_PS1_URL"

echo ""
echo "Checking Update URL in website docs..."

check_contains "website/src/pages/docs/manual.astro" "$EXPECTED"

# ── Domains ──────────────────────────────────────────────────────────────────

echo ""
echo "Checking Domains..."

EXPECTED=$(jq -r .domains.website version.json)

TOML_ORIGIN=$(extract_unique_toml_var_values 'ALLOWED_ORIGIN' workers/wrangler.toml)
check "workers/wrangler.toml (ALLOWED_ORIGIN)" "$TOML_ORIGIN"

ASTRO_SITE=$(grep "site:" website/astro.config.mjs | sed "s/.*'\(.*\)'.*/\1/")
check "website/astro.config.mjs (site)" "$ASTRO_SITE"

EXPECTED=$(jq -r .domains.cdn version.json)

TOML_CDN=$(extract_unique_toml_var_values 'CDN_BASE_URL' workers/wrangler.toml)
check "workers/wrangler.toml (CDN_BASE_URL)" "$TOML_CDN"

# ── domains.api ─────────────────────────────────────────────────────────────

DOMAIN_API=$(jq -r '.domains.api' version.json)
DOMAIN_API_HOST="${DOMAIN_API#https://}"

echo ""
echo "Checking API domain ($DOMAIN_API)..."

check_contains "website/src/components/VersionBadge.astro" "$DOMAIN_API"
check_contains "website/src/pages/install.astro" "$DOMAIN_API"
check_contains "website/src/pages/downloads.astro" "$DOMAIN_API"
check_contains "website/src/pages/releases.astro" "$DOMAIN_API"
check_contains "website/public/_headers" "$DOMAIN_API"
check_contains "workers/wrangler.toml" "$DOMAIN_API_HOST"

# ── domains.website in pages ────────────────────────────────────────────────

DOMAIN_WEBSITE=$(jq -r '.domains.website' version.json)

echo ""
echo "Checking website domain in pages ($DOMAIN_WEBSITE)..."

check_contains "website/src/pages/install.astro" "$DOMAIN_WEBSITE"
check_contains "website/src/pages/downloads.astro" "$DOMAIN_WEBSITE"
check_contains "website/src/pages/docs/troubleshoot.astro" "$DOMAIN_WEBSITE"

# ── domains.cdn in pages ────────────────────────────────────────────────────

DOMAIN_CDN=$(jq -r '.domains.cdn' version.json)

echo ""
echo "Checking CDN domain in pages ($DOMAIN_CDN)..."

check_contains "website/src/pages/docs/manual.astro" "$DOMAIN_CDN"
# ── GitHub Repo ──────────────────────────────────────────────────────────────────

EXPECTED=$(jq -r .githubRepo version.json)
echo ""
echo "Checking GitHub Repo ($EXPECTED)..."

TOML_GITHUB_REPO=$(extract_unique_toml_var_values 'GITHUB_REPO' workers/wrangler.toml)
check "workers/wrangler.toml (GITHUB_REPO)" "$TOML_GITHUB_REPO"

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
  echo "⚠️  Expected $EXPECTED_CHECKS checks but only ran $CHECKS"
  exit 1
fi
echo "✅ $CHECKS/$EXPECTED_CHECKS checks passed — all constants match version.json"

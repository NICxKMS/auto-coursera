#!/bin/bash
# sync-constants.sh — Sync all constants from version.json to component files
#
# Reads extensionId, extensionName, updateUrl, domains, and version from
# version.json (the single source of truth) and propagates them to every
# file in the monorepo that embeds these values.
#
# For the static website model, the install/download Astro pages read
# version.json at build time, while this script generates the truly static
# release-surface files that cannot read build-time state directly:
#   - website/public/updates.xml
#   - website/public/_redirects
#
# Usage:  bash scripts/sync-constants.sh   (run from repo root)
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "❌ jq is required. Install it: apt install jq / brew install jq"; exit 1; }

if [[ ! -f version.json ]]; then
  echo "❌ version.json not found. Run this script from the repo root."
  exit 1
fi

# ── Validate version.json schema ─────────────────────────────────────────────

if ! jq -e '.version and .extensionId and .extensionName and .domains.website and .updateUrl and .githubRepo' version.json > /dev/null 2>&1; then
  echo "❌ version.json is malformed or missing required fields"
  exit 1
fi

# ── Read constants from version.json ─────────────────────────────────────────

VERSION=$(jq -r .version version.json)
EXTENSION_ID=$(jq -r .extensionId version.json)
EXTENSION_NAME=$(jq -r .extensionName version.json)
UPDATE_URL=$(jq -r .updateUrl version.json)
DOMAIN_WEBSITE=$(jq -r .domains.website version.json)
GITHUB_REPO=$(jq -r .githubRepo version.json)

# Guard against null/empty values (jq returns "null" for missing keys)
for var_name in VERSION EXTENSION_ID EXTENSION_NAME UPDATE_URL DOMAIN_WEBSITE GITHUB_REPO; do
  val="${!var_name}"
  [[ "$val" == "null" || -z "$val" ]] && { echo "❌ $var_name is null or empty in version.json"; exit 1; }
done

release_asset_url() {
  local asset_name=$1
  printf 'https://github.com/%s/releases/download/v%s/%s' "$GITHUB_REPO" "$VERSION" "$asset_name"
}

CRX_RELEASE_URL=$(release_asset_url "auto_coursera_${VERSION}.crx")

echo "🔄 Syncing constants from version.json..."
echo "   version:       $VERSION"
echo "   extensionId:   $EXTENSION_ID"
echo "   extensionName: $EXTENSION_NAME"
echo "   updateUrl:     $UPDATE_URL"
echo "   website:       $DOMAIN_WEBSITE"
echo "   githubRepo:    $GITHUB_REPO"
echo ""

# ── Version ──────────────────────────────────────────────────────────────────

echo "── Version ────────────────────────────────────────────────────────────"

for f in extension/package.json extension/manifest.json website/package.json; do
  sed -i '0,/"version": ".*"/{s/"version": ".*"/"version": "'"$VERSION"'"/}' "$f"
  echo "  ✅ $f"
done

# Sync name field in manifest.json (must match extensionName)
sed -i '0,/"name": ".*"/{s/"name": ".*"/"name": "'"$EXTENSION_NAME"'"/}' extension/manifest.json
echo "  ✅ extension/manifest.json (name)"

sed -i "s/\(AppVersion = \)\".*\"/\1\"$VERSION\"/" installer/config.go
echo "  ✅ installer/config.go (AppVersion)"

# ── Extension ID ─────────────────────────────────────────────────────────────

echo ""
echo "── Extension ID ───────────────────────────────────────────────────────"

sed -i "s/\(ExtensionID[[:space:]]*= \)\".*\"/\1\"$EXTENSION_ID\"/" installer/config.go
echo "  ✅ installer/config.go"

sed -i "s/^EXTENSION_ID=\".*\"/EXTENSION_ID=\"$EXTENSION_ID\"/" website/public/scripts/install.sh
echo "  ✅ website/public/scripts/install.sh"

sed -i "s/^EXTENSION_ID=\".*\"/EXTENSION_ID=\"$EXTENSION_ID\"/" website/public/scripts/install-mac.sh
echo "  ✅ website/public/scripts/install-mac.sh"

sed -i "s/^EXTENSION_ID=\".*\"/EXTENSION_ID=\"$EXTENSION_ID\"/" website/public/scripts/uninstall.sh
echo "  ✅ website/public/scripts/uninstall.sh"

sed -i "s/\(\\\$EXTENSION_ID[[:space:]]*= \)\".*\"/\1\"$EXTENSION_ID\"/" website/public/scripts/install.ps1
echo "  ✅ website/public/scripts/install.ps1"

sed -i "s/\(\\\$EXTENSION_ID[[:space:]]*= \)\".*\"/\1\"$EXTENSION_ID\"/" website/public/scripts/uninstall.ps1
echo "  ✅ website/public/scripts/uninstall.ps1"

# ── Extension Name ───────────────────────────────────────────────────────────

echo ""
echo "── Extension Name ─────────────────────────────────────────────────────"

sed -i "s/\(ExtensionName[[:space:]]*= \)\".*\"/\1\"$EXTENSION_NAME\"/" installer/config.go
echo "  ✅ installer/config.go"

sed -i "s/^EXTENSION_NAME=\".*\"/EXTENSION_NAME=\"$EXTENSION_NAME\"/" website/public/scripts/install.sh
echo "  ✅ website/public/scripts/install.sh"

sed -i "s/^EXTENSION_NAME=\".*\"/EXTENSION_NAME=\"$EXTENSION_NAME\"/" website/public/scripts/install-mac.sh
echo "  ✅ website/public/scripts/install-mac.sh"

sed -i "s/^EXTENSION_NAME=\".*\"/EXTENSION_NAME=\"$EXTENSION_NAME\"/" website/public/scripts/uninstall.sh
echo "  ✅ website/public/scripts/uninstall.sh"

sed -i "s/\(\\\$EXTENSION_NAME[[:space:]]*= \)\".*\"/\1\"$EXTENSION_NAME\"/" website/public/scripts/install.ps1
echo "  ✅ website/public/scripts/install.ps1"

sed -i "s/\(\\\$EXTENSION_NAME[[:space:]]*= \)\".*\"/\1\"$EXTENSION_NAME\"/" website/public/scripts/uninstall.ps1
echo "  ✅ website/public/scripts/uninstall.ps1"

# ── Update URL ───────────────────────────────────────────────────────────────

echo ""
echo "── Update URL ───────────────────────────────────────────────────────"

sed -i "s|\(UpdateURL[[:space:]]*= \)\".*\"|\1\"$UPDATE_URL\"|" installer/config.go
echo "  ✅ installer/config.go"

sed -i "s|^UPDATE_URL=\".*\"|UPDATE_URL=\"$UPDATE_URL\"|" website/public/scripts/install.sh
echo "  ✅ website/public/scripts/install.sh"

sed -i "s|^UPDATE_URL=\".*\"|UPDATE_URL=\"$UPDATE_URL\"|" website/public/scripts/install-mac.sh
echo "  ✅ website/public/scripts/install-mac.sh"

sed -i "s|\(\\\$UPDATE_URL[[:space:]]*= \)\".*\"|\1\"$UPDATE_URL\"|" website/public/scripts/install.ps1
echo "  ✅ website/public/scripts/install.ps1"

# ── Domains ──────────────────────────────────────────────────────────────────

echo ""
echo "── Domains ──────────────────────────────────────────────────────────"

sed -i "s|site: '.*'|site: '$DOMAIN_WEBSITE'|" website/astro.config.mjs
echo "  ✅ website/astro.config.mjs (site → website)"

# NOTE: domains.website references embedded in .astro page content are NOT
# auto-synced — only their structured locations (astro.config.mjs) have
# patterns suitable for sed. A domain change requires manual find-and-replace,
# then run:  bash scripts/check-version.sh  to verify consistency.

# ── Static website release surfaces ────────────────────────────────────────

echo ""
echo "── Static website release surfaces ────────────────────────────────────"

cat > website/public/_redirects << EOF
# Platform download shortcuts
/download/windows        $(release_asset_url 'installer-windows-amd64.exe')    302
/download/macos          $(release_asset_url 'installer-macos-arm64')           302
/download/linux          $(release_asset_url 'installer-linux-amd64')           302
/download/windows-arm64  $(release_asset_url 'installer-windows-arm64.exe')    302
/download/linux-arm64    $(release_asset_url 'installer-linux-arm64')           302
/download/macos-intel    $(release_asset_url 'installer-macos-amd64')           302

# Install script shortcuts
/ps                      /scripts/install.ps1                                   200
/sh                      /scripts/install.sh                                    200
EOF
echo "  ✅ website/public/_redirects"

cat > website/public/updates.xml << EOF
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="$EXTENSION_ID">
    <updatecheck codebase="$CRX_RELEASE_URL" version="$VERSION"/>
  </app>
</gupdate>
EOF
echo "  ✅ website/public/updates.xml"

echo ""
echo "✅ All constants synced from version.json"

#!/bin/bash
# sync-constants.sh — Sync all constants from version.json to component files
#
# Reads extensionId, extensionName, updateUrl, domains, and version from
# version.json (the single source of truth) and propagates them to every
# file in the monorepo that embeds these values.
#
# Usage:  bash scripts/sync-constants.sh   (run from repo root)
set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "❌ jq is required. Install it: apt install jq / brew install jq"; exit 1; }

if [[ ! -f version.json ]]; then
  echo "❌ version.json not found. Run this script from the repo root."
  exit 1
fi

# ── Validate version.json schema ─────────────────────────────────────────────

if ! jq -e '.version and .extensionId and .extensionName and .domains.website and .domains.cdn and .domains.api and .updateUrl and .githubRepo' version.json > /dev/null 2>&1; then
  echo "❌ version.json is malformed or missing required fields"
  exit 1
fi

# ── Read constants from version.json ─────────────────────────────────────────

VERSION=$(jq -r .version version.json)
EXTENSION_ID=$(jq -r .extensionId version.json)
EXTENSION_NAME=$(jq -r .extensionName version.json)
UPDATE_URL=$(jq -r .updateUrl version.json)
DOMAIN_WEBSITE=$(jq -r .domains.website version.json)
DOMAIN_CDN=$(jq -r .domains.cdn version.json)
DOMAIN_API=$(jq -r .domains.api version.json)
GITHUB_REPO=$(jq -r .githubRepo version.json)

# Guard against null/empty values (jq returns "null" for missing keys)
for var_name in VERSION EXTENSION_ID EXTENSION_NAME UPDATE_URL DOMAIN_WEBSITE DOMAIN_CDN DOMAIN_API GITHUB_REPO; do
  val="${!var_name}"
  [[ "$val" == "null" || -z "$val" ]] && { echo "❌ $var_name is null or empty in version.json"; exit 1; }
done

echo "🔄 Syncing constants from version.json..."
echo "   version:       $VERSION"
echo "   extensionId:   $EXTENSION_ID"
echo "   extensionName: $EXTENSION_NAME"
echo "   updateUrl:     $UPDATE_URL"
echo "   website:       $DOMAIN_WEBSITE"
echo "   cdn:           $DOMAIN_CDN"
echo "   api:           $DOMAIN_API"
echo "   githubRepo:    $GITHUB_REPO"
echo ""

# ── Version ──────────────────────────────────────────────────────────────────

echo "── Version ────────────────────────────────────────────────────────────"

for f in extension/package.json extension/manifest.json workers/package.json website/package.json; do
  sed -i '0,/"version": ".*"/{s/"version": ".*"/"version": "'"$VERSION"'"/}' "$f"
  echo "  ✅ $f"
done

# Sync name field in manifest.json (must match extensionName)
sed -i '0,/"name": ".*"/{s/"name": ".*"/"name": "'"$EXTENSION_NAME"'"/}' extension/manifest.json
echo "  ✅ extension/manifest.json (name)"

sed -i "s/\(AppVersion = \)\".*\"/\1\"$VERSION\"/" installer/config.go
echo "  ✅ installer/config.go (AppVersion)"

sed -i "s/\(CURRENT_VERSION = \)\".*\"/\1\"$VERSION\"/" workers/wrangler.toml
echo "  ✅ workers/wrangler.toml (CURRENT_VERSION)"

# VersionBadge.astro fallback version (shown when API fetch fails)
sed -i "s/textContent = 'v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'/textContent = 'v$VERSION'/" website/src/components/VersionBadge.astro
echo "  ✅ website/src/components/VersionBadge.astro (fallback version)"

# downloads.astro fallback version (shown when API fetch fails)
sed -i "s/textContent = 'v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*'/textContent = 'v$VERSION'/" website/src/pages/downloads.astro
echo "  ✅ website/src/pages/downloads.astro (fallback version)"

# ── Extension ID ─────────────────────────────────────────────────────────────

echo ""
echo "── Extension ID ───────────────────────────────────────────────────────"

sed -i "s/\(ExtensionID[[:space:]]*= \)\".*\"/\1\"$EXTENSION_ID\"/" installer/config.go
echo "  ✅ installer/config.go"

sed -i "s/\(EXTENSION_ID = \)\".*\"/\1\"$EXTENSION_ID\"/" workers/wrangler.toml
echo "  ✅ workers/wrangler.toml"

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

sed -i "s|\(ALLOWED_ORIGIN = \)\".*\"|\1\"$DOMAIN_WEBSITE\"|" workers/wrangler.toml
echo "  ✅ workers/wrangler.toml (ALLOWED_ORIGIN → website)"

sed -i "s|\(CDN_BASE_URL = \)\".*\"|\1\"$DOMAIN_CDN\"|" workers/wrangler.toml
echo "  ✅ workers/wrangler.toml (CDN_BASE_URL → cdn)"

sed -i "s|\(GITHUB_REPO = \)\".*\"|\1\"$GITHUB_REPO\"|" workers/wrangler.toml
echo "  ✅ workers/wrangler.toml (GITHUB_REPO)"

sed -i "s|site: '.*'|site: '$DOMAIN_WEBSITE'|" website/astro.config.mjs
echo "  ✅ website/astro.config.mjs (site → website)"

# NOTE: domains.api is validated by check-version.sh but NOT auto-synced here.
# API domain URLs appear in many varied contexts across .astro pages, _headers,
# and wrangler.toml routes. Similarly, domains.website and domains.cdn references
# embedded in .astro page content are NOT auto-synced — only their structured
# locations (wrangler.toml vars, astro.config.mjs) have patterns suitable for sed.
# A domain change requires manual find-and-replace, then run:
#   bash scripts/check-version.sh
# to verify consistency across all files.

echo ""
echo "✅ All constants synced from version.json"

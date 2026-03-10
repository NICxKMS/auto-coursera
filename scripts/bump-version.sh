#!/bin/bash
# bump-version.sh — Bump version and sync ALL constants across all components
#
# Updates the version field in version.json, then delegates to sync-constants.sh
# to propagate version + extensionId + extensionName + updateUrl + domains to
# every file in the monorepo.
#
# Usage:  bash scripts/bump-version.sh 1.8.0   (run from repo root)
set -euo pipefail

NEW_VERSION="${1:-}"

if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <semver>  (e.g., $0 1.8.0)"
  exit 1
fi

if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <semver>  (e.g., $0 1.8.0)"
  exit 1
fi

# Check jq dependency
command -v jq >/dev/null 2>&1 || { echo "❌ jq is required. Install it: apt install jq / brew install jq"; exit 1; }

# Update version in source of truth
tmpfile=$(mktemp)
jq --arg v "$NEW_VERSION" '.version = $v' version.json > "$tmpfile" && mv "$tmpfile" version.json
echo "  ✅ version.json → $NEW_VERSION"
echo ""

# Sync ALL constants (version + extensionId + extensionName + updateUrl + domains)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/sync-constants.sh"

echo ""
echo "Next steps:"
echo "  git add -A"
echo "  git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  git tag v$NEW_VERSION"
echo "  git push auto-coursera master --tags"

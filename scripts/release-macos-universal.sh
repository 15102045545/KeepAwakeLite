#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build unsigned macOS DMGs and upload them to the GitHub draft Release.

Usage:
  npm run release:macos

The script creates separate Apple Silicon and Intel DMGs. It does not use
Apple Developer ID signing, notarization, stapling, Apple ID, or Apple Secrets.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS release packaging must run on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

REPO="15102045545/KeepAwakeLite"
TAG_NAME="v1.0.0"
RELEASE_NAME="KeepAwakeLite v1.0.0"
TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

require_command gh
require_command npm
require_command rustup

gh auth status --hostname github.com >/dev/null

# Prevent a caller's shell from accidentally turning this unsigned build into
# a signed or notarized build.
unset APPLE_ID APPLE_TEAM_ID APPLE_PASSWORD APPLE_SIGNING_IDENTITY

rustup target add aarch64-apple-darwin x86_64-apple-darwin

npm ci

DMG_PATHS=()
for target in "${TARGETS[@]}"; do
  rm -rf "src-tauri/target/${target}/release/bundle"
  npm exec tauri -- build --target "${target}" --bundles dmg --ci --no-sign

  dmg_dir="src-tauri/target/${target}/release/bundle/dmg"
  dmg_count="$(find "${dmg_dir}" -maxdepth 1 -type f -name '*.dmg' -print | wc -l | tr -d ' ')"

  if [[ "${dmg_count}" != "1" ]]; then
    echo "Expected exactly one DMG in ${dmg_dir}, found ${dmg_count}." >&2
    exit 1
  fi

  DMG_PATHS+=("$(find "${dmg_dir}" -maxdepth 1 -type f -name '*.dmg' -print | sort | head -n 1)")
done

if gh release view "${TAG_NAME}" --repo "${REPO}" >/dev/null 2>&1; then
  if [[ "$(gh release view "${TAG_NAME}" --repo "${REPO}" --json isDraft --jq '.isDraft')" != "true" ]]; then
    echo "Release ${TAG_NAME} exists but is not a draft. Refusing to upload." >&2
    exit 1
  fi
else
  gh release create "${TAG_NAME}" \
    --repo "${REPO}" \
    --draft \
    --target "$(git rev-parse HEAD)" \
    --title "${RELEASE_NAME}" \
    --notes "KeepAwakeLite v1.0.0"
fi

gh release upload "${TAG_NAME}" "${DMG_PATHS[@]}" --repo "${REPO}" --clobber

echo "Uploaded unsigned macOS DMGs to draft release ${TAG_NAME}."

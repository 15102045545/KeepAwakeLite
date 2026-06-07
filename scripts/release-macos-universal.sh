#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build, sign, notarize, staple, and upload the macOS universal DMG.

Usage:
  npm run release:macos

The script stores Apple ID, Team ID, and the app-specific password in the
local macOS Keychain when they are missing. Values are never printed.
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
TARGET="universal-apple-darwin"
KEYCHAIN_ACCOUNT="keepawakelite-release"
APPLE_ID_SERVICE="keepawakelite.apple-id"
APPLE_TEAM_ID_SERVICE="keepawakelite.apple-team-id"
APPLE_PASSWORD_SERVICE="keepawakelite.apple-app-password"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is missing: $1" >&2
    exit 1
  fi
}

read_keychain_value() {
  security find-generic-password -w -s "$1" 2>/dev/null || true
}

store_keychain_value() {
  local service="$1"
  local label="$2"

  if [[ ! -t 0 ]]; then
    echo "Missing Keychain item ${service}. Run this script in an interactive terminal once to store ${label}." >&2
    exit 1
  fi

  echo "Store ${label} in the local Keychain. Input is handled by macOS and is not echoed." >&2

  security add-generic-password \
    -a "${KEYCHAIN_ACCOUNT}" \
    -s "${service}" \
    -U \
    -w >/dev/null
}

ensure_keychain_value() {
  local service="$1"
  local label="$2"
  local value

  value="$(read_keychain_value "${service}")"
  if [[ -z "${value}" ]]; then
    store_keychain_value "${service}" "${label}"
    value="$(read_keychain_value "${service}")"
  fi

  if [[ -z "${value}" ]]; then
    echo "Could not read Keychain item ${service}." >&2
    exit 1
  fi

  printf '%s' "${value}"
}

ensure_developer_id_identity() {
  local count
  local identity

  count="$(
    security find-identity -v -p codesigning 2>/dev/null \
      | sed -n 's/^[[:space:]]*[0-9]*) [[:xdigit:]]* "\(Developer ID Application:.*\)"$/\1/p' \
      | wc -l \
      | tr -d ' '
  )"

  if [[ "${count}" == "0" ]]; then
    echo "No Developer ID Application identity was found in the local Keychain." >&2
    exit 1
  fi

  if [[ "${count}" != "1" ]]; then
    echo "Multiple Developer ID Application identities were found. Set APPLE_SIGNING_IDENTITY for this terminal session." >&2
    exit 1
  fi

  identity="$(
    security find-identity -v -p codesigning 2>/dev/null \
      | sed -n 's/^[[:space:]]*[0-9]*) [[:xdigit:]]* "\(Developer ID Application:.*\)"$/\1/p' \
      | head -n 1
  )"

  export APPLE_SIGNING_IDENTITY="${identity}"
  unset identity
}

require_command gh
require_command npm
require_command rustup
require_command xcrun
require_command security

gh auth status --hostname github.com >/dev/null
xcrun notarytool --version >/dev/null

export APPLE_ID
APPLE_ID="$(ensure_keychain_value "${APPLE_ID_SERVICE}" "Apple ID for notarization")"

export APPLE_TEAM_ID
APPLE_TEAM_ID="$(ensure_keychain_value "${APPLE_TEAM_ID_SERVICE}" "Apple Team ID")"

if [[ -z "$(read_keychain_value "${APPLE_PASSWORD_SERVICE}")" ]]; then
  store_keychain_value "${APPLE_PASSWORD_SERVICE}" "Apple app-specific password"
fi
export APPLE_PASSWORD="@keychain:${APPLE_PASSWORD_SERVICE}"

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  ensure_developer_id_identity
fi

rustup target add aarch64-apple-darwin x86_64-apple-darwin

rm -rf "src-tauri/target/${TARGET}"
npm ci
npm exec tauri -- build --target "${TARGET}" --bundles dmg --ci

DMG_DIR="src-tauri/target/${TARGET}/release/bundle/dmg"
DMG_PATH="$(find "${DMG_DIR}" -maxdepth 1 -type f -name '*.dmg' -print | sort | head -n 1)"

if [[ -z "${DMG_PATH}" ]]; then
  echo "No universal DMG was produced in ${DMG_DIR}." >&2
  exit 1
fi

if [[ "$(find "${DMG_DIR}" -maxdepth 1 -type f -name '*.dmg' -print | wc -l | tr -d ' ')" != "1" ]]; then
  echo "Expected exactly one DMG in ${DMG_DIR}." >&2
  exit 1
fi

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

gh release upload "${TAG_NAME}" "${DMG_PATH}" --repo "${REPO}" --clobber

echo "Uploaded macOS universal DMG to draft release ${TAG_NAME}."

#!/bin/zsh

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DEVICE_ID="${1:-}"
ENTITLEMENTS_FILE="${PROJECT_DIR}/ios/Flow/Flow.entitlements"

if [[ -z "${DEVICE_ID}" ]]; then
  print -u2 -- "Usage: $0 <iPhone name or identifier>"
  exit 2
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

cd "${PROJECT_DIR}"

print -- "Synchronizing the Pomodoro iOS project..."
npx expo prebuild --platform ios

# Personal Apple development profiles do not support remote push notifications.
# Pomodoro uses scheduled local notifications, which do not need this entitlement.
if [[ -f "${ENTITLEMENTS_FILE}" ]]; then
  /usr/libexec/PlistBuddy -c "Delete :aps-environment" "${ENTITLEMENTS_FILE}" 2>/dev/null || true
fi

print -- "Building and installing Pomodoro on ${DEVICE_ID}..."
npx --yes @expo/cli@latest run:ios \
  --configuration Release \
  --device "${DEVICE_ID}"

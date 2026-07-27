#!/bin/zsh

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
DEVICE_ID="${1:-}"
STATE_DIR="${PROJECT_DIR}/.expo"
SUCCESS_FILE="${STATE_DIR}/last-seven-day-refresh"

if [[ -z "${DEVICE_ID}" ]]; then
  print -u2 -- "Usage: $0 <iPhone name or identifier>"
  exit 2
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

print -- "Checking whether the configured iPhone is reachable over Wi-Fi..."

if [[ ! -d "${DEVELOPER_DIR}" ]]; then
  print -u2 -- "Xcode is not installed at /Applications/Xcode.app."
  exit 2
fi

if [[ ! -x "${PROJECT_DIR}/node_modules/.bin/expo" ]]; then
  print -u2 -- "Project dependencies are missing. Run npm install in ${PROJECT_DIR}."
  exit 3
fi

DEVICE_INFO=$(/usr/bin/xcrun devicectl device info details --device "${DEVICE_ID}" 2>&1) || {
  print -u2 -- "${DEVICE_INFO}"
  print -u2 -- "The iPhone is not reachable. Put the Mac and iPhone on the same Wi-Fi, unlock the iPhone, and try again."
  exit 4
}

if [[ "${DEVICE_INFO}" != *"transportType: localNetwork"* ||
      "${DEVICE_INFO}" != *"tunnelState: connected"* ]]; then
  print -u2 -- "The iPhone is paired but is not connected through the local Wi-Fi network."
  print -u2 -- "Put the Mac and iPhone on the same Wi-Fi, unlock the iPhone, and try again."
  exit 5
fi

print -- "Wi-Fi device check passed."

if ! /usr/bin/security find-identity -v -p codesigning |
  /usr/bin/grep -q "Apple Development:"; then
  print -u2 -- "No valid Apple Development signing certificate was found."
  print -u2 -- "Open Xcode and sign in to your Apple Account before retrying."
  exit 6
fi

print -- "Signing certificate check passed."
print -- "Rebuilding, re-signing, and reinstalling Pomodoro..."

cd "${PROJECT_DIR}"

npx --yes @expo/cli@latest run:ios \
  --configuration Release \
  --device "${DEVICE_ID}" \
  --no-bundler

/bin/mkdir -p "${STATE_DIR}"
/usr/bin/touch "${SUCCESS_FILE}"

print -- "Pomodoro was refreshed successfully at $(/bin/date "+%Y-%m-%d %H:%M:%S")."

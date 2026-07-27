#!/bin/zsh

set -u
set -o pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${PROJECT_DIR}/.expo"
SUCCESS_FILE="${STATE_DIR}/last-iphone-refresh"
LOG_FILE="${STATE_DIR}/iphone-refresh.log"
REFRESH_AFTER_SECONDS=$((5 * 24 * 60 * 60))

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "${STATE_DIR}"
exec >>"${LOG_FILE}" 2>&1

print -- ""
print -- "[$(/bin/date "+%Y-%m-%dT%H:%M:%S%z")] Pomodoro iPhone refresh check started."

DEVICE="${1:-}"
MODE="${2:-}"

if [[ -z "${DEVICE}" || "${DEVICE}" == "REPLACE_WITH_IPHONE_NAME_OR_ID" ]]; then
  print -- "No iPhone name or identifier is configured."
  exit 2
fi

if [[ "${MODE}" != "--force" && -f "${SUCCESS_FILE}" ]]; then
  LAST_SUCCESS=$(/usr/bin/stat -f "%m" "${SUCCESS_FILE}")
  NOW=$(/bin/date "+%s")
  AGE_SECONDS=$((NOW - LAST_SUCCESS))
  if (( AGE_SECONDS < REFRESH_AFTER_SECONDS )); then
    REMAINING_HOURS=$(((REFRESH_AFTER_SECONDS - AGE_SECONDS + 3599) / 3600))
    print -- "Refresh is not due for approximately ${REMAINING_HOURS} hour(s)."
    exit 0
  fi
fi

if [[ ! -d "/Applications/Xcode.app" ]]; then
  print -- "Xcode is not installed at /Applications/Xcode.app."
  exit 3
fi

if [[ ! -x "${PROJECT_DIR}/node_modules/.bin/expo" ]]; then
  print -- "Project dependencies are missing. Run npm install in ${PROJECT_DIR}."
  exit 4
fi

if [[ ! -d "${PROJECT_DIR}/ios" ]]; then
  print -- "The native iOS project is missing. Complete the first USB installation."
  exit 5
fi

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

print -- "Available Xcode devices:"
/usr/bin/xcrun devicectl list devices || true

print -- "Refreshing Pomodoro on ${DEVICE}."
cd "${PROJECT_DIR}" || exit 6

npx --yes @expo/cli@latest run:ios \
  --configuration Release \
  --device "${DEVICE}" \
  --no-bundler
RESULT=$?

if (( RESULT != 0 )); then
  print -- "Refresh failed with exit code ${RESULT}; launchd will retry later."
  exit "${RESULT}"
fi

/usr/bin/touch "${SUCCESS_FILE}"
print -- "[$(/bin/date "+%Y-%m-%dT%H:%M:%S%z")] Pomodoro refresh installed successfully."

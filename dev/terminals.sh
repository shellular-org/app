#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

CONFIG_FILE="$SCRIPT_DIR/terminals.config"
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

SSH_REMOTE_PORT=${SSH_REMOTE_PORT:-5001}
SSH_USER=${SSH_USER:-}
SSH_HOST=${SSH_HOST:-}
LOCAL_SERVER_PORT=${LOCAL_SERVER_PORT:-3011}
LOCAL_RELAY_PORT=${LOCAL_RELAY_PORT:-6970}
SERVER_DIR=${SERVER_DIR:-../server}
PACKAGES_DIR=${PACKAGES_DIR:-../packages}
CLI_WORK_DIR=${CLI_WORK_DIR:-/}
SERVER_WIDTH_PCT=${SERVER_WIDTH_PCT:-50}

resolve_directory() {
    local configured_path="$1"
    local candidate

    if [[ "$configured_path" = /* ]]; then
        candidate="$configured_path"
    else
        candidate="$ROOT_DIR/$configured_path"
    fi

    if [ ! -d "$candidate" ]; then
        echo "Directory not found: $candidate" >&2
        return 1
    fi

    (cd "$candidate" && pwd)
}

validate_port() {
    local name="$1"
    local value="$2"

    if [[ ! "$value" =~ ^[0-9]+$ ]] || ((value < 1 || value > 65535)); then
        echo "$name must be an integer between 1 and 65535 (received: $value)" >&2
        exit 1
    fi
}

for command in curl npm osascript pnpm ssh system_profiler; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Required command not found: $command" >&2
        exit 1
    fi
done

if [ -z "$SSH_HOST" ]; then
    echo "SSH_HOST must be set in $CONFIG_FILE" >&2
    exit 1
fi

if [[ ! "$SSH_HOST" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "SSH_HOST contains unsupported characters: $SSH_HOST" >&2
    exit 1
fi

if [ -n "$SSH_USER" ] && [[ ! "$SSH_USER" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "SSH_USER contains unsupported characters: $SSH_USER" >&2
    exit 1
fi

validate_port "SSH_REMOTE_PORT" "$SSH_REMOTE_PORT"
validate_port "LOCAL_SERVER_PORT" "$LOCAL_SERVER_PORT"
validate_port "LOCAL_RELAY_PORT" "$LOCAL_RELAY_PORT"

SERVER_DIR="$(resolve_directory "$SERVER_DIR")" || exit 1
PACKAGES_DIR="$(resolve_directory "$PACKAGES_DIR")" || exit 1
CLI_DIR="$(resolve_directory "$PACKAGES_DIR/cli")" || exit 1
CLI_WORK_DIR="$(resolve_directory "$CLI_WORK_DIR")" || exit 1

echo "Building the local protocol package..."
(cd "$PACKAGES_DIR" && pnpm --filter protocol run build) || exit 1

if [ -n "${DISPLAY:-}" ]; then
    DISPLAY_INDEX=$(($DISPLAY - 1))
    DISPLAY_INFO=$(system_profiler SPDisplaysDataType 2>/dev/null | awk -v idx="$DISPLAY_INDEX" '
        /^Displays:/ { found=1; next }
        found && /^[[:space:]]/ { count++ }
        found && /Resolution:/ { res[count] = $2 " " $4 }
        END { split(res[idx], r, " "); print r[1], r[2] }
    ')
    read SCREEN_WIDTH SCREEN_HEIGHT <<< "$DISPLAY_INFO"
else
    read SCREEN_WIDTH SCREEN_HEIGHT <<< $(system_profiler SPDisplaysDataType 2>/dev/null | awk '/Resolution:/{print $2" "$4; exit}')
fi

SCREEN_WIDTH=${SCREEN_WIDTH:-1920}
SCREEN_HEIGHT=${SCREEN_HEIGHT:-1080}
SERVER_WIDTH=$((SCREEN_WIDTH * SERVER_WIDTH_PCT / 100))
RIGHT_X=$SERVER_WIDTH
RIGHT_WIDTH=$((SCREEN_WIDTH - SERVER_WIDTH))

if [ -n "${DISPLAY:-}" ]; then
    DISPLAY_OFFSET_X=0
    DISPLAY_OFFSET_Y=0
    for ((i=0; i<DISPLAY_INDEX; i++)); do
        DISPLAY_INFO=$(system_profiler SPDisplaysDataType 2>/dev/null | awk -v idx="$i" '
            /^Displays:/ { found=1; next }
            found && /^[[:space:]]/ { count++ }
            found && /Resolution:/ { res[count] = $2 " " $4 }
            END { split(res[idx], r, " "); print r[1], r[2] }
        ')
        read DW DH <<< "$DISPLAY_INFO"
        DISPLAY_OFFSET_X=$((DISPLAY_OFFSET_X + DW))
    done
else
    DISPLAY_OFFSET_X=0
    DISPLAY_OFFSET_Y=0
fi

if [ -n "$SSH_USER" ]; then
    SERVER_URL="https://${SSH_USER}.${SSH_HOST}"
else
    SERVER_URL="https://${SSH_HOST}"
fi

CENTRAL_HEALTH_URL="http://127.0.0.1:${LOCAL_SERVER_PORT}/health"
RELAY_HEALTH_URL="http://[::1]:${LOCAL_RELAY_PORT}/health"
SSH_DESTINATION="${SSH_USER}${SSH_USER:+@}${SSH_HOST}"

printf -v QUOTED_SERVER_DIR '%q' "$SERVER_DIR"
printf -v QUOTED_CLI_DIR '%q' "$CLI_DIR"
printf -v QUOTED_APP_DIR '%q' "$ROOT_DIR"
printf -v QUOTED_CLI_WORK_DIR '%q' "$CLI_WORK_DIR"
printf -v QUOTED_SERVER_URL '%q' "$SERVER_URL"
printf -v QUOTED_CENTRAL_HEALTH_URL '%q' "$CENTRAL_HEALTH_URL"
printf -v QUOTED_RELAY_HEALTH_URL '%q' "$RELAY_HEALTH_URL"

CENTRAL_COMMAND="cd $QUOTED_SERVER_DIR && pnpm run central:dev"
RELAY_COMMAND="cd $QUOTED_SERVER_DIR && echo 'Waiting for central...' && until curl --fail --silent $QUOTED_CENTRAL_HEALTH_URL >/dev/null; do sleep 1; done && env POSTHOG_KEY=disabled pnpm run relay:dev"
TUNNEL_COMMAND="cd $QUOTED_SERVER_DIR && echo 'Waiting for central before opening the SSH tunnel...' && until curl --fail --silent $QUOTED_CENTRAL_HEALTH_URL >/dev/null; do sleep 1; done && ssh -N -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R ${SSH_REMOTE_PORT}:127.0.0.1:${LOCAL_SERVER_PORT} $SSH_DESTINATION"
CLI_COMMAND="cd $QUOTED_CLI_DIR && echo 'Waiting for the relay and development tunnel...' && until curl --noproxy '*' --fail --silent $QUOTED_RELAY_HEALTH_URL >/dev/null && curl --fail --silent $QUOTED_SERVER_URL/health >/dev/null; do sleep 1; done && pnpm run dev --server $QUOTED_SERVER_URL --dir $QUOTED_CLI_WORK_DIR"
APP_COMMAND="cd $QUOTED_APP_DIR && echo 'Waiting for the relay and development tunnel...' && until curl --noproxy '*' --fail --silent $QUOTED_RELAY_HEALTH_URL >/dev/null && curl --fail --silent $QUOTED_SERVER_URL/health >/dev/null; do sleep 1; done && npm run dev macos"

LEFT_X=$DISPLAY_OFFSET_X
LEFT_Y=$((DISPLAY_OFFSET_Y + 50))
LEFT_W=$((LEFT_X + SERVER_WIDTH))
LEFT_H=$((LEFT_Y + SCREEN_HEIGHT - 50))

RIGHT_X=$((DISPLAY_OFFSET_X + SERVER_WIDTH))
RIGHT_Y=$LEFT_Y
RIGHT_W=$((DISPLAY_OFFSET_X + SCREEN_WIDTH))
RIGHT_H=$LEFT_H

osascript - \
    "$CENTRAL_COMMAND" \
    "$RELAY_COMMAND" \
    "$TUNNEL_COMMAND" \
    "$CLI_COMMAND" \
    "$APP_COMMAND" \
    "$LEFT_X" "$LEFT_Y" "$LEFT_W" "$LEFT_H" \
    "$RIGHT_X" "$RIGHT_Y" "$RIGHT_W" "$RIGHT_H" <<'APPLESCRIPT'
on run arguments
    set centralCommand to item 1 of arguments
    set relayCommand to item 2 of arguments
    set tunnelCommand to item 3 of arguments
    set cliCommand to item 4 of arguments
    set appCommand to item 5 of arguments
    set leftBounds to {(item 6 of arguments) as integer, (item 7 of arguments) as integer, (item 8 of arguments) as integer, (item 9 of arguments) as integer}
    set rightBounds to {(item 10 of arguments) as integer, (item 11 of arguments) as integer, (item 12 of arguments) as integer, (item 13 of arguments) as integer}

    tell application "Terminal"
        activate

        -- Server window: central, relay, and reverse SSH tunnel.
        do script centralCommand
        set serverWindow to front window
        set bounds of serverWindow to leftBounds

        do script relayCommand in serverWindow

        do script tunnelCommand in serverWindow

        -- Client window: workspace CLI and the macOS app development process.
        do script cliCommand
        set clientWindow to front window
        set bounds of clientWindow to rightBounds

        do script appCommand in clientWindow
    end tell
end run
APPLESCRIPT

echo "Shellular development terminals started. Complete the SSH password prompt to bring the client and app online."

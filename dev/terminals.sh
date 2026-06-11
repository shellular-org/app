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
LOCAL_SERVER_PORT=${LOCAL_SERVER_PORT:-6969}
SERVER_DIR=${SERVER_DIR:-../server}
PACKAGES_DIR=${PACKAGES_DIR:-../packages}
SERVER_WIDTH_PCT=${SERVER_WIDTH_PCT:-50}

SERVER_DIR="$(cd "$ROOT_DIR/$SERVER_DIR" 2>/dev/null && pwd || echo "$ROOT_DIR/$SERVER_DIR")"
PACKAGES_DIR="$(cd "$ROOT_DIR/$PACKAGES_DIR" 2>/dev/null && pwd || echo "$ROOT_DIR/$PACKAGES_DIR")"

if [ -n "$DISPLAY" ]; then
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

if [ -n "$DISPLAY" ]; then
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
    WSS_SERVER="wss://${SSH_USER}.${SSH_HOST}"
else
    WSS_SERVER="wss://${SSH_HOST}"
fi

LEFT_X=$DISPLAY_OFFSET_X
LEFT_Y=$((DISPLAY_OFFSET_Y + 50))
LEFT_W=$((LEFT_X + SERVER_WIDTH))
LEFT_H=$((LEFT_Y + SCREEN_HEIGHT - 50))

RIGHT_X=$((DISPLAY_OFFSET_X + SERVER_WIDTH))
RIGHT_Y=$LEFT_Y
RIGHT_W=$((DISPLAY_OFFSET_X + SCREEN_WIDTH))
RIGHT_H=$LEFT_H

osascript -e "
tell application \"Terminal\"
    activate

    -- Server window (left side, tab 1: dev server)
    do script \"cd '$SERVER_DIR' && npm run dev\"
    set bounds of window 1 to {$LEFT_X, $LEFT_Y, $LEFT_W, $LEFT_H}

    -- Tab 2: SSH tunnel
    tell application \"System Events\" to tell process \"Terminal\" to keystroke \"t\" using command down
    delay 0.3
    do script \"ssh -R ${SSH_REMOTE_PORT}:localhost:${LOCAL_SERVER_PORT} ${SSH_USER}${SSH_USER:+@}${SSH_HOST}\" in window 1

    -- Packages window (right side)
    do script \"cd '$PACKAGES_DIR' && npm run dev:cli -- --server $WSS_SERVER\"
    set bounds of window 1 to {$RIGHT_X, $RIGHT_Y, $RIGHT_W, $RIGHT_H}
end tell
"

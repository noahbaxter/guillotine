#!/bin/bash
# Auto-reload development server
# Watches src/ and assets/, rebuilds and relaunches on changes
#
# Usage: ./scripts/watch.sh

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
source "$SCRIPT_DIR/_common.sh"

APP_PATH="$BUILD_DIR/build/Debug/$PLUGIN_NAME.app"
APP_NAME="$PLUGIN_NAME"

# Check for fswatch
if ! command -v fswatch &> /dev/null; then
    echo -e "${RED}fswatch not found. Install with: brew install fswatch${NC}"
    exit 1
fi

# Gracefully quit app (allows it to save window position)
kill_app() {
    # Send quit, then force kill, then wait until actually dead
    osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null &
    sleep 0.1
    pkill -x "$APP_NAME" 2>/dev/null || true
    # Wait for process to actually exit (max 1s)
    for i in {1..10}; do
        pgrep -x "$APP_NAME" >/dev/null || break
        sleep 0.1
    done
}

# Cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping watch...${NC}"
    kill_app
    exit 0
}
trap cleanup SIGINT SIGTERM

# Initial build and launch
echo -e "${CYAN}=== $PLUGIN_NAME Watch Mode ===${NC}"
echo -e "Watching: src/, assets/, web/"
echo -e "Press Ctrl+C to stop\n"

"$SCRIPT_DIR/standalone.sh"

# Watch and rebuild
fswatch -o "$PROJECT_ROOT/src" "$PROJECT_ROOT/assets" "$PROJECT_ROOT/web" | while read -r _; do
    START=$(python3 -c 'import time; print(time.time())')
    echo -e "\n${YELLOW}Change detected, rebuilding...${NC}"

    # Build first, only kill/relaunch if successful
    if "$SCRIPT_DIR/standalone.sh" --no-launch; then
        BUILD_DONE=$(python3 -c 'import time; print(time.time())')
        kill_app
        open -g "$APP_PATH"
        END=$(python3 -c 'import time; print(time.time())')
        BUILD_TIME=$(python3 -c "print(f'{${BUILD_DONE} - ${START}:.2f}s')")
        TOTAL_TIME=$(python3 -c "print(f'{${END} - ${START}:.2f}s')")
        echo -e "${GREEN}✓ Reloaded${NC} (build: ${BUILD_TIME}, total: ${TOTAL_TIME})"
    else
        echo -e "${RED}Build failed - keeping current version${NC}"
    fi
done

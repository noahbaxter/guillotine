#!/bin/bash
# Quick UI preview - builds standalone app and launches it
#
# Usage:
#   ./scripts/standalone.sh          # Build and launch
#   ./scripts/standalone.sh --open   # Just open existing build (skip rebuild)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
source "$SCRIPT_DIR/_common.sh"

APP_PATH="$BUILD_DIR/build/Debug/${PLUGIN_NAME}.app"

# Parse flags
LAUNCH=true
for arg in "$@"; do
    case $arg in
        --open)
            if [ -d "$APP_PATH" ]; then
                echo -e "${GREEN}Opening existing build...${NC}"
                open "$APP_PATH"
                exit 0
            else
                echo -e "${RED}No existing build found. Building...${NC}"
            fi
            ;;
        --no-launch)
            LAUNCH=false
            ;;
    esac
done

# Kill any running instance first (prevents WebView caching issues)
pkill -f "Guillotine.app" 2>/dev/null || true
sleep 0.5

# Always regenerate to pick up web file changes (BinaryData)
force_regen

# Build standalone (Debug, current arch only for speed)
echo -e "${YELLOW}Building standalone app...${NC}"
xcodebuild -project "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" \
    -scheme "$PLUGIN_NAME - Standalone Plugin" \
    -configuration Debug \
    ARCHS=arm64 \
    ONLY_ACTIVE_ARCH=YES \
    CODE_SIGNING_ALLOWED=NO \
    -quiet

if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}Build failed - app not found at $APP_PATH${NC}"
    exit 1
fi

if [ "$LAUNCH" = true ]; then
    echo -e "${GREEN}✓ Built. Launching...${NC}"
    open "$APP_PATH"
else
    echo -e "${GREEN}✓ Built.${NC}"
fi

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

CMAKE_BUILD_DIR="$PROJECT_ROOT/build-standalone"
APP_PATH="$CMAKE_BUILD_DIR/Guillotine_artefacts/Debug/Standalone/${PLUGIN_NAME}.app"

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

# Configure CMake if needed (or reconfigure if paths changed)
need_configure=false
if [ ! -f "$CMAKE_BUILD_DIR/CMakeCache.txt" ]; then
    need_configure=true
elif ! grep -q "CMAKE_HOME_DIRECTORY:INTERNAL=$PROJECT_ROOT" "$CMAKE_BUILD_DIR/CMakeCache.txt" 2>/dev/null; then
    echo -e "${YELLOW}Project path changed, reconfiguring...${NC}"
    rm -rf "$CMAKE_BUILD_DIR"
    need_configure=true
fi

if [ "$need_configure" = true ]; then
    echo -e "${YELLOW}Configuring CMake (first build takes ~30s)...${NC}"
    CMAKE_OUTPUT=$(cmake -B "$CMAKE_BUILD_DIR" -G Xcode \
        -DCMAKE_OSX_ARCHITECTURES="arm64" \
        -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
        "$PROJECT_ROOT" 2>&1) || {
        echo "$CMAKE_OUTPUT"
        echo -e "${RED}CMake configuration failed${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ CMake configured${NC}"
fi

# Build standalone (Debug for speed, quiet unless error)
echo -e "${YELLOW}Building standalone app...${NC}"
BUILD_OUTPUT=$(cmake --build "$CMAKE_BUILD_DIR" --config Debug --target Guillotine_Standalone --parallel -- -quiet 2>&1) || {
    echo "$BUILD_OUTPUT"
    echo -e "${RED}Build failed${NC}"
    exit 1
}

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

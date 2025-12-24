#!/bin/bash
# Shared functions for Guillotine build scripts

# Colors
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Project paths (set PROJECT_ROOT before sourcing)
: "${PROJECT_ROOT:="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"}"
JUCER_FILE="$PROJECT_ROOT/Guillotine.jucer"
BUILD_DIR="$PROJECT_ROOT/Builds/MacOSX"
PLUGIN_NAME="Guillotine"

# Find Projucer in submodule (returns path or empty)
find_projucer() {
    local path="$PROJECT_ROOT/third_party/JUCE/extras/Projucer/Builds/MacOSX/build/Release/Projucer.app/Contents/MacOS/Projucer"
    [ -f "$path" ] && echo "$path"
}

# Build Projucer from submodule
build_projucer() {
    local project="$PROJECT_ROOT/third_party/JUCE/extras/Projucer/Builds/MacOSX/Projucer.xcodeproj"
    if [ ! -f "$project/project.pbxproj" ]; then
        echo -e "${RED}Error: JUCE submodule not initialized${NC}"
        echo "Run: git submodule update --init --recursive"
        return 1
    fi
    echo -e "${YELLOW}Building Projucer...${NC}"
    xcodebuild -project "$project" -scheme "Projucer - App" -configuration Release -quiet || return 1
    echo -e "${GREEN}✓ Projucer built${NC}"
}

# Ensure Projucer is available, build if needed
ensure_projucer() {
    PROJUCER=$(find_projucer)
    if [ -z "$PROJUCER" ]; then
        build_projucer || return 1
        PROJUCER=$(find_projucer)
    fi
    [ -n "$PROJUCER" ]
}

# Regenerate Xcode project if .jucer is newer
regen_if_needed() {
    if [ "$JUCER_FILE" -nt "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" ] 2>/dev/null || [ ! -d "$BUILD_DIR" ]; then
        echo -e "${YELLOW}Regenerating Xcode project...${NC}"
        ensure_projucer || return 1
        "$PROJUCER" --resave "$JUCER_FILE"
    fi
}

# Force regenerate Xcode project (needed when web files change)
force_regen() {
    echo -e "${YELLOW}Regenerating Xcode project (web files may have changed)...${NC}"
    ensure_projucer || return 1
    "$PROJUCER" --resave "$JUCER_FILE"
}

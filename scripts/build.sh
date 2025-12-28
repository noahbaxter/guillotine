#!/bin/bash
# Build script for Guillotine
#
# Usage:
#   ./scripts/build.sh                 # Build Release (default)
#   ./scripts/build.sh debug           # Build Debug
#   ./scripts/build.sh clean           # Clean build artifacts
#   ./scripts/build.sh regen           # Regenerate Xcode project from JUCE
#   ./scripts/build.sh release         # Build Release and create distribution package
#
# Options:
#   --install                          # Install to user library (default: on)
#   --no-install                       # Skip installation

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
source "$SCRIPT_DIR/_common.sh"

RELEASE_DIR="$PROJECT_ROOT/releases"

# Parse arguments
MODE="Release"
INSTALL=true

for arg in "$@"; do
    case $arg in
        debug|Debug|DEBUG)
            MODE="Debug"
            ;;
        clean|Clean|CLEAN)
            MODE="Clean"
            ;;
        regen|Regen|REGEN)
            MODE="Regen"
            ;;
        release|Release|RELEASE)
            MODE="Release"
            ;;
        uninstall|Uninstall|UNINSTALL)
            MODE="Uninstall"
            ;;
        --install)
            INSTALL=true
            ;;
        --no-install)
            INSTALL=false
            ;;
        --help|-h)
            echo "Usage: ./scripts/build.sh [mode] [options]"
            echo ""
            echo "Modes:"
            echo "  debug     Build Debug configuration"
            echo "  release   Build Release configuration (default)"
            echo "  clean     Clean build artifacts"
            echo "  regen     Regenerate Xcode project from .jucer"
            echo "  uninstall Remove installed plugins"
            echo ""
            echo "Options:"
            echo "  --install      Install plugins to user library (default)"
            echo "  --no-install   Skip installation"
            exit 0
            ;;
    esac
done

echo -e "${YELLOW}=== $PLUGIN_NAME Build Script ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Mode: $MODE"

# Regenerate Xcode project (verbose version for main build)
regen_project() {
    echo -e "\n${YELLOW}Regenerating Xcode project...${NC}"
    ensure_projucer || return 1
    echo "Using Projucer: $PROJUCER"
    "$PROJUCER" --resave "$JUCER_FILE" || {
        echo -e "${RED}Error: Projucer failed to regenerate project${NC}"
        return 1
    }
    echo -e "${GREEN}✓ Xcode project regenerated${NC}"
}

# Function to install plugins
install_plugins() {
    local src_dir="$1"
    local vst3_dest="$HOME/Library/Audio/Plug-Ins/VST3"
    local au_dest="$HOME/Library/Audio/Plug-Ins/Components"

    echo -e "\n${YELLOW}Installing plugins to user library...${NC}"
    mkdir -p "$vst3_dest" "$au_dest"

    # Install VST3
    if [ -d "$src_dir/$PLUGIN_NAME.vst3" ]; then
        rm -rf "$vst3_dest/$PLUGIN_NAME.vst3"
        ditto "$src_dir/$PLUGIN_NAME.vst3" "$vst3_dest/$PLUGIN_NAME.vst3"

        # Verify installation
        if [ -f "$vst3_dest/$PLUGIN_NAME.vst3/Contents/MacOS/$PLUGIN_NAME" ]; then
            echo -e "${GREEN}✓ Installed VST3 to $vst3_dest${NC}"
        else
            echo -e "${RED}✗ VST3 installation failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ VST3 not found at $src_dir/$PLUGIN_NAME.vst3${NC}"
        exit 1
    fi

    # Install AU
    if [ -d "$src_dir/$PLUGIN_NAME.component" ]; then
        rm -rf "$au_dest/$PLUGIN_NAME.component"
        ditto "$src_dir/$PLUGIN_NAME.component" "$au_dest/$PLUGIN_NAME.component"

        # Verify installation
        if [ -f "$au_dest/$PLUGIN_NAME.component/Contents/MacOS/$PLUGIN_NAME" ]; then
            echo -e "${GREEN}✓ Installed AU to $au_dest${NC}"
        else
            echo -e "${RED}✗ AU installation failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ AU not found at $src_dir/$PLUGIN_NAME.component${NC}"
        exit 1
    fi

    # Touch bundles to update modification time (triggers DAW rescan)
    touch "$vst3_dest/$PLUGIN_NAME.vst3"
    touch "$au_dest/$PLUGIN_NAME.component"

    echo -e "${YELLOW}NOTE: If Ableton shows the old version, try:${NC}"
    echo -e "  ${YELLOW}1. File > Plug-In Manager > Rescan${NC}"
    echo -e "  ${YELLOW}2. Or delete ~/Library/Audio/Cache/Ableton folder and restart Ableton${NC}"
}

# Main logic
case "$MODE" in
    Clean)
        echo -e "\n${YELLOW}Cleaning build artifacts...${NC}"
        rm -rf "$BUILD_DIR/build"
        rm -rf "$PROJECT_ROOT/Builds"
        rm -rf "$PROJECT_ROOT/JuceLibraryCode"
        echo -e "${GREEN}✓ Cleaned${NC}"
        ;;

    Regen)
        regen_project
        ;;

    Uninstall)
        echo -e "\n${YELLOW}Uninstalling plugins...${NC}"
        local vst3_dest="$HOME/Library/Audio/Plug-Ins/VST3"
        local au_dest="$HOME/Library/Audio/Plug-Ins/Components"
        local cache_dir="$HOME/Library/Audio/Cache/Ableton"

        if [ -d "$vst3_dest/$PLUGIN_NAME.vst3" ]; then
            rm -rf "$vst3_dest/$PLUGIN_NAME.vst3"
            echo -e "${GREEN}✓ Removed VST3${NC}"
        fi

        if [ -d "$au_dest/$PLUGIN_NAME.component" ]; then
            rm -rf "$au_dest/$PLUGIN_NAME.component"
            echo -e "${GREEN}✓ Removed AU${NC}"
        fi

        if [ -d "$cache_dir" ]; then
            echo -e "${YELLOW}Would you like to clear Ableton cache? (y/n)${NC}"
            read -r response
            if [[ "$response" =~ ^[Yy]$ ]]; then
                rm -rf "$cache_dir"
                echo -e "${GREEN}✓ Cleared Ableton cache${NC}"
            fi
        fi

        echo -e "${YELLOW}Please restart your DAW${NC}"
        ;;


    Debug)
        # Always regenerate to pick up web file changes (they're embedded in BinaryData)
        regen_project

        echo -e "\n${YELLOW}Building Debug...${NC}"
        xcodebuild -project "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" \
            -scheme "$PLUGIN_NAME - VST3" \
            -configuration Debug \
            -destination "generic/platform=macOS" \
            ARCHS="arm64" \
            ONLY_ACTIVE_ARCH=YES \
            MACOSX_DEPLOYMENT_TARGET=10.15 \
            -quiet 2>&1 | grep -E "(error:|warning:)" || true

        xcodebuild -project "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" \
            -scheme "$PLUGIN_NAME - AU" \
            -configuration Debug \
            -destination "generic/platform=macOS" \
            ARCHS="arm64" \
            ONLY_ACTIVE_ARCH=YES \
            MACOSX_DEPLOYMENT_TARGET=10.15 \
            -quiet 2>&1 | grep -E "(error:|warning:)" || true

        echo -e "${GREEN}✓ Debug build complete${NC}"

        if [ "$INSTALL" = true ]; then
            install_plugins "$BUILD_DIR/build/Debug"
        fi
        ;;

    Release)
        # Always regenerate to pick up web file changes (they're embedded in BinaryData)
        regen_project

        echo -e "\n${YELLOW}Building Release (Universal Binary)...${NC}"

        # Clean previous builds
        rm -rf "$BUILD_DIR/build"

        xcodebuild -project "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" \
            -scheme "$PLUGIN_NAME - VST3" \
            -configuration Release \
            -destination "generic/platform=macOS" \
            ARCHS="arm64 x86_64" \
            ONLY_ACTIVE_ARCH=NO \
            MACOSX_DEPLOYMENT_TARGET=10.15 \
            -quiet || { echo -e "${RED}VST3 Build Failed${NC}"; exit 1; }

        xcodebuild -project "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" \
            -scheme "$PLUGIN_NAME - AU" \
            -configuration Release \
            -destination "generic/platform=macOS" \
            ARCHS="arm64 x86_64" \
            ONLY_ACTIVE_ARCH=NO \
            MACOSX_DEPLOYMENT_TARGET=10.15 \
            -quiet || { echo -e "${RED}AU Build Failed${NC}"; exit 1; }

        # Verify builds
        VST3_PATH="$BUILD_DIR/build/Release/$PLUGIN_NAME.vst3"
        AU_PATH="$BUILD_DIR/build/Release/$PLUGIN_NAME.component"

        if [ ! -d "$VST3_PATH" ] || [ ! -d "$AU_PATH" ]; then
            echo -e "${RED}Error: Build artifacts missing${NC}"
            exit 1
        fi

        # Check Universal Binary
        echo "Checking architectures..."
        VST3_ARCHS=$(lipo -archs "$VST3_PATH/Contents/MacOS/$PLUGIN_NAME")

        if [[ "$VST3_ARCHS" == *"arm64"* ]] && [[ "$VST3_ARCHS" == *"x86_64"* ]]; then
            echo -e "${GREEN}✓ VST3 is Universal Binary: $VST3_ARCHS${NC}"
        else
            echo -e "${YELLOW}Warning: VST3 is not universal: $VST3_ARCHS${NC}"
        fi

        echo -e "${GREEN}✓ Release build complete${NC}"

        if [ "$INSTALL" = true ]; then
            install_plugins "$BUILD_DIR/build/Release"
        fi

        # Create Release Package
        echo -e "\n${YELLOW}Creating release package...${NC}"
        VERSION=$(grep -o 'version="[^"]*"' "$JUCER_FILE" | head -1 | sed 's/version="//' | sed 's/"//' || echo "0.1.0")
        RELEASE_NAME="$PLUGIN_NAME-v${VERSION}-macOS"
        TEMP_DIR="/tmp/$RELEASE_NAME"

        rm -rf "$TEMP_DIR"
        mkdir -p "$TEMP_DIR"

        cp -R "$VST3_PATH" "$TEMP_DIR/"
        cp -R "$AU_PATH" "$TEMP_DIR/"

        # Create Installer Script
        cat > "$TEMP_DIR/Install.command" << 'INSTALL_SCRIPT'
#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_NAME="Guillotine"
echo "Installing $PLUGIN_NAME..."
mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3"
mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"
cp -R "$DIR/$PLUGIN_NAME.vst3" "$HOME/Library/Audio/Plug-Ins/VST3/"
cp -R "$DIR/$PLUGIN_NAME.component" "$HOME/Library/Audio/Plug-Ins/Components/"
echo ""
echo "Removing Gatekeeper quarantine attributes (may require password)..."
sudo xattr -cr "$HOME/Library/Audio/Plug-Ins/VST3/$PLUGIN_NAME.vst3"
sudo xattr -cr "$HOME/Library/Audio/Plug-Ins/Components/$PLUGIN_NAME.component"
echo ""
echo "Done! Please restart your DAW."
read -p "Press any key to exit..."
INSTALL_SCRIPT
        chmod +x "$TEMP_DIR/Install.command"

        # Create README
        cat > "$TEMP_DIR/README.txt" << EOF
$PLUGIN_NAME v${VERSION} - macOS Release

This bundle contains:
- $PLUGIN_NAME.vst3 (VST3 plugin)
- $PLUGIN_NAME.component (Audio Unit plugin)
- Install.command (automatic installer script)

Installation:
1. Double-click Install.command for automatic installation
2. Or manually copy plugins to:
   - VST3: ~/Library/Audio/Plug-Ins/VST3/
   - AU: ~/Library/Audio/Plug-Ins/Components/

Requirements: macOS 10.15 or later
Built: $(date)
EOF

        mkdir -p "$RELEASE_DIR"
        cd /tmp
        zip -r "$RELEASE_DIR/${RELEASE_NAME}.zip" "$RELEASE_NAME" -x "*.DS_Store"
        rm -rf "$TEMP_DIR"

        echo -e "${GREEN}✓ Release package created: $RELEASE_DIR/${RELEASE_NAME}.zip${NC}"
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"

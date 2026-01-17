#!/bin/bash
# Build script for Guillotine (CMake-based)
#
# Usage:
#   ./scripts/build.sh                 # Build Release (default)
#   ./scripts/build.sh debug           # Build Debug
#   ./scripts/build.sh clean           # Clean build artifacts
#   ./scripts/build.sh release         # Build Release and create distribution package
#
# Options:
#   --install                          # Install to system library (default: on, requires sudo)
#   --no-install                       # Skip installation

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
source "$SCRIPT_DIR/_common.sh"

RELEASE_DIR="$PROJECT_ROOT/releases"
CMAKE_BUILD_DIR="$PROJECT_ROOT/build"

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
        release|Release|RELEASE)
            MODE="Release"
            ;;
        uninstall|Uninstall|UNINSTALL)
            MODE="Uninstall"
            ;;
        reconfigure|Reconfigure|RECONFIGURE)
            MODE="Reconfigure"
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
            echo "  debug       Build Debug configuration"
            echo "  release     Build Release configuration (default)"
            echo "  clean       Clean build artifacts"
            echo "  reconfigure Force CMake reconfigure (use after adding files)"
            echo "  uninstall   Remove installed plugins"
            echo ""
            echo "Options:"
            echo "  --install      Install plugins to system library (default, requires sudo)"
            echo "  --no-install   Skip installation"
            exit 0
            ;;
    esac
done

echo -e "${YELLOW}=== $PLUGIN_NAME Build Script (CMake) ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Mode: $MODE"

# Configure CMake if needed (or reconfigure if paths/files changed)
configure_cmake() {
    local need_configure=false
    local cache_file="$CMAKE_BUILD_DIR/CMakeCache.txt"
    local cmake_lists="$PROJECT_ROOT/CMakeLists.txt"

    if [ ! -f "$cache_file" ]; then
        need_configure=true
    elif ! grep -q "CMAKE_HOME_DIRECTORY:INTERNAL=$PROJECT_ROOT" "$cache_file" 2>/dev/null; then
        echo -e "${YELLOW}Project path changed, reconfiguring...${NC}"
        need_configure=true
    elif [ "$cmake_lists" -nt "$cache_file" ]; then
        # CMakeLists.txt is newer than cache - files were added/removed
        echo -e "${YELLOW}CMakeLists.txt changed, reconfiguring...${NC}"
        need_configure=true
    fi

    if [ "$need_configure" = true ]; then
        echo -e "${YELLOW}Configuring CMake (first build takes ~30s)...${NC}"
        CMAKE_OUTPUT=$(cmake -B "$CMAKE_BUILD_DIR" -G Xcode \
            -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
            -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
            "$PROJECT_ROOT" 2>&1) || {
            echo "$CMAKE_OUTPUT"
            echo -e "${RED}CMake configuration failed${NC}"
            exit 1
        }
        fix_ownership "$CMAKE_BUILD_DIR"
        echo -e "${GREEN}✓ CMake configured${NC}"
    fi
}

# Force reconfigure CMake
force_reconfigure() {
    echo -e "${YELLOW}Forcing CMake reconfigure...${NC}"
    CMAKE_OUTPUT=$(cmake -B "$CMAKE_BUILD_DIR" -G Xcode \
        -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
        -DCMAKE_OSX_DEPLOYMENT_TARGET=10.15 \
        "$PROJECT_ROOT" 2>&1) || {
        echo "$CMAKE_OUTPUT"
        echo -e "${RED}CMake configuration failed${NC}"
        exit 1
    }
    fix_ownership "$CMAKE_BUILD_DIR"
    echo -e "${GREEN}✓ CMake reconfigured${NC}"
}

# Function to install plugins
# CMake outputs to: $ARTIFACTS_DIR/{Config}/VST3/ and $ARTIFACTS_DIR/{Config}/AU/
install_plugins() {
    local src_dir="$1"
    local vst3_dest="/Library/Audio/Plug-Ins/VST3"
    local au_dest="/Library/Audio/Plug-Ins/Components"
    local user_vst3="$HOME/Library/Audio/Plug-Ins/VST3"
    local user_au="$HOME/Library/Audio/Plug-Ins/Components"

    # Clean user folder if present (shouldn't be with CMake, but just in case)
    if [ -d "$user_vst3/$PLUGIN_NAME.vst3" ]; then
        rm -rf "$user_vst3/$PLUGIN_NAME.vst3"
    fi
    if [ -d "$user_au/$PLUGIN_NAME.component" ]; then
        rm -rf "$user_au/$PLUGIN_NAME.component"
    fi

    echo -e "\n${YELLOW}Installing plugins to system library (requires sudo)...${NC}"
    sudo mkdir -p "$vst3_dest" "$au_dest"

    # CMake artifact structure: {config}/VST3/ and {config}/AU/
    local vst3_src="$src_dir/VST3/$PLUGIN_NAME.vst3"
    local au_src="$src_dir/AU/$PLUGIN_NAME.component"

    # Install VST3
    if [ -d "$vst3_src" ]; then
        sudo rm -rf "$vst3_dest/$PLUGIN_NAME.vst3"
        sudo ditto "$vst3_src" "$vst3_dest/$PLUGIN_NAME.vst3"

        # Verify installation
        if [ -f "$vst3_dest/$PLUGIN_NAME.vst3/Contents/MacOS/$PLUGIN_NAME" ]; then
            echo -e "${GREEN}✓ Installed VST3 to $vst3_dest${NC}"
        else
            echo -e "${RED}✗ VST3 installation failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ VST3 not found at $vst3_src${NC}"
        exit 1
    fi

    # Install AU
    if [ -d "$au_src" ]; then
        sudo rm -rf "$au_dest/$PLUGIN_NAME.component"
        sudo ditto "$au_src" "$au_dest/$PLUGIN_NAME.component"

        # Verify installation
        if [ -f "$au_dest/$PLUGIN_NAME.component/Contents/MacOS/$PLUGIN_NAME" ]; then
            echo -e "${GREEN}✓ Installed AU to $au_dest${NC}"
        else
            echo -e "${RED}✗ AU installation failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ AU not found at $au_src${NC}"
        exit 1
    fi

    # Touch bundles to update modification time (triggers DAW rescan)
    sudo touch "$vst3_dest/$PLUGIN_NAME.vst3"
    sudo touch "$au_dest/$PLUGIN_NAME.component"

    echo -e "${YELLOW}NOTE: If Ableton shows the old version, try:${NC}"
    echo -e "  ${YELLOW}1. File > Plug-In Manager > Rescan${NC}"
    echo -e "  ${YELLOW}2. Or delete ~/Library/Audio/Cache/Ableton folder and restart Ableton${NC}"
}

# CMake artifact paths
ARTIFACTS_DIR="$CMAKE_BUILD_DIR/Guillotine_artefacts"

# Main logic
case "$MODE" in
    Clean)
        echo -e "\n${YELLOW}Cleaning build artifacts...${NC}"
        rm -rf "$CMAKE_BUILD_DIR"
        rm -rf "$PROJECT_ROOT/Builds"
        rm -rf "$PROJECT_ROOT/JuceLibraryCode"
        echo -e "${GREEN}✓ Cleaned${NC}"
        ;;

    Reconfigure)
        force_reconfigure
        echo -e "${YELLOW}Run './scripts/build.sh' to build${NC}"
        ;;

    Uninstall)
        echo -e "\n${YELLOW}Uninstalling plugins (requires sudo)...${NC}"
        vst3_dest="/Library/Audio/Plug-Ins/VST3"
        au_dest="/Library/Audio/Plug-Ins/Components"
        cache_dir="$HOME/Library/Audio/Cache/Ableton"

        if [ -d "$vst3_dest/$PLUGIN_NAME.vst3" ]; then
            sudo rm -rf "$vst3_dest/$PLUGIN_NAME.vst3"
            echo -e "${GREEN}✓ Removed VST3${NC}"
        fi

        if [ -d "$au_dest/$PLUGIN_NAME.component" ]; then
            sudo rm -rf "$au_dest/$PLUGIN_NAME.component"
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
        configure_cmake

        echo -e "\n${YELLOW}Building Debug...${NC}"
        BUILD_OUTPUT=$(cmake --build "$CMAKE_BUILD_DIR" --config Debug --parallel -- -quiet 2>&1) || {
            echo "$BUILD_OUTPUT"
            echo -e "${RED}Build Failed${NC}"
            exit 1
        }
        fix_ownership "$CMAKE_BUILD_DIR"

        echo -e "${GREEN}✓ Debug build complete${NC}"

        if [ "$INSTALL" = true ]; then
            install_plugins "$ARTIFACTS_DIR/Debug"
        fi
        ;;

    Release)
        configure_cmake

        echo -e "\n${YELLOW}Building Release (Universal Binary)...${NC}"

        BUILD_OUTPUT=$(cmake --build "$CMAKE_BUILD_DIR" --config Release --parallel -- -quiet 2>&1) || {
            echo "$BUILD_OUTPUT"
            echo -e "${RED}Build Failed${NC}"
            exit 1
        }
        fix_ownership "$CMAKE_BUILD_DIR"

        # Verify builds
        VST3_PATH="$ARTIFACTS_DIR/Release/VST3/$PLUGIN_NAME.vst3"
        AU_PATH="$ARTIFACTS_DIR/Release/AU/$PLUGIN_NAME.component"

        if [ ! -d "$VST3_PATH" ] || [ ! -d "$AU_PATH" ]; then
            echo -e "${RED}Error: Build artifacts missing${NC}"
            echo "Expected: $VST3_PATH"
            echo "Expected: $AU_PATH"
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
            install_plugins "$ARTIFACTS_DIR/Release"
        fi

        # Create Release Package
        echo -e "\n${YELLOW}Creating release package...${NC}"
        VERSION=$(cat "$PROJECT_ROOT/VERSION" | tr -d '[:space:]')
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
VST3_DEST="/Library/Audio/Plug-Ins/VST3"
AU_DEST="/Library/Audio/Plug-Ins/Components"
echo "Installing $PLUGIN_NAME to system library (requires password)..."
sudo mkdir -p "$VST3_DEST" "$AU_DEST"
sudo cp -R "$DIR/$PLUGIN_NAME.vst3" "$VST3_DEST/"
sudo cp -R "$DIR/$PLUGIN_NAME.component" "$AU_DEST/"
echo ""
echo "Removing Gatekeeper quarantine attributes..."
sudo xattr -cr "$VST3_DEST/$PLUGIN_NAME.vst3"
sudo xattr -cr "$AU_DEST/$PLUGIN_NAME.component"
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
1. Double-click Install.command for automatic installation (requires password)
2. Or manually copy plugins to:
   - VST3: /Library/Audio/Plug-Ins/VST3/
   - AU: /Library/Audio/Plug-Ins/Components/

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

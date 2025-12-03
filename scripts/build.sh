#!/bin/bash
# Build script for AudioPlugin
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
BUILD_DIR="$PROJECT_ROOT/Builds/MacOSX"
RELEASE_DIR="$PROJECT_ROOT/releases"
JUCER_FILE="$PROJECT_ROOT/AudioPlugin.jucer"
PLUGIN_NAME="AudioPlugin"

# Colors
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

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
            echo ""
            echo "Options:"
            echo "  --install      Install plugins to user library (default)"
            echo "  --no-install   Skip installation"
            exit 0
            ;;
    esac
done

echo -e "${YELLOW}=== AudioPlugin Build Script ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Mode: $MODE"

# Function to find Projucer (always prefer submodule for version consistency)
find_projucer() {
    local submodule_projucer="$PROJECT_ROOT/third_party/JUCE/extras/Projucer/Builds/MacOSX/build/Release/Projucer.app/Contents/MacOS/Projucer"

    # Always use submodule Projucer for version consistency
    if [ -f "$submodule_projucer" ]; then
        echo "$submodule_projucer"
        return 0
    fi

    # Build from submodule if not found
    return 1
}

# Function to build Projucer from submodule
build_projucer() {
    local projucer_project="$PROJECT_ROOT/third_party/JUCE/extras/Projucer/Builds/MacOSX/Projucer.xcodeproj"

    if [ ! -f "$projucer_project/project.pbxproj" ]; then
        echo -e "${RED}Error: JUCE submodule not initialized${NC}"
        echo "Run: git submodule update --init --recursive"
        return 1
    fi

    echo -e "${YELLOW}Building Projucer from submodule...${NC}"
    xcodebuild -project "$projucer_project" \
        -scheme "Projucer - App" \
        -configuration Release \
        -quiet || {
            echo -e "${RED}Error: Failed to build Projucer${NC}"
            return 1
        }
    echo -e "${GREEN}✓ Projucer built${NC}"
}

# Function to regenerate Xcode project
regen_project() {
    echo -e "\n${YELLOW}Regenerating Xcode project...${NC}"

    PROJUCER=$(find_projucer)

    if [ -z "$PROJUCER" ]; then
        echo "Projucer not found, building from submodule..."
        build_projucer || return 1
        PROJUCER=$(find_projucer)
    fi

    if [ -n "$PROJUCER" ]; then
        echo "Using Projucer: $PROJUCER"
        "$PROJUCER" --resave "$JUCER_FILE" || {
            echo -e "${RED}Error: Projucer failed to regenerate project${NC}"
            return 1
        }
        echo -e "${GREEN}✓ Xcode project regenerated${NC}"
    else
        echo -e "${RED}Error: Could not find or build Projucer${NC}"
        return 1
    fi
}

# Function to install plugins
install_plugins() {
    local src_dir="$1"
    local vst3_dest="$HOME/Library/Audio/Plug-Ins/VST3"
    local au_dest="$HOME/Library/Audio/Plug-Ins/Components"

    echo -e "\n${YELLOW}Installing plugins to user library...${NC}"
    mkdir -p "$vst3_dest" "$au_dest"

    if [ -d "$src_dir/$PLUGIN_NAME.vst3" ]; then
        rm -rf "$vst3_dest/$PLUGIN_NAME.vst3"
        cp -R "$src_dir/$PLUGIN_NAME.vst3" "$vst3_dest/"
        echo -e "${GREEN}✓ Installed VST3 to $vst3_dest${NC}"
    fi

    if [ -d "$src_dir/$PLUGIN_NAME.component" ]; then
        rm -rf "$au_dest/$PLUGIN_NAME.component"
        cp -R "$src_dir/$PLUGIN_NAME.component" "$au_dest/"
        echo -e "${GREEN}✓ Installed AU to $au_dest${NC}"
    fi
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

    Debug)
        # Regenerate if .jucer is newer than xcodeproj
        if [ "$JUCER_FILE" -nt "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" ] 2>/dev/null || [ ! -d "$BUILD_DIR" ]; then
            regen_project
        fi

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
        # Regenerate if .jucer is newer than xcodeproj
        if [ "$JUCER_FILE" -nt "$BUILD_DIR/$PLUGIN_NAME.xcodeproj" ] 2>/dev/null || [ ! -d "$BUILD_DIR" ]; then
            regen_project
        fi

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
        AU_ARCHS=$(lipo -archs "$AU_PATH/Contents/MacOS/$PLUGIN_NAME")

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
PLUGIN_NAME="AudioPlugin"
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

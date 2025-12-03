#!/bin/bash
# =============================================================================
# Plugin Template Initialization Script
# Run this ONCE after cloning the template to rename everything.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# -----------------------------------------------------------------------------
# Prompt for values
# -----------------------------------------------------------------------------

echo -e "${BLUE}=== JUCE Plugin Template Initialization ===${NC}"
echo ""
echo "This script will rename all template placeholders in the codebase."
echo "Run this ONCE after cloning, then delete this script."
echo ""

# Plugin name (e.g., "Guillotine", "SuperDelay")
read -p "Plugin name (PascalCase, e.g., Guillotine): " PLUGIN_NAME
if [[ -z "$PLUGIN_NAME" ]]; then
    echo -e "${RED}Error: Plugin name required${NC}"
    exit 1
fi

# Display name (e.g., "Guillotine", "Super Delay")
read -p "Plugin display name (shown in DAW, e.g., Guillotine) [$PLUGIN_NAME]: " PLUGIN_DISPLAY_NAME
PLUGIN_DISPLAY_NAME="${PLUGIN_DISPLAY_NAME:-$PLUGIN_NAME}"

# Description
read -p "Plugin description (short): " PLUGIN_DESC
PLUGIN_DESC="${PLUGIN_DESC:-A JUCE audio plugin}"

# Company/manufacturer name
read -p "Company/manufacturer name: " COMPANY_NAME

# Plugin codes (4 characters each)
echo ""
echo -e "${YELLOW}Plugin codes must be exactly 4 characters (e.g., 'Gltn', 'Manu')${NC}"

# Generate default plugin code from name
DEFAULT_CODE=$(echo "$PLUGIN_NAME" | head -c 4)
read -p "Plugin code (4 chars) [$DEFAULT_CODE]: " PLUGIN_CODE
PLUGIN_CODE="${PLUGIN_CODE:-$DEFAULT_CODE}"
if [[ ${#PLUGIN_CODE} -ne 4 ]]; then
    echo -e "${RED}Error: Plugin code must be exactly 4 characters${NC}"
    exit 1
fi

read -p "Manufacturer code (4 chars) [Manu]: " MANU_CODE
MANU_CODE="${MANU_CODE:-Manu}"
if [[ ${#MANU_CODE} -ne 4 ]]; then
    echo -e "${RED}Error: Manufacturer code must be exactly 4 characters${NC}"
    exit 1
fi

# Generate project ID from plugin code
PROJECT_ID="${PLUGIN_CODE}01"

# -----------------------------------------------------------------------------
# Confirm
# -----------------------------------------------------------------------------

echo ""
echo -e "${YELLOW}=== Summary ===${NC}"
echo "  Plugin name:      $PLUGIN_NAME"
echo "  Display name:     $PLUGIN_DISPLAY_NAME"
echo "  Description:      $PLUGIN_DESC"
echo "  Company:          $COMPANY_NAME"
echo "  Plugin code:      $PLUGIN_CODE"
echo "  Manufacturer:     $MANU_CODE"
echo ""
echo "Files to be modified:"
echo "  - AudioPlugin.jucer → ${PLUGIN_NAME}.jucer"
echo "  - src/*.cpp, src/*.h (class names)"
echo "  - scripts/build.sh"
echo "  - .github/workflows/build.yml"
echo "  - tests/conftest.py, tests/generate_references.py"
echo ""
read -p "Proceed? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${BLUE}Renaming...${NC}"

# -----------------------------------------------------------------------------
# Perform replacements
# -----------------------------------------------------------------------------

# Helper: replace in file (works on macOS and Linux)
replace_in_file() {
    local file="$1"
    local search="$2"
    local replace="$3"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|$search|$replace|g" "$file"
    else
        sed -i "s|$search|$replace|g" "$file"
    fi
}

# 1. Rename .jucer file
echo "  Renaming AudioPlugin.jucer → ${PLUGIN_NAME}.jucer"
mv "AudioPlugin.jucer" "${PLUGIN_NAME}.jucer"

# 2. Update .jucer file contents
echo "  Updating ${PLUGIN_NAME}.jucer"
JUCER_FILE="${PLUGIN_NAME}.jucer"
replace_in_file "$JUCER_FILE" 'id="AudPlg1"' "id=\"${PROJECT_ID}\""
replace_in_file "$JUCER_FILE" 'name="AudioPlugin"' "name=\"${PLUGIN_NAME}\""
replace_in_file "$JUCER_FILE" 'pluginName="Audio Plugin"' "pluginName=\"${PLUGIN_DISPLAY_NAME}\""
replace_in_file "$JUCER_FILE" 'pluginDesc="A minimal VST plugin template"' "pluginDesc=\"${PLUGIN_DESC}\""
replace_in_file "$JUCER_FILE" 'companyName=""' "companyName=\"${COMPANY_NAME}\""
replace_in_file "$JUCER_FILE" 'targetName="AudioPlugin"' "targetName=\"${PLUGIN_NAME}\""

# 3. Update C++ source files
echo "  Updating src files"
for file in src/PluginProcessor.cpp src/PluginProcessor.h src/PluginEditor.cpp src/PluginEditor.h; do
    if [[ -f "$file" ]]; then
        replace_in_file "$file" "AudioPluginProcessor" "${PLUGIN_NAME}Processor"
        replace_in_file "$file" "AudioPluginEditor" "${PLUGIN_NAME}Editor"
        replace_in_file "$file" '"Audio Plugin"' "\"${PLUGIN_DISPLAY_NAME}\""
    fi
done

# 4. Update unit test files
echo "  Updating test files"
if [[ -f "tests/unit/UnitTests.cpp" ]]; then
    replace_in_file "tests/unit/UnitTests.cpp" "AudioPluginProcessor" "${PLUGIN_NAME}Processor"
    replace_in_file "tests/unit/UnitTests.cpp" '"AudioPlugin Unit Tests"' "\"${PLUGIN_NAME} Unit Tests\""
fi

# 5. Update conftest.py and generate_references.py
if [[ -f "tests/conftest.py" ]]; then
    replace_in_file "tests/conftest.py" "AudioPlugin.vst3" "${PLUGIN_NAME}.vst3"
fi
if [[ -f "tests/generate_references.py" ]]; then
    replace_in_file "tests/generate_references.py" "AudioPlugin.vst3" "${PLUGIN_NAME}.vst3"
fi

# 6. Update build.sh
echo "  Updating scripts/build.sh"
if [[ -f "scripts/build.sh" ]]; then
    replace_in_file "scripts/build.sh" 'AudioPlugin.jucer' "${PLUGIN_NAME}.jucer"
    replace_in_file "scripts/build.sh" 'PLUGIN_NAME="AudioPlugin"' "PLUGIN_NAME=\"${PLUGIN_NAME}\""
    replace_in_file "scripts/build.sh" '"AudioPlugin - VST3"' "\"${PLUGIN_NAME} - VST3\""
    replace_in_file "scripts/build.sh" '"AudioPlugin - AU"' "\"${PLUGIN_NAME} - AU\""
    replace_in_file "scripts/build.sh" '"AudioPlugin - Standalone"' "\"${PLUGIN_NAME} - Standalone\""
    replace_in_file "scripts/build.sh" 'AudioPlugin.xcodeproj' "${PLUGIN_NAME}.xcodeproj"
    replace_in_file "scripts/build.sh" 'AudioPlugin.vst3' "${PLUGIN_NAME}.vst3"
    replace_in_file "scripts/build.sh" 'AudioPlugin.component' "${PLUGIN_NAME}.component"
    replace_in_file "scripts/build.sh" 'AudioPlugin.app' "${PLUGIN_NAME}.app"
    replace_in_file "scripts/build.sh" '# Build script for AudioPlugin' "# Build script for ${PLUGIN_NAME}"
fi

# 7. Update GitHub workflow
echo "  Updating .github/workflows/build.yml"
if [[ -f ".github/workflows/build.yml" ]]; then
    replace_in_file ".github/workflows/build.yml" 'name: Build AudioPlugin' "name: Build ${PLUGIN_NAME}"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin.jucer' "${PLUGIN_NAME}.jucer"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin_SharedCode' "${PLUGIN_NAME}_SharedCode"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin_VST3' "${PLUGIN_NAME}_VST3"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin.dll' "${PLUGIN_NAME}.dll"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin.xcodeproj' "${PLUGIN_NAME}.xcodeproj"
    replace_in_file ".github/workflows/build.yml" '"AudioPlugin - VST3"' "\"${PLUGIN_NAME} - VST3\""
    replace_in_file ".github/workflows/build.yml" '"AudioPlugin - AU"' "\"${PLUGIN_NAME} - AU\""
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin.vst3' "${PLUGIN_NAME}.vst3"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin.component' "${PLUGIN_NAME}.component"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin-VST3-Windows' "${PLUGIN_NAME}-VST3-Windows"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin-macOS' "${PLUGIN_NAME}-macOS"
    replace_in_file ".github/workflows/build.yml" 'AudioPlugin-VST3-Linux' "${PLUGIN_NAME}-VST3-Linux"
    replace_in_file ".github/workflows/build.yml" '## AudioPlugin Release' "## ${PLUGIN_NAME} Release"
    replace_in_file ".github/workflows/build.yml" "AudioPlugin {0}" "${PLUGIN_NAME} {0}"
fi

# 8. Update unit test CMakeLists.txt
echo "  Updating tests/unit/CMakeLists.txt"
if [[ -f "tests/unit/CMakeLists.txt" ]]; then
    replace_in_file "tests/unit/CMakeLists.txt" "AudioPluginUnitTests" "${PLUGIN_NAME}UnitTests"
    replace_in_file "tests/unit/CMakeLists.txt" "AudioPlugin Unit Tests" "${PLUGIN_NAME} Unit Tests"
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------

echo ""
echo -e "${GREEN}=== Initialization complete! ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Delete this script:  rm scripts/init.sh"
echo "  2. Delete TEMPLATE.md:  rm TEMPLATE.md"
echo "  3. Update README.md with your plugin's documentation"
echo "  4. Initialize git:      git add -A && git commit -m 'Initialize ${PLUGIN_NAME}'"
echo "  5. Build:               ./scripts/build.sh"
echo ""

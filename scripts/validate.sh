#!/bin/bash
# Run pluginval validation on the built plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default strictness level
STRICTNESS="${1:-10}"

VST3_PATH="$PROJECT_ROOT/build/Guillotine_artefacts/Release/VST3/Guillotine.vst3"

if [[ ! -d "$VST3_PATH" ]]; then
    echo "Error: VST3 not found at $VST3_PATH"
    echo "Run ./scripts/build.sh first"
    exit 1
fi

# Find pluginval
if command -v pluginval &> /dev/null; then
    PLUGINVAL="pluginval"
elif [[ -x "/Applications/pluginval.app/Contents/MacOS/pluginval" ]]; then
    PLUGINVAL="/Applications/pluginval.app/Contents/MacOS/pluginval"
else
    echo "Error: pluginval not found"
    echo "Install from: https://github.com/Tracktion/pluginval"
    exit 1
fi

echo "Running pluginval at strictness $STRICTNESS..."
echo "Plugin: $VST3_PATH"
echo ""

"$PLUGINVAL" --strictness-level "$STRICTNESS" --validate "$VST3_PATH"

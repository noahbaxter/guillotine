#!/bin/bash
# Build and run C++ unit tests
set -euo pipefail

source "$(dirname "$0")/_common.sh"

UNIT_DIR="$PROJECT_ROOT/tests/unit"
BUILD_DIR="$UNIT_DIR/build"
BINARY="$BUILD_DIR/unit_tests_artefacts/Release/unit_tests"

# Configure if needed
if [ ! -f "$BUILD_DIR/CMakeCache.txt" ]; then
    echo -e "${CYAN}Configuring unit tests...${NC}"
    cmake -S "$UNIT_DIR" -B "$BUILD_DIR"
fi

# Build
echo -e "${CYAN}Building unit tests...${NC}"
cmake --build "$BUILD_DIR" --config Release

# Run (pass through any args like "[autogain]" for tag filtering)
echo -e "${GREEN}Running tests...${NC}"
"$BINARY" "$@"

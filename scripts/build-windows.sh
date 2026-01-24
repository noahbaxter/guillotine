#!/bin/bash
# Build on Windows from WSL - syncs only when needed, then builds
# Usage: ./scripts/build-windows.sh [release|debug|clean|install|installer] [--sync]
#
# Options:
#   --sync      Force full rsync (default: auto-detect if needed)
#   installer   Build Release + create Inno Setup installer (.exe)

set -e

CONFIG="${1:-release}"
FORCE_SYNC=false

for arg in "$@"; do
    case $arg in
        --sync|-s)
            FORCE_SYNC=true
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WIN_DEST="/mnt/c/Users/Noah/Code/guillotine"
SYNC_MARKER="$WIN_DEST/.last_sync"

# Check if sync is needed (any source file newer than last sync)
needs_sync() {
    # Always sync if marker doesn't exist or --sync flag
    [ "$FORCE_SYNC" = true ] && return 0
    [ ! -f "$SYNC_MARKER" ] && return 0

    # Check if any relevant files are newer than last sync
    if find "$PROJECT_DIR/src" "$PROJECT_DIR/web" "$PROJECT_DIR/CMakeLists.txt" \
            "$PROJECT_DIR/installer" -newer "$SYNC_MARKER" 2>/dev/null | grep -q .; then
        return 0
    fi
    return 1
}

if needs_sync; then
    echo "=== Syncing to Windows FS (robocopy) ==="
    # Convert paths for Windows
    WIN_SRC=$(wslpath -w "$PROJECT_DIR")
    WIN_DST=$(wslpath -w "$WIN_DEST")

    # robocopy is native Windows = much faster than rsync over 9P
    # /MIR = mirror (sync deletions too)
    # /XD = exclude directories
    # /XF = exclude files
    # /NFL /NDL /NJH /NJS = quiet output
    set +e  # robocopy uses weird exit codes
    robocopy.exe "$WIN_SRC" "$WIN_DST" /MIR \
        /XD build build-windows packages releases .git .venv __pycache__ node_modules \
        /XF "*.zip" ".DS_Store" \
        /NFL /NDL /NJH /NJS /NP
    ROBO_EXIT=$?
    set -e

    # robocopy: 0-7 = success, 8+ = failure
    if [ "$ROBO_EXIT" -ge 8 ]; then
        echo "Robocopy failed with exit code $ROBO_EXIT"
        exit 1
    fi

    touch "$SYNC_MARKER"
    echo "Synced."
else
    echo "=== No changes detected, skipping sync ==="
fi

# Run Windows build
echo "=== Running Windows build ==="
powershell.exe -ExecutionPolicy Bypass -File "C:/Users/Noah/Code/guillotine/scripts/build-windows.ps1" -Config "$CONFIG" -NoSync

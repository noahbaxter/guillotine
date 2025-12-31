#!/bin/bash
# Build on Windows from WSL - syncs then builds
# Usage: ./scripts/build-windows.sh [release|debug|clean|install]

set -e

CONFIG="${1:-release}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WIN_DEST="/mnt/c/Users/Noah/Code/guillotine"

# Sync to Windows FS
echo "=== Syncing to Windows FS ==="
rsync -av --delete \
    --exclude='build/' \
    --exclude='packages/' \
    --exclude='*.zip' \
    --exclude='.git/' \
    "$PROJECT_DIR/" "$WIN_DEST/"

echo ""

# Run Windows build (skip sync since we just did it)
echo "=== Running Windows build ==="
powershell.exe -ExecutionPolicy Bypass -File "C:/Users/Noah/Code/guillotine/scripts/build-windows.ps1" -Config "$CONFIG" -NoSync

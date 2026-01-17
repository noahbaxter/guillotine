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
PLUGIN_NAME="Guillotine"

# Fix ownership if running as root via sudo
# Call this after creating build directories
fix_ownership() {
    if [ -n "$SUDO_USER" ] && [ "$EUID" -eq 0 ]; then
        for dir in "$@"; do
            if [ -d "$dir" ]; then
                chown -R "$SUDO_USER:staff" "$dir"
            fi
        done
    fi
}

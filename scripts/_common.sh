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

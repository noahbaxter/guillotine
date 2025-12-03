import pytest
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).parent
sys.path.insert(0, str(TESTS_DIR))  # Allow subdirectories to import utils
PROJECT_ROOT = TESTS_DIR.parent
FIXTURES_DIR = TESTS_DIR / "fixtures"


@pytest.fixture
def plugin_path():
    """Path to the installed VST3 plugin."""
    path = Path.home() / "Library/Audio/Plug-Ins/VST3/AudioPlugin.vst3"
    if not path.exists():
        pytest.skip(f"Plugin not found at {path}. Run ./scripts/build.sh first.")
    return str(path)


@pytest.fixture
def unit_tests_binary():
    """Path to the C++ unit tests binary."""
    path = TESTS_DIR / "unit/build/unit_tests_artefacts/Release/unit_tests"
    if not path.exists():
        pytest.skip(f"Unit tests binary not found at {path}. Build with cmake first.")
    return str(path)


@pytest.fixture
def pluginval_path():
    """Path to pluginval executable."""
    import shutil

    # First check if it's in PATH
    pluginval = shutil.which("pluginval")
    if pluginval:
        return pluginval

    # Check common locations
    paths = [
        "/Applications/pluginval.app/Contents/MacOS/pluginval",
        "/usr/local/bin/pluginval",
        Path.home() / "bin/pluginval",
    ]
    for p in paths:
        if Path(p).exists():
            return str(p)
    pytest.skip("pluginval not found. Install from https://github.com/Tracktion/pluginval")


@pytest.fixture
def fixtures_dir():
    """Path to test fixtures directory."""
    return FIXTURES_DIR

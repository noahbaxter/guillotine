import pytest
import sys
import platform
from pathlib import Path
from pedalboard import load_plugin

TESTS_DIR = Path(__file__).parent
sys.path.insert(0, str(TESTS_DIR))  # Allow subdirectories to import utils
PROJECT_ROOT = TESTS_DIR.parent
FIXTURES_DIR = TESTS_DIR / "fixtures"

# Test defaults - explicit values to avoid depending on plugin defaults
TEST_DEFAULTS = {
    "bypass_clipper": False,
    "oversampling": "1x",
    "filter_type": "Minimum Phase",
    "curve": "Hard",
    "curve_exponent": 4.0,
    "ceiling_db": 0.0,
    "input_gain_db": 0.0,
    "output_gain_db": 0.0,
    "stereo_link": False,
    "channel_mode": "L/R",
    "delta": False,
    "true_clip": True,
}


def get_vst3_path():
    """Get platform-specific VST3 install path."""
    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library/Audio/Plug-Ins/VST3/Guillotine.vst3"
    elif system == "Windows":
        return Path("C:/Program Files/Common Files/VST3/Guillotine.vst3")
    elif system == "Linux":
        return Path.home() / ".vst3/Guillotine.vst3"
    else:
        raise RuntimeError(f"Unsupported platform: {system}")


def _skip_pedalboard_on_windows():
    """Skip test if pedalboard can't load VST3 on this platform."""
    if platform.system() == "Windows":
        pytest.skip("pedalboard VST3 loading not supported on Windows CI")


@pytest.fixture
def plugin_path():
    """Path to the installed VST3 plugin."""
    _skip_pedalboard_on_windows()
    path = get_vst3_path()
    if not path.exists():
        pytest.skip(f"Plugin not found at {path}. Build and install the plugin first.")
    return str(path)


@pytest.fixture
def fresh_plugin(plugin_path):
    """Load plugin with all parameters set to known test defaults.

    Use this instead of load_plugin() directly to ensure consistent test setup.
    Override specific parameters as needed in your test.

    Defaults:
        - bypass_clipper=False (clipper active)
        - oversampling="1x" (no latency, true passthrough)
        - filter_type="Minimum Phase"
        - curve="Hard"
        - ceiling_db=0.0 (unity)
        - input/output_gain_db=0.0 (unity)
        - stereo_link=False (independent channels)
        - channel_mode="L/R" (not M/S)
        - delta=False (normal output)
        - true_clip=True (enforce ceiling)
    """
    plugin = load_plugin(plugin_path)
    for param, value in TEST_DEFAULTS.items():
        setattr(plugin, param, value)
    return plugin


@pytest.fixture
def make_plugin(plugin_path):
    """Factory fixture to create plugins with custom settings.

    Usage:
        def test_something(make_plugin):
            plugin = make_plugin(ceiling_db=-6.0, oversampling="4x")
            # plugin has all TEST_DEFAULTS plus your overrides
    """
    def _make_plugin(**overrides):
        plugin = load_plugin(plugin_path)
        settings = {**TEST_DEFAULTS, **overrides}
        for param, value in settings.items():
            setattr(plugin, param, value)
        return plugin
    return _make_plugin


@pytest.fixture
def unit_tests_binary():
    """Path to the C++ unit tests binary."""
    system = platform.system()
    if system == "Windows":
        path = TESTS_DIR / "unit/build/unit_tests_artefacts/Release/unit_tests.exe"
    else:
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

    # Check common locations per platform
    system = platform.system()
    if system == "Darwin":
        paths = [
            "/Applications/pluginval.app/Contents/MacOS/pluginval",
            "/usr/local/bin/pluginval",
            Path.home() / "bin/pluginval",
        ]
    elif system == "Windows":
        paths = [
            Path("C:/pluginval/pluginval.exe"),
            Path.home() / "pluginval/pluginval.exe",
        ]
    else:
        paths = [
            Path.home() / "bin/pluginval",
            "/usr/local/bin/pluginval",
        ]

    for p in paths:
        if Path(p).exists():
            return str(p)
    pytest.skip("pluginval not found. Install from https://github.com/Tracktion/pluginval")


@pytest.fixture
def fixtures_dir():
    """Path to test fixtures directory."""
    return FIXTURES_DIR

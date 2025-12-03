import pytest
from pathlib import Path
from pedalboard import load_plugin
from utils import load_audio, generate_sine, rms, samples_equal


# =============================================================================
# Correctness Tests - Verify the actual DSP math is correct
# =============================================================================

def test_gain_minus_6db_halves_amplitude(plugin_path):
    """-6dB should reduce amplitude by ~50% (0.501x)."""
    plugin = load_plugin(plugin_path)
    plugin.gain_db = -6.0

    input_audio = generate_sine()
    output = plugin.process(input_audio, 44100)

    ratio = rms(output) / rms(input_audio)
    assert 0.48 < ratio < 0.52, f"Expected ~0.5x amplitude, got {ratio:.3f}x"


def test_gain_plus_6db_doubles_amplitude(plugin_path):
    """+6dB should increase amplitude by ~2x (1.995x)."""
    plugin = load_plugin(plugin_path)
    plugin.gain_db = 6.0

    input_audio = generate_sine()
    output = plugin.process(input_audio, 44100)

    ratio = rms(output) / rms(input_audio)
    assert 1.95 < ratio < 2.05, f"Expected ~2.0x amplitude, got {ratio:.3f}x"


def test_gain_unity_preserves_amplitude(plugin_path):
    """0dB should preserve amplitude (1.0x)."""
    plugin = load_plugin(plugin_path)
    plugin.gain_db = 0.0

    input_audio = generate_sine()
    output = plugin.process(input_audio, 44100)

    ratio = rms(output) / rms(input_audio)
    assert 0.99 < ratio < 1.01, f"Expected ~1.0x amplitude, got {ratio:.3f}x"


# =============================================================================
# Regression Tests - Catch unintentional changes to DSP output
# Auto-discovers all input files and tests against their references
# =============================================================================

# Test configurations matching generate_references.py
GAIN_SETTINGS = [
    (0.0, "unity"),
    (-6.0, "minus_6db"),
    (6.0, "plus_6db"),
]


def get_regression_test_cases():
    """Discover all input files and generate test cases."""
    fixtures = Path(__file__).parent.parent / "fixtures"
    input_dir = fixtures / "input"
    ref_dir = fixtures / "references"

    if not input_dir.exists():
        return []

    cases = []
    for input_file in sorted(input_dir.glob("*.wav")):
        stem = input_file.stem
        for gain, suffix in GAIN_SETTINGS:
            ref_file = ref_dir / f"{stem}_{suffix}.wav"
            case_id = f"{stem}_{suffix}"
            cases.append(pytest.param(input_file, ref_file, gain, id=case_id))

    return cases


@pytest.mark.parametrize("input_file,reference_file,gain_db", get_regression_test_cases())
def test_regression(plugin_path, input_file, reference_file, gain_db):
    """Regression: output matches reference for given input and settings."""
    if not input_file.exists():
        pytest.skip(f"Input file not found: {input_file}")
    if not reference_file.exists():
        pytest.skip(f"Reference not found: {reference_file}. Run: python tests/generate_references.py")

    plugin = load_plugin(plugin_path)
    plugin.gain_db = gain_db

    input_audio, sr = load_audio(input_file)
    expected, _ = load_audio(reference_file)
    output = plugin.process(input_audio, sr)

    passed, msg = samples_equal(output, expected)
    assert passed, f"Output changed ({msg}). Intentional? Run: python tests/generate_references.py"

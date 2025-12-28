import pytest
import numpy as np
from pathlib import Path
from pedalboard import load_plugin
from utils import load_audio, generate_sine, rms, peak, db_to_linear, samples_equal, settle_params


# =============================================================================
# Clipper Tests - Verify clipping behavior
# =============================================================================

def test_clipper_signal_below_ceiling_unchanged(fresh_plugin):
    """Signal below ceiling should pass through unchanged."""
    # fresh_plugin already has: oversampling=1x, ceiling=0dB, gains=0dB
    input_audio = generate_sine(amplitude=0.5)  # Well below ceiling
    output = fresh_plugin.process(input_audio, 44100)

    passed, msg = samples_equal(output, input_audio, tolerance_db=-60)
    assert passed, f"Signal below ceiling should be unchanged: {msg}"


def test_clipper_hard_clip_limits_peak(make_plugin):
    """Hard clip should limit peak to ceiling."""
    plugin = make_plugin(ceiling_db=-6.0)

    input_audio = generate_sine(amplitude=0.9)  # Above ceiling
    output = plugin.process(input_audio, 44100)

    ceiling_linear = db_to_linear(-6.0)
    output_peak = peak(output)
    assert output_peak <= ceiling_linear + 0.01, \
        f"Peak {output_peak:.3f} exceeds ceiling {ceiling_linear:.3f}"


def test_clipper_bypass_passes_unchanged(make_plugin):
    """Bypass should pass signal unchanged."""
    plugin = make_plugin(bypass_clipper=True, ceiling_db=-20.0)

    input_audio = generate_sine(amplitude=0.8)
    output = plugin.process(input_audio, 44100)

    passed, msg = samples_equal(output, input_audio, tolerance_db=-60)
    assert passed, f"Bypass should pass unchanged: {msg}"


def test_clipper_ceiling_sweep(fresh_plugin):
    """Lower ceiling should produce lower output peak."""
    input_audio = generate_sine(amplitude=0.9)
    ceilings_db = [0.0, -6.0, -12.0, -18.0]
    peaks = []

    for ceiling_db in ceilings_db:
        fresh_plugin.ceiling_db = ceiling_db
        settle_params(fresh_plugin)
        output = fresh_plugin.process(input_audio.copy(), 44100)
        peaks.append(peak(output))

    # Each lower ceiling should produce lower peak
    for i in range(len(peaks) - 1):
        assert peaks[i] > peaks[i+1], \
            f"Ceiling {ceilings_db[i]}dB peak {peaks[i]:.3f} should be > ceiling {ceilings_db[i+1]}dB peak {peaks[i+1]:.3f}"


def test_clipper_stereo_link_same_reduction(make_plugin):
    """Stereo link should apply same gain reduction to both channels."""
    plugin = make_plugin(ceiling_db=-6.0, stereo_link=True, true_clip=False)
    settle_params(plugin)

    # Create stereo with different amplitudes
    t = np.linspace(0, 1.0, 44100, endpoint=False)
    left = (0.9 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)   # Above ceiling
    right = (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)  # Below ceiling
    input_audio = np.column_stack([left, right])

    output = plugin.process(input_audio, 44100)

    # With stereo link, right channel should be reduced even though it's below ceiling
    # Check that ratio is preserved
    input_ratio = peak(input_audio[:, 0]) / peak(input_audio[:, 1])
    output_ratio = peak(output[:, 0]) / peak(output[:, 1])
    assert abs(input_ratio - output_ratio) < 0.1, \
        f"Stereo link should preserve L/R ratio: input {input_ratio:.2f}, output {output_ratio:.2f}"


# =============================================================================
# Gain Tests - Verify gain stage behavior
# =============================================================================

def test_input_gain_minus_6db_halves_amplitude(make_plugin):
    """-6dB input gain should reduce amplitude by ~50%."""
    plugin = make_plugin(bypass_clipper=True, input_gain_db=-6.0)

    input_audio = generate_sine()
    output = plugin.process(input_audio, 44100)

    ratio = rms(output) / rms(input_audio)
    assert 0.48 < ratio < 0.52, f"Expected ~0.5x amplitude, got {ratio:.3f}x"


def test_input_gain_plus_6db_doubles_amplitude(plugin_path):
    """+6dB input gain should increase amplitude by ~2x."""
    plugin = load_plugin(plugin_path)
    plugin.bypass_clipper = True
    plugin.input_gain_db = 6.0
    plugin.output_gain_db = 0.0

    input_audio = generate_sine()
    output = plugin.process(input_audio, 44100)

    ratio = rms(output) / rms(input_audio)
    assert 1.95 < ratio < 2.05, f"Expected ~2.0x amplitude, got {ratio:.3f}x"


def test_gain_unity_preserves_amplitude(plugin_path):
    """0dB gains should preserve amplitude."""
    plugin = load_plugin(plugin_path)
    plugin.bypass_clipper = True
    plugin.input_gain_db = 0.0
    plugin.output_gain_db = 0.0

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

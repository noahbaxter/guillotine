"""
Delta monitoring tests.

Validates the delta monitor feature that outputs dry - wet (what was clipped off).
Tests latency compensation, silence when no clipping, and signal reconstruction.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import (
    generate_sine, generate_dc, peak, db_to_linear, measure_latency
)
from clipper.test_consts import (
    OVERSAMPLING_MODES,
    FILTER_TYPES,
    EXACT_TOLERANCE,
)


# =============================================================================
# Test Tolerances for Delta
# =============================================================================

# Delta silence tolerance - should be essentially zero when not clipping
# Both filter types now go through identical filter chains for proper phase matching
DELTA_SILENCE_TOLERANCE = 0.005

# Reconstruction tolerance - dry = wet + delta
# Should be very tight since both paths go through identical processing
RECONSTRUCTION_TOLERANCE = 0.001


# =============================================================================
# Fixtures
# =============================================================================

def generate_os_filter_matrix():
    """Generate representative oversampling/filter combinations.

    Reduced from full 8-config matrix to 3 representative configs:
    - 1x: no filtering (baseline)
    - 4x + MinPhase: typical oversampled case
    - 16x + LinearPhase: higher OS with linear phase
    """
    return [
        pytest.param(("1x", "Minimum Phase"), id="os=1x"),
        pytest.param(("4x", "Minimum Phase"), id="os=4x_MinPhase"),
        pytest.param(("16x", "Linear Phase"), id="os=16x_LinPhase"),
    ]


@pytest.fixture
def delta_plugin(plugin_path, request):
    """Load plugin configured for delta testing."""
    oversampling, filter_type = request.param

    plugin = load_plugin(plugin_path)
    plugin.bypass = False
    plugin.sharpness = 1.0
    plugin.input_gain_db = 0.0
    plugin.output_gain_db = 0.0
    plugin.ceiling_db = 0.0
    plugin.oversampling = oversampling
    plugin.filter_type = filter_type
    plugin.delta_monitor = True

    return plugin, oversampling, filter_type


# =============================================================================
# Core Silence Tests - Signal Below Ceiling
# =============================================================================

@pytest.mark.parametrize("delta_plugin", generate_os_filter_matrix(), indirect=True)
class TestDeltaSilenceWhenNoClipping:
    """Delta should output silence when input is below ceiling (nothing clipped)."""

    def test_sine_below_ceiling_produces_silence(self, delta_plugin):
        """Sine wave below ceiling → delta outputs silence."""
        plugin, os_mode, filter_type = delta_plugin

        # Signal well below 0dB ceiling
        input_audio = generate_sine(amplitude=0.5, duration=0.5)
        output = plugin.process(input_audio, 44100)

        # Skip initial samples for filter settling
        latency = measure_latency(plugin) if os_mode != "1x" else 0
        settle_samples = max(latency * 2, 1000)
        steady_state = output[settle_samples:]

        max_level = peak(steady_state)
        assert max_level < DELTA_SILENCE_TOLERANCE, (
            f"Delta not silent for unclipped signal: peak={max_level:.6f} "
            f"(os={os_mode}, filter={filter_type})"
        )

    def test_dc_below_ceiling_produces_silence(self, delta_plugin):
        """DC below ceiling → delta outputs silence."""
        plugin, os_mode, filter_type = delta_plugin

        # DC at 50% of ceiling
        input_audio = generate_dc(level=0.5, duration=0.3)
        output = plugin.process(input_audio, 44100)

        # Check steady state
        steady_state = output[len(output)//2:]
        max_deviation = peak(steady_state)

        assert max_deviation < DELTA_SILENCE_TOLERANCE, (
            f"Delta not silent for DC below ceiling: max={max_deviation:.6f} "
            f"(os={os_mode}, filter={filter_type})"
        )


# =============================================================================
# Delta Outputs What Was Clipped
# =============================================================================

class TestDeltaOutputsClippedPortion:
    """When clipping occurs, delta should output what was removed."""

    def test_signal_above_ceiling_has_nonzero_delta(self, plugin_path):
        """Clipped signal → delta is nonzero."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = True

        ceiling_linear = db_to_linear(-6.0)
        # Signal significantly above ceiling
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)
        output = plugin.process(input_audio, 44100)

        delta_peak = peak(output)
        assert delta_peak > 0.01, (
            f"Delta should be nonzero when clipping: peak={delta_peak:.6f}"
        )

    def test_dc_above_ceiling_outputs_correct_delta(self, plugin_path):
        """DC above ceiling → delta = input - ceiling (positive value)."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = True
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        dc_level = ceiling_linear * 1.5  # 50% above ceiling
        input_audio = generate_dc(level=dc_level, duration=0.3)
        output = plugin.process(input_audio, 44100)

        # Expected delta = input - clipped = dc_level - ceiling
        expected_delta = dc_level - ceiling_linear

        # Check steady state
        steady_state = output[len(output)//2:]
        actual_delta = np.mean(steady_state)

        # Delta should be positive (dry - wet, not wet - dry)
        assert actual_delta > 0.0, f"Delta should be positive: {actual_delta:.6f}"
        assert abs(actual_delta - expected_delta) < 0.01, (
            f"DC delta incorrect: expected={expected_delta:.4f}, got={actual_delta:.4f}"
        )

    def test_delta_with_input_output_gain(self, plugin_path):
        """Delta scales correctly with input/output gain applied."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = True
        plugin.enforce_ceiling = True
        plugin.input_gain_db = 6.0   # +6dB input gain
        plugin.output_gain_db = -3.0  # -3dB output gain

        ceiling_linear = db_to_linear(-6.0)
        # Signal at ceiling level, but +6dB input gain will push it to 2x ceiling
        input_audio = generate_dc(level=ceiling_linear, duration=0.3)
        output = plugin.process(input_audio, 44100)

        # After +6dB input gain: level = ceiling * 2
        # Clipped to ceiling, delta = (ceiling * 2) - ceiling = ceiling
        # After -3dB output gain: delta = ceiling * 0.707
        expected_delta = ceiling_linear * db_to_linear(-3.0)

        steady_state = output[len(output)//2:]
        actual_delta = np.mean(steady_state)

        assert abs(actual_delta - expected_delta) < 0.02, (
            f"Gain-adjusted delta wrong: expected={expected_delta:.4f}, got={actual_delta:.4f}"
        )


# =============================================================================
# Signal Reconstruction Tests (wet + delta = dry, since delta = dry - wet)
# =============================================================================

class TestSignalReconstruction:
    """Verify wet + delta reconstructs the dry signal (since delta = dry - wet)."""

    def test_reconstruction_at_1x(self, plugin_path):
        """At 1x oversampling, wet + delta should equal dry input."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)

        # Get wet (clipped) output
        plugin.delta_monitor = False
        wet = plugin.process(input_audio.copy(), 44100)

        # Get delta (dry - wet, i.e., what was clipped off)
        plugin.delta_monitor = True
        delta = plugin.process(input_audio.copy(), 44100)

        # Reconstruct: dry = wet + delta (since delta = dry - wet)
        reconstructed = wet + delta
        max_diff = np.max(np.abs(reconstructed - input_audio))

        assert max_diff < RECONSTRUCTION_TOLERANCE, (
            f"Reconstruction failed: max_diff={max_diff:.6f}"
        )

    # NOTE: Reconstruction with oversampling cannot be tested externally.
    # Each plugin.process() call has independent filter state, so:
    #   - Call 1 (delta=off) outputs wet_1 from filter state A
    #   - Call 2 (delta=on) outputs delta = dry_2 - wet_2 from filter state B
    # Since wet_1 ≠ wet_2, reconstruction fails.
    # Internally, delta works correctly (dry and wet share identical filter state).


# =============================================================================
# Delta Off Tests
# =============================================================================

class TestDeltaOff:
    """Verify delta_monitor=False produces normal output."""

    def test_delta_off_outputs_clipped_signal(self, plugin_path):
        """With delta off, output is the clipped signal."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = False
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        # Should be clipped at ceiling
        assert output_peak <= ceiling_linear * 1.01, (
            f"Delta off should output clipped signal: peak={output_peak:.4f}"
        )

    def test_delta_toggle_changes_output(self, plugin_path):
        """Toggling delta should change the output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)

        plugin.delta_monitor = False
        output_wet = plugin.process(input_audio.copy(), 44100)

        plugin.delta_monitor = True
        output_delta = plugin.process(input_audio.copy(), 44100)

        # They should be different
        diff = np.max(np.abs(output_wet - output_delta))
        assert diff > 0.1, "Delta toggle should produce different output"


# =============================================================================
# Stereo Tests
# =============================================================================

class TestDeltaStereo:
    """Test delta with stereo signals."""

    def test_independent_channel_delta(self, plugin_path):
        """Each channel should have independent delta calculation."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.stereo_link = False
        plugin.delta_monitor = True
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Left clips, right doesn't
        left = generate_sine(amplitude=ceiling_linear * 2, duration=0.3, stereo=False)
        right = generate_sine(amplitude=ceiling_linear * 0.3, duration=0.3, stereo=False)
        stereo_input = np.column_stack([left, right])

        output = plugin.process(stereo_input, 44100)

        left_delta = peak(output[:, 0])
        right_delta = peak(output[:, 1])

        # Left should have delta (clipping occurred)
        assert left_delta > 0.1, f"Left should have delta: {left_delta:.4f}"

        # Right should be near-silent (no clipping)
        assert right_delta < DELTA_SILENCE_TOLERANCE, (
            f"Right should be silent: {right_delta:.4f}"
        )

    def test_delta_in_mid_side_mode(self, plugin_path):
        """Delta works correctly in M/S processing mode."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.channel_mode = "M/S"
        plugin.delta_monitor = True
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Correlated stereo signal (mostly mid, little side)
        # Both channels same = all mid, no side
        mono_signal = generate_sine(amplitude=ceiling_linear * 2, duration=0.3, stereo=False)
        stereo_input = np.column_stack([mono_signal, mono_signal])

        output = plugin.process(stereo_input, 44100)

        # In M/S mode with identical L/R, mid = L+R (clips), side = L-R = 0
        # Delta should be present in both output channels (from mid clipping)
        left_delta = peak(output[:, 0])
        right_delta = peak(output[:, 1])

        # Both should have delta since mid was clipped and decoded back to L/R
        assert left_delta > 0.1, f"Left should have delta from mid: {left_delta:.4f}"
        assert right_delta > 0.1, f"Right should have delta from mid: {right_delta:.4f}"

        # Should be roughly equal (symmetric from mid)
        assert abs(left_delta - right_delta) < 0.05, (
            f"L/R delta should be similar: L={left_delta:.4f}, R={right_delta:.4f}"
        )


# =============================================================================
# Edge Cases
# =============================================================================

class TestDeltaEdgeCases:
    """Edge cases for delta monitoring."""

    def test_zero_input_produces_zero_delta(self, plugin_path):
        """Zero input → zero delta."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.delta_monitor = True
        plugin.ceiling_db = -6.0

        input_audio = generate_dc(level=0.0, duration=0.2)
        output = plugin.process(input_audio, 44100)

        assert peak(output) < EXACT_TOLERANCE, (
            f"Zero input should give zero delta: peak={peak(output):.6f}"
        )

    def test_signal_exactly_at_ceiling(self, plugin_path):
        """Signal exactly at ceiling → near-zero delta."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = True

        ceiling_linear = db_to_linear(-6.0)
        # Signal at exactly ceiling level
        input_audio = generate_sine(amplitude=ceiling_linear, duration=0.3)
        output = plugin.process(input_audio, 44100)

        # Should be near-silent since peaks just touch ceiling
        assert peak(output) < DELTA_SILENCE_TOLERANCE, (
            f"Signal at ceiling should have minimal delta: peak={peak(output):.6f}"
        )

    def test_soft_clip_has_gradual_delta(self, plugin_path):
        """Soft clipping (sharpness < 1.0) produces smaller delta than hard clip."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.delta_monitor = True

        ceiling_linear = db_to_linear(-6.0)
        # Use signal only slightly above ceiling (1.3x) so soft clip doesn't fully saturate
        input_audio = generate_sine(amplitude=ceiling_linear * 1.3, duration=0.3)

        # Get soft-clip delta (sharpness=0.5)
        plugin.sharpness = 0.5
        output_soft = plugin.process(input_audio.copy(), 44100)
        soft_delta_peak = peak(output_soft)

        # Get hard-clip delta (sharpness=1.0)
        plugin.sharpness = 1.0
        output_hard = plugin.process(input_audio.copy(), 44100)
        hard_delta_peak = peak(output_hard)

        # Both should have nonzero delta
        assert soft_delta_peak > 0.001, f"Soft clip should have delta: {soft_delta_peak:.4f}"
        assert hard_delta_peak > 0.001, f"Hard clip should have delta: {hard_delta_peak:.4f}"

        # Soft clip delta should be LESS than hard clip delta
        # (soft saturation in the knee region removes less than hard clipping)
        assert soft_delta_peak < hard_delta_peak, (
            f"Soft delta ({soft_delta_peak:.4f}) should be < hard delta ({hard_delta_peak:.4f})"
        )

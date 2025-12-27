"""
Hard clip behavior tests.

Focused integration tests for hard clipping (sharpness=1.0).
Tests core functionality without exhaustive parameter matrix.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import generate_sine, generate_dc, peak, db_to_linear, linear_to_db
from clipper.test_consts import (
    OVERSAMPLING_MODES,
    FILTER_TYPES,
    PEAK_TOLERANCE_DB,
    EXACT_TOLERANCE,
    PASSTHROUGH_TOLERANCE,
    SYMMETRY_TOLERANCE,
    MIN_EXPECTED_OVERSHOOT_DB,
    MAX_OVERSHOOT_MIN_PHASE_DB,
    MAX_OVERSHOOT_LINEAR_PHASE_DB,
)


# =============================================================================
# Core Clipping Tests
# =============================================================================

class TestHardClipCore:
    """Core hard clip functionality."""

    def test_clips_at_ceiling(self, plugin_path):
        """Signal above ceiling is clipped to ceiling."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.1)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear * db_to_linear(PEAK_TOLERANCE_DB)

    def test_clips_symmetrically(self, plugin_path):
        """Positive and negative peaks clip to same magnitude."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.5)
        output = plugin.process(input_audio, 44100)

        pos_peak = np.max(output)
        neg_peak = np.min(output)

        assert abs(pos_peak - ceiling_linear) < SYMMETRY_TOLERANCE
        assert abs(neg_peak + ceiling_linear) < SYMMETRY_TOLERANCE

    def test_dc_clips_to_exact_ceiling(self, plugin_path):
        """DC signal clips to exact ceiling value."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_dc(level=ceiling_linear * 2, duration=0.1)
        output = plugin.process(input_audio, 44100)

        # Check steady-state (skip first samples for filter settling)
        steady = output[len(output)//2:]
        clipped_value = np.mean(steady)

        assert abs(clipped_value - ceiling_linear) < EXACT_TOLERANCE

    def test_below_ceiling_passes_through(self, plugin_path):
        """Signal below ceiling passes through unchanged."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = 0.0
        plugin.oversampling = "1x"  # No latency for easy comparison

        input_audio = generate_sine(amplitude=0.5, duration=0.1)
        output = plugin.process(input_audio, 44100)

        max_diff = np.max(np.abs(input_audio - output))
        assert max_diff < EXACT_TOLERANCE, f"Signal modified by {max_diff}"

    def test_zero_stays_zero(self, plugin_path):
        """Zero input produces zero output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0

        input_audio = generate_dc(level=0.0, duration=0.1)
        output = plugin.process(input_audio, 44100)

        max_deviation = np.max(np.abs(output))
        assert max_deviation < EXACT_TOLERANCE


# =============================================================================
# Enforce Ceiling Tests
# =============================================================================

class TestEnforceCeiling:
    """Test enforce_ceiling parameter."""

    def test_enforce_on_limits_output(self, plugin_path):
        """enforce_ceiling=True guarantees output <= ceiling."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -12.0
        plugin.oversampling = "4x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-12.0)
        input_audio = generate_sine(amplitude=1.5, duration=0.3)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear * db_to_linear(PEAK_TOLERANCE_DB)

    def test_enforce_off_allows_overshoot(self, plugin_path):
        """enforce_ceiling=False allows filter overshoot."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -12.0
        plugin.oversampling = "4x"
        plugin.enforce_ceiling = False

        ceiling_linear = db_to_linear(-12.0)
        input_audio = generate_sine(amplitude=1.5, duration=0.3)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        overshoot_db = linear_to_db(output_peak / ceiling_linear)

        # Should have measurable overshoot with oversampling
        assert overshoot_db > MIN_EXPECTED_OVERSHOOT_DB, f"Expected overshoot, got {overshoot_db:.3f}dB"

# =============================================================================
# Oversampling Tests
# =============================================================================

class TestOversampling:
    """Verify oversampling modes work correctly."""

    @pytest.mark.parametrize("os_mode", OVERSAMPLING_MODES)
    def test_clipping_works_all_os_modes(self, plugin_path, os_mode):
        """Clipping works correctly at all oversampling rates."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.2)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear * db_to_linear(PEAK_TOLERANCE_DB)

    @pytest.mark.parametrize("filter_type", FILTER_TYPES)
    @pytest.mark.parametrize("os_mode", ["4x", "32x"])
    def test_filter_types_work(self, plugin_path, filter_type, os_mode):
        """Both filter types clip correctly at different oversampling rates."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.filter_type = filter_type
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.2)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear * db_to_linear(PEAK_TOLERANCE_DB)


# =============================================================================
# Filter Overshoot Quality Tests
# =============================================================================

class TestFilterOvershoot:
    """Validate filter overshoot stays within acceptable bounds."""

    @pytest.mark.parametrize("os_mode", ["4x", "16x", "32x"])
    def test_min_phase_overshoot_bounded(self, plugin_path, os_mode):
        """Min-phase filter overshoot should be reasonable."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.filter_type = "Minimum Phase"
        plugin.enforce_ceiling = False

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)
        output = plugin.process(input_audio, 44100)

        overshoot_db = linear_to_db(peak(output) / ceiling_linear)
        assert overshoot_db < MAX_OVERSHOOT_MIN_PHASE_DB, (
            f"{os_mode} Min-phase overshoot {overshoot_db:.3f}dB exceeds {MAX_OVERSHOOT_MIN_PHASE_DB}dB"
        )

    @pytest.mark.parametrize("os_mode", ["4x", "16x", "32x"])
    def test_linear_phase_overshoot_bounded(self, plugin_path, os_mode):
        """Linear-phase filter overshoot should be reasonable."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.filter_type = "Linear Phase"
        plugin.enforce_ceiling = False

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 2, duration=0.3)
        output = plugin.process(input_audio, 44100)

        overshoot_db = linear_to_db(peak(output) / ceiling_linear)
        assert overshoot_db < MAX_OVERSHOOT_LINEAR_PHASE_DB, (
            f"{os_mode} Linear-phase overshoot {overshoot_db:.3f}dB exceeds {MAX_OVERSHOOT_LINEAR_PHASE_DB}dB"
        )


# =============================================================================
# Ceiling Range Tests
# =============================================================================

class TestCeilingRange:
    """Test ceiling parameter at different values."""

    @pytest.mark.parametrize("ceiling_db", [-6.0, -24.0])  # Moderate and extreme
    def test_ceiling_respected(self, plugin_path, ceiling_db):
        """Ceiling is respected at various dB values."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = ceiling_db
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(ceiling_db)
        # Use fixed amplitude that will clip at all ceiling values
        input_audio = generate_sine(amplitude=1.5, duration=0.2)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear * db_to_linear(PEAK_TOLERANCE_DB), (
            f"Ceiling {ceiling_db}dB not respected: peak={output_peak:.6f}, ceiling={ceiling_linear:.6f}"
        )


# =============================================================================
# Gain Interaction Tests
# =============================================================================

class TestGainInteraction:
    """Test gain parameters interact correctly with clipping."""

    def test_input_gain_pushes_into_clipping(self, plugin_path):
        """Input gain can push a quiet signal into clipping."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.output_gain_db = 0.0
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        # Quiet signal that won't clip
        input_audio = generate_sine(amplitude=0.2, duration=0.2)

        # Without gain - should pass through
        plugin.input_gain_db = 0.0
        output_no_gain = plugin.process(input_audio.copy(), 44100)
        peak_no_gain = peak(output_no_gain)

        # With +12dB gain - should clip
        plugin.input_gain_db = 12.0
        output_with_gain = plugin.process(input_audio.copy(), 44100)
        peak_with_gain = peak(output_with_gain)

        assert peak_no_gain < ceiling_linear, "Should not clip without gain"
        assert peak_with_gain <= ceiling_linear * (1 + PASSTHROUGH_TOLERANCE), "Should clip with gain"


# =============================================================================
# Stereo Tests
# =============================================================================

class TestStereo:
    """Test stereo behavior."""

    def test_channels_independent(self, plugin_path):
        """Clipping one channel doesn't affect the other."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"  # No latency
        plugin.stereo_link = False
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Left clips, right doesn't
        left = generate_sine(amplitude=ceiling_linear * 2, duration=0.2, stereo=False)
        right = generate_sine(amplitude=ceiling_linear * 0.3, duration=0.2, stereo=False)
        stereo_input = np.column_stack([left, right])

        output = plugin.process(stereo_input, 44100)

        left_peak = peak(output[:, 0])

        # Left should be clipped
        assert left_peak <= ceiling_linear * (1 + PASSTHROUGH_TOLERANCE)

        # Right should be unchanged
        right_diff = np.max(np.abs(right.flatten() - output[:, 1]))
        assert right_diff < PASSTHROUGH_TOLERANCE, f"Right channel modified: diff={right_diff}"

    def test_stereo_link_clips_both_channels(self, plugin_path):
        """With stereo link, both channels clip based on the louder one."""
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.stereo_link = True
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Left loud (clips), right quiet (would not clip alone)
        left = generate_sine(amplitude=ceiling_linear * 2, duration=0.2, stereo=False)
        right = generate_sine(amplitude=ceiling_linear * 0.3, duration=0.2, stereo=False)
        stereo_input = np.column_stack([left, right])

        output = plugin.process(stereo_input, 44100)

        # Both channels should be affected by the clipping
        # Right channel should be reduced proportionally, not pass through unchanged
        right_output = output[:, 1]
        right_input = right.flatten()

        # With stereo link, right should be modified (gain reduction from left's clipping)
        right_diff = np.max(np.abs(right_input - right_output))
        assert right_diff > PASSTHROUGH_TOLERANCE, (
            f"Right channel unchanged with stereo link on: diff={right_diff}"
        )

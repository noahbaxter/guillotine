"""
Sharpness parameter integration tests.

Tests the sharpness parameter through the full plugin chain.
Mathematical correctness is covered by C++ unit tests (tests/unit/test_clipper.cpp).
These tests focus on:
- Plugin parameter binding
- Audible waveform quality differences
- System-level sanity checks
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import generate_sine, generate_dc, peak, db_to_linear


CEILING_TOLERANCE = 0.001


# =============================================================================
# Soft vs Hard Clip Comparison (Audible Quality)
# =============================================================================

class TestSoftVsHardClipDifference:
    """Soft clipping should produce audibly different output than hard clipping."""

    def test_soft_clip_compresses_in_knee_region(self, plugin_path):
        """In the knee region, soft clip compresses while hard clip passes through."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"

        ceiling_linear = db_to_linear(-6.0)
        # 80% of ceiling: below hard clip threshold, in soft clip knee
        input_level = ceiling_linear * 0.8
        input_audio = generate_dc(level=input_level, duration=0.2)

        # Hard clip - should pass through unchanged
        plugin.sharpness = 1.0
        hard_output = plugin.process(input_audio.copy(), 44100)
        hard_level = np.mean(hard_output[len(hard_output)//2:])

        # Soft clip - should compress
        plugin.sharpness = 0.0
        soft_output = plugin.process(input_audio.copy(), 44100)
        soft_level = np.mean(soft_output[len(soft_output)//2:])

        assert soft_level < hard_level, (
            f"Soft should compress more: soft={soft_level:.4f}, hard={hard_level:.4f}"
        )

    def test_soft_clip_smoother_waveform(self, plugin_path):
        """Soft clip produces smoother waveform (rounded vs flat tops)."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = False

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 1.5, duration=0.3)

        # Hard clip - creates flat tops
        plugin.sharpness = 1.0
        hard_output = plugin.process(input_audio.copy(), 44100)

        # Soft clip - rounded tops
        plugin.sharpness = 0.0
        soft_output = plugin.process(input_audio.copy(), 44100)

        # Measure variance in clipped region (flat = low variance, curved = higher)
        hard_peaks = hard_output[np.abs(hard_output) > ceiling_linear * 0.95]
        soft_peaks = soft_output[np.abs(soft_output) > ceiling_linear * 0.7]

        if len(hard_peaks) > 0 and len(soft_peaks) > 0:
            hard_variance = np.var(np.abs(hard_peaks))
            soft_variance = np.var(np.abs(soft_peaks))
            assert soft_variance > hard_variance, (
                f"Soft clip should have more peak variance: soft={soft_variance:.6f}, hard={hard_variance:.6f}"
            )


# =============================================================================
# System Sanity Check
# =============================================================================

class TestOutputNeverExceedsCeiling:
    """Regardless of sharpness, output should never exceed ceiling."""

    @pytest.mark.parametrize("sharpness", [0.0, 0.5, 1.0])
    def test_output_bounded_by_ceiling(self, plugin_path, sharpness):
        """Output peak never exceeds ceiling at any sharpness."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = sharpness
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = False

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 5, duration=0.3)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        assert output_peak <= ceiling_linear + CEILING_TOLERANCE, (
            f"Output exceeds ceiling at sharpness={sharpness}: "
            f"peak={output_peak:.4f}, ceiling={ceiling_linear:.4f}"
        )


# =============================================================================
# Parameter Binding Smoke Test
# =============================================================================

class TestSharpnessParameterBinding:
    """Verify sharpness parameter affects plugin behavior."""

    def test_sharpness_parameter_has_effect(self, plugin_path):
        """Changing sharpness parameter produces different output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling_linear * 1.5, duration=0.2)

        plugin.sharpness = 0.0
        output_soft = plugin.process(input_audio.copy(), 44100)

        plugin.sharpness = 1.0
        output_hard = plugin.process(input_audio.copy(), 44100)

        # Outputs should differ
        max_diff = np.max(np.abs(output_soft - output_hard))
        assert max_diff > 0.01, f"Sharpness parameter had no effect: diff={max_diff}"

"""
NaN/Inf defense tests.

Verify the sanitization code in ClipperEngine.cpp actually works.
The plugin has defensive code that replaces NaN/Inf with 0.0 to prevent DAW crashes.

NOTE: These tests verify INPUT sanitization only. The sanitization code also exists
to catch NaN/Inf that might be produced internally by the oversimple library (e.g.,
from filter instability). Testing that would require either:
- Mocking/patching the library to produce bad values (not practical)
- Finding specific inputs that trigger internal NaN (none known)
The code path is the same either way - we trust that if input NaN is caught,
internal NaN would be too.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from clipper.test_consts import OVERSAMPLING_MODES


class TestNaNDefense:
    """Verify NaN inputs produce finite outputs."""

    def test_nan_input_produces_finite_output(self, plugin_path):
        """NaN in input buffer results in finite output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = 0.0
        plugin.oversampling = "1x"

        # Create signal with NaN values
        signal = np.array([0.5, float('nan'), 0.5, float('nan'), 0.5], dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), (
            f"Output contains NaN/Inf: {output[~np.isfinite(output)]}"
        )

    def test_inf_input_produces_finite_output(self, plugin_path):
        """Inf in input buffer results in finite output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = 0.0
        plugin.oversampling = "1x"

        # Create signal with Inf values
        signal = np.array([0.5, float('inf'), 0.5, float('-inf'), 0.5], dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), (
            f"Output contains NaN/Inf: {output[~np.isfinite(output)]}"
        )

    def test_all_nan_input(self, plugin_path):
        """Buffer of all NaN values produces finite output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"

        signal = np.full(100, float('nan'), dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), "All-NaN buffer produced NaN output"

    @pytest.mark.parametrize("os_mode", OVERSAMPLING_MODES)
    def test_nan_defense_all_oversampling_modes(self, plugin_path, os_mode):
        """NaN sanitization works at all oversampling rates."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.enforce_ceiling = True

        # Mix of valid samples and NaN
        signal = np.array([0.5, float('nan'), 0.8, float('nan'), 0.3] * 20, dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), (
            f"NaN leaked through at {os_mode}: {np.sum(~np.isfinite(output))} bad samples"
        )


class TestInfDefense:
    """Verify Inf inputs produce finite outputs."""

    def test_positive_inf_clamped(self, plugin_path):
        """Positive infinity is sanitized."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.ceiling_db = 0.0
        plugin.oversampling = "1x"

        signal = np.array([float('inf')] * 10, dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), "Positive Inf leaked through"
        assert np.max(np.abs(output)) <= 1.0, "Inf not properly clamped"

    def test_negative_inf_clamped(self, plugin_path):
        """Negative infinity is sanitized."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.ceiling_db = 0.0
        plugin.oversampling = "1x"

        signal = np.array([float('-inf')] * 10, dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), "Negative Inf leaked through"


class TestMixedBadValues:
    """Test combinations of bad values."""

    def test_nan_inf_mixed(self, plugin_path):
        """Mix of NaN and Inf values all sanitized."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"

        signal = np.array([
            float('nan'), float('inf'), float('-inf'),
            float('nan'), 0.5, float('inf')
        ], dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), "Mixed bad values leaked through"

    def test_sparse_nan_in_long_buffer(self, plugin_path):
        """Sparse NaN values in a long buffer are all caught."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "4x"  # With filtering

        # Long buffer with occasional NaN
        signal = np.sin(np.linspace(0, 100, 10000)).astype(np.float32) * 0.5
        nan_positions = [100, 500, 1000, 5000, 9999]
        for pos in nan_positions:
            signal[pos] = float('nan')

        stereo = np.column_stack([signal, signal])
        output = plugin.process(stereo, 44100)

        assert np.all(np.isfinite(output)), (
            f"Sparse NaN leaked: {np.sum(~np.isfinite(output))} bad samples"
        )


class TestBypassWithBadValues:
    """Test bypass mode handles bad values."""

    @pytest.mark.xfail(
        reason="Bypass mode skips NaN sanitization - input passes through raw",
        strict=True
    )
    def test_bypass_sanitizes_nan(self, plugin_path):
        """Bypass mode should still sanitize NaN (currently doesn't)."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = True

        signal = np.array([0.5, float('nan'), 0.5], dtype=np.float32)
        stereo = np.column_stack([signal, signal])

        output = plugin.process(stereo, 44100)

        # Strict check - no NaN should leak through
        assert np.all(np.isfinite(output)), (
            f"NaN leaked through bypass: {np.sum(~np.isfinite(output))} bad samples"
        )

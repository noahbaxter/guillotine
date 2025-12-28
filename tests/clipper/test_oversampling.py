"""
Oversampling integration tests.

Tests oversampling behavior through the plugin interface. Focuses on:
1. Round-trip signal integrity
2. Latency reporting to DAW
3. Instance independence (critical for delta monitoring)

Unit tests in tests/unit/test_oversampler.cpp cover API-level behavior.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import (
    generate_sine, generate_dc, peak, rms, db_to_linear, measure_latency
)


# =============================================================================
# Test Constants
# =============================================================================

REPRESENTATIVE_MODES = ["1x", "4x", "16x"]

ROUNDTRIP_TOLERANCE = 0.02  # 2% amplitude difference allowed


# =============================================================================
# Round-Trip Signal Preservation
# =============================================================================

class TestRoundTrip:
    """Verify signal survives upsample→process→downsample."""

    @pytest.mark.parametrize("oversampling", REPRESENTATIVE_MODES)
    def test_sine_amplitude_preserved(self, plugin_path, oversampling):
        """Sine wave amplitude preserved through plugin at various OS rates."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = oversampling
        plugin.ceiling_db = 0.0
        plugin.input_gain_db = 0.0
        plugin.output_gain_db = 0.0

        input_audio = generate_sine(amplitude=0.25, duration=0.2)
        output = plugin.process(input_audio, 44100)

        latency = measure_latency(plugin)
        if latency > 0:
            output = output[latency:]
            input_audio = input_audio[:len(output)]

        skip = 1000
        input_rms = rms(input_audio[skip:])
        output_rms = rms(output[skip:])

        ratio = output_rms / input_rms
        assert abs(ratio - 1.0) < ROUNDTRIP_TOLERANCE, (
            f"RMS changed at {oversampling}: ratio={ratio:.4f}"
        )

    @pytest.mark.parametrize("oversampling", ["4x", "16x"])
    def test_dc_preserved(self, plugin_path, oversampling):
        """DC signal preserved through plugin."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = oversampling
        plugin.ceiling_db = 0.0

        input_level = 0.25
        input_audio = generate_dc(level=input_level, duration=0.3)
        output = plugin.process(input_audio, 44100)

        steady_state = output[len(output)//2:]
        output_level = np.mean(steady_state)

        assert abs(output_level - input_level) < ROUNDTRIP_TOLERANCE, (
            f"DC level changed at {oversampling}: expected={input_level:.4f}, got={output_level:.4f}"
        )


# =============================================================================
# Latency Reporting
# =============================================================================

class TestLatency:
    """Verify latency is reported correctly for DAW compensation."""

    def test_1x_has_zero_latency(self, plugin_path):
        """1x oversampling reports zero latency."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"

        latency = measure_latency(plugin)
        assert latency == 0, f"1x should have 0 latency, got {latency}"

    @pytest.mark.parametrize("oversampling", ["4x", "16x"])
    def test_linphase_has_higher_latency_than_minphase(self, plugin_path, oversampling):
        """Linear phase filter has >= latency than minimum phase."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = oversampling

        plugin.filter_type = "Minimum Phase"
        min_phase_latency = measure_latency(plugin)

        plugin.filter_type = "Linear Phase"
        lin_phase_latency = measure_latency(plugin)

        assert lin_phase_latency >= min_phase_latency, (
            f"Linear phase ({lin_phase_latency}) < minimum phase ({min_phase_latency}) "
            f"at {oversampling}"
        )

    def test_latency_varies_with_settings(self, plugin_path):
        """Different settings report different latencies."""
        # Note: pedalboard caches latency, so we use fresh loads for each config

        def get_latency(os, ft):
            p = load_plugin(plugin_path)
            p.bypass_clipper = False
            p.oversampling = os
            p.filter_type = ft
            return measure_latency(p)

        lat_1x_min = get_latency("1x", "Minimum Phase")
        lat_1x_lin = get_latency("1x", "Linear Phase")
        lat_4x_min = get_latency("4x", "Minimum Phase")
        lat_4x_lin = get_latency("4x", "Linear Phase")

        assert lat_1x_min == 0, "1x min phase should have 0 latency"
        assert lat_1x_lin == 0, "1x lin phase should have 0 latency (no oversampling)"
        assert lat_4x_lin >= lat_4x_min, "Linear phase should have >= latency than min phase"
        assert lat_4x_lin > 0, "4x linear phase should have non-zero latency"


# =============================================================================
# Instance Independence (Critical - Tests the channelPtrs bug fix)
# =============================================================================

class TestInstanceIndependence:
    """Verify multiple oversamplers don't share state.

    Delta monitoring requires two independent oversamplers (wet and dry paths).
    If they share state, delta = dry - wet ≈ 0 (both contain same data).
    """

    @pytest.mark.parametrize("oversampling", ["4x", "16x"])
    def test_delta_proves_instance_independence(self, plugin_path, oversampling):
        """Delta output proves wet/dry oversamplers don't share state.

        If oversamplers shared state (the channelPtrs bug), delta would be near-zero
        because both paths would contain the same data. Substantial delta proves
        the paths are independent.
        """
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = oversampling
        plugin.filter_type = "Linear Phase"
        plugin.ceiling_db = -6.0
        plugin.input_gain_db = 0.0
        plugin.output_gain_db = 0.0
        plugin.delta_monitor = True

        ceiling = db_to_linear(-6.0)
        input_audio = generate_sine(amplitude=ceiling * 1.5, duration=0.2)
        delta = plugin.process(input_audio.copy(), 44100)

        delta_peak = peak(delta)
        expected_delta = ceiling * 1.5 - ceiling

        # Delta should be substantial - at least 50% of theoretical max
        assert delta_peak > expected_delta * 0.5, (
            f"Delta too small at {oversampling} - possible shared state bug: "
            f"delta_peak={delta_peak:.4f}, expected≈{expected_delta:.4f}"
        )

        # Delta should not exceed input amplitude (sanity check)
        assert delta_peak < ceiling * 1.5, (
            f"Delta exceeds input amplitude at {oversampling}: "
            f"delta_peak={delta_peak:.4f}, input_amp={ceiling * 1.5:.4f}"
        )

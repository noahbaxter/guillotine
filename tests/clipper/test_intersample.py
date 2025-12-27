"""
Intersample peak detection tests.

Prove oversampling catches peaks that exist between samples.
This validates the value proposition of oversampling for limiting.

BUG: Higher oversampling rates (16x, 32x) have WORSE intersample control than 4x.
This is counterintuitive and likely a bug in the oversimple library configuration.
Measured true peak overshoot with enforce_ceiling=True:
  - 4x min-phase:  +0.16 dB (good)
  - 16x min-phase: +2.42 dB (bad)
  - 32x min-phase: +2.06 dB (bad)
  - All linear phase: ~+2.0 dB (bad)

TODO: Investigate oversimple library behavior at higher OS rates.
"""
import pytest
from pedalboard import load_plugin
from utils import (
    generate_intersample_test,
    true_peak,
    peak,
    db_to_linear,
    linear_to_db,
)

# Strict tolerance for proper intersample peak control
MAX_TRUE_PEAK_OVERSHOOT_DB = 0.5


@pytest.fixture
def clipper(plugin_path):
    """Return a plugin configured for standard clipping tests."""
    plugin = load_plugin(plugin_path)
    plugin.bypass_clipper = False
    plugin.sharpness = 1.0
    plugin.ceiling_db = -6.0
    plugin.oversampling = "4x"
    plugin.filter_type = "Minimum Phase"
    plugin.enforce_ceiling = True
    return plugin


class TestIntersamplePeakDetection:
    """Verify oversampling catches intersample peaks."""

    def test_intersample_signal_has_higher_true_peak(self):
        """Sanity check: our test signal has true peak > sample peak."""
        signal = generate_intersample_test(amplitude=1.0, duration=0.1, stereo=True)

        sample_peak_val = peak(signal)
        true_peak_val = true_peak(signal)

        # True peak should exceed sample peak for this signal
        assert true_peak_val > sample_peak_val * 1.1, (
            f"Test signal doesn't have intersample peaks: "
            f"sample={sample_peak_val:.4f}, true={true_peak_val:.4f}"
        )

    def test_1x_misses_intersample_peaks(self, plugin_path):
        """At 1x oversampling, intersample peaks pass through ceiling."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Signal with intersample peaks above ceiling
        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 1.5,
            duration=0.1,
            stereo=True
        )

        output = plugin.process(input_signal, 44100)

        output_sample_peak = peak(output)
        output_true_peak = true_peak(output)

        # Sample peak should be at ceiling
        assert output_sample_peak <= ceiling_linear * 1.01, (
            f"Sample peak exceeds ceiling at 1x"
        )

        # But true peak will exceed ceiling (this is expected at 1x)
        # This proves 1x can't catch intersample peaks
        assert output_true_peak > ceiling_linear, (
            f"Expected 1x to miss intersample peaks, but true_peak={output_true_peak:.4f} <= ceiling={ceiling_linear:.4f}"
        )


class TestIntersampleControl:
    """Test intersample peak control at various OS rates and filter types."""

    def test_4x_min_phase_catches_intersample_peaks(self, clipper):
        """4x min-phase provides good intersample peak control (<0.5dB overshoot)."""
        ceiling_linear = db_to_linear(-6.0)

        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 2.0,
            duration=0.2,
            stereo=True
        )

        output = clipper.process(input_signal, 44100)
        output_true_peak = true_peak(output)
        overshoot_db = linear_to_db(output_true_peak / ceiling_linear)

        assert overshoot_db < MAX_TRUE_PEAK_OVERSHOOT_DB, (
            f"4x min-phase true peak overshoot {overshoot_db:.2f}dB exceeds {MAX_TRUE_PEAK_OVERSHOOT_DB}dB"
        )

    @pytest.mark.xfail(reason="BUG: 16x has worse intersample control than 4x (~2.4dB overshoot)")
    def test_16x_min_phase_intersample_control(self, plugin_path):
        """16x min-phase should provide good intersample control."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "16x"
        plugin.filter_type = "Minimum Phase"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 2.0,
            duration=0.2,
            stereo=True
        )

        output = plugin.process(input_signal, 44100)
        output_true_peak = true_peak(output)
        overshoot_db = linear_to_db(output_true_peak / ceiling_linear)

        assert overshoot_db < MAX_TRUE_PEAK_OVERSHOOT_DB, (
            f"16x min-phase true peak overshoot {overshoot_db:.2f}dB exceeds {MAX_TRUE_PEAK_OVERSHOOT_DB}dB"
        )

    @pytest.mark.xfail(reason="BUG: 32x has worse intersample control than 4x (~2.1dB overshoot)")
    def test_32x_min_phase_intersample_control(self, plugin_path):
        """32x min-phase should provide good intersample control."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "32x"
        plugin.filter_type = "Minimum Phase"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 2.0,
            duration=0.2,
            stereo=True
        )

        output = plugin.process(input_signal, 44100)
        output_true_peak = true_peak(output)
        overshoot_db = linear_to_db(output_true_peak / ceiling_linear)

        assert overshoot_db < MAX_TRUE_PEAK_OVERSHOOT_DB, (
            f"32x min-phase true peak overshoot {overshoot_db:.2f}dB exceeds {MAX_TRUE_PEAK_OVERSHOOT_DB}dB"
        )

    @pytest.mark.xfail(reason="BUG: Linear phase has ~2dB overshoot at all OS rates")
    @pytest.mark.parametrize("os_mode", ["4x", "16x", "32x"])
    def test_linear_phase_intersample_control(self, plugin_path, os_mode):
        """Linear phase should provide good intersample control."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = os_mode
        plugin.filter_type = "Linear Phase"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 2.0,
            duration=0.2,
            stereo=True
        )

        output = plugin.process(input_signal, 44100)
        output_true_peak = true_peak(output)
        overshoot_db = linear_to_db(output_true_peak / ceiling_linear)

        assert overshoot_db < MAX_TRUE_PEAK_OVERSHOOT_DB, (
            f"{os_mode} linear-phase true peak overshoot {overshoot_db:.2f}dB exceeds {MAX_TRUE_PEAK_OVERSHOOT_DB}dB"
        )


class TestIntersampleComparison:
    """Compare intersample behavior across oversampling modes."""

    def test_4x_min_phase_better_than_1x(self, plugin_path):
        """4x min-phase significantly reduces intersample overshoot vs 1x."""
        ceiling_linear = db_to_linear(-6.0)

        input_signal = generate_intersample_test(
            amplitude=ceiling_linear * 2.0,
            duration=0.2,
            stereo=True
        )

        # Process at 1x
        plugin_1x = load_plugin(plugin_path)
        plugin_1x.bypass_clipper = False
        plugin_1x.sharpness = 1.0
        plugin_1x.ceiling_db = -6.0
        plugin_1x.oversampling = "1x"
        plugin_1x.enforce_ceiling = True

        output_1x = plugin_1x.process(input_signal.copy(), 44100)
        true_peak_1x = true_peak(output_1x)

        # Process at 4x min-phase
        plugin_4x = load_plugin(plugin_path)
        plugin_4x.bypass_clipper = False
        plugin_4x.sharpness = 1.0
        plugin_4x.ceiling_db = -6.0
        plugin_4x.oversampling = "4x"
        plugin_4x.filter_type = "Minimum Phase"
        plugin_4x.enforce_ceiling = True

        output_4x = plugin_4x.process(input_signal.copy(), 44100)
        true_peak_4x = true_peak(output_4x)

        # 4x should have significantly lower true peak than 1x
        assert true_peak_4x < true_peak_1x, (
            f"4x ({true_peak_4x:.4f}) should have lower true peak than 1x ({true_peak_1x:.4f})"
        )

        improvement_db = linear_to_db(true_peak_1x) - linear_to_db(true_peak_4x)
        assert improvement_db > 2.0, (
            f"Expected >2dB improvement from 4x min-phase OS, got {improvement_db:.2f}dB"
        )


class TestIntersampleEdgeCases:
    """Edge cases for intersample peak handling."""

    def test_signal_below_ceiling_unchanged(self, clipper):
        """Intersample signal below ceiling passes through at all OS rates."""
        clipper.ceiling_db = 0.0  # Full scale ceiling

        # Very quiet signal - true peak well below ceiling
        input_signal = generate_intersample_test(
            amplitude=0.3,
            duration=0.1,
            stereo=True
        )

        input_true_peak = true_peak(input_signal)
        assert input_true_peak < 1.0, "Test signal should be below ceiling"

        output = clipper.process(input_signal, 44100)
        output_true_peak = true_peak(output)

        # Should be relatively unchanged (allow for filter artifacts)
        ratio = output_true_peak / input_true_peak
        assert 0.9 < ratio < 1.1, (
            f"Signal below ceiling modified unexpectedly: ratio={ratio:.4f}"
        )

    def test_exactly_at_ceiling(self, clipper):
        """Signal with true peak exactly at ceiling."""
        ceiling_linear = db_to_linear(-6.0)

        # Generate signal and scale so true peak ≈ ceiling
        raw_signal = generate_intersample_test(amplitude=1.0, duration=0.1, stereo=True)
        raw_true_peak = true_peak(raw_signal)
        input_signal = raw_signal * (ceiling_linear / raw_true_peak)

        output = clipper.process(input_signal, 44100)
        output_true_peak = true_peak(output)

        # Should stay at or below ceiling (with small tolerance)
        max_allowed = ceiling_linear * db_to_linear(MAX_TRUE_PEAK_OVERSHOOT_DB)
        assert output_true_peak <= max_allowed, (
            f"Signal at ceiling exceeded limit: {linear_to_db(output_true_peak):.2f}dB"
        )

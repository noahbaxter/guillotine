"""
Hard clip behavior tests.

Tests that sharpness=1.0 (hard clip) produces exact clipping at ceiling.
Validates sample peak and true peak across all oversampling/filter combinations.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import (
    generate_sine, generate_dc, generate_impulse, generate_intersample_test,
    peak, true_peak, measure_peaks, measure_latency, align_signals,
    db_to_linear, linear_to_db
)
from clipper.test_consts import (
    CEILINGS_DB, OVERSAMPLING_MODES, FILTER_TYPES, TEST_AMPLITUDES,
    EXACT_TOLERANCE, SYMMETRY_TOLERANCE, PASSTHROUGH_TOLERANCE_DB,
    SAMPLE_PEAK_TOLERANCE, TRUE_PEAK_TOLERANCE, NEIGHBOR_ISOLATION_TOLERANCE
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def configured_plugin(plugin_path, request):
    """Load plugin with specific ceiling, oversampling, and filter type."""
    ceiling_db, oversampling, filter_type = request.param

    plugin = load_plugin(plugin_path)
    plugin.bypass = False
    plugin.sharpness = 1.0  # Hard clip
    plugin.input_gain_db = 0.0
    plugin.output_gain_db = 0.0
    plugin.ceiling_db = ceiling_db
    plugin.oversampling = oversampling
    plugin.filter_type = filter_type

    return plugin, ceiling_db, oversampling, filter_type


# =============================================================================
# Helpers
# =============================================================================

def generate_config_matrix():
    """Generate all combinations of ceiling, oversampling, filter type."""
    configs = []
    for ceiling in CEILINGS_DB:
        for os_mode in OVERSAMPLING_MODES:
            for ftype in FILTER_TYPES:
                config_id = f"ceil={ceiling}dB_os={os_mode}_filt={ftype[:3]}"
                configs.append(pytest.param((ceiling, os_mode, ftype), id=config_id))
    return configs


# =============================================================================
# Peak Limiting Tests
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestHardClipPeakLimiting:
    """Test that hard clip limits peaks correctly."""

    def test_sine_sample_peak(self, configured_plugin):
        """Sine wave sample peak should not exceed ceiling."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)
        tolerance = SAMPLE_PEAK_TOLERANCE[os_mode]

        for amplitude in TEST_AMPLITUDES:
            if amplitude <= ceiling_linear:
                continue  # Only test signals that would clip

            input_audio = generate_sine(amplitude=amplitude, duration=0.5)
            output = plugin.process(input_audio, 44100)

            output_peak = peak(output)
            max_allowed = ceiling_linear * db_to_linear(tolerance)

            assert output_peak <= max_allowed

    def test_sine_true_peak(self, configured_plugin):
        """Sine wave true peak should not exceed ceiling (where applicable)."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)
        tolerance = TRUE_PEAK_TOLERANCE[os_mode]

        if tolerance is None:
            pytest.skip(f"True peak not asserted for {os_mode}")

        for amplitude in TEST_AMPLITUDES:
            if amplitude <= ceiling_linear:
                continue

            input_audio = generate_sine(amplitude=amplitude, duration=0.5)
            output = plugin.process(input_audio, 44100)

            output_tp = true_peak(output)
            max_allowed = ceiling_linear * db_to_linear(tolerance)

            assert output_tp <= max_allowed

    def test_impulse_sample_peak(self, configured_plugin):
        """Impulse train sample peak should not exceed ceiling."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)
        tolerance = SAMPLE_PEAK_TOLERANCE[os_mode]

        input_audio = generate_impulse(amplitude=ceiling_linear * 2, duration=0.2)
        output = plugin.process(input_audio, 44100)

        output_peak = peak(output)
        max_allowed = ceiling_linear * db_to_linear(tolerance)

        assert output_peak <= max_allowed


# =============================================================================
# Intersample Peak Tests
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestIntersamplePeaks:
    """Test handling of intersample peaks."""

    def test_intersample_signal(self, configured_plugin):
        """Test signal designed to have intersample peaks."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        input_audio = generate_intersample_test(amplitude=ceiling_linear * 1.5, duration=0.1)
        output = plugin.process(input_audio, 44100)

        peaks = measure_peaks(output)

        # Sample peak check
        sample_tol = SAMPLE_PEAK_TOLERANCE[os_mode]
        max_sample = ceiling_linear * db_to_linear(sample_tol)
        assert peaks['sample_peak'] <= max_sample

        # True peak check (if applicable)
        true_tol = TRUE_PEAK_TOLERANCE[os_mode]
        if true_tol is not None:
            max_true = ceiling_linear * db_to_linear(true_tol)
            assert peaks['true_peak'] <= max_true


# =============================================================================
# Exact Value Tests
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestExactClipValues:
    """Test that clipping produces exact expected values."""

    def test_positive_clips_to_ceiling(self, configured_plugin):
        """Positive values above ceiling should clip to exactly +ceiling."""
        plugin, ceiling_db, _, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        input_audio = generate_dc(level=ceiling_linear * 2, duration=0.1)
        output = plugin.process(input_audio, 44100)

        steady = output[len(output)//2:]
        clipped_value = np.mean(steady)

        assert abs(clipped_value - ceiling_linear) < EXACT_TOLERANCE

    def test_negative_clips_to_negative_ceiling(self, configured_plugin):
        """Negative values below -ceiling should clip to exactly -ceiling."""
        plugin, ceiling_db, _, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        input_audio = generate_dc(level=-ceiling_linear * 2, duration=0.1)
        output = plugin.process(input_audio, 44100)

        steady = output[len(output)//2:]
        clipped_value = np.mean(steady)

        assert abs(clipped_value - (-ceiling_linear)) < EXACT_TOLERANCE

    def test_symmetry_sine(self, configured_plugin):
        """Positive and negative peaks should clip symmetrically."""
        plugin, ceiling_db, _, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        input_audio = generate_sine(amplitude=ceiling_linear * 1.5, duration=0.5)
        output = plugin.process(input_audio, 44100)

        pos_peak = np.max(output)
        neg_peak = np.min(output)

        assert abs(pos_peak - ceiling_linear) < SYMMETRY_TOLERANCE
        assert abs(neg_peak - (-ceiling_linear)) < SYMMETRY_TOLERANCE

    def test_zero_stays_zero(self, configured_plugin):
        """Zero input should produce zero output."""
        plugin, _, _, _ = configured_plugin

        input_audio = generate_dc(level=0.0, duration=0.1)
        output = plugin.process(input_audio, 44100)

        max_deviation = np.max(np.abs(output))
        assert max_deviation < EXACT_TOLERANCE


# =============================================================================
# Neighbor Isolation Tests
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestClipIsolation:
    """Test that clipping doesn't bleed into neighboring samples."""

    def test_clipped_sample_doesnt_affect_neighbors(self, configured_plugin):
        """A clipped sample shouldn't alter adjacent unclipped samples."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        safe_level = ceiling_linear * 0.3
        clip_level = ceiling_linear * 2.0

        samples = 1000
        input_audio = np.full(samples, safe_level, dtype=np.float32)
        input_audio[500] = clip_level  # Single spike

        input_audio = input_audio.reshape(-1, 1)
        output = plugin.process(input_audio, 44100)

        latency = measure_latency(plugin)
        spike_pos = 500 + latency

        if spike_pos <= 10 or spike_pos >= len(output) - 10:
            pytest.skip(f"Spike position {spike_pos} out of bounds for analysis")

        before = output[spike_pos - 5:spike_pos - 1]
        after = output[spike_pos + 2:spike_pos + 6]

        before_diff = np.max(np.abs(before - safe_level))
        after_diff = np.max(np.abs(after - safe_level))

        tolerance = NEIGHBOR_ISOLATION_TOLERANCE[os_mode]

        assert before_diff < tolerance
        assert after_diff < tolerance


# =============================================================================
# Input Gain Interaction Tests
# =============================================================================

@pytest.mark.parametrize("oversampling", OVERSAMPLING_MODES)
@pytest.mark.parametrize("filter_type", FILTER_TYPES)
def test_input_gain_then_clip(plugin_path, oversampling, filter_type):
    """Input gain should push signal into clipping correctly."""
    plugin = load_plugin(plugin_path)
    plugin.bypass = False
    plugin.sharpness = 1.0
    plugin.ceiling_db = -6.0
    plugin.output_gain_db = 0.0
    plugin.oversampling = oversampling
    plugin.filter_type = filter_type

    ceiling_linear = db_to_linear(-6.0)
    input_audio = generate_sine(amplitude=0.25, duration=0.3)

    # Without gain - should pass through
    plugin.input_gain_db = 0.0
    output_no_gain = plugin.process(input_audio.copy(), 44100)
    peak_no_gain = peak(output_no_gain)

    # With +12dB gain - should clip
    plugin.input_gain_db = 12.0
    output_with_gain = plugin.process(input_audio.copy(), 44100)
    peak_with_gain = peak(output_with_gain)

    assert 0.2 < peak_no_gain < 0.3

    tolerance = SAMPLE_PEAK_TOLERANCE[oversampling]
    max_allowed = ceiling_linear * db_to_linear(tolerance)
    assert peak_with_gain <= max_allowed


# =============================================================================
# Passthrough Tests (signal below ceiling)
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestBelowCeilingPassthrough:
    """Test that signals below ceiling pass through unchanged."""

    def test_sine_below_ceiling_unchanged(self, configured_plugin):
        """Sine well below ceiling should pass unchanged."""
        plugin, ceiling_db, os_mode, filter_type = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        amplitude = ceiling_linear * 0.5
        input_audio = generate_sine(amplitude=amplitude, duration=0.5)

        latency = measure_latency(plugin)
        output = plugin.process(input_audio, 44100)

        aligned_in, aligned_out = align_signals(input_audio, output, latency)

        max_diff = np.max(np.abs(aligned_in - aligned_out))
        max_diff_db = linear_to_db(max_diff) if max_diff > 0 else -np.inf

        assert max_diff_db < PASSTHROUGH_TOLERANCE_DB, (
            f"Changed by {max_diff_db:.1f}dB (os={os_mode}, filter={filter_type})"
        )


# =============================================================================
# Frequency Response Tests
# =============================================================================

TEST_FREQUENCIES = [100.0, 1000.0, 10000.0, 15000.0]


@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestFrequencyConsistency:
    """Test clipping behavior across audible frequency range."""

    def test_clipping_consistent_across_frequencies(self, configured_plugin):
        """Clipping should work identically at different frequencies."""
        plugin, ceiling_db, os_mode, _ = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)
        tolerance = SAMPLE_PEAK_TOLERANCE[os_mode]
        max_allowed = ceiling_linear * db_to_linear(tolerance)

        for freq in TEST_FREQUENCIES:
            input_audio = generate_sine(
                freq=freq, amplitude=ceiling_linear * 1.5, duration=0.1
            )
            output = plugin.process(input_audio, 44100)

            output_peak = peak(output)
            assert output_peak <= max_allowed, (
                f"Failed at {freq}Hz: peak {output_peak:.4f} > {max_allowed:.4f}"
            )


# =============================================================================
# Edge-of-Ceiling Tests
# =============================================================================

@pytest.mark.parametrize("configured_plugin", generate_config_matrix(), indirect=True)
class TestEdgeOfCeiling:
    """Test signals exactly at ceiling pass through unchanged."""

    def test_signal_at_ceiling_unchanged(self, configured_plugin):
        """Signal exactly at ceiling should pass through without clipping."""
        plugin, ceiling_db, os_mode, filter_type = configured_plugin
        ceiling_linear = db_to_linear(ceiling_db)

        input_audio = generate_sine(amplitude=ceiling_linear, duration=0.5)

        latency = measure_latency(plugin)
        output = plugin.process(input_audio, 44100)

        aligned_in, aligned_out = align_signals(input_audio, output, latency)

        max_diff = np.max(np.abs(aligned_in - aligned_out))
        max_diff_db = linear_to_db(max_diff) if max_diff > 0 else -np.inf

        assert max_diff_db < PASSTHROUGH_TOLERANCE_DB, (
            f"Signal at ceiling was modified by {max_diff_db:.1f}dB "
            f"(os={os_mode}, filter={filter_type})"
        )


# =============================================================================
# Stereo Independence Tests
# =============================================================================

@pytest.mark.parametrize("oversampling", OVERSAMPLING_MODES)
@pytest.mark.parametrize("filter_type", FILTER_TYPES)
def test_stereo_channel_independence(plugin_path, oversampling, filter_type):
    """Clipping on one channel should not affect the other channel."""
    plugin = load_plugin(plugin_path)
    plugin.bypass = False
    plugin.sharpness = 1.0
    plugin.input_gain_db = 0.0
    plugin.output_gain_db = 0.0
    plugin.ceiling_db = -6.0
    plugin.oversampling = oversampling
    plugin.filter_type = filter_type

    ceiling_linear = db_to_linear(-6.0)

    # L channel: clips hard, R channel: well below ceiling
    left = generate_sine(amplitude=ceiling_linear * 2.0, duration=0.3, stereo=False)
    right = generate_sine(amplitude=ceiling_linear * 0.3, duration=0.3, stereo=False)
    stereo_input = np.column_stack([left, right])

    output = plugin.process(stereo_input, 44100)

    left_out = output[:, 0:1]
    right_out = output[:, 1:2]

    # Left should be clipped
    left_peak = peak(left_out)
    tolerance = SAMPLE_PEAK_TOLERANCE[oversampling]
    max_allowed = ceiling_linear * db_to_linear(tolerance)
    assert left_peak <= max_allowed, f"Left channel not clipped properly"

    # Right should be unchanged (compare to input)
    latency = measure_latency(plugin)
    aligned_in, aligned_out = align_signals(right, right_out, latency)
    max_diff = np.max(np.abs(aligned_in - aligned_out))
    max_diff_db = linear_to_db(max_diff) if max_diff > 0 else -np.inf

    assert max_diff_db < PASSTHROUGH_TOLERANCE_DB, (
        f"Right channel affected by left clipping: {max_diff_db:.1f}dB change"
    )


# =============================================================================
# Block Boundary Tests
# =============================================================================

@pytest.mark.parametrize("oversampling", OVERSAMPLING_MODES)
@pytest.mark.parametrize("filter_type", FILTER_TYPES)
def test_block_size_independence(plugin_path, oversampling, filter_type):
    """Processing should be identical regardless of buffer size."""
    ceiling_db = -6.0
    ceiling_linear = db_to_linear(ceiling_db)

    input_audio = generate_sine(amplitude=ceiling_linear * 1.5, duration=0.5)
    block_sizes = [128, 512, 1024]
    outputs = []

    for block_size in block_sizes:
        plugin = load_plugin(plugin_path)
        plugin.bypass = False
        plugin.sharpness = 1.0
        plugin.input_gain_db = 0.0
        plugin.output_gain_db = 0.0
        plugin.ceiling_db = ceiling_db
        plugin.oversampling = oversampling
        plugin.filter_type = filter_type

        # Process in chunks
        output_chunks = []
        for i in range(0, len(input_audio), block_size):
            chunk = input_audio[i:i + block_size]
            if len(chunk) > 0:
                out_chunk = plugin.process(chunk, 44100)
                output_chunks.append(out_chunk)
        outputs.append(np.concatenate(output_chunks, axis=0))

    # Compare outputs from different block sizes
    min_len = min(len(o) for o in outputs)
    reference = outputs[0][:min_len]

    for i, output in enumerate(outputs[1:], 1):
        diff = np.max(np.abs(reference - output[:min_len]))
        diff_db = linear_to_db(diff) if diff > 0 else -np.inf
        assert diff_db < -60, (
            f"Block size {block_sizes[i]} differs from {block_sizes[0]}: {diff_db:.1f}dB"
        )


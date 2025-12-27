"""
Sample rate and block size invariance tests.

Prove clipper math is identical across sample rates and block sizes.
At 1x oversampling (no filters), output should be sample-identical.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import generate_sine, peak, db_to_linear

SAMPLE_RATES = [44100, 48000, 88200, 96000]
BLOCK_SIZES = [64, 128, 256, 512, 1024, 2048]
TOLERANCE = 1e-6  # Float32 precision


class TestSampleRateInvariance:
    """Clipper math should be identical across sample rates."""

    @pytest.mark.parametrize("sample_rate", SAMPLE_RATES)
    def test_hard_clip_output_identical_across_sample_rates(self, plugin_path, sample_rate):
        """Hard clipping produces identical peak at all sample rates."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"  # No filter influence
        plugin.enforce_ceiling = True

        # Generate signal at this sample rate (same relative frequency)
        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(
            freq=1000.0,
            duration=0.1,
            sr=sample_rate,
            amplitude=ceiling_linear * 2,
            stereo=True
        )

        output = plugin.process(input_audio, sample_rate)
        output_peak = peak(output)

        # Output peak should be at ceiling regardless of sample rate
        assert abs(output_peak - ceiling_linear) < TOLERANCE, (
            f"At {sample_rate}Hz: peak={output_peak:.8f}, expected={ceiling_linear:.8f}"
        )

    def test_soft_clip_consistent_across_sample_rates(self, plugin_path):
        """Soft clipping produces identical peaks across sample rates."""
        ceiling_linear = db_to_linear(-6.0)
        peaks = []

        for sample_rate in SAMPLE_RATES:
            plugin = load_plugin(plugin_path)
            plugin.bypass_clipper = False
            plugin.sharpness = 0.5  # Mid soft knee
            plugin.ceiling_db = -6.0
            plugin.oversampling = "1x"
            plugin.enforce_ceiling = True

            input_audio = generate_sine(
                freq=1000.0,
                duration=0.1,
                sr=sample_rate,
                amplitude=ceiling_linear * 1.5,
                stereo=True
            )

            output = plugin.process(input_audio, sample_rate)
            peaks.append((sample_rate, peak(output)))

        # All peaks should be identical (soft clip math is sample-rate independent)
        reference_peak = peaks[0][1]
        for sample_rate, output_peak in peaks[1:]:
            assert abs(output_peak - reference_peak) < TOLERANCE, (
                f"Soft clip peak differs at {sample_rate}Hz: {output_peak:.8f} vs {reference_peak:.8f}"
            )


class TestBlockSizeInvariance:
    """Clipper is stateless - block size shouldn't affect output."""

    def test_single_large_block_vs_many_small(self, plugin_path):
        """Processing in one block vs many small blocks gives identical output."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        total_samples = 4096
        input_audio = generate_sine(
            freq=440.0,
            duration=total_samples / 44100,
            sr=44100,
            amplitude=ceiling_linear * 2,
            stereo=True
        )

        # Process as one large block
        output_single = plugin.process(input_audio.copy(), 44100)

        # Process as many small blocks (64 samples each)
        output_chunks = []
        chunk_size = 64
        for i in range(0, total_samples, chunk_size):
            chunk = input_audio[i:i + chunk_size]
            output_chunk = plugin.process(chunk.copy(), 44100)
            output_chunks.append(output_chunk)
        output_multi = np.vstack(output_chunks)

        # Should be sample-identical
        max_diff = np.max(np.abs(output_single - output_multi))
        assert max_diff < TOLERANCE, f"Block size affected output: max_diff={max_diff}"

    @pytest.mark.parametrize("block_size", BLOCK_SIZES)
    def test_various_block_sizes_same_peak(self, plugin_path, block_size):
        """Output peak is identical regardless of block size."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -12.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-12.0)

        # Generate exactly block_size samples
        input_audio = generate_sine(
            freq=440.0,
            duration=block_size / 44100,
            sr=44100,
            amplitude=ceiling_linear * 2,
            stereo=True
        )

        output = plugin.process(input_audio, 44100)
        output_peak = peak(output)

        assert abs(output_peak - ceiling_linear) < TOLERANCE, (
            f"Block size {block_size}: peak={output_peak:.8f}, expected={ceiling_linear:.8f}"
        )

    @pytest.mark.parametrize("block_size", [100, 333, 441, 997, 1234])
    def test_odd_block_size(self, plugin_path, block_size):
        """Non-power-of-2 block sizes work correctly (DAWs do this)."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)
        input_audio = generate_sine(
            freq=440.0,
            duration=block_size / 44100,
            sr=44100,
            amplitude=ceiling_linear * 2,
            stereo=True
        )

        output = plugin.process(input_audio, 44100)
        output_peak = peak(output)

        assert abs(output_peak - ceiling_linear) < TOLERANCE, (
            f"Odd block size {block_size}: peak={output_peak:.8f}"
        )

    def test_tiny_block_size(self, plugin_path):
        """Very small blocks (1-16 samples) work correctly."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.sharpness = 1.0
        plugin.ceiling_db = -6.0
        plugin.oversampling = "1x"
        plugin.enforce_ceiling = True

        ceiling_linear = db_to_linear(-6.0)

        # Process 16 samples one at a time
        input_samples = generate_sine(
            freq=440.0,
            duration=16 / 44100,
            sr=44100,
            amplitude=ceiling_linear * 2,
            stereo=True
        )

        for i in range(16):
            single_sample = input_samples[i:i + 1]
            output = plugin.process(single_sample, 44100)
            output_peak = peak(output)
            assert output_peak <= ceiling_linear + TOLERANCE

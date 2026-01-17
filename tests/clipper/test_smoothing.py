"""
Parameter smoothing tests.

Tests that ceiling and curve exponent changes don't cause zipper noise
(discontinuities) when automated rapidly.
"""
import pytest
import numpy as np
from pedalboard import load_plugin
from utils import generate_sine, db_to_linear


class TestCeilingSmoothing:
    """Test that ceiling parameter changes are smoothed (no zipper noise)."""

    def test_ceiling_change_no_discontinuity(self, plugin_path):
        """
        Changing ceiling mid-buffer should not cause sample discontinuities.

        Strategy: Process audio in small chunks, changing ceiling between chunks.
        Without smoothing, the output would have jumps at chunk boundaries.
        With smoothing, transitions should be gradual.
        """
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"  # No oversampling to isolate ceiling effect
        plugin.true_clip = False  # Disable enforce-ceiling to test Clipper smoothing directly
        plugin.curve = "Hard"

        sr = 44100
        chunk_size = 64  # Small chunks to stress the smoothing
        num_chunks = 20

        # Use DC signal so output tracks ceiling exactly (no phase alignment issues)
        input_amplitude = 0.8
        total_samples = chunk_size * num_chunks
        input_audio = np.full((total_samples, 1), input_amplitude, dtype=np.float32)

        output_chunks = []

        # Alternate between two ceiling values
        ceilings = [-6.0, -12.0]

        for i in range(num_chunks):
            # Change ceiling every chunk
            plugin.ceiling_db = ceilings[i % 2]

            chunk_start = i * chunk_size
            chunk_end = chunk_start + chunk_size
            chunk = input_audio[chunk_start:chunk_end].copy()

            output = plugin.process(chunk, sr)
            output_chunks.append(output)

        # Concatenate all output
        full_output = np.concatenate(output_chunks, axis=0)

        # Check for discontinuities: large sample-to-sample jumps
        # A smoothed signal should have gradual transitions
        diff = np.abs(np.diff(full_output, axis=0))
        max_diff = np.max(diff)

        # With DC input, output should track ceiling directly.
        # Ceilings are -6dB (0.501) and -12dB (0.251), step of 0.25.
        # Without smoothing: max_diff = 0.25 (full step)
        # With 2ms smoothing at 44.1kHz (~88 samples): max_diff ≈ 0.25/88 ≈ 0.003
        # Use 0.05 threshold to catch broken smoothing while allowing some tolerance
        max_expected_diff = 0.05

        assert max_diff < max_expected_diff, (
            f"Detected discontinuity: max sample-to-sample diff = {max_diff:.4f} "
            f"(threshold: {max_expected_diff}). Ceiling smoothing may not be working."
        )

    def test_rapid_ceiling_automation(self, plugin_path):
        """
        Rapidly automating ceiling should produce smooth output.

        This simulates DAW automation at audio rate.
        """
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"
        plugin.true_clip = True
        plugin.curve = "Hard"

        sr = 44100
        duration = 0.1  # 100ms
        samples = int(sr * duration)

        # Input signal above both ceiling values
        input_audio = generate_sine(freq=440, duration=duration, sr=sr, amplitude=0.9)

        # Process in very small chunks with ceiling changes
        chunk_size = 32
        outputs = []

        for i in range(0, samples, chunk_size):
            # Sweep ceiling from -3dB to -12dB
            progress = i / samples
            ceiling_db = -3.0 - (progress * 9.0)  # -3 to -12 dB
            plugin.ceiling_db = ceiling_db

            chunk = input_audio[i:i+chunk_size].copy()
            if len(chunk) == 0:
                break
            output = plugin.process(chunk, sr)
            outputs.append(output)

        full_output = np.concatenate(outputs, axis=0)

        # Check for discontinuities
        diff = np.abs(np.diff(full_output, axis=0))
        max_diff = np.max(diff)

        # Should be smooth
        assert max_diff < 0.1, (
            f"Rapid ceiling automation caused discontinuity: {max_diff:.4f}"
        )


class TestExponentSmoothing:
    """Test that curve exponent changes are smoothed."""

    def test_exponent_change_no_discontinuity(self, plugin_path):
        """Changing curve exponent mid-buffer should be smooth."""
        plugin = load_plugin(plugin_path)
        plugin.bypass_clipper = False
        plugin.oversampling = "1x"
        plugin.true_clip = False  # Disable enforce-ceiling to test Clipper smoothing directly
        plugin.curve = "Knee"  # Knee mode uses exponent
        plugin.ceiling_db = -6.0

        sr = 44100
        chunk_size = 64
        num_chunks = 20

        # Use DC signal to avoid phase alignment issues
        input_amplitude = 0.8
        total_samples = chunk_size * num_chunks
        input_audio = np.full((total_samples, 1), input_amplitude, dtype=np.float32)

        output_chunks = []

        # Alternate between exponent values
        exponents = [1.0, 4.0]  # Min and max softness

        for i in range(num_chunks):
            plugin.curve_exponent = exponents[i % 2]

            chunk_start = i * chunk_size
            chunk_end = chunk_start + chunk_size
            chunk = input_audio[chunk_start:chunk_end].copy()

            output = plugin.process(chunk, sr)
            output_chunks.append(output)

        full_output = np.concatenate(output_chunks, axis=0)

        # Check for discontinuities
        diff = np.abs(np.diff(full_output, axis=0))
        max_diff = np.max(diff)

        assert max_diff < 0.05, (
            f"Detected discontinuity: max diff = {max_diff:.4f}. "
            f"Exponent smoothing may not be working."
        )

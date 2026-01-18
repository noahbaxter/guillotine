import numpy as np
from utils import peak, db_to_linear, settle_params


def generate_stereo_sine(left_amp, right_amp, freq=440, duration=1.0, sr=44100):
    """Generate stereo sine wave with different amplitudes per channel."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    left = (left_amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    right = (right_amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return np.column_stack([left, right])


class TestStereoLinkMode:
    """Tests for Stereo Link mode (L/R with linked gain reduction)."""

    def test_preserves_lr_ratio(self, make_plugin):
        """Stereo Link should preserve L/R amplitude ratio."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="Stereo Link", true_clip=False)
        settle_params(plugin)

        # Left loud (above ceiling), right quiet (below ceiling)
        input_audio = generate_stereo_sine(0.9, 0.3)
        output = plugin.process(input_audio, 44100)

        input_ratio = peak(input_audio[:, 0]) / peak(input_audio[:, 1])
        output_ratio = peak(output[:, 0]) / peak(output[:, 1])

        assert abs(input_ratio - output_ratio) < 0.1, \
            f"Stereo Link should preserve L/R ratio: input {input_ratio:.2f}, output {output_ratio:.2f}"

    def test_louder_channel_drives_both(self, make_plugin):
        """Louder channel should drive gain reduction on both channels."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="Stereo Link", true_clip=False)
        settle_params(plugin)

        ceiling = db_to_linear(-6.0)
        input_audio = generate_stereo_sine(0.9, 0.3)
        output = plugin.process(input_audio, 44100)

        # Left should be clipped to ceiling
        assert peak(output[:, 0]) <= ceiling + 0.01

        # Right should be reduced proportionally (not at ceiling, but reduced)
        # If ratio preserved and left at ceiling, right should be at ceiling * (0.3/0.9)
        expected_right_peak = ceiling * (0.3 / 0.9)
        assert abs(peak(output[:, 1]) - expected_right_peak) < 0.05


class TestLRMode:
    """Tests for L/R mode (independent channel processing)."""

    def test_channels_processed_independently(self, make_plugin):
        """Each channel should clip independently based on its own level."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="L/R", true_clip=True)
        settle_params(plugin)

        ceiling = db_to_linear(-6.0)

        # Left above ceiling, right below ceiling
        input_audio = generate_stereo_sine(0.9, 0.3)
        output = plugin.process(input_audio, 44100)

        # Left should be clipped to ceiling
        assert peak(output[:, 0]) <= ceiling + 0.01

        # Right should pass through unchanged (below ceiling)
        assert abs(peak(output[:, 1]) - 0.3) < 0.01, \
            f"Right channel should be unchanged at {0.3:.2f}, got {peak(output[:, 1]):.3f}"

    def test_both_channels_above_ceiling(self, make_plugin):
        """Both channels above ceiling should both be clipped independently."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="L/R", true_clip=True)
        settle_params(plugin)

        ceiling = db_to_linear(-6.0)

        # Both channels above ceiling but at different levels
        input_audio = generate_stereo_sine(0.9, 0.7)
        output = plugin.process(input_audio, 44100)

        # Both should be clipped to ceiling
        assert peak(output[:, 0]) <= ceiling + 0.01
        assert peak(output[:, 1]) <= ceiling + 0.01


class TestMSMode:
    """Tests for M/S mode (mid/side processing)."""

    def test_mono_signal_only_affects_mid(self, make_plugin):
        """A mono signal (L=R) should only have mid content, no side."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="M/S", true_clip=True)
        settle_params(plugin)

        # Mono signal: left == right
        t = np.linspace(0, 1.0, 44100, endpoint=False)
        mono = (0.9 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        input_audio = np.column_stack([mono, mono])

        output = plugin.process(input_audio, 44100)

        # Output should still be mono (L == R) after M/S round-trip
        diff = np.abs(output[:, 0] - output[:, 1])
        assert np.max(diff) < 0.001, "Mono signal should remain mono after M/S processing"

    def test_side_only_signal(self, make_plugin):
        """A side-only signal (L=-R) should only have side content."""
        plugin = make_plugin(ceiling_db=-6.0, stereo_mode="M/S", true_clip=True)
        settle_params(plugin)

        # Side-only signal: left = -right (180 degrees out of phase)
        t = np.linspace(0, 1.0, 44100, endpoint=False)
        left = (0.9 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        right = -left  # Inverted
        input_audio = np.column_stack([left, right])

        output = plugin.process(input_audio, 44100)

        # Output should still be side-only (L == -R) after M/S round-trip
        diff = np.abs(output[:, 0] + output[:, 1])
        assert np.max(diff) < 0.001, "Side-only signal should remain side-only after M/S processing"

    def test_ms_encodes_and_decodes_correctly(self, make_plugin):
        """M/S mode should encode, process, and decode without artifacts."""
        # Use bypass to verify encode/decode is transparent
        plugin = make_plugin(ceiling_db=0.0, stereo_mode="M/S", bypass_clipper=True)
        settle_params(plugin)

        # Complex stereo signal
        t = np.linspace(0, 1.0, 44100, endpoint=False)
        left = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        right = (0.3 * np.sin(2 * np.pi * 550 * t)).astype(np.float32)
        input_audio = np.column_stack([left, right])

        output = plugin.process(input_audio, 44100)

        # Should be unchanged when bypassed (M/S encode/decode is transparent)
        max_diff = np.max(np.abs(output - input_audio))
        assert max_diff < 0.001, f"M/S encode/decode should be transparent, max diff: {max_diff}"

    def test_mid_and_side_clip_independently(self, make_plugin):
        """Mid and side should clip at their own thresholds."""
        plugin = make_plugin(ceiling_db=-12.0, stereo_mode="M/S", true_clip=True)
        settle_params(plugin)

        ceiling = db_to_linear(-12.0)

        # Signal with strong mid and weak side
        # Mid = (L+R)/2, Side = (L-R)/2
        # L=0.8, R=0.6 -> Mid=0.7, Side=0.1
        input_audio = generate_stereo_sine(0.8, 0.6)

        output = plugin.process(input_audio, 44100)

        # Reconstruct mid/side from output to verify clipping
        mid = (output[:, 0] + output[:, 1]) / 2
        side = (output[:, 0] - output[:, 1]) / 2

        # Mid was 0.7, above ceiling 0.25, should be clipped
        assert peak(mid) <= ceiling + 0.01, f"Mid should be clipped to ceiling, got {peak(mid):.3f}"

        # Side was 0.1, below ceiling 0.25, should pass through
        # (approximately, since mid clipping affects the reconstruction)
        assert peak(side) < 0.15, f"Side should be relatively unchanged, got {peak(side):.3f}"

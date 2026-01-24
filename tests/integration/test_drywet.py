import numpy as np
from scipy import signal
from utils import generate_sine, rms, peak


def generate_white_noise(duration=0.5, sr=44100, amplitude=0.3, seed=42):
    """Generate white noise (tests all frequencies simultaneously)."""
    rng = np.random.default_rng(seed)
    samples = int(sr * duration)
    noise = amplitude * rng.uniform(-1, 1, samples)
    return noise.astype(np.float32).reshape(-1, 1)


def generate_single_impulse(delay_samples=1000, duration=0.1, sr=44100, amplitude=0.5):
    """Generate single impulse at specified delay."""
    samples = int(sr * duration)
    sig = np.zeros(samples, dtype=np.float32)
    if delay_samples < samples:
        sig[delay_samples] = amplitude
    return sig.reshape(-1, 1)


def compute_psd(audio, sr=44100, nperseg=2048):
    """Compute power spectral density."""
    freqs, psd = signal.welch(audio.flatten(), sr, nperseg=nperseg)
    return freqs, psd


def find_null_bins(freqs, psd, threshold_db=-20):
    """Find frequency bin indices with nulls (comb filtering artifacts)."""
    psd_db = 10 * np.log10(psd + 1e-12)
    median_db = np.median(psd_db)
    null_mask = psd_db < median_db + threshold_db
    return np.where(null_mask)[0]  # Return bin indices, not frequencies


def count_unique_nulls(nulls_a, nulls_b, nulls_c, tolerance_bins=2):
    """Count nulls in A that don't appear in B or C (within tolerance)."""
    unique_count = 0
    for idx in nulls_a:
        # Check if this null exists in B or C within tolerance
        in_b = np.any(np.abs(nulls_b - idx) <= tolerance_bins) if len(nulls_b) > 0 else False
        in_c = np.any(np.abs(nulls_c - idx) <= tolerance_bins) if len(nulls_c) > 0 else False
        if not in_b and not in_c:
            unique_count += 1
    return unique_count


# =============================================================================
# Phase Coherence Tests
# =============================================================================

def test_drywet_phase_coherence_whitenoise(make_plugin):
    """50% mix of white noise should NOT have comb filtering."""
    # White noise tests all frequencies simultaneously - more sensitive than chirp
    noise = generate_white_noise(duration=1.0, amplitude=0.3)

    # Process at 0%, 50%, 100% with 4x oversampling
    plugin_0 = make_plugin(oversampling="4x", dry_wet=0.0)
    plugin_50 = make_plugin(oversampling="4x", dry_wet=0.5)
    plugin_100 = make_plugin(oversampling="4x", dry_wet=1.0)

    out_0 = plugin_0.process(noise.copy(), 44100)
    out_50 = plugin_50.process(noise.copy(), 44100)
    out_100 = plugin_100.process(noise.copy(), 44100)

    # Compute PSDs with smaller segments for sharper frequency resolution
    _, psd_0 = compute_psd(out_0, nperseg=1024)
    _, psd_50 = compute_psd(out_50, nperseg=1024)
    freqs, psd_100 = compute_psd(out_100, nperseg=1024)

    # Find deep nulls - tighter threshold (-20dB instead of -30dB)
    nulls_50 = find_null_bins(freqs, psd_50, threshold_db=-20)
    nulls_0 = find_null_bins(freqs, psd_0, threshold_db=-20)
    nulls_100 = find_null_bins(freqs, psd_100, threshold_db=-20)

    # Nulls unique to 50% mix = comb filtering from phase mismatch
    unique_count = count_unique_nulls(nulls_50, nulls_0, nulls_100, tolerance_bins=2)

    # Stricter limit - any significant comb filtering should fail
    assert unique_count < 3, \
        f"Phase mismatch: 50% mix has {unique_count} comb nulls not present in 0% or 100%"


def test_drywet_coherent_summing_multifreq(make_plugin):
    """50% mix should sum coherently at multiple frequencies."""
    # Test multiple frequencies - phase errors show up more at high frequencies
    # 1 sample delay at 44.1kHz = 8° at 1kHz, but 82° at 10kHz
    test_freqs = [200, 1000, 5000, 10000]

    for freq in test_freqs:
        sine = generate_sine(freq=freq, amplitude=0.3, duration=0.5)
        input_rms = rms(sine)

        for os_level in ["1x", "2x", "4x", "8x"]:
            plugin = make_plugin(oversampling=os_level, dry_wet=0.5, ceiling_db=0.0)
            output = plugin.process(sine.copy(), 44100)
            output_rms = rms(output)

            # Tighter tolerance: 0.98-1.02 catches phase errors > ~10°
            # Old 0.95-1.05 allowed ~30° phase error to pass
            ratio = output_rms / input_rms
            assert 0.98 < ratio < 1.02, \
                f"{freq}Hz @ {os_level}: expected ~1.0x RMS, got {ratio:.3f}x (phase cancellation?)"


def test_drywet_impulse_no_preringing(make_plugin):
    """Impulse at 50% mix should not have energy before the impulse peak."""
    impulse = generate_single_impulse(delay_samples=500, amplitude=0.5)
    plugin = make_plugin(oversampling="4x", dry_wet=0.5)
    output = plugin.process(impulse.copy(), 44100)

    # Find the peak position
    peak_idx = np.argmax(np.abs(output))

    # Check for pre-ringing: significant energy before the peak
    # (Allow some samples for filter ringing, but not inverted latency)
    pre_peak = output[:max(0, peak_idx - 50)]
    post_peak = output[peak_idx:]

    if len(pre_peak) > 0 and len(post_peak) > 0:
        pre_energy = np.sum(pre_peak ** 2)
        post_energy = np.sum(post_peak ** 2)

        # Pre-ringing should be minimal compared to post-peak energy
        if post_energy > 0:
            ratio = pre_energy / post_energy
            assert ratio < 0.1, \
                f"Excessive pre-ringing: {ratio:.3f} ratio (possible inverted latency)"


# =============================================================================
# Dry/Wet Extremes Tests
# =============================================================================

def test_drywet_zero_is_dry(make_plugin):
    """0% wet should output dry signal (no clipping/ceiling applied)."""
    sine = generate_sine(amplitude=0.5, duration=0.5)
    input_rms = rms(sine)

    # Extreme settings that WOULD affect wet signal
    plugin = make_plugin(
        oversampling="4x",
        dry_wet=0.0,
        ceiling_db=-12.0,  # Would clip at -12dB (0.25 linear)
        curve="Hard"
    )

    output = plugin.process(sine.copy(), 44100)

    # 0% wet = dry path only = no clipping applied
    # Dry still goes through oversampler so there's filter coloration,
    # but amplitude/RMS should be preserved (no clipping or ceiling)
    output_rms = rms(output)
    rms_ratio = output_rms / input_rms

    assert 0.95 < rms_ratio < 1.05, \
        f"0% wet RMS changed: {rms_ratio:.3f}x (expected ~1.0, clipping would give ~0.5)"

    # Peak should be preserved (not clipped to ceiling)
    # Ceiling is -12dB = 0.25, input peak is 0.5
    assert peak(output) > 0.45, \
        f"0% wet signal was clipped: peak {peak(output):.3f} (expected ~0.5, ceiling is 0.25)"


def test_drywet_hundred_is_full_wet(make_plugin):
    """100% wet should be fully processed with no dry mixed in."""
    # Signal above ceiling to ensure clipping is audible
    sine = generate_sine(amplitude=0.9)

    plugin = make_plugin(
        oversampling="1x",
        dry_wet=1.0,
        ceiling_db=-6.0
    )

    output = plugin.process(sine.copy(), 44100)

    # 100% wet with ceiling at -6dB: output peak should be limited
    from utils import db_to_linear
    ceiling_linear = db_to_linear(-6.0)
    output_peak = peak(output)

    assert output_peak <= ceiling_linear + 0.01, \
        f"100% wet should be fully clipped: peak {output_peak:.3f} exceeds ceiling {ceiling_linear:.3f}"


def test_drywet_sweep_monotonic(make_plugin):
    """RMS should change monotonically as mix sweeps from 0% to 100%."""
    # Signal that clips significantly
    sine = generate_sine(amplitude=0.9)

    mix_values = [0.0, 0.25, 0.5, 0.75, 1.0]
    rms_values = []

    for mix in mix_values:
        plugin = make_plugin(oversampling="1x", dry_wet=mix, ceiling_db=-6.0)
        output = plugin.process(sine.copy(), 44100)
        rms_values.append(rms(output))

    # With clipping reducing amplitude, RMS should decrease as wet increases
    # Phase cancellation would cause unexpected dips at intermediate values
    for i in range(len(rms_values) - 1):
        # Tighter tolerance: -0.02 instead of -0.05
        # Phase cancellation at 50% would cause larger dips
        diff = rms_values[i] - rms_values[i + 1]
        assert diff >= -0.02, \
            f"Non-monotonic RMS: mix {mix_values[i]} -> {mix_values[i+1]}: " \
            f"RMS {rms_values[i]:.3f} -> {rms_values[i+1]:.3f}"

"""Test utilities for audio plugin testing."""
import numpy as np
import soundfile as sf


# =============================================================================
# Audio I/O
# =============================================================================

def load_audio(filepath):
    """Load audio file as 2D float32 array (samples, channels)."""
    audio, sr = sf.read(filepath, dtype='float32')
    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)
    return audio, sr


def generate_sine(freq=440.0, duration=1.0, sr=44100, amplitude=0.5, stereo=False):
    """Generate a sine wave for testing."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    sine = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    if stereo:
        return np.column_stack([sine, sine])
    return sine.reshape(-1, 1)


def generate_dc(level=0.5, duration=0.1, sr=44100, stereo=False):
    """Generate DC offset signal."""
    samples = int(sr * duration)
    dc = np.full(samples, level, dtype=np.float32)
    if stereo:
        return np.column_stack([dc, dc])
    return dc.reshape(-1, 1)


def generate_impulse(amplitude=1.0, duration=0.1, sr=44100, impulse_interval=0.01, stereo=False):
    """Generate impulse train (periodic clicks)."""
    samples = int(sr * duration)
    interval_samples = int(sr * impulse_interval)
    signal = np.zeros(samples, dtype=np.float32)
    for i in range(0, samples, interval_samples):
        signal[i] = amplitude
    if stereo:
        return np.column_stack([signal, signal])
    return signal.reshape(-1, 1)


def generate_square(freq=440.0, duration=1.0, sr=44100, amplitude=0.5, stereo=False):
    """Generate square wave."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    square = (amplitude * np.sign(np.sin(2 * np.pi * freq * t))).astype(np.float32)
    if stereo:
        return np.column_stack([square, square])
    return square.reshape(-1, 1)


def generate_intersample_test(amplitude=1.0, duration=0.1, sr=44100, stereo=False):
    """
    Generate signal designed to have intersample peaks.

    Uses a frequency where samples land off-peak, causing true peak
    to exceed sample peak. At sr/4 frequency, samples hit zero crossings
    and peaks are between samples.
    """
    freq = sr / 4.0  # Nyquist/2 - samples hit zero crossings
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Phase shift so samples land between peaks
    signal = (amplitude * np.sin(2 * np.pi * freq * t + np.pi/4)).astype(np.float32)
    if stereo:
        return np.column_stack([signal, signal])
    return signal.reshape(-1, 1)


# =============================================================================
# Audio Measurements
# =============================================================================

def rms(audio):
    """Calculate RMS of audio signal."""
    return np.sqrt(np.mean(audio ** 2))


def peak(audio):
    """Get peak absolute amplitude (sample peak)."""
    return np.max(np.abs(audio))


def true_peak(audio, oversample=4):
    """
    Calculate true peak using interpolation (ITU-R BS.1770 style).

    Upsamples by `oversample` factor to find intersample peaks.
    Default 4x matches broadcast standard measurement.
    """
    from scipy.signal import resample_poly

    audio = np.asarray(audio)
    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)

    max_peak = 0.0
    for ch in range(audio.shape[1]):
        upsampled = resample_poly(audio[:, ch], oversample, 1)
        ch_peak = np.max(np.abs(upsampled))
        max_peak = max(max_peak, ch_peak)

    return max_peak


def measure_peaks(audio):
    """Return both sample peak and true peak as dict."""
    return {
        'sample_peak': peak(audio),
        'true_peak': true_peak(audio),
        'sample_peak_db': linear_to_db(peak(audio)),
        'true_peak_db': linear_to_db(true_peak(audio)),
    }


def measure_latency(plugin, sr=44100):
    """
    Measure plugin latency by finding impulse delay.

    Returns latency in samples.
    """
    # Generate impulse at known position
    impulse_pos = 1000
    signal = np.zeros(4096, dtype=np.float32).reshape(-1, 1)
    signal[impulse_pos] = 1.0

    output = plugin.process(signal, sr)

    # Find where the impulse appears in output
    output_pos = np.argmax(np.abs(output))
    return output_pos - impulse_pos


def align_signals(input_signal, output_signal, latency):
    """
    Align input and output signals accounting for latency.

    Trims both signals to comparable regions.
    """
    if latency >= 0:
        # Output is delayed - trim start of output, end of input
        aligned_output = output_signal[latency:]
        aligned_input = input_signal[:len(aligned_output)]
    else:
        # Output is ahead (shouldn't happen but handle it)
        aligned_input = input_signal[-latency:]
        aligned_output = output_signal[:len(aligned_input)]

    # Ensure same length
    min_len = min(len(aligned_input), len(aligned_output))
    return aligned_input[:min_len], aligned_output[:min_len]


def db_to_linear(db):
    """Convert dB to linear gain."""
    return 10 ** (db / 20)


def linear_to_db(linear):
    """Convert linear gain to dB."""
    return 20 * np.log10(linear + 1e-10)  # Avoid log(0)


# =============================================================================
# Comparison Utilities
# =============================================================================

def samples_equal(actual, expected, tolerance_db=-80):
    """
    Compare audio samples with dB tolerance.

    Args:
        actual: Actual audio array
        expected: Expected audio array
        tolerance_db: Max allowed difference in dB (default -80dB ≈ 0.0001)

    Returns:
        Tuple of (passed, message)
    """
    if actual.shape != expected.shape:
        return False, f"Shape mismatch: {actual.shape} vs {expected.shape}"

    diff = np.abs(actual - expected)
    max_diff = np.max(diff)
    tolerance_linear = db_to_linear(tolerance_db)

    if max_diff <= tolerance_linear:
        return True, f"Max diff: {linear_to_db(max_diff):.1f}dB (threshold: {tolerance_db}dB)"
    else:
        return False, f"Max diff: {linear_to_db(max_diff):.1f}dB exceeds threshold: {tolerance_db}dB"


def approx_equal(actual, expected, tolerance=1e-4):
    """
    Compare values with absolute tolerance.

    Args:
        actual: Actual value (scalar or array)
        expected: Expected value (scalar or array)
        tolerance: Max allowed absolute difference

    Returns:
        Tuple of (passed, message)
    """
    diff = np.abs(np.asarray(actual) - np.asarray(expected))
    max_diff = np.max(diff)

    if max_diff <= tolerance:
        return True, f"Max diff: {max_diff:.2e} (threshold: {tolerance:.2e})"
    else:
        return False, f"Max diff: {max_diff:.2e} exceeds threshold: {tolerance:.2e}"


def rms_ratio_approx(actual_audio, expected_ratio, tolerance=0.02):
    """
    Check if RMS changed by expected ratio (e.g., 0.5 for -6dB, 2.0 for +6dB).

    Args:
        actual_audio: Processed audio
        expected_ratio: Expected amplitude ratio
        tolerance: Allowed deviation from ratio

    Returns:
        Tuple of (passed, actual_ratio, message)
    """
    # Compare to unit amplitude sine
    input_rms = rms(generate_sine())
    actual_rms = rms(actual_audio)
    actual_ratio = actual_rms / input_rms

    passed = abs(actual_ratio - expected_ratio) <= tolerance
    msg = f"Expected ratio: {expected_ratio:.3f}, got: {actual_ratio:.3f}"
    return passed, actual_ratio, msg

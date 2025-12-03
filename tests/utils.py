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


def generate_sine(freq=440.0, duration=1.0, sr=44100, amplitude=0.5):
    """Generate a sine wave for testing."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    sine = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    return sine.reshape(-1, 1)


# =============================================================================
# Audio Measurements
# =============================================================================

def rms(audio):
    """Calculate RMS of audio signal."""
    return np.sqrt(np.mean(audio ** 2))


def peak(audio):
    """Get peak absolute amplitude."""
    return np.max(np.abs(audio))


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

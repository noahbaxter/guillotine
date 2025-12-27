#!/usr/bin/env python3
"""
Objective comparison of oversampling implementations.

Metrics measured:
1. Intersample peak control - How well does it catch peaks between samples?
2. Aliasing rejection - How much harmonic aliasing does clipping introduce?
3. Signal transparency - How much does the filter color the sound?
4. Latency - Processing delay introduced
5. CPU usage - Relative processing time
6. Transient preservation - How well are transients maintained?
7. Frequency response - Passband flatness and rolloff
8. THD (Total Harmonic Distortion) - Distortion added by the filter itself

Run with: python tests/compare_oversampling.py
"""

import numpy as np
import scipy.signal as sig
from pathlib import Path
import sys
import time

# Add tests dir to path for utils
sys.path.insert(0, str(Path(__file__).parent))

try:
    from pedalboard import load_plugin
except ImportError:
    print("ERROR: pedalboard not installed. Run: pip install pedalboard")
    sys.exit(1)


# =============================================================================
# Utility Functions
# =============================================================================

def db_to_linear(db):
    return 10 ** (db / 20)

def linear_to_db(lin):
    return 20 * np.log10(np.maximum(lin, 1e-10))

def true_peak(signal):
    """ITU-R BS.1770 true peak measurement (4x oversampled)."""
    if signal.ndim == 1:
        signal = signal.reshape(1, -1)
    upsampled = sig.resample_poly(signal, 4, 1, axis=-1)
    return np.max(np.abs(upsampled))

def rms(signal):
    """RMS level of signal."""
    return np.sqrt(np.mean(signal ** 2))


# =============================================================================
# Test Signal Generators
# =============================================================================

def generate_intersample_test(amplitude=1.0, sr=44100, duration=0.5):
    """
    Generate worst-case intersample peak signal.
    Uses frequency where samples land at zero crossings, so true peak >> sample peak.
    """
    freq = sr / 4.0  # Samples hit zero crossings
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    signal = amplitude * np.sin(2 * np.pi * freq * t + np.pi/4)
    return np.stack([signal, signal]).astype(np.float32)


def generate_aliasing_test(amplitude=1.0, sr=44100, duration=0.5):
    """
    Generate signal that will create aliasing when clipped.
    Low frequency sine that will be hard-clipped, creating harmonics.
    """
    freq = 1000.0  # 1kHz fundamental
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    signal = amplitude * np.sin(2 * np.pi * freq * t)
    return np.stack([signal, signal]).astype(np.float32)


def generate_transparency_test(amplitude=0.1, sr=44100, duration=0.5):
    """
    Generate quiet signal to test filter transparency (no clipping should occur).
    Pink noise at low level.
    """
    n_samples = int(sr * duration)
    # Generate white noise
    white = np.random.randn(2, n_samples).astype(np.float32)
    # Apply pink filter (1/f rolloff)
    b, a = sig.butter(1, 0.01)
    pink = sig.lfilter(b, a, white, axis=-1)
    # Normalize and scale
    pink = pink / np.max(np.abs(pink)) * amplitude
    return pink.astype(np.float32)


def generate_impulse(sr=44100, duration=0.1):
    """Generate impulse for latency measurement."""
    n_samples = int(sr * duration)
    signal = np.zeros((2, n_samples), dtype=np.float32)
    signal[:, n_samples // 4] = 0.5  # Impulse at 1/4 through buffer
    return signal


def generate_transient_test(sr=44100, duration=0.5):
    """
    Generate signal with sharp transients to test transient preservation.
    Uses a series of clicks/impulses with varying spacing.
    """
    n_samples = int(sr * duration)
    signal = np.zeros((2, n_samples), dtype=np.float32)
    
    # Add impulses at various positions
    for i in range(10):
        pos = int(n_samples * (i + 1) / 12)
        # Short burst (attack transient)
        burst_len = int(sr * 0.001)  # 1ms burst
        t = np.linspace(0, 1, burst_len)
        burst = 0.3 * np.sin(2 * np.pi * 1000 * t) * np.exp(-t * 10)
        signal[:, pos:pos+burst_len] = burst.astype(np.float32)
    
    return signal


def generate_sweep(sr=44100, duration=1.0, f_start=20, f_end=20000):
    """Generate logarithmic sine sweep for frequency response measurement."""
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)
    
    # Log sweep
    k = (f_end / f_start) ** (1 / duration)
    phase = 2 * np.pi * f_start * (k ** t - 1) / np.log(k)
    signal = 0.1 * np.sin(phase)  # Low level to avoid clipping
    
    return np.stack([signal, signal]).astype(np.float32)


def generate_multitone(sr=44100, duration=0.5):
    """Generate multitone signal for THD measurement (no clipping level)."""
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)
    
    # Use frequencies that don't create intermodulation at harmonic frequencies
    freqs = [1000, 1500, 2000]  # Hz
    signal = np.zeros(n_samples, dtype=np.float32)
    for f in freqs:
        signal += 0.05 * np.sin(2 * np.pi * f * t)
    
    return np.stack([signal, signal]).astype(np.float32)


# =============================================================================
# Measurement Functions
# =============================================================================

def measure_intersample_control(plugin, ceiling_db=-6.0, sr=44100):
    """
    Measure intersample peak overshoot.
    Returns overshoot in dB (0 = perfect, positive = overshoot).
    """
    ceiling_linear = db_to_linear(ceiling_db)
    
    # Generate signal with true peak well above ceiling
    input_signal = generate_intersample_test(
        amplitude=ceiling_linear * 4.0,  # ~12dB over ceiling
        sr=sr,
        duration=0.3
    )
    
    plugin.ceiling_db = ceiling_db
    plugin.enforce_ceiling = False  # Measure pure clipper+filter behavior
    
    output = plugin.process(input_signal.copy(), sr)
    output_tp = true_peak(output)
    
    overshoot_db = linear_to_db(output_tp / ceiling_linear)
    return overshoot_db


def measure_aliasing(plugin, ceiling_db=-6.0, sr=44100):
    """
    Measure aliasing introduced by clipping.
    Returns aliasing level in dB relative to fundamental.
    
    Method: Clip a 1kHz sine, measure energy in frequency bins that
    should contain aliased harmonics (folded back from above Nyquist).
    """
    ceiling_linear = db_to_linear(ceiling_db)
    
    # Generate 1kHz sine that will be heavily clipped
    input_signal = generate_aliasing_test(
        amplitude=ceiling_linear * 4.0,  # Hard clipping
        sr=sr,
        duration=0.5
    )
    
    plugin.ceiling_db = ceiling_db
    plugin.enforce_ceiling = False
    
    output = plugin.process(input_signal.copy(), sr)
    
    # Analyze spectrum
    fft = np.fft.rfft(output[0])
    freqs = np.fft.rfftfreq(len(output[0]), 1/sr)
    magnitudes = np.abs(fft)
    
    # Find fundamental (1kHz)
    fund_idx = np.argmin(np.abs(freqs - 1000))
    fund_mag = magnitudes[fund_idx]
    
    # Aliased harmonics appear at: Nyquist - (harmonic - Nyquist)
    # For 1kHz fundamental, harmonics are 2k, 3k, 4k... 
    # At 44.1kHz, Nyquist=22.05kHz
    # 23kHz folds to 21.1kHz, 24kHz folds to 20.1kHz, etc.
    nyquist = sr / 2
    alias_freqs = []
    for h in range(23, 45):  # Harmonics that fold back
        harmonic_freq = h * 1000
        if harmonic_freq > nyquist:
            aliased = nyquist - (harmonic_freq - nyquist)
            if 100 < aliased < nyquist - 100:  # Avoid DC and Nyquist
                alias_freqs.append(aliased)
    
    # Measure energy at aliased frequencies
    alias_energy = 0
    for af in alias_freqs:
        idx = np.argmin(np.abs(freqs - af))
        alias_energy += magnitudes[idx] ** 2
    
    alias_mag = np.sqrt(alias_energy) if alias_energy > 0 else 1e-10
    alias_db = linear_to_db(alias_mag / fund_mag)
    
    return alias_db


def measure_transparency(plugin, sr=44100):
    """
    Measure filter transparency (coloration) when no clipping occurs.
    Returns deviation in dB (0 = perfect transparency).
    """
    input_signal = generate_transparency_test(amplitude=0.05, sr=sr, duration=0.5)
    
    plugin.ceiling_db = 0.0  # Full scale ceiling - signal won't clip
    plugin.enforce_ceiling = False
    
    output = plugin.process(input_signal.copy(), sr)
    
    # Compare RMS levels (should be nearly identical)
    # Account for filter latency by trimming edges
    trim = int(sr * 0.05)  # 50ms
    input_trimmed = input_signal[:, trim:-trim]
    output_trimmed = output[:, trim:-trim]
    
    input_rms = rms(input_trimmed)
    output_rms = rms(output_trimmed)
    
    deviation_db = linear_to_db(output_rms / input_rms)
    return deviation_db


def measure_latency(plugin, sr=44100):
    """
    Measure actual latency in samples.
    Returns (reported_latency, measured_latency).
    """
    input_signal = generate_impulse(sr=sr, duration=0.1)
    
    plugin.ceiling_db = 0.0
    plugin.enforce_ceiling = False
    
    # Get reported latency (try different attribute names)
    try:
        reported = plugin.latency_samples
    except AttributeError:
        try:
            reported = int(plugin.get_latency_samples())
        except:
            reported = 0  # Will measure instead
    
    # Process and find impulse
    output = plugin.process(input_signal.copy(), sr)
    
    # Find peak in output
    input_peak_idx = np.argmax(np.abs(input_signal[0]))
    output_peak_idx = np.argmax(np.abs(output[0]))
    
    measured = output_peak_idx - input_peak_idx
    
    return reported, measured


def measure_cpu(plugin, sr=44100, iterations=20):
    """
    Measure relative CPU usage.
    Returns average processing time in milliseconds per buffer.
    """
    # Use realistic buffer size
    buffer_size = 512
    duration = buffer_size / sr
    n_samples = buffer_size
    
    # Generate test signal (pink noise, moderate level)
    np.random.seed(42)
    test_signal = np.random.randn(2, n_samples).astype(np.float32) * 0.3
    
    plugin.ceiling_db = -6.0
    plugin.enforce_ceiling = False
    
    # Warmup
    for _ in range(5):
        plugin.process(test_signal.copy(), sr)
    
    # Measure
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        plugin.process(test_signal.copy(), sr)
        end = time.perf_counter()
        times.append((end - start) * 1000)  # Convert to ms
    
    return np.mean(times), np.std(times)


def measure_transient_preservation(plugin, sr=44100):
    """
    Measure how well transients are preserved.
    Returns correlation coefficient (1.0 = perfect preservation).
    """
    input_signal = generate_transient_test(sr=sr, duration=0.3)
    
    plugin.ceiling_db = 0.0  # No clipping
    plugin.enforce_ceiling = False
    
    output = plugin.process(input_signal.copy(), sr)
    
    # Compute envelope of input and output
    def envelope(sig):
        analytic = sig.hilbert(sig)
        return np.abs(analytic)
    
    # Use simple peak detection instead of Hilbert
    def peak_envelope(sig, window=64):
        """Simple peak envelope follower."""
        n = len(sig)
        env = np.zeros(n)
        for i in range(n):
            start = max(0, i - window // 2)
            end = min(n, i + window // 2)
            env[i] = np.max(np.abs(sig[start:end]))
        return env
    
    # Compare envelopes (ignoring edges due to latency)
    trim = int(sr * 0.02)  # 20ms
    in_env = peak_envelope(input_signal[0, trim:-trim])
    out_env = peak_envelope(output[0, trim:-trim])
    
    # Normalize
    in_env = in_env / (np.max(in_env) + 1e-10)
    out_env = out_env / (np.max(out_env) + 1e-10)
    
    # Cross-correlation at zero lag
    correlation = np.corrcoef(in_env, out_env)[0, 1]
    
    return correlation


def measure_frequency_response(plugin, sr=44100):
    """
    Measure frequency response flatness.
    Returns (max_deviation_db, rolloff_freq_hz).
    Rolloff freq is where response drops 3dB.
    """
    input_signal = generate_sweep(sr=sr, duration=1.0, f_start=20, f_end=20000)
    
    plugin.ceiling_db = 0.0  # No clipping
    plugin.enforce_ceiling = False
    
    output = plugin.process(input_signal.copy(), sr)
    
    # Compute transfer function via FFT
    n = len(input_signal[0])
    in_fft = np.fft.rfft(input_signal[0])
    out_fft = np.fft.rfft(output[0])
    freqs = np.fft.rfftfreq(n, 1/sr)
    
    # Avoid division by zero
    in_fft_safe = np.where(np.abs(in_fft) > 1e-10, in_fft, 1e-10)
    transfer = np.abs(out_fft) / np.abs(in_fft_safe)
    transfer_db = 20 * np.log10(transfer + 1e-10)
    
    # Find passband (100Hz to 10kHz)
    passband_mask = (freqs >= 100) & (freqs <= 10000)
    passband_db = transfer_db[passband_mask]
    
    # Max deviation in passband
    if len(passband_db) > 0:
        max_dev = np.max(np.abs(passband_db - np.mean(passband_db)))
    else:
        max_dev = 0.0
    
    # Find -3dB rolloff point
    ref_level = np.mean(transfer_db[(freqs >= 100) & (freqs <= 1000)])
    rolloff_mask = transfer_db < (ref_level - 3)
    rolloff_freqs = freqs[rolloff_mask]
    
    if len(rolloff_freqs) > 0 and rolloff_freqs[0] > 1000:
        rolloff_hz = rolloff_freqs[0]
    else:
        rolloff_hz = sr / 2  # No rolloff detected
    
    return max_dev, rolloff_hz


def measure_thd(plugin, sr=44100):
    """
    Measure THD added by the oversampling filter itself (no clipping).
    Returns THD in dB.
    """
    # Single pure tone
    duration = 0.5
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)
    freq = 1000  # 1kHz
    input_signal = 0.1 * np.sin(2 * np.pi * freq * t)  # Low level, no clipping
    input_signal = np.stack([input_signal, input_signal]).astype(np.float32)
    
    plugin.ceiling_db = 0.0  # No clipping
    plugin.enforce_ceiling = False
    
    output = plugin.process(input_signal.copy(), sr)
    
    # FFT analysis
    fft = np.fft.rfft(output[0])
    freqs = np.fft.rfftfreq(len(output[0]), 1/sr)
    magnitudes = np.abs(fft)
    
    # Find fundamental
    fund_idx = np.argmin(np.abs(freqs - freq))
    fund_mag = magnitudes[fund_idx]
    
    # Sum harmonic energy (2nd through 10th harmonic)
    harmonic_energy = 0
    for h in range(2, 11):
        h_freq = freq * h
        if h_freq < sr / 2:
            h_idx = np.argmin(np.abs(freqs - h_freq))
            harmonic_energy += magnitudes[h_idx] ** 2
    
    thd_linear = np.sqrt(harmonic_energy) / (fund_mag + 1e-10)
    thd_db = 20 * np.log10(thd_linear + 1e-10)
    
    return thd_db


# =============================================================================
# Main Comparison
# =============================================================================

def run_comparison():
    plugin_path = Path(__file__).parent.parent / "Builds/MacOSX/build/Release/Guillotine.vst3"
    if not plugin_path.exists():
        # Try installed location
        plugin_path = Path.home() / "Library/Audio/Plug-Ins/VST3/Guillotine.vst3"
    
    if not plugin_path.exists():
        print(f"ERROR: Plugin not found at {plugin_path}")
        print("Run ./scripts/build.sh first")
        sys.exit(1)
    
    plugin_path = str(plugin_path)
    
    # Available modes (based on current build)
    os_modes = ["1x", "2x", "4x", "8x", "16x", "32x"]
    filter_types = ["Minimum Phase", "Linear Phase"]
    
    print("=" * 80)
    print("OVERSAMPLING COMPARISON TEST")
    print("=" * 80)
    print()
    print("Testing plugin at:", plugin_path)
    print()
    
    # Check which modes are available
    test_plugin = load_plugin(plugin_path)
    available_os = []
    for mode in os_modes:
        try:
            test_plugin.oversampling = mode
            available_os.append(mode)
        except:
            pass
    
    print(f"Available oversampling modes: {available_os}")
    print()
    
    # Results storage
    results = {}
    
    # Run tests for each configuration
    for filter_type in filter_types:
        print(f"\n{'='*40}")
        print(f"Filter: {filter_type}")
        print(f"{'='*40}")
        
        for os_mode in available_os:
            key = f"{os_mode} {filter_type}"
            
            try:
                plugin = load_plugin(plugin_path)
                plugin.bypass_clipper = False
                plugin.sharpness = 1.0  # Hard clip
                plugin.oversampling = os_mode
                plugin.filter_type = filter_type
                plugin.input_gain_db = 0.0
                plugin.output_gain_db = 0.0
                
                # Measure all metrics
                intersample = measure_intersample_control(plugin)
                aliasing = measure_aliasing(plugin)
                transparency = measure_transparency(plugin)
                reported_lat, measured_lat = measure_latency(plugin)
                cpu_mean, cpu_std = measure_cpu(plugin)
                thd = measure_thd(plugin)
                freq_dev, rolloff = measure_frequency_response(plugin)
                
                # Transient test can be slow, skip for now
                # transient = measure_transient_preservation(plugin)
                
                results[key] = {
                    'intersample_db': intersample,
                    'aliasing_db': aliasing,
                    'transparency_db': transparency,
                    'latency_reported': reported_lat,
                    'latency_measured': measured_lat,
                    'cpu_ms': cpu_mean,
                    'cpu_std': cpu_std,
                    'thd_db': thd,
                    'freq_dev_db': freq_dev,
                    'rolloff_hz': rolloff,
                }
                
                print(f"\n{os_mode}:")
                print(f"  Intersample overshoot: {intersample:+.2f} dB")
                print(f"  Aliasing rejection:    {aliasing:.1f} dB")
                print(f"  THD (filter only):     {thd:.1f} dB")
                print(f"  Freq response dev:     {freq_dev:.2f} dB")
                print(f"  Rolloff (-3dB):        {rolloff:.0f} Hz")
                print(f"  CPU time:              {cpu_mean:.3f} ms (±{cpu_std:.3f})")
                print(f"  Latency:               {measured_lat} samples")
                
            except Exception as e:
                import traceback
                print(f"\n{os_mode}: ERROR - {e}")
                traceback.print_exc()
    
    # Summary table
    print("\n")
    print("=" * 100)
    print("SUMMARY TABLE")
    print("=" * 100)
    print()
    print(f"{'Mode':<20} {'Intersamp':>10} {'Aliasing':>10} {'THD':>10} {'FreqDev':>10} {'CPU':>10} {'Latency':>10}")
    print(f"{'':20} {'(dB)':>10} {'(dB)':>10} {'(dB)':>10} {'(dB)':>10} {'(ms)':>10} {'(samp)':>10}")
    print("-" * 100)
    
    for key, data in sorted(results.items()):
        print(f"{key:<20} {data['intersample_db']:>+10.2f} {data['aliasing_db']:>10.1f} {data['thd_db']:>10.1f} {data['freq_dev_db']:>10.2f} {data['cpu_ms']:>10.3f} {data['latency_measured']:>10}")
    
    print()
    print("INTERPRETATION:")
    print("  - Intersample: Lower is better. 0dB = perfect peak control.")
    print("  - Aliasing: Lower (more negative) is better. Shows harmonic foldback level.")
    print("  - THD: Lower (more negative) is better. Distortion added by filter itself.")
    print("  - FreqDev: Lower is better. Deviation from flat frequency response.")
    print("  - CPU: Lower is better. Processing time per 512-sample buffer.")
    print("  - Latency: Lower is better for real-time use.")
    
    return results


if __name__ == "__main__":
    run_comparison()

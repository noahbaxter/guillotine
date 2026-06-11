#!/usr/bin/env python3
"""
Offline analysis of match-mode gain compensation across all clipping curves,
ceiling values, and reference signal shapes/crest factors.

Tests multiple signal shapes (Gaussian, exponential decay, repeated transients)
at the same crest factor to validate that shape doesn't matter (or find where it does).

Usage:
  python3 scripts/analyze_gain_compensation.py
  python3 scripts/analyze_gain_compensation.py --csv
  python3 scripts/analyze_gain_compensation.py --input-gain 6
"""

import argparse
import math
import sys

# ---------------------------------------------------------------------------
# Clipping curves (mirrors src/dsp/SaturatorCurves.h / web/lib/saturation-curves.js)
# ---------------------------------------------------------------------------

def hard(x):
    return max(-1.0, min(1.0, x))

def quintic(x):
    ax = abs(x)
    if ax < 1.25:
        x2 = x * x
        x5 = x2 * x2 * x
        return x - (256 / 3125) * x5
    return 1.0 if x >= 0 else -1.0

def cubic(x):
    ax = abs(x)
    if ax < 1.5:
        x3 = x * x * x
        return x - (4 / 27) * x3
    return 1.0 if x >= 0 else -1.0

def tanh_curve(x):
    return math.tanh(x)

def arctan_curve(x):
    return (2 / math.pi) * math.atan(x)

def knee(x, exponent=2.0):
    ax = abs(x)
    sign = 1.0 if x >= 0 else -1.0
    sharpness = (4.0 - exponent) / 3.0
    knee_width = (1.0 - sharpness) * 0.95
    knee_start = 1.0 - knee_width
    if ax <= knee_start:
        return x
    if ax > 1.0:
        return sign
    t = (ax - knee_start) / knee_width
    compressed = knee_start + knee_width * t * t
    return sign * compressed

def tsquared(x, exponent=2.0):
    ax = abs(x)
    powered = ax ** exponent
    if powered > 1:
        return 1.0 if x >= 0 else -1.0
    return powered if x >= 0 else -powered

CURVES = {
    "Hard":    (lambda x, _exp: hard(x)),
    "Quintic": (lambda x, _exp: quintic(x)),
    "Cubic":   (lambda x, _exp: cubic(x)),
    "Tanh":    (lambda x, _exp: tanh_curve(x)),
    "Arctan":  (lambda x, _exp: arctan_curve(x)),
    "Knee":    (lambda x, exp: knee(x, exp)),
    "T2":      (lambda x, exp: tsquared(x, exp)),
}

def apply_with_ceiling(curve_fn, sample, ceiling, exponent=2.0):
    if ceiling <= 0:
        return 0.0
    normalized = sample / ceiling
    curved = curve_fn(normalized, exponent)
    return curved * ceiling

# ---------------------------------------------------------------------------
# Reference signal generation — multiple shapes
# ---------------------------------------------------------------------------

N_SAMPLES = 65536

def measure_crest_factor(samples):
    peak = max(abs(v) for v in samples)
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    if rms <= 0 or peak <= 0:
        return 0.0
    return 20 * math.log10(peak / rms)

def scale_to_peak(samples, target_peak=1.0):
    """Scale samples so peak = target_peak."""
    peak = max(abs(v) for v in samples)
    if peak <= 0:
        return samples
    scale = target_peak / peak
    return [v * scale for v in samples]


# --- Shape generators (all produce signals with peak=1.0) ---

def gen_sine():
    """Half sine wave. CF ≈ 3dB."""
    samples = [math.sin(math.pi * (i + 0.5) / N_SAMPLES) for i in range(N_SAMPLES)]
    return samples, "sine"

def gen_gaussian(alpha):
    """Symmetric Gaussian pulse. Smooth, bell-shaped."""
    samples = [math.exp(-alpha * ((i + 0.5) / N_SAMPLES - 0.5) ** 2) for i in range(N_SAMPLES)]
    return samples, f"gauss(a={alpha:.0f})"

def gen_exp_decay(rate):
    """Exponential decay from peak — like a drum transient.
    Sharp attack at t=0, exponential decay: exp(-rate * t)."""
    samples = [math.exp(-rate * (i + 0.5) / N_SAMPLES) for i in range(N_SAMPLES)]
    return scale_to_peak(samples), f"decay(r={rate:.0f})"

def gen_repeated_transients(n_hits, decay_rate):
    """Multiple drum hits evenly spaced, each with exponential decay.
    More realistic than single transient — mimics a drum loop.
    Enforces minimum decay: each hit must decay to <10% before the next one."""
    samples = [0.0] * N_SAMPLES
    hit_spacing = N_SAMPLES // n_hits
    # Enforce minimum decay rate: exp(-r) < 0.1 → r > ln(10) ≈ 2.3
    # Each hit decays over hit_spacing samples normalized to t ∈ [0,1]
    # so exp(-rate * 1.0) < 0.1 → rate > ln(10) ≈ 2.3
    min_rate = math.log(10)  # ~2.302, ensures decay to <10%
    effective_rate = max(decay_rate, min_rate)
    for hit in range(n_hits):
        start = hit * hit_spacing
        for i in range(hit_spacing):
            idx = start + i
            if idx < N_SAMPLES:
                t = i / hit_spacing
                samples[idx] += math.exp(-effective_rate * t)
    return scale_to_peak(samples), f"hits({n_hits}x,r={effective_rate:.1f})"

def gen_noise_shaped(target_cf_db):
    """Pseudo-random signal shaped to a target crest factor.
    Uses a simple LCG for reproducibility (no numpy dependency).
    Generates noise, then scales the amplitude envelope to hit the target CF."""
    # LCG pseudo-random
    seed = 42
    raw = []
    for _ in range(N_SAMPLES):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        raw.append((seed / 0x7FFFFFFF) * 2.0 - 1.0)

    # Sort by absolute value descending, scale top samples to be peaks
    # and reduce the rest to hit target CF
    # CF = peak / rms, so rms = peak / 10^(CF/20)
    target_rms = 1.0 / (10 ** (target_cf_db / 20))

    # Scale: keep peak samples at 1.0, reduce bulk
    # Simple approach: clip bulk to a max level that gives target RMS
    raw = scale_to_peak(raw)
    # Binary search for a soft-clip threshold that gives target CF
    lo, hi = 0.001, 1.0
    best_samples = raw
    for _ in range(100):
        mid = (lo + hi) / 2
        clipped = [max(-mid, min(mid, v)) for v in raw]
        # Keep original peaks by blending: top 1% stays unclipped
        threshold_idx = int(N_SAMPLES * 0.99)
        abs_sorted = sorted(range(N_SAMPLES), key=lambda i: abs(raw[i]), reverse=True)
        result = list(clipped)
        for idx in abs_sorted[:N_SAMPLES - threshold_idx]:
            result[idx] = raw[idx]
        result = scale_to_peak(result)
        cf = measure_crest_factor(result)
        if cf < target_cf_db:
            hi = mid
        else:
            lo = mid
            best_samples = result
        if abs(cf - target_cf_db) < 0.1:
            best_samples = result
            break

    return best_samples, f"noise(cf≈{measure_crest_factor(best_samples):.0f})"


def find_param_for_crest(generator_fn, target_db, param_lo, param_hi, tol=0.1):
    """Binary search a generator's parameter to hit a target crest factor."""
    for _ in range(200):
        mid = math.exp((math.log(max(param_lo, 0.01)) + math.log(param_hi)) / 2)
        samples, _ = generator_fn(mid)
        cf = measure_crest_factor(samples)
        if cf < target_db:
            param_lo = mid
        else:
            param_hi = mid
        if abs(cf - target_db) < tol:
            break
    return mid

# ---------------------------------------------------------------------------
# Gain compensation calculation (mirrors computeAutoGain)
# ---------------------------------------------------------------------------

def compute_compensation(curve_fn, ref_samples, ceiling_db, input_gain_db, exponent=2.0):
    ceil_lin = 10 ** (ceiling_db / 20)
    input_lin = 10 ** (input_gain_db / 20)

    sum_sq_orig = 0.0
    sum_sq_clip = 0.0

    for s in ref_samples:
        driven = s * input_lin
        clipped = apply_with_ceiling(curve_fn, driven, ceil_lin, exponent)
        sum_sq_orig += s * s
        sum_sq_clip += clipped * clipped

    n = len(ref_samples)
    rms_orig = math.sqrt(sum_sq_orig / n)
    rms_clip = math.sqrt(sum_sq_clip / n)

    if rms_clip <= 0 or rms_orig <= 0:
        return 0.0

    return 20 * math.log10(rms_orig / rms_clip)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_candidates(args):
    """Phase 1: Compare candidate reference signals for transient and tonal match modes."""
    print("=" * 95)
    print("PHASE 1: Candidate reference signal comparison")
    print("=" * 95)
    print(f"Input gain: {args.input_gain:+.1f} dB\n")

    key_ceilings = [-3, -6, -12, -18, -24]

    # --- Generate candidates ---
    transient_cfs = [8, 10, 12, 15]
    tonal_cfs = [3, 4, 5, 6]

    print("Generating candidate signals...", file=sys.stderr)

    transient_candidates = []
    for target_cf in transient_cfs:
        rate = find_param_for_crest(gen_exp_decay, target_cf, 0.1, 1e6)
        samples, desc = gen_exp_decay(rate)
        cf = measure_crest_factor(samples)
        transient_candidates.append((f"decay CF{target_cf}", samples, cf, rate))
        print(f"  Transient CF {target_cf}dB → rate={rate:.1f}, actual={cf:.2f}dB", file=sys.stderr)

    tonal_candidates = []
    for target_cf in tonal_cfs:
        alpha = find_param_for_crest(gen_gaussian, target_cf, 0.01, 1e6)
        samples, desc = gen_gaussian(alpha)
        cf = measure_crest_factor(samples)
        tonal_candidates.append((f"gauss CF{target_cf}", samples, cf, alpha))
        print(f"  Tonal CF {target_cf}dB → alpha={alpha:.1f}, actual={cf:.2f}dB", file=sys.stderr)

    # Also generate repeated transients (now with fixed decay) for validation
    repeat_candidates = []
    for n_hits in [4, 8, 16]:
        for target_cf in [10, 12]:
            rate = find_param_for_crest(lambda r: gen_repeated_transients(n_hits, r), target_cf, 0.1, 1e6)
            samples, desc = gen_repeated_transients(n_hits, rate)
            cf = measure_crest_factor(samples)
            repeat_candidates.append((f"{n_hits}x CF{target_cf}", samples, cf))
            print(f"  {n_hits}x hits CF {target_cf}dB → rate={rate:.1f}, actual={cf:.2f}dB", file=sys.stderr)

    # Current reference (sine, ~3dB CF) for comparison
    sine_samples, _ = gen_sine()
    sine_cf = measure_crest_factor(sine_samples)

    all_curves = list(CURVES.keys())

    # --- Table 1: Transient candidates vs all curves ---
    print(f"\n{'─' * 95}")
    print("  TRANSIENT CANDIDATES (exponential decay)")
    print(f"{'─' * 95}")

    labels = [c[0] for c in transient_candidates] + ["current sine"]
    all_signals = [(c[0], c[1]) for c in transient_candidates] + [("current sine", sine_samples)]

    for curve_name in all_curves:
        curve_fn = CURVES[curve_name]
        exp = 2.0
        print(f"\n  {curve_name} (exp={exp}):")
        header = "  Ceiling │ " + " │ ".join(f"{l:>12s}" for l in labels) + " │  maximize │"
        print(header)
        print("  " + "─" * (len(header) - 2))

        for ceil_db in key_ceilings:
            vals = []
            for name, samples in all_signals:
                comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, exp)
                vals.append(f"{comp:+12.2f}")
            maximize = -ceil_db
            row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + f" │ {maximize:+9.2f} │"
            print(row)

    # --- Table 2: Tonal candidates vs all curves ---
    print(f"\n\n{'─' * 95}")
    print("  TONAL CANDIDATES (Gaussian)")
    print(f"{'─' * 95}")

    labels = [c[0] for c in tonal_candidates] + ["current sine"]
    all_signals = [(c[0], c[1]) for c in tonal_candidates] + [("current sine", sine_samples)]

    for curve_name in all_curves:
        curve_fn = CURVES[curve_name]
        exp = 2.0
        print(f"\n  {curve_name} (exp={exp}):")
        header = "  Ceiling │ " + " │ ".join(f"{l:>12s}" for l in labels) + " │  maximize │"
        print(header)
        print("  " + "─" * (len(header) - 2))

        for ceil_db in key_ceilings:
            vals = []
            for name, samples in all_signals:
                comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, exp)
                vals.append(f"{comp:+12.2f}")
            maximize = -ceil_db
            row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + f" │ {maximize:+9.2f} │"
            print(row)

    # --- Table 3: Repeated transients (fixed decay) vs single decay ---
    print(f"\n\n{'─' * 95}")
    print("  REPEATED TRANSIENTS (fixed min decay) vs SINGLE DECAY")
    print(f"{'─' * 95}")

    # Compare single decay CF10/12 against repeated transients at same CFs
    single_10 = next(c for c in transient_candidates if "CF10" in c[0])
    single_12 = next(c for c in transient_candidates if "CF12" in c[0])

    labels_r = [single_10[0], single_12[0]] + [c[0] for c in repeat_candidates]
    signals_r = [(single_10[0], single_10[1]), (single_12[0], single_12[1])] + \
                [(c[0], c[1]) for c in repeat_candidates]

    for curve_name in ["Hard", "Tanh", "Knee"]:
        curve_fn = CURVES[curve_name]
        print(f"\n  {curve_name}:")
        header = "  Ceiling │ " + " │ ".join(f"{l:>10s}" for l in labels_r) + " │"
        print(header)
        print("  " + "─" * (len(header) - 2))

        for ceil_db in key_ceilings:
            vals = []
            for name, samples in signals_r:
                comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, 2.0)
                vals.append(f"{comp:+10.2f}")
            row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + " │"
            print(row)

    # --- Summary: ratio to maximize ---
    print(f"\n\n{'─' * 95}")
    print("  SUMMARY: Compensation as % of maximize (Hard clip)")
    print(f"{'─' * 95}")

    best_transient = next(c for c in transient_candidates if "CF12" in c[0])
    best_tonal_candidates = [(c[0], c[1]) for c in tonal_candidates]
    curve_fn = CURVES["Hard"]

    labels_s = [best_transient[0]] + [c[0] for c in tonal_candidates] + ["current sine"]
    signals_s = [(best_transient[0], best_transient[1])] + \
                [(c[0], c[1]) for c in tonal_candidates] + [("current sine", sine_samples)]

    header = "  Ceiling │ " + " │ ".join(f"{l:>12s}" for l in labels_s) + " │"
    print(header)
    print("  " + "─" * (len(header) - 2))

    for ceil_db in key_ceilings:
        maximize = -ceil_db
        vals = []
        for name, samples in signals_s:
            comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, 2.0)
            pct = (comp / maximize * 100) if maximize > 0 else 0
            vals.append(f"{pct:11.1f}%")
        row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + " │"
        print(row)

    # --- Print chosen parameters for implementation ---
    print(f"\n\n{'=' * 95}")
    print("  REFERENCE SIGNAL PARAMETERS (for implementation)")
    print(f"{'=' * 95}")
    for name, _, cf, param in transient_candidates:
        print(f"  {name}: rate={param:.4f}, actual CF={cf:.2f}dB")
    for name, _, cf, param in tonal_candidates:
        print(f"  {name}: alpha={param:.4f}, actual CF={cf:.2f}dB")


def compute_match_mode(curve_fn, ceiling_db, input_gain_db=0.0, exponent=2.0):
    """Replicate the exact blended match-mode output from computeAutoGain()."""
    N = 32
    decay_rate = 8.0
    gauss_alpha = 25.5

    ceil_lin = 10 ** (ceiling_db / 20)
    input_lin = 10 ** (input_gain_db / 20)

    t_sum_sq_orig = t_sum_sq_clip = 0.0
    g_sum_sq_orig = g_sum_sq_clip = 0.0

    for i in range(N):
        t = (i + 0.5) / N

        transient = math.exp(-decay_rate * t)
        t_driven = transient * input_lin
        t_clipped = apply_with_ceiling(curve_fn, t_driven, ceil_lin, exponent)
        t_sum_sq_orig += transient * transient
        t_sum_sq_clip += t_clipped * t_clipped

        dt = t - 0.5
        tonal = math.exp(-gauss_alpha * dt * dt)
        g_driven = tonal * input_lin
        g_clipped = apply_with_ceiling(curve_fn, g_driven, ceil_lin, exponent)
        g_sum_sq_orig += tonal * tonal
        g_sum_sq_clip += g_clipped * g_clipped

    def comp(sq_orig, sq_clip):
        rms_o = math.sqrt(sq_orig / N)
        rms_c = math.sqrt(sq_clip / N)
        if rms_c <= 0 or rms_o <= 0:
            return 0.0
        return 20 * math.log10(rms_o / rms_c)

    t_comp = comp(t_sum_sq_orig, t_sum_sq_clip)
    g_comp = comp(g_sum_sq_orig, g_sum_sq_clip)

    blend = (ceiling_db - (-6.0)) / (-18.0 - (-6.0))
    blend = max(0.0, min(1.0, blend))

    compensation = t_comp + blend * (g_comp - t_comp)

    reduction_blend = max(0.0, min(1.0, ceiling_db / -60.0))
    compensation -= 2.0 * reduction_blend

    return min(max(compensation, 0.0), -ceiling_db)


def run_readme(args):
    """Generate markdown tables for the README."""
    ceilings = [-3, -6, -12, -18, -24]
    curve_names = ["Hard", "Quintic", "Cubic", "Tanh", "Arctan", "Knee", "T2"]

    print("**Match mode** — auto-compensation applied per curve at each ceiling depth:")
    print()
    header = "| Ceiling |"
    sep = "|---------|"
    for name in curve_names:
        header += f" {name} |"
        sep += "------|"
    header += " Maximize |"
    sep += "----------|"
    print(header)
    print(sep)

    for ceil_db in ceilings:
        row = f"| **{ceil_db} dB** |"
        for name in curve_names:
            comp = compute_match_mode(CURVES[name], ceil_db, args.input_gain)
            row += f" +{comp:.1f} |"
        row += f" +{-ceil_db:.0f} |"
        print(row)

    print()
    print("_Values in dB. Maximize always boosts by the ceiling amount. Match mode compensates")
    print("less because it estimates actual energy loss — softer curves (Arctan, Tanh) lose more")
    print("energy and get more compensation. Generated by `scripts/analyze_gain_compensation.py`._")


def main():
    parser = argparse.ArgumentParser(description="Analyze match-mode gain compensation")
    parser.add_argument("--csv", action="store_true", help="Output as CSV")
    parser.add_argument("--candidates", action="store_true", help="Phase 1: compare candidate reference signals")
    parser.add_argument("--readme", action="store_true", help="Generate markdown table for README")
    parser.add_argument("--input-gain", type=float, default=0.0, help="Input gain in dB (default: 0)")
    parser.add_argument("--ceiling-min", type=int, default=-24, help="Lowest ceiling in dB (default: -24)")
    parser.add_argument("--ceiling-max", type=int, default=0, help="Highest ceiling in dB (default: 0)")
    args = parser.parse_args()

    if args.readme:
        run_readme(args)
        return

    if args.candidates:
        run_candidates(args)
        return

    ceilings = list(range(args.ceiling_max, args.ceiling_min - 1, -1))
    key_ceilings = [c for c in [-3, -6, -12, -18, -24] if c >= min(ceilings)]

    # Fixed-exponent curves vs exponent-dependent curves
    fixed_curves = {k: v for k, v in CURVES.items() if k not in ("Knee", "T2")}
    exp_curves = {k: v for k, v in CURVES.items() if k in ("Knee", "T2")}

    # Exponent range: 1.0 to 4.0, sweep at 25% intervals
    exponent_sweep = [1.0, 1.75, 2.5, 3.25, 4.0]

    # =====================================================================
    # PART 1: Shape comparison at matched crest factors
    # =====================================================================
    print("=" * 90, file=sys.stderr)
    print("PART 1: Signal shape comparison (do different shapes give different compensation?)",
          file=sys.stderr)
    print("=" * 90, file=sys.stderr)

    # Target CFs: every dB from 0 to 6 (where convergence happens)
    shape_test_cfs = [1, 2, 3, 4, 5, 6]

    # For each target CF, generate multiple signal shapes
    print("\nGenerating reference signals at matched crest factors...", file=sys.stderr)

    shape_results = {}  # {target_cf: [(name, samples, actual_cf), ...]}

    for target_cf in shape_test_cfs:
        shapes = []

        # Gaussian
        alpha = find_param_for_crest(gen_gaussian, target_cf, 0.1, 1e6)
        samples, desc = gen_gaussian(alpha)
        cf = measure_crest_factor(samples)
        shapes.append((f"Gaussian", samples, cf))
        print(f"  CF {target_cf}dB → Gaussian: alpha={alpha:.1f}, actual={cf:.2f}dB", file=sys.stderr)

        # Exponential decay (drum transient)
        rate = find_param_for_crest(gen_exp_decay, target_cf, 0.1, 1e6)
        samples, desc = gen_exp_decay(rate)
        cf = measure_crest_factor(samples)
        shapes.append((f"Exp decay", samples, cf))
        print(f"  CF {target_cf}dB → Exp decay: rate={rate:.1f}, actual={cf:.2f}dB", file=sys.stderr)

        # Repeated transients (4 hits)
        rate4 = find_param_for_crest(lambda r: gen_repeated_transients(4, r), target_cf, 0.1, 1e6)
        samples, desc = gen_repeated_transients(4, rate4)
        cf = measure_crest_factor(samples)
        shapes.append((f"4x hits", samples, cf))
        print(f"  CF {target_cf}dB → 4x hits: rate={rate4:.1f}, actual={cf:.2f}dB", file=sys.stderr)

        # Repeated transients (16 hits)
        rate16 = find_param_for_crest(lambda r: gen_repeated_transients(16, r), target_cf, 0.1, 1e6)
        samples, desc = gen_repeated_transients(16, rate16)
        cf = measure_crest_factor(samples)
        shapes.append((f"16x hits", samples, cf))
        print(f"  CF {target_cf}dB → 16x hits: rate={rate16:.1f}, actual={cf:.2f}dB", file=sys.stderr)

        shape_results[target_cf] = shapes

    # Print shape comparison tables
    print(f"\n{'=' * 90}")
    print("PART 1: Shape comparison — compensation (dB) by signal shape at matched crest factors")
    print(f"{'=' * 90}")
    print(f"Input gain: {args.input_gain:+.1f} dB")

    shape_names = ["Gaussian", "Exp decay", "4x hits", "16x hits"]

    for curve_name, curve_fn in list(fixed_curves.items())[:3]:  # Hard, Quintic, Cubic
        print(f"\n{'─' * 90}")
        print(f"  {curve_name}")
        print(f"{'─' * 90}")

        for target_cf in shape_test_cfs:
            print(f"\n  Target CF: {target_cf} dB")
            header = "  Ceiling │ " + " │ ".join(f"{s:>10s}" for s in shape_names) + " │    spread │"
            print(header)
            print("  " + "─" * (len(header) - 2))

            for ceil_db in key_ceilings:
                vals = []
                comps = []
                for name, samples, _ in shape_results[target_cf]:
                    comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, 2.0)
                    vals.append(f"{comp:+10.2f}")
                    comps.append(comp)
                spread = max(comps) - min(comps)
                row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + f" │ {spread:9.2f} │"
                print(row)

    # Also test soft curves
    for curve_name in ["Tanh", "Arctan"]:
        curve_fn = CURVES[curve_name]
        print(f"\n{'─' * 90}")
        print(f"  {curve_name}")
        print(f"{'─' * 90}")

        for target_cf in shape_test_cfs:
            print(f"\n  Target CF: {target_cf} dB")
            header = "  Ceiling │ " + " │ ".join(f"{s:>10s}" for s in shape_names) + " │    spread │"
            print(header)
            print("  " + "─" * (len(header) - 2))

            for ceil_db in key_ceilings:
                vals = []
                comps = []
                for name, samples, _ in shape_results[target_cf]:
                    comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, 2.0)
                    vals.append(f"{comp:+10.2f}")
                    comps.append(comp)
                spread = max(comps) - min(comps)
                row = f"  {ceil_db:+4d} dB │ " + " │ ".join(vals) + f" │ {spread:9.2f} │"
                print(row)

    # =====================================================================
    # PART 2: Crest factor sweep (every dB from 0-6, using Gaussian)
    # =====================================================================
    print(f"\n\n{'=' * 90}")
    print("PART 2: Crest factor sweep (Gaussian, 0-6 dB CF in 1dB steps)")
    print(f"{'=' * 90}")

    cf_sweep = list(range(0, 7))
    cf_refs = {}

    print("\nGenerating CF sweep signals...", file=sys.stderr)
    for target_cf in cf_sweep:
        if target_cf == 0:
            # DC-like signal (constant 1.0) — CF = 0dB
            samples = [1.0] * N_SAMPLES
            cf = 0.0
            desc = "DC"
        elif target_cf <= 3:
            alpha = find_param_for_crest(gen_gaussian, target_cf, 0.01, 1000)
            samples, desc = gen_gaussian(alpha)
            cf = measure_crest_factor(samples)
        else:
            alpha = find_param_for_crest(gen_gaussian, target_cf, 1, 1e6)
            samples, desc = gen_gaussian(alpha)
            cf = measure_crest_factor(samples)
        cf_refs[target_cf] = (samples, cf)
        print(f"  Target {target_cf}dB → actual={cf:.2f}dB", file=sys.stderr)

    all_curve_names = list(fixed_curves.keys()) + list(exp_curves.keys())

    for target_cf in cf_sweep:
        samples, actual_cf = cf_refs[target_cf]
        print(f"\n  CF: {actual_cf:.1f} dB")
        header = "  Ceiling │ " + " │ ".join(f"{name:>8s}" for name in all_curve_names) + " │"
        print(header)
        print("  " + "─" * (len(header) - 2))

        for ceil_db in key_ceilings:
            row = f"  {ceil_db:+4d} dB │ "
            vals = []
            for curve_name in all_curve_names:
                curve_fn = CURVES[curve_name]
                comp = compute_compensation(curve_fn, samples, ceil_db, args.input_gain, 2.0)
                vals.append(f"{comp:+8.2f}")
            row += " │ ".join(vals) + " │"
            print(row)

    # =====================================================================
    # PART 3: Exponent sweep for Knee and T2 (1.0 to 4.0)
    # =====================================================================
    print(f"\n\n{'=' * 90}")
    print("PART 3: Exponent impact — Knee & T2 (range 1.0-4.0, at 6dB CF Gaussian)")
    print(f"{'=' * 90}")

    # Use 6dB CF since that's where convergence starts
    ref_6db = cf_refs[6][0] if 6 in cf_refs else shape_results[6][0][1]
    exp_labels = [f"{e:.2f}" for e in exponent_sweep]

    for curve_name, curve_fn in exp_curves.items():
        print(f"\n  {curve_name}")
        header = "  Ceiling │ " + " │ ".join(f"exp={lbl:>5s}" for lbl in exp_labels) + " │"
        print(header)
        print("  " + "─" * (len(header) - 2))

        for ceil_db in ceilings:
            row = f"  {ceil_db:+4d} dB │ "
            vals = []
            for exp in exponent_sweep:
                comp = compute_compensation(curve_fn, ref_6db, ceil_db, args.input_gain, exp)
                vals.append(f"{comp:+11.2f}")
            row += " │ ".join(vals) + " │"
            print(row)


if __name__ == "__main__":
    main()

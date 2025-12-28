"""
Shared constants for clipper tests.
"""

# =============================================================================
# Plugin Configuration Options
# =============================================================================

OVERSAMPLING_MODES = ["1x", "2x", "4x", "8x", "16x", "32x"]
FILTER_TYPES = ["Minimum Phase", "Linear Phase"]


# =============================================================================
# Test Tolerances
# =============================================================================

# Float32 precision tolerance in dB
# float32 has ~7 significant digits, worst case relative error ~1.2e-7
# In dB: 20 * log10(1 + 1.2e-7) ≈ 0.000001 dB
# We use 0.001 dB for safety margin
PEAK_TOLERANCE_DB = 0.001

# Exact value tolerance (linear) - for DC and zero comparisons
# Allows for tiny float rounding errors
EXACT_TOLERANCE = 0.0001

# Passthrough tolerance (linear) - for signals that should be unchanged
# Slightly looser than exact since filters may introduce tiny artifacts
PASSTHROUGH_TOLERANCE = 0.001

# Symmetry tolerance (linear) - for comparing positive vs negative peaks
SYMMETRY_TOLERANCE = 0.001

# Minimum expected overshoot (dB) when enforce_ceiling is OFF with oversampling
# Used to verify the parameter actually changes behavior
MIN_EXPECTED_OVERSHOOT_DB = 0.1

# =============================================================================
# Maximum Allowed Overshoot (dB)
# =============================================================================
# When enforce_ceiling is OFF, filter ringing causes overshoot.
# Polyphase IIR (min-phase) filters have inherent transient ringing at low rates:
# - 2x/4x min-phase: 2-4dB overshoot (fundamental IIR limitation)
# - 8x+ min-phase: <0.2dB (good)
# - Linear phase: <0.1dB at 4x+ (excellent, but adds latency)
# Use enforce_ceiling=True in production for guaranteed ceiling compliance.
# For best results without enforce_ceiling: use 8x+ min-phase or 4x+ linear.

MAX_OVERSHOOT_MIN_PHASE_DB = 2.5  # 4x can hit ~2.3dB, 8x+ are <0.2dB
MAX_OVERSHOOT_LINEAR_PHASE_DB = 0.7  # 2x can hit 0.6dB, 4x+ are <0.1dB

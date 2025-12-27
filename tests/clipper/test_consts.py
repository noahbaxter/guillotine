"""
Shared constants for clipper tests.
"""

# =============================================================================
# Plugin Configuration Options
# =============================================================================

OVERSAMPLING_MODES = ["1x", "4x", "16x", "32x"]
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
# These are upper bounds only - we don't care about minimums.
# Overshoot is filter-dependent, not OS-factor-dependent (4x ≈ 16x ≈ 32x).

MAX_OVERSHOOT_MIN_PHASE_DB = 0.5  # Typical good min-phase: ~0.2-0.4 dB
MAX_OVERSHOOT_LINEAR_PHASE_DB = 0.2  # Typical good linear: ~0.05-0.15 dB

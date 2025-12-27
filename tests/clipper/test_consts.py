"""
Shared constants for clipper tests.
"""

# =============================================================================
# Plugin Configuration
# =============================================================================

CEILINGS_DB = [0.0, -6.0, -12.0, -24.0]
OVERSAMPLING_MODES = ["1x", "4x", "16x", "32x"]
FILTER_TYPES = ["Minimum Phase", "Linear Phase"]

# Input amplitudes to test (linear)
TEST_AMPLITUDES = [0.5, 0.9, 1.0, 1.5, 2.0]


# =============================================================================
# Tolerances
# =============================================================================

# Exact value comparison (DC, zero input)
EXACT_TOLERANCE = 0.0001

# Peak symmetry comparison (pos vs neg)
SYMMETRY_TOLERANCE = 0.01

# Passthrough comparison (signal unchanged)
PASSTHROUGH_TOLERANCE_DB = -60

# Sample peak overshoot tolerance by oversampling mode (dB above ceiling)
SAMPLE_PEAK_TOLERANCE = {
    "1x": 0.0,    # Sample peak should be exact
    "4x": 0.1,
    "16x": 0.05,
    "32x": 0.02,
}

# True peak overshoot tolerance by oversampling mode (dB above ceiling)
# None = don't assert (1x can't control intersample peaks)
TRUE_PEAK_TOLERANCE = {
    "1x": None,
    "4x": 0.3,
    "16x": 0.15,
    "32x": 0.1,
}

# Neighbor isolation tolerance (filter ringing allowance)
NEIGHBOR_ISOLATION_TOLERANCE = {
    "1x": 0.01,
    "4x": 0.05,
    "16x": 0.05,
    "32x": 0.05,
}

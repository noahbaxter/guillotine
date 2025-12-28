// NOTE: This file mirrors src/dsp/SaturatorCurves.h
// Keep both files in sync when modifying curve implementations

const PI = Math.PI;

export const CurveType = {
  Hard: 0,
  Quintic: 1,
  Cubic: 2,
  Tanh: 3,
  Arctan: 4,
  Knee: 5,
  T2: 6
};

// Hard clip: just clamp to [-1, 1]
function hard(x) {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

// Tanh: smooth S-curve, naturally limits to [-1, 1]
function tanh(x) {
  return Math.tanh(x);
}

// Quintic: x - (256/3125)x^5, very transparent
// Valid for |x| < 1.25, hard clips beyond
function quintic(x) {
  const absX = Math.abs(x);
  if (absX < 1.25) {
    const x2 = x * x;
    const x5 = x2 * x2 * x;
    return x - (256 / 3125) * x5;
  }
  return x >= 0 ? 1 : -1;
}

// Cubic: x - (4/27)x^3, gentle saturation
// Valid for |x| < 1.5, hard clips beyond
function cubic(x) {
  const absX = Math.abs(x);
  if (absX < 1.5) {
    const x3 = x * x * x;
    return x - (4 / 27) * x3;
  }
  return x >= 0 ? 1 : -1;
}

// Arctan: (2/pi)atan(x), softest curve
function arctan(x) {
  return (2 / PI) * Math.atan(x);
}

// T-squared: sign(x) * |x|^n, weird asymmetric character
// Exponent controls the curve: 1.0=linear, 2.0=squared, 3.0=cubed, etc.
function tsquared(x, exponent = 2.0) {
  const absX = Math.abs(x);
  const powered = Math.pow(absX, exponent);
  if (x >= 0) {
    return powered > 1 ? 1 : powered;
  } else {
    return powered > 1 ? -1 : -powered;
  }
}

// Knee: soft knee compression with adjustable knee width
// Linear below kneeStart, t² compression in knee region, hard clip above 1.0
// Exponent controls knee size: 4.0=huge knee (starts at 5%), 1.0=tiny knee (near hard clip)
function knee(x, exponent = 2.0) {
  const absX = Math.abs(x);
  const sign = x >= 0 ? 1 : -1;

  // Map exponent (1-4) to sharpness (0-1): lower exponent = sharper = smaller knee
  const sharpness = (4.0 - exponent) / 3.0;

  // Knee width: 0 at sharpness=1, 0.95 at sharpness=0 (starts at 5% of ceiling!)
  const kneeWidth = (1.0 - sharpness) * 0.95;
  const kneeStart = 1.0 - kneeWidth;

  // Below knee - pass through unchanged
  if (absX <= kneeStart) {
    return x;
  }

  // Above ceiling - hard limit
  if (absX > 1.0) {
    return sign;
  }

  // In knee region - t² compression
  const t = (absX - kneeStart) / kneeWidth;  // 0 to 1 within knee
  const compressed = kneeStart + kneeWidth * t * t;
  return sign * compressed;
}

// Apply curve by type (normalized input/output)
// exponent used for Knee and T2 curves
export function applyCurve(curveType, x, exponent = 2.0) {
  switch (curveType) {
    case CurveType.Hard:     return hard(x);
    case CurveType.Quintic:  return quintic(x);
    case CurveType.Cubic:    return cubic(x);
    case CurveType.Tanh:     return tanh(x);
    case CurveType.Arctan:   return arctan(x);
    case CurveType.Knee:     return knee(x, exponent);
    case CurveType.T2:       return tsquared(x, exponent);
    default:                 return hard(x);
  }
}

// Apply curve with ceiling (handles normalization)
// input: amplitude value
// ceiling: threshold in linear amplitude
// exponent: only used for Knee and T2 curves
// returns: clipped amplitude value
export function applyWithCeiling(curveType, sample, ceiling, exponent = 2.0) {
  if (ceiling <= 0) return 0;

  const normalized = sample / ceiling;
  const curved = applyCurve(curveType, normalized, exponent);
  return curved * ceiling;
}

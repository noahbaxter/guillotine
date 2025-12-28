#pragma once

// NOTE: This file has a JS mirror at web/lib/saturation-curves.js
// Keep both files in sync when modifying curve implementations

#include <cmath>

namespace dsp {

enum class CurveType
{
    Hard = 0,    // Pure hard clip
    Quintic = 1, // x - (256/3125)x^5 - transparent, minimal harmonics
    Cubic = 2,   // x - (4/27)x^3 - gentle, clean
    Tanh = 3,    // tanh - smooth, musical saturation
    Arctan = 4,  // (2/pi)atan(x) - softest, most saturated
    Knee = 5,    // Soft knee compression - exponent 4.0=wide knee, 1.0=sharp
    T2 = 6       // sign(x) * |x|^n - power curve
};

constexpr int kNumCurveTypes = 7;

namespace curves {

constexpr float PI = 3.14159265358979323846f;

// Hard clip: just clamp to [-1, 1]
inline float hard(float x)
{
    if (x > 1.0f) return 1.0f;
    if (x < -1.0f) return -1.0f;
    return x;
}

// Tanh: smooth S-curve, naturally limits to [-1, 1]
inline float tanh(float x)
{
    return std::tanh(x);
}

// Quintic: x - (256/3125)x^5, very transparent
// Valid for |x| < 1.25, hard clips beyond
inline float quintic(float x)
{
    float absX = std::abs(x);
    if (absX < 1.25f)
    {
        float x2 = x * x;
        float x5 = x2 * x2 * x;
        return x - (256.0f / 3125.0f) * x5;
    }
    return (x >= 0.0f) ? 1.0f : -1.0f;
}

// Cubic: x - (4/27)x^3, gentle saturation
// Valid for |x| < 1.5, hard clips beyond
inline float cubic(float x)
{
    float absX = std::abs(x);
    if (absX < 1.5f)
    {
        float x3 = x * x * x;
        return x - (4.0f / 27.0f) * x3;
    }
    return (x >= 0.0f) ? 1.0f : -1.0f;
}

// Arctan: (2/pi)atan(x), softest curve
inline float arctan(float x)
{
    return (2.0f / PI) * std::atan(x);
}

// T-squared: sign(x) * |x|^n, weird asymmetric character
// Exponent controls the curve: 1.0=linear, 2.0=squared, 3.0=cubed, etc.
// Hard clips at ±1
inline float tsquared(float x, float exponent = 2.0f)
{
    float absX = std::abs(x);
    float powered = std::pow(absX, exponent);
    if (x >= 0.0f)
        return (powered > 1.0f) ? 1.0f : powered;
    else
        return (powered > 1.0f) ? -1.0f : -powered;
}

// Knee: soft knee compression with adjustable knee width
// Linear below kneeStart, t² compression in knee region, hard clip above 1.0
// Exponent controls knee size: 4.0=huge knee (starts at 5%), 1.0=tiny knee (near hard clip)
inline float knee(float x, float exponent = 2.0f)
{
    float absX = std::abs(x);
    float sign = (x >= 0.0f) ? 1.0f : -1.0f;

    // Map exponent (1-4) to sharpness (0-1): lower exponent = sharper = smaller knee
    float sharpness = (4.0f - exponent) / 3.0f;

    // Knee width: 0 at sharpness=1, 0.95 at sharpness=0 (starts at 5% of ceiling!)
    float kneeWidth = (1.0f - sharpness) * 0.95f;
    float kneeStart = 1.0f - kneeWidth;

    // Below knee - pass through unchanged
    if (absX <= kneeStart)
        return x;

    // Above ceiling - hard limit
    if (absX > 1.0f)
        return sign;

    // In knee region - t² compression
    float t = (absX - kneeStart) / kneeWidth;  // 0 to 1 within knee
    float compressed = kneeStart + kneeWidth * t * t;
    return sign * compressed;
}

// Apply curve by type (normalized input/output)
// exponent used for Knee and T2 curves
inline float apply(CurveType type, float x, float exponent = 2.0f)
{
    switch (type)
    {
        case CurveType::Hard:     return hard(x);
        case CurveType::Quintic:  return quintic(x);
        case CurveType::Cubic:    return cubic(x);
        case CurveType::Tanh:     return tanh(x);
        case CurveType::Arctan:   return arctan(x);
        case CurveType::Knee:     return knee(x, exponent);
        case CurveType::T2:       return tsquared(x, exponent);
        default:                  return hard(x);
    }
}

// Apply curve with ceiling (handles normalization)
// exponent used for Knee and T2 curves
inline float applyWithCeiling(CurveType type, float sample, float ceiling, float exponent = 2.0f)
{
    if (ceiling <= 0.0f)
        return 0.0f;

    float normalized = sample / ceiling;
    float curved = apply(type, normalized, exponent);
    return curved * ceiling;
}

} // namespace curves
} // namespace dsp

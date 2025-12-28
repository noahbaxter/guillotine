#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/Clipper.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::Clipper;
using dsp::CurveType;
using namespace test_utils;

namespace {

Clipper makeClipper()
{
    return Clipper();
}

float processSingleSample(Clipper& clipper, float sample)
{
    juce::AudioBuffer<float> buffer(1, 1);
    buffer.setSample(0, 0, sample);
    clipper.process(buffer);
    return buffer.getSample(0, 0);
}

std::pair<float, float> processStereoSample(Clipper& clipper, float left, float right)
{
    juce::AudioBuffer<float> buffer(2, 1);
    buffer.setSample(0, 0, left);
    buffer.setSample(1, 0, right);
    clipper.process(buffer);
    return { buffer.getSample(0, 0), buffer.getSample(1, 0) };
}

} // namespace

// =============================================================================
// Hard Clip Tests (CurveType::Hard)
// =============================================================================

TEST_CASE("Hard clip: signal at ceiling passes unchanged", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    float input = 1.0f;
    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: signal above ceiling clips to ceiling", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    auto input = GENERATE(1.1f, 1.5f, 2.0f, 10.0f, 100.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: signal below ceiling passes through", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    auto input = GENERATE(0.0f, 0.1f, 0.5f, 0.9f, 0.999f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: negative values clip to -ceiling", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    auto input = GENERATE(-1.1f, -1.5f, -2.0f, -10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(-1.0f).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: symmetry - abs(clip(x)) == abs(clip(-x))", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    auto input = GENERATE(0.5f, 1.0f, 1.5f, 2.0f, 5.0f);
    CAPTURE(input);

    float outputPos = processSingleSample(clipper, input);
    float outputNeg = processSingleSample(clipper, -input);

    REQUIRE(std::abs(outputPos) == Approx(std::abs(outputNeg)).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: with different ceiling values", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCurve(CurveType::Hard);

    auto ceiling = GENERATE(0.5f, 0.25f, 0.1f, 2.0f);
    CAPTURE(ceiling);

    clipper.setCeiling(ceiling);

    float output = processSingleSample(clipper, ceiling * 2.0f);
    REQUIRE(output == Approx(ceiling).margin(kClipperTolerance));

    float belowCeiling = ceiling * 0.5f;
    float outputBelow = processSingleSample(clipper, belowCeiling);
    REQUIRE(outputBelow == Approx(belowCeiling).margin(kClipperTolerance));
}

// =============================================================================
// Soft Curve Tests (Tanh, Cubic, etc.)
// =============================================================================

TEST_CASE("Tanh: below threshold passes with minimal change", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Tanh);

    // Low levels should be nearly linear
    auto input = GENERATE(0.0f, 0.1f, 0.2f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(input).margin(0.05f));
}

TEST_CASE("Tanh: at ceiling outputs ceiling", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Tanh);

    // tanh(1) ≈ 0.76, so at normalized input=1, output < ceiling
    // But we scale by ceiling, so it's actually compressed
    float output = processSingleSample(clipper, 1.0f);
    REQUIRE(output < 1.0f);
    REQUIRE(output > 0.7f);
}

TEST_CASE("Tanh: above ceiling approaches ceiling asymptotically", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Tanh);

    auto input = GENERATE(2.0f, 5.0f, 10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    // tanh asymptotically approaches 1.0 - for very large inputs, it's essentially 1.0
    REQUIRE(output <= 1.0f + kClipperTolerance);
    REQUIRE(output > 0.9f);
}

TEST_CASE("Cubic: soft saturation behavior", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Cubic);

    // Low levels nearly linear
    float lowOutput = processSingleSample(clipper, 0.2f);
    REQUIRE(lowOutput == Approx(0.2f).margin(0.02f));

    // At ceiling, should be compressed
    float ceilingOutput = processSingleSample(clipper, 1.0f);
    REQUIRE(ceilingOutput < 1.0f);
}

TEST_CASE("Quintic: most transparent soft clip", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Quintic);

    // Low levels should be very close to linear
    auto input = GENERATE(0.1f, 0.2f, 0.3f, 0.4f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(input).margin(0.01f));
}

TEST_CASE("Arctan: softest saturation", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Arctan);

    // arctan is the softest curve - most compression at low levels
    float output = processSingleSample(clipper, 1.0f);
    REQUIRE(output < 0.8f);  // More compressed than tanh
}

// =============================================================================
// T2 Curve Tests (power curve with exponent)
// =============================================================================

TEST_CASE("T2: exponent 1.0 is linear until clip", "[t2]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::T2);
    clipper.setCurveExponent(1.0f);

    auto input = GENERATE(0.2f, 0.5f, 0.8f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("T2: exponent 2.0 squares the signal", "[t2]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::T2);
    clipper.setCurveExponent(2.0f);

    float input = 0.5f;
    float output = processSingleSample(clipper, input);

    // output = sign(x) * |x|^2 = 0.5^2 = 0.25
    REQUIRE(output == Approx(0.25f).margin(kClipperTolerance));
}

TEST_CASE("T2: preserves sign", "[t2]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::T2);
    clipper.setCurveExponent(2.0f);

    float outputPos = processSingleSample(clipper, 0.5f);
    float outputNeg = processSingleSample(clipper, -0.5f);

    REQUIRE(outputPos > 0.0f);
    REQUIRE(outputNeg < 0.0f);
    REQUIRE(std::abs(outputPos) == Approx(std::abs(outputNeg)).margin(kClipperTolerance));
}

TEST_CASE("T2: clips at ceiling", "[t2]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::T2);
    clipper.setCurveExponent(2.0f);

    float output = processSingleSample(clipper, 2.0f);
    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

// =============================================================================
// Knee Curve Tests (soft knee compression)
// =============================================================================

TEST_CASE("Knee: exponent 1.0 is nearly hard clip", "[knee]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Knee);
    clipper.setCurveExponent(1.0f);  // Maps to sharpness ~1.0

    // Below ceiling should pass through mostly unchanged
    float input = 0.8f;
    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(input).margin(0.01f));
}

TEST_CASE("Knee: exponent 4.0 has large soft knee", "[knee]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Knee);
    clipper.setCurveExponent(4.0f);  // Maps to sharpness ~0.0, large knee

    // At 70% of ceiling, should see compression (knee starts at 5% for exponent 4.0)
    float input = 0.7f;
    float output = processSingleSample(clipper, input);
    REQUIRE(output < input);
}

TEST_CASE("Knee: at ceiling outputs ceiling", "[knee]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Knee);

    auto exponent = GENERATE(1.0f, 2.0f, 3.0f, 4.0f);
    CAPTURE(exponent);

    clipper.setCurveExponent(exponent);
    float output = processSingleSample(clipper, 1.0f);
    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Knee: above ceiling hard-limits", "[knee]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Knee);
    clipper.setCurveExponent(2.0f);

    auto input = GENERATE(1.5f, 2.0f, 10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Knee: higher exponent = more softness", "[knee]")
{
    float input = 0.7f;
    float outputs[4];
    float exponents[] = { 1.0f, 2.0f, 3.0f, 4.0f };

    for (int i = 0; i < 4; ++i)
    {
        auto clipper = makeClipper();
        clipper.setCeiling(1.0f);
        clipper.setCurve(CurveType::Knee);
        clipper.setCurveExponent(exponents[i]);
        outputs[i] = processSingleSample(clipper, input);
    }

    // Higher exponent = wider knee = more compression = lower output
    for (int i = 1; i < 4; ++i)
    {
        CAPTURE(exponents[i], outputs[i-1], outputs[i]);
        REQUIRE(outputs[i] <= outputs[i-1] + 0.001f);
    }
}

// =============================================================================
// Edge Cases
// =============================================================================

TEST_CASE("Edge case: zero ceiling returns 0", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(0.0f);
    clipper.setCurve(CurveType::Hard);

    auto input = GENERATE(0.0f, 0.5f, 1.0f, -1.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);
    REQUIRE(output == Approx(0.0f).margin(kClipperTolerance));
}

TEST_CASE("Edge case: very large input still clips to ceiling", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    auto curve = GENERATE(CurveType::Hard, CurveType::Tanh, CurveType::Knee);
    CAPTURE(static_cast<int>(curve));

    clipper.setCurve(curve);
    float output = processSingleSample(clipper, 1000.0f);
    REQUIRE(output == Approx(1.0f).margin(0.01f));
}

TEST_CASE("Edge case: zero input passes through", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    auto curve = GENERATE(CurveType::Hard, CurveType::Tanh, CurveType::Cubic);
    CAPTURE(static_cast<int>(curve));

    clipper.setCurve(curve);
    float output = processSingleSample(clipper, 0.0f);
    REQUIRE(output == Approx(0.0f).margin(kClipperTolerance));
}

// =============================================================================
// Buffer Processing Tests
// =============================================================================

TEST_CASE("Buffer processing: multi-sample buffer", "[buffer]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);

    juce::AudioBuffer<float> buffer(1, 5);
    buffer.setSample(0, 0, 0.5f);   // Below ceiling
    buffer.setSample(0, 1, 1.0f);   // At ceiling
    buffer.setSample(0, 2, 1.5f);   // Above ceiling
    buffer.setSample(0, 3, -1.5f);  // Negative, above ceiling
    buffer.setSample(0, 4, 0.0f);   // Zero

    clipper.process(buffer);

    REQUIRE(buffer.getSample(0, 0) == Approx(0.5f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(0, 1) == Approx(1.0f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(0, 2) == Approx(1.0f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(0, 3) == Approx(-1.0f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(0, 4) == Approx(0.0f).margin(kClipperTolerance));
}

TEST_CASE("Buffer processing: stereo buffer independent channels", "[buffer]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);
    clipper.setStereoLink(false);

    juce::AudioBuffer<float> buffer(2, 2);
    buffer.setSample(0, 0, 1.5f);   // L: clips
    buffer.setSample(1, 0, 0.5f);   // R: passes through
    buffer.setSample(0, 1, 0.5f);   // L: passes through
    buffer.setSample(1, 1, 2.0f);   // R: clips

    clipper.process(buffer);

    REQUIRE(buffer.getSample(0, 0) == Approx(1.0f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(1, 0) == Approx(0.5f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(0, 1) == Approx(0.5f).margin(kClipperTolerance));
    REQUIRE(buffer.getSample(1, 1) == Approx(1.0f).margin(kClipperTolerance));
}

// =============================================================================
// Stereo Link Tests
// =============================================================================

TEST_CASE("Stereo link disabled: channels clip independently", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);
    clipper.setStereoLink(false);

    auto [outL, outR] = processStereoSample(clipper, 1.5f, 0.5f);

    REQUIRE(outL == Approx(1.0f).margin(kClipperTolerance));
    REQUIRE(outR == Approx(0.5f).margin(kClipperTolerance));
}

TEST_CASE("Stereo link enabled: same gain reduction to both channels", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);
    clipper.setStereoLink(true);

    float input = 0.9f;
    auto [outL, outR] = processStereoSample(clipper, input, input);

    REQUIRE(outL == Approx(outR).margin(kClipperTolerance));
}

TEST_CASE("Stereo link enabled: quiet channel reduced based on loud channel", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);
    clipper.setStereoLink(true);

    float loudInput = 1.5f;
    float quietInput = 0.3f;

    auto [outL, outR] = processStereoSample(clipper, loudInput, quietInput);

    // L should be limited to ceiling
    REQUIRE(outL == Approx(1.0f).margin(kClipperTolerance));

    // R should be reduced proportionally (gain reduction = 1.0/1.5)
    float expectedR = quietInput * (1.0f / loudInput);
    REQUIRE(outR == Approx(expectedR).margin(kClipperTolerance));
}

TEST_CASE("Stereo link: both channels below threshold pass unchanged", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(CurveType::Hard);
    clipper.setStereoLink(true);

    float inputL = 0.3f;
    float inputR = 0.5f;

    auto [outL, outR] = processStereoSample(clipper, inputL, inputR);

    REQUIRE(outL == Approx(inputL).margin(kClipperTolerance));
    REQUIRE(outR == Approx(inputR).margin(kClipperTolerance));
}

// =============================================================================
// All Curve Types Test
// =============================================================================

TEST_CASE("All curve types produce bounded output", "[curves]")
{
    auto curveType = GENERATE(
        CurveType::Hard,
        CurveType::Quintic,
        CurveType::Cubic,
        CurveType::Tanh,
        CurveType::Arctan,
        CurveType::Knee,
        CurveType::T2
    );
    CAPTURE(static_cast<int>(curveType));

    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setCurve(curveType);
    clipper.setCurveExponent(2.0f);

    // Test various input levels
    auto input = GENERATE(-10.0f, -1.0f, -0.5f, 0.0f, 0.5f, 1.0f, 10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    // Output should always be bounded by ceiling
    REQUIRE(std::abs(output) <= 1.0f + kClipperTolerance);
}

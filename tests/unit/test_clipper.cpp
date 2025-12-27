#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/Clipper.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::Clipper;
using namespace test_utils;

namespace {

// Create a clipper (stateless, no prepare needed)
Clipper makeClipper()
{
    return Clipper();
}

// Process a single sample through the clipper
float processSingleSample(Clipper& clipper, float sample)
{
    juce::AudioBuffer<float> buffer(1, 1);
    buffer.setSample(0, 0, sample);
    clipper.process(buffer);
    return buffer.getSample(0, 0);
}

// Process stereo samples through the clipper
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
// Hard Clip Tests (sharpness = 1.0)
// =============================================================================

TEST_CASE("Hard clip: signal at ceiling passes unchanged", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    float input = 1.0f;
    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: signal above ceiling clips to ceiling", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    auto input = GENERATE(1.1f, 1.5f, 2.0f, 10.0f, 100.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: signal below ceiling passes through", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    auto input = GENERATE(0.0f, 0.1f, 0.5f, 0.9f, 0.999f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: negative values clip to -ceiling", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    auto input = GENERATE(-1.1f, -1.5f, -2.0f, -10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(-1.0f).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: symmetry - abs(clip(x)) == abs(clip(-x))", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    auto input = GENERATE(0.5f, 1.0f, 1.5f, 2.0f, 5.0f);
    CAPTURE(input);

    float outputPos = processSingleSample(clipper, input);
    float outputNeg = processSingleSample(clipper, -input);

    REQUIRE(std::abs(outputPos) == Approx(std::abs(outputNeg)).margin(kClipperTolerance));
}

TEST_CASE("Hard clip: with different ceiling values", "[hardclip]")
{
    auto clipper = makeClipper();
    clipper.setSharpness(1.0f);

    auto ceiling = GENERATE(0.5f, 0.25f, 0.1f, 2.0f);
    CAPTURE(ceiling);

    clipper.setCeiling(ceiling);

    // Input above ceiling should clip
    float output = processSingleSample(clipper, ceiling * 2.0f);
    REQUIRE(output == Approx(ceiling).margin(kClipperTolerance));

    // Input below ceiling should pass through
    float belowCeiling = ceiling * 0.5f;
    float outputBelow = processSingleSample(clipper, belowCeiling);
    REQUIRE(outputBelow == Approx(belowCeiling).margin(kClipperTolerance));
}

// =============================================================================
// Soft Clip Tests (sharpness < 0.999)
// =============================================================================

TEST_CASE("Soft clip: below kneeStart passes unchanged", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.0f);  // Max soft knee

    // At sharpness=0: knee = 0.5, kneeStart = 0.5
    auto input = GENERATE(0.0f, 0.1f, 0.25f, 0.4f, 0.49f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Soft clip: at ceiling outputs ceiling", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    auto sharpness = GENERATE(0.0f, 0.25f, 0.5f, 0.75f, 0.9f);
    CAPTURE(sharpness);

    clipper.setSharpness(sharpness);

    // Input exactly at ceiling should output ceiling
    float output = processSingleSample(clipper, 1.0f);

    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Soft clip: in knee region output < input (compression)", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.0f);  // Max soft knee

    // At sharpness=0: kneeStart = 0.5, ceiling = 1.0
    // Test points in the knee region
    auto input = GENERATE(0.6f, 0.7f, 0.8f, 0.9f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    // Output should be less than input (compressed)
    REQUIRE(output < input);
    // But output should be greater than kneeStart
    REQUIRE(output > 0.5f);
}

TEST_CASE("Soft clip: quadratic formula verification", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.0f);  // Max soft knee

    // At sharpness=0: knee = 0.5, kneeStart = 0.5
    // Formula: output = kneeStart + knee * t² where t = (input - kneeStart) / knee

    float ceiling = 1.0f;
    float knee = 0.5f;
    float kneeStart = 0.5f;

    // Test at t = 0.5 (midpoint of knee)
    float input = kneeStart + knee * 0.5f;  // 0.75
    float expectedT = (input - kneeStart) / knee;  // 0.5
    float expectedOutput = kneeStart + knee * expectedT * expectedT;  // 0.5 + 0.5 * 0.25 = 0.625

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(expectedOutput).margin(kClipperTolerance));
}

TEST_CASE("Soft clip: continuous at kneeStart boundary", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.0f);

    // At sharpness=0: kneeStart = 0.5
    float kneeStart = 0.5f;

    // Just below kneeStart
    float inputBelow = kneeStart - 0.001f;
    float outputBelow = processSingleSample(clipper, inputBelow);

    // Just above kneeStart
    float inputAbove = kneeStart + 0.001f;
    float outputAbove = processSingleSample(clipper, inputAbove);

    // Outputs should be very close (continuity)
    float diff = std::abs(outputBelow - outputAbove);
    REQUIRE(diff < 0.01f);
}

TEST_CASE("Soft clip: above ceiling hard-limits", "[softclip]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.0f);

    auto input = GENERATE(1.5f, 2.0f, 10.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

// =============================================================================
// Sharpness Parameter Tests
// =============================================================================

TEST_CASE("Sharpness: 1.0 uses hard clip path", "[sharpness]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

    // At 80% of ceiling - should pass through unchanged in hard clip mode
    float input = 0.8f;
    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Sharpness: 0.999 uses hard clip path (threshold)", "[sharpness]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.999f);

    // At 80% of ceiling - should pass through unchanged in hard clip mode
    float input = 0.8f;
    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

TEST_CASE("Sharpness: 0.998 uses soft knee (different from hard clip)", "[sharpness]")
{
    auto clipperHard = makeClipper();
    auto clipperSoft = makeClipper();
    clipperHard.setCeiling(1.0f);
    clipperHard.setSharpness(1.0f);
    clipperSoft.setCeiling(1.0f);
    clipperSoft.setSharpness(0.998f);

    // At sharpness=0.998: knee = 0.001, kneeStart = 0.999
    // Input above kneeStart should show difference
    float input = 0.9995f;

    float outputHard = processSingleSample(clipperHard, input);
    float outputSoft = processSingleSample(clipperSoft, input);

    // Hard clip should pass through unchanged
    REQUIRE(outputHard == Approx(input).margin(kClipperTolerance));
    // Soft clip should be slightly compressed
    REQUIRE(outputSoft < input);
}

TEST_CASE("Sharpness: knee width formula verification", "[sharpness]")
{
    auto clipper = makeClipper();
    float ceiling = 1.0f;
    clipper.setCeiling(ceiling);

    // Test knee = (1 - sharpness) * ceiling * 0.5
    auto sharpness = GENERATE(0.0f, 0.25f, 0.5f, 0.75f, 0.9f);
    CAPTURE(sharpness);

    clipper.setSharpness(sharpness);

    float expectedKnee = (1.0f - sharpness) * ceiling * 0.5f;
    float expectedKneeStart = ceiling - expectedKnee;

    // Test that input at kneeStart passes through unchanged
    float inputAtKneeStart = expectedKneeStart;
    float outputAtKneeStart = processSingleSample(clipper, inputAtKneeStart);

    REQUIRE(outputAtKneeStart == Approx(inputAtKneeStart).margin(0.001f));

    // Test that input just above kneeStart is compressed
    if (expectedKnee > 0.01f)  // Only if knee is large enough
    {
        float inputAboveKnee = expectedKneeStart + expectedKnee * 0.5f;
        float outputAboveKnee = processSingleSample(clipper, inputAboveKnee);
        REQUIRE(outputAboveKnee < inputAboveKnee);
    }
}

TEST_CASE("Sharpness: higher sharpness = less compression", "[sharpness]")
{
    // Input level in the knee region for low sharpness
    float input = 0.7f;

    // Get outputs at different sharpness levels
    float outputs[4];
    float sharpnesses[] = { 0.0f, 0.25f, 0.5f, 0.75f };

    for (int i = 0; i < 4; ++i)
    {
        auto clipper = makeClipper();
        clipper.setCeiling(1.0f);
        clipper.setSharpness(sharpnesses[i]);
        outputs[i] = processSingleSample(clipper, input);
    }

    // Each higher sharpness should result in higher output (less compression)
    for (int i = 1; i < 4; ++i)
    {
        CAPTURE(sharpnesses[i], outputs[i-1], outputs[i]);
        REQUIRE(outputs[i] >= outputs[i-1] - 0.001f);
    }
}

// =============================================================================
// Edge Cases
// =============================================================================

TEST_CASE("Edge case: zero ceiling returns 0", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(0.0f);
    clipper.setSharpness(0.5f);

    auto input = GENERATE(0.0f, 0.5f, 1.0f, -1.0f);
    CAPTURE(input);

    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(0.0f).margin(kClipperTolerance));
}

TEST_CASE("Edge case: very large input still clips to ceiling", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    auto sharpness = GENERATE(0.0f, 0.5f, 1.0f);
    CAPTURE(sharpness);

    clipper.setSharpness(sharpness);

    float output = processSingleSample(clipper, 1000.0f);

    REQUIRE(output == Approx(1.0f).margin(kClipperTolerance));
}

TEST_CASE("Edge case: zero input passes through", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    auto sharpness = GENERATE(0.0f, 0.5f, 1.0f);
    CAPTURE(sharpness);

    clipper.setSharpness(sharpness);

    float output = processSingleSample(clipper, 0.0f);

    REQUIRE(output == Approx(0.0f).margin(kClipperTolerance));
}

TEST_CASE("Edge case: negative sharpness clamped to 0", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    // Set negative sharpness (should be clamped to 0)
    clipper.setSharpness(-0.5f);

    // At sharpness=0: kneeStart = 0.5
    // Input at 0.7 should be compressed
    float input = 0.7f;
    float output = processSingleSample(clipper, input);

    // Should behave like sharpness=0 (max soft knee)
    REQUIRE(output < input);
    REQUIRE(output > 0.5f);
}

TEST_CASE("Edge case: sharpness > 1 clamped to 1", "[edge]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);

    // Set sharpness > 1 (should be clamped to 1)
    clipper.setSharpness(1.5f);

    // At sharpness=1: hard clip mode
    // Input below ceiling should pass through unchanged
    float input = 0.8f;
    float output = processSingleSample(clipper, input);

    REQUIRE(output == Approx(input).margin(kClipperTolerance));
}

// =============================================================================
// Buffer Processing Tests
// =============================================================================

TEST_CASE("Buffer processing: multi-sample buffer", "[buffer]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(1.0f);

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
    clipper.setSharpness(1.0f);
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
    clipper.setSharpness(1.0f);
    clipper.setStereoLink(false);

    // L channel loud, R channel quiet
    auto [outL, outR] = processStereoSample(clipper, 1.5f, 0.5f);

    // L should clip, R should pass through unchanged
    REQUIRE(outL == Approx(1.0f).margin(kClipperTolerance));
    REQUIRE(outR == Approx(0.5f).margin(kClipperTolerance));
}

TEST_CASE("Stereo link enabled: same gain reduction to both channels", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.5f);  // Use soft clip for gain reduction
    clipper.setStereoLink(true);

    // Both channels at same level above threshold
    float input = 0.9f;
    auto [outL, outR] = processStereoSample(clipper, input, input);

    // Both channels should have identical output
    REQUIRE(outL == Approx(outR).margin(kClipperTolerance));
}

TEST_CASE("Stereo link enabled: quiet channel also reduced based on loud channel", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.5f);  // Use soft clip
    clipper.setStereoLink(true);

    // L channel very loud (will cause gain reduction)
    // R channel quiet (below knee start)
    float loudInput = 1.5f;
    float quietInput = 0.3f;

    auto [outL, outR] = processStereoSample(clipper, loudInput, quietInput);

    // L should be limited to ceiling
    REQUIRE(outL == Approx(1.0f).margin(kClipperTolerance));

    // R should be reduced proportionally (gain reduction applied)
    // The gain reduction is calculated based on the louder channel
    REQUIRE(outR < quietInput);
}

TEST_CASE("Stereo link: gain reduction calculation", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.5f);  // soft clip
    clipper.setStereoLink(true);

    // At sharpness=0.5: knee = 0.25, kneeStart = 0.75
    float loudInput = 1.0f;  // At ceiling
    float quietInput = 0.5f;

    auto [outL, outR] = processStereoSample(clipper, loudInput, quietInput);

    // L at ceiling should output ceiling
    REQUIRE(outL == Approx(1.0f).margin(kClipperTolerance));

    // R should be reduced by the same ratio
    float gainReduction = outL / loudInput;  // 1.0
    float expectedR = quietInput * gainReduction;
    REQUIRE(outR == Approx(expectedR).margin(0.01f));
}

TEST_CASE("Stereo link: both channels below threshold pass unchanged", "[stereolink]")
{
    auto clipper = makeClipper();
    clipper.setCeiling(1.0f);
    clipper.setSharpness(0.5f);  // kneeStart = 0.75
    clipper.setStereoLink(true);

    // Both channels well below kneeStart
    float inputL = 0.3f;
    float inputR = 0.5f;

    auto [outL, outR] = processStereoSample(clipper, inputL, inputR);

    // Both should pass through unchanged (below knee)
    REQUIRE(outL == Approx(inputL).margin(kClipperTolerance));
    REQUIRE(outR == Approx(inputR).margin(kClipperTolerance));
}

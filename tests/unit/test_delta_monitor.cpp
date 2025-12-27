#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/ClipperEngine.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::ClipperEngine;
using namespace test_utils;

namespace {

constexpr float kDeltaTolerance = 0.0001f;

// Helper to create stereo buffer with specific L/R values
juce::AudioBuffer<float> makeStereoBuffer(float left, float right, int numSamples = 1)
{
    juce::AudioBuffer<float> buffer(2, numSamples);
    for (int i = 0; i < numSamples; ++i)
    {
        buffer.setSample(0, i, left);
        buffer.setSample(1, i, right);
    }
    return buffer;
}

// Isolated delta calculation (matches ClipperEngine logic)
float calculateDelta(float dry, float wet)
{
    return dry - wet;
}

} // namespace

// =============================================================================
// Isolated Math Tests [delta][math]
// These test the raw dry - wet calculation
// =============================================================================

TEST_CASE("Delta math: no clipping (dry == wet)", "[delta][math]")
{
    auto value = GENERATE(0.0f, 0.5f, 1.0f, -0.5f, -1.0f);
    CAPTURE(value);

    float delta = calculateDelta(value, value);

    REQUIRE(delta == Approx(0.0f).margin(kDeltaTolerance));
}

TEST_CASE("Delta math: hard clip DC above ceiling", "[delta][math]")
{
    // Dry = 1.5, Wet = 1.0 (clipped to ceiling)
    float delta = calculateDelta(1.5f, 1.0f);

    REQUIRE(delta == Approx(0.5f).margin(kDeltaTolerance));
}

TEST_CASE("Delta math: hard clip negative above ceiling", "[delta][math]")
{
    // Dry = -1.5, Wet = -1.0 (clipped to -ceiling)
    float delta = calculateDelta(-1.5f, -1.0f);

    REQUIRE(delta == Approx(-0.5f).margin(kDeltaTolerance));
}

TEST_CASE("Delta math: partial clip", "[delta][math]")
{
    // Dry = 1.2, Wet = 1.0
    float delta = calculateDelta(1.2f, 1.0f);

    REQUIRE(delta == Approx(0.2f).margin(kDeltaTolerance));
}

TEST_CASE("Delta math: zero input", "[delta][math]")
{
    float delta = calculateDelta(0.0f, 0.0f);

    REQUIRE(delta == Approx(0.0f).margin(kDeltaTolerance));
}

TEST_CASE("Delta math: extreme values", "[delta][math]")
{
    // Very large input clipped to ceiling
    float delta = calculateDelta(100.0f, 1.0f);

    REQUIRE(delta == Approx(99.0f).margin(kDeltaTolerance));
}

// =============================================================================
// Signal Reconstruction Tests [delta][reconstruction]
// =============================================================================

TEST_CASE("Delta reconstruction: wet + delta = dry", "[delta][reconstruction]")
{
    auto [dry, wet] = GENERATE(
        std::make_pair(1.5f, 1.0f),
        std::make_pair(-1.5f, -1.0f),
        std::make_pair(0.8f, 0.8f),
        std::make_pair(2.0f, 1.0f),
        std::make_pair(-2.0f, -1.0f)
    );
    CAPTURE(dry, wet);

    float delta = calculateDelta(dry, wet);
    float reconstructed = wet + delta;

    REQUIRE(reconstructed == Approx(dry).margin(kDeltaTolerance));
}

// =============================================================================
// ClipperEngine Integration Tests [delta][engine]
// These test the full delta monitor through ClipperEngine
// =============================================================================

TEST_CASE("Engine delta: signal below ceiling produces silence", "[delta][engine]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setSharpness(1.0f);         // Hard clip
    engine.setOversamplingFactor(0);   // 1x (no oversampling)
    engine.setInputGain(0.0f);         // Unity gain
    engine.setOutputGain(0.0f);
    engine.setDeltaMonitor(true);

    // Signal below ceiling - should not clip
    auto buffer = makeStereoBuffer(0.5f, 0.5f, kBlockSize);
    engine.process(buffer);

    // Delta should be ~0 (nothing clipped)
    float peak = calculatePeak(buffer);
    REQUIRE(peak < 0.01f);
}

TEST_CASE("Engine delta: signal above ceiling produces delta", "[delta][engine]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setSharpness(1.0f);         // Hard clip
    engine.setOversamplingFactor(0);   // 1x (no oversampling)
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setDeltaMonitor(true);

    // Signal above ceiling - should produce delta
    float inputLevel = 1.5f;
    auto buffer = makeStereoBuffer(inputLevel, inputLevel, kBlockSize);
    engine.process(buffer);

    // Delta should be ~0.5 (1.5 - 1.0)
    // Check that output is non-zero and positive (clipped amount)
    float peak = calculatePeak(buffer);
    REQUIRE(peak > 0.4f);
    REQUIRE(peak < 0.6f);  // Should be ~0.5
}

TEST_CASE("Engine delta: stereo independent channels", "[delta][engine]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setSharpness(1.0f);         // Hard clip
    engine.setOversamplingFactor(0);   // 1x
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setStereoLink(false);       // Independent channels
    engine.setDeltaMonitor(true);

    // L clips, R doesn't
    float inputL = 1.5f;
    float inputR = 0.5f;
    auto buffer = makeStereoBuffer(inputL, inputR, kBlockSize);
    engine.process(buffer);

    // L should have delta ~0.5, R should be ~0
    float peakL = 0.0f, peakR = 0.0f;
    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        peakL = std::max(peakL, std::abs(buffer.getSample(0, i)));
        peakR = std::max(peakR, std::abs(buffer.getSample(1, i)));
    }

    REQUIRE(peakL > 0.4f);   // L has delta
    REQUIRE(peakR < 0.01f);  // R is silent (no clipping)
}

TEST_CASE("Engine delta: disabled outputs wet signal", "[delta][engine]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setSharpness(1.0f);         // Hard clip
    engine.setOversamplingFactor(0);   // 1x
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setDeltaMonitor(false);     // Delta disabled

    // Signal above ceiling
    float inputLevel = 1.5f;
    auto buffer = makeStereoBuffer(inputLevel, inputLevel, kBlockSize);
    engine.process(buffer);

    // Output should be clipped signal (ceiling), not delta
    float peak = calculatePeak(buffer);
    REQUIRE(peak == Approx(1.0f).margin(0.01f));
}

TEST_CASE("Engine delta: works with both filter types", "[delta][engine]")
{
    // Delta monitoring should work with minimum-phase AND linear-phase
    // Both oversamplers use same filter type for phase-matched cancellation

    auto isLinearPhase = GENERATE(false, true);
    CAPTURE(isLinearPhase);

    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setSharpness(1.0f);         // Hard clip
    engine.setOversamplingFactor(2);   // 4x - actually uses filters
    engine.setFilterType(isLinearPhase);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setDeltaMonitor(true);

    // Linear-phase has ~1700 samples latency, need multiple blocks
    // Process enough blocks to get past the latency
    int numBlocks = isLinearPhase ? 8 : 1;
    float inputLevel = 1.5f;
    float maxPeak = 0.0f;

    for (int i = 0; i < numBlocks; ++i)
    {
        auto buffer = makeStereoBuffer(inputLevel, inputLevel, kBlockSize);
        engine.process(buffer);
        maxPeak = std::max(maxPeak, calculatePeak(buffer));
    }

    // Delta should be non-zero (clipped amount)
    REQUIRE(maxPeak > 0.3f);  // Should have significant delta
}

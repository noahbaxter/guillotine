#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/StereoProcessor.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::StereoProcessor;
using namespace test_utils;

namespace {

constexpr float kMSTolerance = 0.0001f;

// Helper to create stereo buffer with specific L/R values
juce::AudioBuffer<float> makeStereoBuffer(float left, float right)
{
    juce::AudioBuffer<float> buffer(2, 1);
    buffer.setSample(0, 0, left);
    buffer.setSample(1, 0, right);
    return buffer;
}

// Helper to get L/R values from buffer
std::pair<float, float> getStereo(const juce::AudioBuffer<float>& buffer)
{
    return { buffer.getSample(0, 0), buffer.getSample(1, 0) };
}

} // namespace

// =============================================================================
// Round-Trip Tests [stereo][roundtrip]
// =============================================================================

TEST_CASE("Round-trip is lossless", "[stereo][roundtrip]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto [inputL, inputR] = GENERATE(
        std::make_pair(0.5f, 0.5f),
        std::make_pair(1.0f, 0.0f),
        std::make_pair(0.0f, 1.0f),
        std::make_pair(1.0f, -1.0f),
        std::make_pair(0.3f, 0.7f),
        std::make_pair(-0.5f, 0.5f)
    );
    CAPTURE(inputL, inputR);

    auto buffer = makeStereoBuffer(inputL, inputR);

    processor.encodeToMidSide(buffer);
    processor.decodeFromMidSide(buffer);

    auto [outL, outR] = getStereo(buffer);

    REQUIRE(outL == Approx(inputL).margin(kMSTolerance));
    REQUIRE(outR == Approx(inputR).margin(kMSTolerance));
}

TEST_CASE("Multiple round-trips stable", "[stereo][roundtrip]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    float inputL = 0.6f;
    float inputR = 0.4f;

    auto buffer = makeStereoBuffer(inputL, inputR);

    // 10 round-trips
    for (int i = 0; i < 10; ++i)
    {
        processor.encodeToMidSide(buffer);
        processor.decodeFromMidSide(buffer);
    }

    auto [outL, outR] = getStereo(buffer);

    REQUIRE(outL == Approx(inputL).margin(kMSTolerance));
    REQUIRE(outR == Approx(inputR).margin(kMSTolerance));
}

// =============================================================================
// Encode Tests [stereo][encode]
// =============================================================================

TEST_CASE("Encode: mono signal (L=R) produces M=L, S=0", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(0.5f, 0.5f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    REQUIRE(mid == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(side == Approx(0.0f).margin(kMSTolerance));
}

TEST_CASE("Encode: hard pan left", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(1.0f, 0.0f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    // M = (1+0)/2 = 0.5, S = (1-0)/2 = 0.5
    REQUIRE(mid == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(side == Approx(0.5f).margin(kMSTolerance));
}

TEST_CASE("Encode: hard pan right", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(0.0f, 1.0f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    // M = (0+1)/2 = 0.5, S = (0-1)/2 = -0.5
    REQUIRE(mid == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(side == Approx(-0.5f).margin(kMSTolerance));
}

TEST_CASE("Encode: out of phase", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(1.0f, -1.0f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    // M = (1 + -1)/2 = 0, S = (1 - -1)/2 = 1
    REQUIRE(mid == Approx(0.0f).margin(kMSTolerance));
    REQUIRE(side == Approx(1.0f).margin(kMSTolerance));
}

TEST_CASE("Encode: silence", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(0.0f, 0.0f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    REQUIRE(mid == Approx(0.0f).margin(kMSTolerance));
    REQUIRE(side == Approx(0.0f).margin(kMSTolerance));
}

TEST_CASE("Encode: full scale stereo", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(1.0f, 1.0f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    // M = (1+1)/2 = 1, S = (1-1)/2 = 0
    REQUIRE(mid == Approx(1.0f).margin(kMSTolerance));
    REQUIRE(side == Approx(0.0f).margin(kMSTolerance));
}

TEST_CASE("Encode: opposite polarity", "[stereo][encode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    auto buffer = makeStereoBuffer(-0.5f, 0.5f);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);

    // M = (-0.5 + 0.5)/2 = 0, S = (-0.5 - 0.5)/2 = -0.5
    REQUIRE(mid == Approx(0.0f).margin(kMSTolerance));
    REQUIRE(side == Approx(-0.5f).margin(kMSTolerance));
}

// =============================================================================
// Decode Tests [stereo][decode]
// =============================================================================

TEST_CASE("Decode: mid only", "[stereo][decode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    // Start with M=0.5, S=0 (already in M/S domain)
    auto buffer = makeStereoBuffer(0.5f, 0.0f);
    processor.decodeFromMidSide(buffer);

    auto [left, right] = getStereo(buffer);

    // L = M+S = 0.5+0 = 0.5, R = M-S = 0.5-0 = 0.5
    REQUIRE(left == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(right == Approx(0.5f).margin(kMSTolerance));
}

TEST_CASE("Decode: side only", "[stereo][decode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    // Start with M=0, S=0.5 (already in M/S domain)
    auto buffer = makeStereoBuffer(0.0f, 0.5f);
    processor.decodeFromMidSide(buffer);

    auto [left, right] = getStereo(buffer);

    // L = M+S = 0+0.5 = 0.5, R = M-S = 0-0.5 = -0.5
    REQUIRE(left == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(right == Approx(-0.5f).margin(kMSTolerance));
}

TEST_CASE("Decode: both mid and side", "[stereo][decode]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    // Start with M=0.5, S=0.25 (already in M/S domain)
    auto buffer = makeStereoBuffer(0.5f, 0.25f);
    processor.decodeFromMidSide(buffer);

    auto [left, right] = getStereo(buffer);

    // L = M+S = 0.5+0.25 = 0.75, R = M-S = 0.5-0.25 = 0.25
    REQUIRE(left == Approx(0.75f).margin(kMSTolerance));
    REQUIRE(right == Approx(0.25f).margin(kMSTolerance));
}

// =============================================================================
// Edge Cases [stereo][edge]
// =============================================================================

TEST_CASE("Disabled mode: buffer unchanged on encode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(false);

    float inputL = 0.6f;
    float inputR = 0.4f;
    auto buffer = makeStereoBuffer(inputL, inputR);

    processor.encodeToMidSide(buffer);

    auto [outL, outR] = getStereo(buffer);

    REQUIRE(outL == Approx(inputL).margin(kMSTolerance));
    REQUIRE(outR == Approx(inputR).margin(kMSTolerance));
}

TEST_CASE("Disabled mode: buffer unchanged on decode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(false);

    float inputL = 0.6f;
    float inputR = 0.4f;
    auto buffer = makeStereoBuffer(inputL, inputR);

    processor.decodeFromMidSide(buffer);

    auto [outL, outR] = getStereo(buffer);

    REQUIRE(outL == Approx(inputL).margin(kMSTolerance));
    REQUIRE(outR == Approx(inputR).margin(kMSTolerance));
}

TEST_CASE("Single channel buffer: unchanged on encode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    juce::AudioBuffer<float> buffer(1, 1);
    buffer.setSample(0, 0, 0.5f);

    processor.encodeToMidSide(buffer);

    REQUIRE(buffer.getSample(0, 0) == Approx(0.5f).margin(kMSTolerance));
}

TEST_CASE("Single channel buffer: unchanged on decode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    juce::AudioBuffer<float> buffer(1, 1);
    buffer.setSample(0, 0, 0.5f);

    processor.decodeFromMidSide(buffer);

    REQUIRE(buffer.getSample(0, 0) == Approx(0.5f).margin(kMSTolerance));
}

TEST_CASE("Empty buffer: no crash on encode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    juce::AudioBuffer<float> buffer(2, 0);

    // Should not crash
    processor.encodeToMidSide(buffer);

    REQUIRE(buffer.getNumSamples() == 0);
}

TEST_CASE("Empty buffer: no crash on decode", "[stereo][edge]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    juce::AudioBuffer<float> buffer(2, 0);

    // Should not crash
    processor.decodeFromMidSide(buffer);

    REQUIRE(buffer.getNumSamples() == 0);
}

TEST_CASE("Mode toggle: can switch modes dynamically", "[stereo][edge]")
{
    StereoProcessor processor;

    auto buffer = makeStereoBuffer(0.6f, 0.4f);

    // Start disabled
    REQUIRE(processor.isMidSideMode() == false);

    // Enable and encode
    processor.setMidSideMode(true);
    REQUIRE(processor.isMidSideMode() == true);
    processor.encodeToMidSide(buffer);

    auto [mid, side] = getStereo(buffer);
    REQUIRE(mid == Approx(0.5f).margin(kMSTolerance));  // (0.6+0.4)/2
    REQUIRE(side == Approx(0.1f).margin(kMSTolerance)); // (0.6-0.4)/2

    // Disable - decode should do nothing
    processor.setMidSideMode(false);
    processor.decodeFromMidSide(buffer);

    // Buffer should still contain M/S values (decode skipped)
    auto [stillMid, stillSide] = getStereo(buffer);
    REQUIRE(stillMid == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(stillSide == Approx(0.1f).margin(kMSTolerance));
}

// =============================================================================
// Multi-Sample Buffer Tests [stereo][buffer]
// =============================================================================

TEST_CASE("Multi-sample buffer: all samples processed", "[stereo][buffer]")
{
    StereoProcessor processor;
    processor.setMidSideMode(true);

    juce::AudioBuffer<float> buffer(2, 4);
    // L: 1.0, 0.0, 0.5, -0.5
    // R: 0.0, 1.0, 0.5, 0.5
    buffer.setSample(0, 0, 1.0f);  buffer.setSample(1, 0, 0.0f);
    buffer.setSample(0, 1, 0.0f);  buffer.setSample(1, 1, 1.0f);
    buffer.setSample(0, 2, 0.5f);  buffer.setSample(1, 2, 0.5f);
    buffer.setSample(0, 3, -0.5f); buffer.setSample(1, 3, 0.5f);

    processor.encodeToMidSide(buffer);

    // Sample 0: M = 0.5, S = 0.5 (hard pan left)
    REQUIRE(buffer.getSample(0, 0) == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(buffer.getSample(1, 0) == Approx(0.5f).margin(kMSTolerance));

    // Sample 1: M = 0.5, S = -0.5 (hard pan right)
    REQUIRE(buffer.getSample(0, 1) == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(buffer.getSample(1, 1) == Approx(-0.5f).margin(kMSTolerance));

    // Sample 2: M = 0.5, S = 0 (mono)
    REQUIRE(buffer.getSample(0, 2) == Approx(0.5f).margin(kMSTolerance));
    REQUIRE(buffer.getSample(1, 2) == Approx(0.0f).margin(kMSTolerance));

    // Sample 3: M = 0, S = -0.5 (opposite polarity)
    REQUIRE(buffer.getSample(0, 3) == Approx(0.0f).margin(kMSTolerance));
    REQUIRE(buffer.getSample(1, 3) == Approx(-0.5f).margin(kMSTolerance));
}

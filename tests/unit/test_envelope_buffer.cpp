#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "dsp/EnvelopeBuffer.h"
#include <vector>

using Catch::Approx;
using dsp::EnvelopeBuffer;

namespace {
constexpr float kTolerance = 0.0001f;
constexpr double kSampleRate = 44100.0;
constexpr double kPointDuration = 0.01;  // 10ms
constexpr int kSamplesPerPoint = 441;    // 44100 * 0.01

// Helper: create envelope data filled with a constant value
std::vector<float> constEnv(float value, int numSamples)
{
    return std::vector<float>(static_cast<size_t>(numSamples), value);
}
}

// =============================================================================
// Basic Functionality [envelope][basic]
// =============================================================================

TEST_CASE("Initial state is zeroed", "[envelope][basic]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    REQUIRE(buffer.getWritePosition() == 0);

    const auto& preClip = buffer.getPreClipBuffer();
    const auto& postClip = buffer.getPostClipBuffer();

    for (size_t i = 0; i < 100; ++i)
    {
        REQUIRE(preClip[i] == 0.0f);
        REQUIRE(postClip[i] == 0.0f);
    }
}

TEST_CASE("Reset clears buffer", "[envelope][basic]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    auto env = constEnv(0.5f, kSamplesPerPoint);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.3f, 0.0f);
    REQUIRE(buffer.getWritePosition() == 1);

    buffer.reset();

    REQUIRE(buffer.getWritePosition() == 0);
    REQUIRE(buffer.getPreClipBuffer()[0] == 0.0f);
}

// =============================================================================
// Write Position [envelope][writepos]
// =============================================================================

TEST_CASE("Write position advances after enough samples", "[envelope][writepos]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    REQUIRE(buffer.getWritePosition() == 0);

    auto env = constEnv(0.5f, kSamplesPerPoint);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 1);
}

TEST_CASE("Write position stays same if not enough samples", "[envelope][writepos]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    int n = kSamplesPerPoint - 1;
    auto env = constEnv(0.5f, n);
    buffer.processSamples(env.data(), n, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 0);
}

TEST_CASE("Write position wraps at buffer size", "[envelope][writepos]")
{
    EnvelopeBuffer<10> buffer;  // Small buffer for easy testing
    buffer.prepare(kSampleRate, kPointDuration);

    auto env = constEnv(0.1f, kSamplesPerPoint);
    for (int i = 0; i < 10; ++i)
    {
        buffer.processSamples(env.data(), kSamplesPerPoint, 0.1f, 0.0f);
    }

    REQUIRE(buffer.getWritePosition() == 0);  // Wrapped back to start
}

TEST_CASE("Write position wraps correctly after multiple cycles", "[envelope][writepos]")
{
    EnvelopeBuffer<10> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    auto env = constEnv(0.1f, kSamplesPerPoint);
    for (int i = 0; i < 25; ++i)
    {
        buffer.processSamples(env.data(), kSamplesPerPoint, 0.1f, 0.0f);
    }

    REQUIRE(buffer.getWritePosition() == 5);  // 25 % 10 = 5
}

// =============================================================================
// Peak Accumulation [envelope][peaks]
// =============================================================================

TEST_CASE("Peak accumulates across blocks", "[envelope][peaks]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    int samplesRemaining = kSamplesPerPoint;
    int chunkSize = kSamplesPerPoint / 4;

    auto env1 = constEnv(0.2f, chunkSize);
    buffer.processSamples(env1.data(), chunkSize, 0.1f, 0.0f);
    samplesRemaining -= chunkSize;

    auto env2 = constEnv(0.8f, chunkSize);  // Higher peak
    buffer.processSamples(env2.data(), chunkSize, 0.6f, 0.0f);
    samplesRemaining -= chunkSize;

    auto env3 = constEnv(0.3f, chunkSize);  // Lower peak
    buffer.processSamples(env3.data(), chunkSize, 0.2f, 0.0f);
    samplesRemaining -= chunkSize;

    auto env4 = constEnv(0.1f, samplesRemaining);  // Finish the point
    buffer.processSamples(env4.data(), samplesRemaining, 0.05f, 0.0f);

    // Buffer should contain the maximum peaks seen
    REQUIRE(buffer.getPreClipBuffer()[0] == Approx(0.8f).margin(kTolerance));
    REQUIRE(buffer.getPostClipBuffer()[0] == Approx(0.6f).margin(kTolerance));
}

TEST_CASE("Peaks reset after writing to buffer", "[envelope][peaks]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    // First point with high peak
    auto env1 = constEnv(0.9f, kSamplesPerPoint);
    buffer.processSamples(env1.data(), kSamplesPerPoint, 0.7f, 0.0f);

    // Second point with low peak
    auto env2 = constEnv(0.1f, kSamplesPerPoint);
    buffer.processSamples(env2.data(), kSamplesPerPoint, 0.05f, 0.0f);

    // Second point should have its own (lower) peak, not accumulated
    REQUIRE(buffer.getPreClipBuffer()[0] == Approx(0.9f).margin(kTolerance));
    REQUIRE(buffer.getPreClipBuffer()[1] == Approx(0.1f).margin(kTolerance));
}

TEST_CASE("Zero peaks are valid", "[envelope][peaks]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    auto env = constEnv(0.0f, kSamplesPerPoint);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.0f, 0.0f);

    REQUIRE(buffer.getPreClipBuffer()[0] == 0.0f);
    REQUIRE(buffer.getPostClipBuffer()[0] == 0.0f);
}

// =============================================================================
// Threshold Storage [envelope][threshold]
// =============================================================================

TEST_CASE("Threshold is stored with each point", "[envelope][threshold]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    auto env = constEnv(0.5f, kSamplesPerPoint);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.3f, 0.25f);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.3f, 0.5f);
    buffer.processSamples(env.data(), kSamplesPerPoint, 0.3f, 0.75f);

    REQUIRE(buffer.getThresholdBuffer()[0] == Approx(0.25f).margin(kTolerance));
    REQUIRE(buffer.getThresholdBuffer()[1] == Approx(0.5f).margin(kTolerance));
    REQUIRE(buffer.getThresholdBuffer()[2] == Approx(0.75f).margin(kTolerance));
}

// =============================================================================
// Sample Rate Handling [envelope][samplerate]
// =============================================================================

TEST_CASE("Different sample rates adjust samples per point", "[envelope][samplerate]")
{
    EnvelopeBuffer<100> buffer;

    // At 96kHz, 10ms = 960 samples
    buffer.prepare(96000.0, 0.01);

    auto env = constEnv(0.5f, 960);
    buffer.processSamples(env.data(), 960, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 1);
}

TEST_CASE("Prepare resets timing state", "[envelope][samplerate]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    // Accumulate some samples (but not enough for a point)
    int half = kSamplesPerPoint / 2;
    auto env1 = constEnv(0.5f, half);
    buffer.processSamples(env1.data(), half, 0.3f, 0.0f);

    // Re-prepare (simulates sample rate change)
    buffer.prepare(kSampleRate, kPointDuration);

    // Now process should start fresh
    auto env2 = constEnv(0.8f, kSamplesPerPoint);
    buffer.processSamples(env2.data(), kSamplesPerPoint, 0.6f, 0.0f);

    // Should have written one point at position 0
    REQUIRE(buffer.getWritePosition() == 1);
    REQUIRE(buffer.getPreClipBuffer()[0] == Approx(0.8f).margin(kTolerance));
}

// =============================================================================
// Large Block Handling [envelope][blocks]
// =============================================================================

TEST_CASE("Large block writes multiple points", "[envelope][blocks]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    // Process 3 points worth of samples at once
    int n = kSamplesPerPoint * 3;
    auto env = constEnv(0.5f, n);
    buffer.processSamples(env.data(), n, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 3);
}

TEST_CASE("Large block with remainder handles correctly", "[envelope][blocks]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    // Process 2.5 points worth
    int halfPoint = kSamplesPerPoint / 2;
    int n = kSamplesPerPoint * 2 + halfPoint;
    auto env1 = constEnv(0.5f, n);
    buffer.processSamples(env1.data(), n, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 2);

    // Process the remaining samples to complete the third point
    int remaining = kSamplesPerPoint - halfPoint;
    auto env2 = constEnv(0.5f, remaining);
    buffer.processSamples(env2.data(), remaining, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 3);
}

// =============================================================================
// Edge Cases [envelope][edge]
// =============================================================================

TEST_CASE("Zero samples does not crash", "[envelope][edge]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    float dummy = 0.5f;
    buffer.processSamples(&dummy, 0, 0.3f, 0.0f);

    REQUIRE(buffer.getWritePosition() == 0);
}

TEST_CASE("Very small buffer wraps correctly", "[envelope][edge]")
{
    EnvelopeBuffer<2> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    auto env1 = constEnv(0.1f, kSamplesPerPoint);
    buffer.processSamples(env1.data(), kSamplesPerPoint, 0.1f, 0.0f);
    REQUIRE(buffer.getWritePosition() == 1);  // wrote to [0], now at 1

    auto env2 = constEnv(0.2f, kSamplesPerPoint);
    buffer.processSamples(env2.data(), kSamplesPerPoint, 0.2f, 0.0f);
    REQUIRE(buffer.getWritePosition() == 0);  // wrote to [1], wrapped to 0

    auto env3 = constEnv(0.3f, kSamplesPerPoint);
    buffer.processSamples(env3.data(), kSamplesPerPoint, 0.3f, 0.0f);
    REQUIRE(buffer.getWritePosition() == 1);  // wrote to [0], now at 1

    // After 3 writes: [0]=0.3 (3rd write), [1]=0.2 (2nd write)
    REQUIRE(buffer.getPreClipBuffer()[0] == Approx(0.3f).margin(kTolerance));
    REQUIRE(buffer.getPreClipBuffer()[1] == Approx(0.2f).margin(kTolerance));
}

TEST_CASE("Negative envelope values don't beat positive peaks", "[envelope][edge]")
{
    EnvelopeBuffer<100> buffer;
    buffer.prepare(kSampleRate, kPointDuration);

    // Process full point: positive envelope first, then negative
    int halfPoint = kSamplesPerPoint / 2;
    int remaining = kSamplesPerPoint - halfPoint;

    auto env1 = constEnv(0.5f, halfPoint);
    buffer.processSamples(env1.data(), halfPoint, 0.3f, 0.0f);

    auto env2 = constEnv(-0.9f, remaining);  // Negative won't beat positive
    buffer.processSamples(env2.data(), remaining, -0.9f, 0.0f);

    // Peak should be the positive value (negative -0.9 < 0.5)
    REQUIRE(buffer.getPreClipBuffer()[0] == Approx(0.5f).margin(kTolerance));
    REQUIRE(buffer.getPostClipBuffer()[0] == Approx(0.3f).margin(kTolerance));
}

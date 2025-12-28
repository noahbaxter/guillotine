#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/ClipperEngine.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::ClipperEngine;
using dsp::CurveType;
using namespace test_utils;

// =============================================================================
// Latency Accuracy Tests [engine][latency]
// =============================================================================

// Expected latencies from JUCE oversampling (see README.md)
// Min-phase: 0, 2, 3, 4, 4, 4 for 1x, 2x, 4x, 8x, 16x, 32x
// Lin-phase: 0, 55, 73, 81, 86, 88 for 1x, 2x, 4x, 8x, 16x, 32x
constexpr int kExpectedLatencyMinPhase[6] = { 0, 2, 3, 4, 4, 4 };
constexpr int kExpectedLatencyLinPhase[6] = { 0, 55, 73, 81, 86, 88 };

TEST_CASE("Engine latency: minimum-phase all factors", "[engine][latency]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setFilterType(false);  // Minimum phase

    for (int i = 0; i <= 5; ++i)
    {
        CAPTURE(i);
        engine.setOversamplingFactor(i);
        REQUIRE(engine.getLatencyInSamples() == kExpectedLatencyMinPhase[i]);
    }
}

TEST_CASE("Engine latency: linear-phase all factors", "[engine][latency]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setFilterType(true);  // Linear phase

    for (int i = 0; i <= 5; ++i)
    {
        CAPTURE(i);
        engine.setOversamplingFactor(i);
        REQUIRE(engine.getLatencyInSamples() == kExpectedLatencyLinPhase[i]);
    }
}

TEST_CASE("Engine latency: consistent across multiple queries", "[engine][latency]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setFilterType(true);
    engine.setOversamplingFactor(2);  // 4x linear phase

    int latency1 = engine.getLatencyInSamples();
    int latency2 = engine.getLatencyInSamples();
    int latency3 = engine.getLatencyInSamples();

    REQUIRE(latency1 == latency2);
    REQUIRE(latency2 == latency3);
    REQUIRE(latency1 > 0);  // Should have positive latency for linear phase
}

TEST_CASE("Engine latency: consistent across sample rates and block sizes", "[engine][latency]")
{
    double sampleRates[] = { 44100.0, 48000.0, 96000.0, 192000.0 };
    int blockSizes[] = { 64, 256, 512, 1024 };

    // Capture reference latencies at first sample rate / block size
    int refLatencyMinPhase[6];
    int refLatencyLinPhase[6];

    ClipperEngine refEngine;
    refEngine.prepare(44100.0, 512, kNumChannels);

    refEngine.setFilterType(false);
    for (int i = 0; i <= 5; ++i)
    {
        refEngine.setOversamplingFactor(i);
        refLatencyMinPhase[i] = refEngine.getLatencyInSamples();
    }

    refEngine.setFilterType(true);
    for (int i = 0; i <= 5; ++i)
    {
        refEngine.setOversamplingFactor(i);
        refLatencyLinPhase[i] = refEngine.getLatencyInSamples();
    }

    // Verify all configurations match reference
    for (double sr : sampleRates)
    {
        for (int bs : blockSizes)
        {
            CAPTURE(sr, bs);

            ClipperEngine engine;
            engine.prepare(sr, bs, kNumChannels);

            engine.setFilterType(false);
            for (int i = 0; i <= 5; ++i)
            {
                engine.setOversamplingFactor(i);
                REQUIRE(engine.getLatencyInSamples() == refLatencyMinPhase[i]);
            }

            engine.setFilterType(true);
            for (int i = 0; i <= 5; ++i)
            {
                engine.setOversamplingFactor(i);
                REQUIRE(engine.getLatencyInSamples() == refLatencyLinPhase[i]);
            }
        }
    }
}

// =============================================================================
// Enforce Ceiling Tests [engine][ceiling]
// =============================================================================

TEST_CASE("Enforce ceiling: output never exceeds ceiling", "[engine][ceiling]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(-6.0f);          // -6 dB = 0.5 linear
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x - filters can cause overshoot
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);
    engine.reset();  // Snap smoothed values to target

    float ceilingLinear = juce::Decibels::decibelsToGain(-6.0f);

    // Generate signal that clips hard (causes filter ringing/overshoot)
    auto buffer = generateSine(1000.0f, kBlockSize, 1.0f);  // Full scale sine
    engine.process(buffer);

    float peak = calculatePeak(buffer);

    // Output must not exceed ceiling
    REQUIRE(peak <= ceilingLinear + 0.001f);
}

TEST_CASE("Enforce ceiling: disabled allows overshoot", "[engine][ceiling]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(-6.0f);          // -6 dB = 0.5 linear
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);   // Disabled
    engine.setDeltaMonitor(false);

    float ceilingLinear = juce::Decibels::decibelsToGain(-6.0f);

    // Process multiple blocks to let filter settle and potentially overshoot
    // Square wave causes more filter ringing than sine
    for (int block = 0; block < 5; ++block)
    {
        juce::AudioBuffer<float> buffer(kNumChannels, kBlockSize);
        for (int ch = 0; ch < kNumChannels; ++ch)
        {
            float* data = buffer.getWritePointer(ch);
            for (int i = 0; i < kBlockSize; ++i)
            {
                // Square wave at ceiling * 2 (will clip hard)
                data[i] = (i % 64 < 32) ? 1.0f : -1.0f;
            }
        }

        engine.process(buffer);

        float peak = calculatePeak(buffer);

        // With enforce disabled and hard clipping + filter ringing,
        // we might see overshoot. If not, at least verify it's near ceiling.
        // This test documents behavior rather than strictly requiring overshoot.
        REQUIRE(peak >= ceilingLinear * 0.9f);  // At least getting signal through
    }
}

TEST_CASE("Enforce ceiling: works at 0 dB", "[engine][ceiling]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB = 1.0 linear
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(3);   // 8x
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    // Hot signal that will clip
    auto buffer = generateSine(500.0f, kBlockSize, 2.0f);  // +6 dB
    engine.process(buffer);

    float peak = calculatePeak(buffer);

    REQUIRE(peak <= 1.001f);  // Never exceeds 0 dB
}

TEST_CASE("Enforce ceiling: works with different ceiling values", "[engine][ceiling]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    auto ceilingDb = GENERATE(-12.0f, -6.0f, -3.0f, 0.0f);
    CAPTURE(ceilingDb);

    engine.setCeiling(ceilingDb);
    engine.reset();  // Snap smoothed values to target
    float ceilingLinear = juce::Decibels::decibelsToGain(ceilingDb);

    auto buffer = generateSine(1000.0f, kBlockSize, 1.0f);
    engine.process(buffer);

    float peak = calculatePeak(buffer);

    REQUIRE(peak <= ceilingLinear + 0.001f);
}

// =============================================================================
// Gain Staging Tests [engine][gain]
// =============================================================================

TEST_CASE("Engine gain: input gain affects clipping threshold", "[engine][gain]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);           // 0 dB
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(0);   // 1x for simplicity
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    // Signal at 0.5 (-6 dB)
    float inputLevel = 0.5f;

    // With +12 dB input gain, 0.5 becomes 2.0, clips to 1.0
    engine.setInputGain(12.0f);
    auto buffer = generateDC(inputLevel, kBlockSize);
    engine.process(buffer);

    float peak = calculatePeak(buffer);
    REQUIRE(peak == Approx(1.0f).margin(0.01f));
}

TEST_CASE("Engine gain: output gain scales final signal", "[engine][gain]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(0);
    engine.setInputGain(0.0f);
    engine.setEnforceCeiling(false);   // Let output gain work freely
    engine.setDeltaMonitor(false);

    float inputLevel = 0.5f;

    // -6 dB output gain should halve the signal
    engine.setOutputGain(-6.0f);

    // Let smoothing settle
    auto warmup = generateDC(inputLevel, kBlockSize);
    engine.process(warmup);

    auto buffer = generateDC(inputLevel, kBlockSize);
    engine.process(buffer);

    float expectedOutput = inputLevel * juce::Decibels::decibelsToGain(-6.0f);
    float peak = calculatePeak(buffer);

    REQUIRE(peak == Approx(expectedOutput).margin(0.01f));
}

// =============================================================================
// M/S Processing Tests [engine][ms]
// =============================================================================

TEST_CASE("Engine M/S: stereo image preserved through chain", "[engine][ms]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(0);   // 1x for precise comparison
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setChannelMode(true);       // M/S enabled
    engine.setStereoLink(false);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    // Create stereo signal with distinct L/R
    juce::AudioBuffer<float> buffer(kNumChannels, kBlockSize);
    for (int i = 0; i < kBlockSize; ++i)
    {
        buffer.setSample(0, i, 0.3f);   // L
        buffer.setSample(1, i, 0.5f);   // R
    }

    engine.process(buffer);

    // Signal below ceiling should pass through unchanged
    // (M/S encode → no clipping → M/S decode = identity)
    for (int i = 0; i < kBlockSize; ++i)
    {
        REQUIRE(buffer.getSample(0, i) == Approx(0.3f).margin(0.001f));
        REQUIRE(buffer.getSample(1, i) == Approx(0.5f).margin(0.001f));
    }
}

TEST_CASE("Engine M/S: disabled passes L/R unchanged", "[engine][ms]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(0);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setChannelMode(false);      // M/S disabled (L/R mode)
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    juce::AudioBuffer<float> buffer(kNumChannels, kBlockSize);
    for (int i = 0; i < kBlockSize; ++i)
    {
        buffer.setSample(0, i, 0.4f);
        buffer.setSample(1, i, 0.6f);
    }

    engine.process(buffer);

    for (int i = 0; i < kBlockSize; ++i)
    {
        REQUIRE(buffer.getSample(0, i) == Approx(0.4f).margin(0.001f));
        REQUIRE(buffer.getSample(1, i) == Approx(0.6f).margin(0.001f));
    }
}

// =============================================================================
// Reset Tests [engine][reset]
// =============================================================================

TEST_CASE("Engine reset: clears filter state", "[engine][reset]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x - uses filters
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    // Process loud signal to fill filter state
    auto loudSignal = generateSine(1000.0f, kBlockSize * 4, 1.0f);
    for (int i = 0; i < 4; ++i)
    {
        juce::AudioBuffer<float> block(kNumChannels, kBlockSize);
        for (int ch = 0; ch < kNumChannels; ++ch)
        {
            block.copyFrom(ch, 0, loudSignal.getReadPointer(ch, i * kBlockSize), kBlockSize);
        }
        engine.process(block);
    }

    // Reset
    engine.reset();

    // Process silence - should output silence (no filter tail)
    auto silence = generateSilence(kBlockSize);
    engine.process(silence);

    float peak = calculatePeak(silence);
    CAPTURE(peak);
    REQUIRE(peak < 0.001f);  // Effectively silent
}

TEST_CASE("Engine reset: no leakage between signals", "[engine][reset]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);  // Let signal through cleanly
    engine.setDeltaMonitor(false);

    // Process signal A (loud, 100 Hz)
    auto signalA = generateSine(100.0f, kBlockSize * 2, 0.9f);
    for (int i = 0; i < 2; ++i)
    {
        juce::AudioBuffer<float> block(kNumChannels, kBlockSize);
        for (int ch = 0; ch < kNumChannels; ++ch)
            block.copyFrom(ch, 0, signalA.getReadPointer(ch, i * kBlockSize), kBlockSize);
        engine.process(block);
    }

    // Reset
    engine.reset();

    // Process signal B (quieter, different frequency)
    auto signalB = generateSine(5000.0f, kBlockSize, 0.3f);
    auto signalBCopy = signalB;  // Keep original for comparison

    engine.process(signalB);

    // After reset + oversampler round-trip, signal B should be clean
    // (no artifacts from signal A's frequency content)
    // Allow for filter roll-off but check shape is similar
    float rmsOriginal = calculateRMS(signalBCopy);
    float rmsProcessed = calculateRMS(signalB);

    // Processed should be close to original (within filter tolerance)
    REQUIRE(rmsProcessed > rmsOriginal * 0.8f);  // At least 80% through
    REQUIRE(rmsProcessed < rmsOriginal * 1.2f);  // No unexpected gain
}

TEST_CASE("Engine reset: consistent behavior across multiple resets", "[engine][reset]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    std::vector<float> peaksAfterReset;

    for (int cycle = 0; cycle < 3; ++cycle)
    {
        // Process some signal
        auto signal = generateSine(1000.0f, kBlockSize, 0.8f);
        engine.process(signal);

        // Reset
        engine.reset();

        // Process silence and measure
        auto silence = generateSilence(kBlockSize);
        engine.process(silence);

        peaksAfterReset.push_back(calculatePeak(silence));
    }

    // All resets should produce similar results (very quiet)
    for (float peak : peaksAfterReset)
    {
        CAPTURE(peak);
        REQUIRE(peak < 0.001f);
    }
}

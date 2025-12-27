#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/Oversampler.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::Oversampler;
using namespace test_utils;

// Process audio through oversampler (round-trip)
juce::AudioBuffer<float> processRoundTrip(Oversampler& os, juce::AudioBuffer<float>& input)
{
    juce::AudioBuffer<float> output(input.getNumChannels(), input.getNumSamples());
    output.clear();

    int numOversampledSamples = 0;
    float* const* upsampled = os.processSamplesUp(input, numOversampledSamples);

    if (upsampled == nullptr)
    {
        // 1x bypass - copy input to output
        for (int ch = 0; ch < input.getNumChannels(); ++ch)
            output.copyFrom(ch, 0, input, ch, 0, input.getNumSamples());
    }
    else
    {
        os.processSamplesDown(output, input.getNumSamples());
    }

    return output;
}

// =============================================================================
// Round-trip Accuracy Tests
// =============================================================================

TEST_CASE("Round-trip preserves sine wave amplitude", "[roundtrip][accuracy]")
{
    auto factorIndex = GENERATE(1, 2, 3, 4, 5);  // 2x, 4x, 8x, 16x, 32x
    auto filterType = GENERATE(
        Oversampler::FilterType::MinimumPhase,
        Oversampler::FilterType::LinearPhase
    );

    CAPTURE(factorIndex, static_cast<int>(filterType));

    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(filterType);

    // Generate a low-frequency sine (well below Nyquist)
    auto input = generateSine(440.0f, kBlockSize * 4, 0.5f);
    float inputRMS = calculateRMS(input);

    // Process multiple blocks to reach steady state
    for (int block = 0; block < 4; ++block)
    {
        juce::AudioBuffer<float> blockInput(kNumChannels, kBlockSize);
        for (int ch = 0; ch < kNumChannels; ++ch)
            blockInput.copyFrom(ch, 0, input, ch, block * kBlockSize, kBlockSize);

        auto output = processRoundTrip(os, blockInput);
    }

    // Process one more block and measure
    juce::AudioBuffer<float> testBlock(kNumChannels, kBlockSize);
    for (int ch = 0; ch < kNumChannels; ++ch)
        testBlock.copyFrom(ch, 0, input, ch, 0, kBlockSize);

    auto output = processRoundTrip(os, testBlock);
    float outputRMS = calculateRMS(output);

    // RMS should be preserved within tolerance
    float rmsRatio = outputRMS / inputRMS;
    REQUIRE(rmsRatio == Approx(1.0f).margin(kRoundTripTolerance));
}

TEST_CASE("Round-trip preserves DC signal", "[roundtrip][dc]")
{
    auto factorIndex = GENERATE(1, 2, 4);  // 2x, 4x, 16x

    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(Oversampler::FilterType::MinimumPhase);

    // Generate DC signal
    float dcLevel = 0.5f;
    auto input = generateDC(dcLevel, kBlockSize);

    // Process several blocks to reach steady state
    for (int i = 0; i < 10; ++i)
    {
        auto output = processRoundTrip(os, input);
    }

    // Final measurement block
    auto output = processRoundTrip(os, input);

    // Check DC level preserved (measure middle samples to avoid transients)
    int startSample = kBlockSize / 4;
    int measureSamples = kBlockSize / 2;
    float avgOutput = 0.0f;
    auto* data = output.getReadPointer(0);
    for (int i = startSample; i < startSample + measureSamples; ++i)
        avgOutput += data[i];
    avgOutput /= measureSamples;

    REQUIRE(avgOutput == Approx(dcLevel).margin(kDcTolerance));
}

// =============================================================================
// Latency Reporting Tests
// =============================================================================

TEST_CASE("1x bypass reports zero latency", "[latency]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(0);  // 1x bypass

    REQUIRE(os.getLatencyInSamples() == 0);
}

TEST_CASE("MinimumPhase reports zero latency", "[latency]")
{
    auto factorIndex = GENERATE(1, 2, 3, 4, 5);

    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(Oversampler::FilterType::MinimumPhase);

    REQUIRE(os.getLatencyInSamples() == 0);
}

TEST_CASE("LinearPhase reports non-zero latency for 2x+", "[latency]")
{
    auto factorIndex = GENERATE(1, 2, 3, 4, 5);

    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(Oversampler::FilterType::LinearPhase);

    int latency = os.getLatencyInSamples();
    CAPTURE(factorIndex, latency);

    // Linear phase should report positive latency
    REQUIRE(latency > 0);
}

TEST_CASE("Latency is consistent across calls", "[latency]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(3);  // 8x
    os.setFilterType(Oversampler::FilterType::LinearPhase);

    int latency1 = os.getLatencyInSamples();
    int latency2 = os.getLatencyInSamples();
    int latency3 = os.getLatencyInSamples();

    REQUIRE(latency1 == latency2);
    REQUIRE(latency2 == latency3);
}

// =============================================================================
// Filter/Frequency Response Tests
// =============================================================================

TEST_CASE("Low-frequency content preserved", "[filter]")
{
    auto factorIndex = GENERATE(2, 4);  // 4x, 16x

    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(Oversampler::FilterType::MinimumPhase);

    // Generate low frequency (well within passband)
    float lowFreq = 1000.0f;  // ~4.5% of Nyquist
    auto input = generateSine(lowFreq, kBlockSize * 4, 0.5f);
    float inputPeak = calculatePeak(input);

    // Process to steady state
    for (int block = 0; block < 4; ++block)
    {
        juce::AudioBuffer<float> blockInput(kNumChannels, kBlockSize);
        for (int ch = 0; ch < kNumChannels; ++ch)
            blockInput.copyFrom(ch, 0, input, ch, block * kBlockSize, kBlockSize);
        processRoundTrip(os, blockInput);
    }

    // Measure output
    juce::AudioBuffer<float> testBlock(kNumChannels, kBlockSize);
    for (int ch = 0; ch < kNumChannels; ++ch)
        testBlock.copyFrom(ch, 0, input, ch, 0, kBlockSize);

    auto output = processRoundTrip(os, testBlock);
    float outputPeak = calculatePeak(output);

    float ratio = outputPeak / inputPeak;
    CAPTURE(factorIndex, ratio);

    // Should be preserved within 5%
    REQUIRE(ratio == Approx(1.0f).margin(0.05f));
}

// =============================================================================
// Instance Independence Tests
// =============================================================================

TEST_CASE("Multiple Oversampler instances don't share state", "[independence]")
{
    Oversampler os1, os2;

    os1.prepare(kSampleRate, kBlockSize, kNumChannels);
    os2.prepare(kSampleRate, kBlockSize, kNumChannels);

    os1.setOversamplingFactor(2);  // 4x
    os2.setOversamplingFactor(4);  // 16x - different setting

    // Generate different signals
    auto input1 = generateSine(440.0f, kBlockSize, 0.5f);
    auto input2 = generateSine(880.0f, kBlockSize, 0.3f);

    // Process os1
    int numOversampled1 = 0;
    float* const* up1 = os1.processSamplesUp(input1, numOversampled1);

    // Process os2 - should not affect os1's internal state
    int numOversampled2 = 0;
    float* const* up2 = os2.processSamplesUp(input2, numOversampled2);

    // Verify different sample counts (different OS factors)
    REQUIRE(numOversampled1 != numOversampled2);

    // Verify pointers are different
    REQUIRE(up1 != up2);

    // Complete processing
    juce::AudioBuffer<float> output1(kNumChannels, kBlockSize);
    juce::AudioBuffer<float> output2(kNumChannels, kBlockSize);

    os1.processSamplesDown(output1, kBlockSize);
    os2.processSamplesDown(output2, kBlockSize);

    // Outputs should be different (different inputs processed)
    float rms1 = calculateRMS(output1);
    float rms2 = calculateRMS(output2);
    REQUIRE(rms1 != Approx(rms2).margin(0.01f));
}

TEST_CASE("Processing on instance A doesn't corrupt instance B", "[independence]")
{
    Oversampler osA, osB;

    osA.prepare(kSampleRate, kBlockSize, kNumChannels);
    osB.prepare(kSampleRate, kBlockSize, kNumChannels);

    osA.setOversamplingFactor(2);
    osB.setOversamplingFactor(2);

    // Same input for both
    auto input = generateSine(440.0f, kBlockSize, 0.5f);

    // Warm up both to steady state
    for (int i = 0; i < 5; ++i)
    {
        processRoundTrip(osA, input);
        processRoundTrip(osB, input);
    }

    // Process A and measure
    auto outputA1 = processRoundTrip(osA, input);
    float rmsA1 = calculateRMS(outputA1);

    // Process B multiple times (should not affect A)
    for (int i = 0; i < 10; ++i)
        processRoundTrip(osB, input);

    // Process A again - should give same result
    auto outputA2 = processRoundTrip(osA, input);
    float rmsA2 = calculateRMS(outputA2);

    // Results should be consistent (within filter precision)
    REQUIRE(rmsA1 == Approx(rmsA2).margin(0.001f));
}

// =============================================================================
// Edge Cases
// =============================================================================

TEST_CASE("1x bypass returns nullptr from processSamplesUp", "[bypass]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(0);  // 1x bypass

    auto input = generateSine(440.0f, kBlockSize);

    int numOversampledSamples = 0;
    float* const* result = os.processSamplesUp(input, numOversampledSamples);

    REQUIRE(result == nullptr);
    REQUIRE(numOversampledSamples == kBlockSize);  // Should equal input size
}

TEST_CASE("Factor switching works mid-stream", "[factor]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(1);  // Start at 2x

    auto input = generateSine(440.0f, kBlockSize);

    // Process at 2x
    int numSamples2x = 0;
    os.processSamplesUp(input, numSamples2x);
    REQUIRE(numSamples2x == kBlockSize * 2);

    // Switch to 4x
    os.setOversamplingFactor(2);

    int numSamples4x = 0;
    os.processSamplesUp(input, numSamples4x);
    REQUIRE(numSamples4x == kBlockSize * 4);

    // Switch back to 2x
    os.setOversamplingFactor(1);

    int numSamplesBack = 0;
    os.processSamplesUp(input, numSamplesBack);
    REQUIRE(numSamplesBack == kBlockSize * 2);
}

TEST_CASE("Filter type switching updates latency correctly", "[filter]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(2);  // 4x

    // MinimumPhase: 0 latency
    os.setFilterType(Oversampler::FilterType::MinimumPhase);
    REQUIRE(os.getLatencyInSamples() == 0);

    // LinearPhase: non-zero latency
    os.setFilterType(Oversampler::FilterType::LinearPhase);
    REQUIRE(os.getLatencyInSamples() > 0);

    // Switch back: 0 latency again
    os.setFilterType(Oversampler::FilterType::MinimumPhase);
    REQUIRE(os.getLatencyInSamples() == 0);
}

TEST_CASE("Filter type switching produces valid output", "[filter]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(2);  // 4x

    // Test MinimumPhase
    os.setFilterType(Oversampler::FilterType::MinimumPhase);
    auto input = generateSine(440.0f, kBlockSize);

    // Warmup and measure
    for (int i = 0; i < 4; ++i)
        processRoundTrip(os, input);

    auto outputMin = processRoundTrip(os, input);
    float rmsMin = calculateRMS(outputMin);
    REQUIRE(rmsMin > 0.3f);  // Signal survives

    // Switch to LinearPhase and reset to clear state
    os.setFilterType(Oversampler::FilterType::LinearPhase);
    os.reset();

    // Linear-phase needs more warmup due to latency
    for (int i = 0; i < 8; ++i)
        processRoundTrip(os, input);

    auto outputLin = processRoundTrip(os, input);
    float rmsLin = calculateRMS(outputLin);
    REQUIRE(rmsLin > 0.3f);  // Signal survives
}

TEST_CASE("reset() clears filter state", "[reset]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);
    os.setOversamplingFactor(2);  // 4x

    // Process some signal to fill filter buffers
    auto input = generateSine(440.0f, kBlockSize, 0.9f);
    for (int i = 0; i < 5; ++i)
        processRoundTrip(os, input);

    // Reset
    os.reset();

    // Process silence - should get (near) silence out after reset
    auto silence = generateDC(0.0f, kBlockSize);

    // Skip first few blocks (filter transient from reset)
    for (int i = 0; i < 3; ++i)
        processRoundTrip(os, silence);

    auto output = processRoundTrip(os, silence);
    float outputRMS = calculateRMS(output);

    // Should be near-silent (allow for tiny numerical noise)
    REQUIRE(outputRMS < 0.001f);
}

TEST_CASE("getOversamplingFactor returns correct multiplier", "[factor]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);

    os.setOversamplingFactor(0);
    REQUIRE(os.getOversamplingFactor() == 1);

    os.setOversamplingFactor(1);
    REQUIRE(os.getOversamplingFactor() == 2);

    os.setOversamplingFactor(2);
    REQUIRE(os.getOversamplingFactor() == 4);

    os.setOversamplingFactor(3);
    REQUIRE(os.getOversamplingFactor() == 8);

    os.setOversamplingFactor(4);
    REQUIRE(os.getOversamplingFactor() == 16);

    os.setOversamplingFactor(5);
    REQUIRE(os.getOversamplingFactor() == 32);
}

TEST_CASE("Factor index clamped to valid range", "[factor]")
{
    Oversampler os;
    os.prepare(kSampleRate, kBlockSize, kNumChannels);

    // Negative should clamp to 0
    os.setOversamplingFactor(-1);
    REQUIRE(os.getOversamplingFactor() == 1);

    // Too high should clamp to max
    os.setOversamplingFactor(100);
    REQUIRE(os.getOversamplingFactor() == 32);
}

// =============================================================================
// Block Size Variations
// =============================================================================

TEST_CASE("Round-trip works with different block sizes", "[blocksize]")
{
    auto blockSize = GENERATE(64, 128, 256, 512, 1024);
    auto factorIndex = GENERATE(2, 4);  // 4x, 16x

    CAPTURE(blockSize, factorIndex);

    Oversampler os;
    os.prepare(kSampleRate, blockSize, kNumChannels);
    os.setOversamplingFactor(factorIndex);
    os.setFilterType(Oversampler::FilterType::MinimumPhase);

    // Use same block for warmup and measurement (avoids filter state mismatch)
    auto input = generateSine(440.0f, blockSize, 0.5f);

    // Warmup: process same block multiple times until steady state
    for (int i = 0; i < 8; ++i)
        processRoundTrip(os, input);

    // Measure
    float inputRMS = calculateRMS(input);
    auto output = processRoundTrip(os, input);
    float outputRMS = calculateRMS(output);

    float rmsRatio = outputRMS / inputRMS;
    REQUIRE(rmsRatio == Approx(1.0f).margin(kRoundTripTolerance));
}

TEST_CASE("Upsampled count scales with block size", "[blocksize]")
{
    auto blockSize = GENERATE(128, 256, 512, 1024);

    Oversampler os;
    os.prepare(kSampleRate, blockSize, kNumChannels);
    os.setOversamplingFactor(2);  // 4x

    auto input = generateSine(440.0f, blockSize);

    int numOversampledSamples = 0;
    os.processSamplesUp(input, numOversampledSamples);

    // At 4x, should have 4 * blockSize samples
    REQUIRE(numOversampledSamples == blockSize * 4);
}


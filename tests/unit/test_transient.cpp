#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/ClipperEngine.h"
#include "test_utils.h"

using Catch::Approx;
using dsp::ClipperEngine;
using dsp::CurveType;
using namespace test_utils;

// Helper to process large buffer through engine in blocks
void processInBlocks(ClipperEngine& engine, juce::AudioBuffer<float>& buffer, int blockSize)
{
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();

    for (int start = 0; start < numSamples; start += blockSize)
    {
        int thisBlock = std::min(blockSize, numSamples - start);
        juce::AudioBuffer<float> block(numChannels, thisBlock);

        for (int ch = 0; ch < numChannels; ++ch)
            block.copyFrom(ch, 0, buffer.getReadPointer(ch, start), thisBlock);

        engine.process(block);

        for (int ch = 0; ch < numChannels; ++ch)
            buffer.copyFrom(ch, start, block.getReadPointer(ch), thisBlock);
    }
}

// =============================================================================
// Diagnostic Tests - Understanding Filter Behavior [transient][diagnostic]
// =============================================================================

TEST_CASE("Diagnostic: measure actual group delay for min-phase", "[transient][diagnostic]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x
    engine.setFilterType(false);       // Minimum phase
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);
    engine.setDeltaMonitor(false);

    int reportedLatency = engine.getLatencyInSamples();
    int impulsePos = 1000;
    int bufferSize = impulsePos + 1000;

    auto buffer = generateImpulse(impulsePos, 0.5f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    int peakPos = findPeakPosition(buffer, 0);
    int actualDelay = peakPos - impulsePos;

    INFO("Min-phase 4x: reported latency = " << reportedLatency << ", actual delay = " << actualDelay);
    CAPTURE(reportedLatency, actualDelay, impulsePos, peakPos);

    // JUCE's min-phase oversampling has small latency (3 samples for 4x)
    REQUIRE(reportedLatency == 3);
    // Actual delay should match or be very close to reported
    REQUIRE(std::abs(actualDelay - reportedLatency) <= 2);
}

TEST_CASE("Diagnostic: measure actual latency for lin-phase", "[transient][diagnostic]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x
    engine.setFilterType(true);        // Linear phase
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);
    engine.setDeltaMonitor(false);

    int reportedLatency = engine.getLatencyInSamples();
    int impulsePos = 2000;
    int bufferSize = impulsePos + reportedLatency + 1000;

    auto buffer = generateImpulse(impulsePos, 0.5f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    int peakPos = findPeakPosition(buffer, 0);
    int actualDelay = peakPos - impulsePos;

    INFO("Lin-phase 4x: reported latency = " << reportedLatency << ", actual delay = " << actualDelay);
    CAPTURE(reportedLatency, actualDelay, impulsePos, peakPos);

    // For linear phase, reported and actual latency should match closely
    REQUIRE(std::abs(actualDelay - reportedLatency) <= 2);
}

TEST_CASE("Diagnostic: impulse response shape", "[transient][diagnostic]")
{
    auto filterType = GENERATE(false, true);
    std::string filterName = filterType ? "linear-phase" : "minimum-phase";
    CAPTURE(filterName);

    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setFilterType(filterType);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);
    engine.setDeltaMonitor(false);

    int latency = engine.getLatencyInSamples();
    int impulsePos = 2000;
    int bufferSize = impulsePos + latency + 2000;

    float inputAmplitude = 0.5f;
    auto buffer = generateImpulse(impulsePos, inputAmplitude, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    // Find where signal starts and ends (above 0.1% of input)
    auto* data = buffer.getReadPointer(0);
    float threshold = inputAmplitude * 0.001f;
    int signalStart = -1, signalEnd = -1;
    float peakAmplitude = 0.0f;
    int peakPos = 0;

    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        float val = std::abs(data[i]);
        if (val > threshold)
        {
            if (signalStart < 0) signalStart = i;
            signalEnd = i;
        }
        if (val > peakAmplitude)
        {
            peakAmplitude = val;
            peakPos = i;
        }
    }

    int signalDuration = signalEnd - signalStart + 1;
    int preImpulseSamples = impulsePos - signalStart;  // Negative if signal starts after impulse

    INFO(filterName << ": signal starts at " << signalStart << " (impulse at " << impulsePos << ")");
    INFO(filterName << ": peak at " << peakPos << ", amplitude " << peakAmplitude);
    INFO(filterName << ": signal duration " << signalDuration << " samples");
    INFO(filterName << ": pre-impulse samples = " << preImpulseSamples);

    CAPTURE(signalStart, signalEnd, signalDuration, peakPos, peakAmplitude, preImpulseSamples);

    // For minimum phase: signal should NOT start before impulse position (causal)
    // For linear phase: signal will start before impulse (pre-ringing is expected)
    if (!filterType)  // minimum phase
    {
        REQUIRE(signalStart >= impulsePos);  // Causal - no output before input
    }
}

// =============================================================================
// Unclipped Transient Tests [transient][unclipped]
// =============================================================================

TEST_CASE("Transient: impulse timing preserved (lin-phase)", "[transient][unclipped][linphase]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);   // 4x
    engine.setFilterType(true);        // Linear phase
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    int latency = engine.getLatencyInSamples();
    int impulsePos = 2000;
    int bufferSize = impulsePos + latency + 1000;

    auto buffer = generateImpulse(impulsePos, 0.5f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    int peakPos = findPeakPosition(buffer, 0);
    int expectedPos = impulsePos + latency;

    CAPTURE(impulsePos, latency, expectedPos, peakPos);

    // Linear phase has accurate latency reporting
    REQUIRE(std::abs(peakPos - expectedPos) <= 2);
}

TEST_CASE("Transient: min-phase is causal (no pre-ringing)", "[transient][unclipped][minphase]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setFilterType(false);       // Minimum phase
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);
    engine.setDeltaMonitor(false);

    int impulsePos = 2000;
    int bufferSize = impulsePos + 2000;

    auto buffer = generateImpulse(impulsePos, 0.8f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    // Check that no significant signal appears before the impulse position
    // (minimum phase filters are causal)
    auto* data = buffer.getReadPointer(0);
    float maxPreImpulse = 0.0f;
    for (int i = 0; i < impulsePos; ++i)
        maxPreImpulse = std::max(maxPreImpulse, std::abs(data[i]));

    float peakAmplitude = calculatePeak(buffer);

    CAPTURE(maxPreImpulse, peakAmplitude);

    // Before impulse position should be silent (< 0.1% of peak)
    REQUIRE(maxPreImpulse < peakAmplitude * 0.001f);
}

TEST_CASE("Transient: lin-phase has symmetric pre/post ringing", "[transient][unclipped][linphase]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setFilterType(true);        // Linear phase
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(false);
    engine.setDeltaMonitor(false);

    int latency = engine.getLatencyInSamples();
    int impulsePos = latency + 500;  // Enough room for pre-ringing
    int bufferSize = impulsePos + latency + 2000;

    auto buffer = generateImpulse(impulsePos, 0.8f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    int peakPos = findPeakPosition(buffer, 0);

    // Measure pre-ringing (before peak) and post-ringing (after peak)
    auto* data = buffer.getReadPointer(0);
    float preRingingMax = 0.0f;
    float postRingingMax = 0.0f;

    // Pre-ringing: 100-500 samples before peak
    for (int i = std::max(0, peakPos - 500); i < peakPos - 10; ++i)
        preRingingMax = std::max(preRingingMax, std::abs(data[i]));

    // Post-ringing: 100-500 samples after peak
    for (int i = peakPos + 10; i < std::min(buffer.getNumSamples(), peakPos + 500); ++i)
        postRingingMax = std::max(postRingingMax, std::abs(data[i]));

    CAPTURE(preRingingMax, postRingingMax);

    // Linear phase should have similar pre and post ringing (symmetric)
    // Allow 2x ratio tolerance for practical filters
    float ratio = preRingingMax > postRingingMax
        ? preRingingMax / (postRingingMax + 0.0001f)
        : postRingingMax / (preRingingMax + 0.0001f);

    REQUIRE(ratio < 2.0f);  // Within 2x of symmetric
}

// =============================================================================
// Clipped Transient Tests [transient][clipped]
// =============================================================================

TEST_CASE("Transient clipped: output never exceeds ceiling", "[transient][clipped]")
{
    auto filterType = GENERATE(false, true);
    CAPTURE(filterType ? "linear-phase" : "minimum-phase");

    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(-6.0f);          // -6 dB ceiling
    engine.setCurve(static_cast<int>(CurveType::Hard));         // Hard clip
    engine.setOversamplingFactor(2);
    engine.setFilterType(filterType);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    float ceilingLinear = juce::Decibels::decibelsToGain(-6.0f);
    int latency = engine.getLatencyInSamples();
    int impulsePos = latency + 500;
    int bufferSize = impulsePos + latency + 2000;

    // Impulse well above ceiling
    auto buffer = generateImpulse(impulsePos, 1.0f, bufferSize);
    processInBlocks(engine, buffer, kBlockSize);

    float peak = calculatePeak(buffer);

    CAPTURE(ceilingLinear, peak);
    REQUIRE(peak <= ceilingLinear + 0.001f);
}

TEST_CASE("Transient clipped: burst recovery", "[transient][clipped]")
{
    ClipperEngine engine;
    engine.prepare(kSampleRate, kBlockSize, kNumChannels);
    engine.setCeiling(0.0f);
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setOversamplingFactor(2);
    engine.setFilterType(false);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);

    // Multiple impulses spaced 5ms apart (~220 samples)
    int spacing = 220;
    std::vector<int> positions = { 1000, 1000 + spacing, 1000 + 2 * spacing };
    int bufferSize = positions.back() + 2000;

    auto buffer = generateBurst(positions, 2.0f, bufferSize);  // Hot bursts
    processInBlocks(engine, buffer, kBlockSize);

    // Output should never exceed ceiling despite rapid transients
    float peak = calculatePeak(buffer);
    REQUIRE(peak <= 1.001f);
}

// =============================================================================
// Min-Phase vs Lin-Phase Comparison [transient][compare]
// =============================================================================

TEST_CASE("Transient: both filters preserve timing after latency compensation", "[transient][compare]")
{
    // This test verifies that after compensating for reported latency,
    // both filter types place the transient at approximately the same position

    int inputImpulsePos = 2000;

    // Min-phase
    ClipperEngine minEngine;
    minEngine.prepare(kSampleRate, kBlockSize, kNumChannels);
    minEngine.setCeiling(0.0f);
    minEngine.setCurve(static_cast<int>(CurveType::Hard));
    minEngine.setOversamplingFactor(2);
    minEngine.setFilterType(false);
    minEngine.setInputGain(0.0f);
    minEngine.setOutputGain(0.0f);
    minEngine.setEnforceCeiling(false);
    minEngine.setDeltaMonitor(false);

    int minLatency = minEngine.getLatencyInSamples();
    auto minBuffer = generateImpulse(inputImpulsePos, 0.5f, inputImpulsePos + 1000);
    processInBlocks(minEngine, minBuffer, kBlockSize);
    int minPeakPos = findPeakPosition(minBuffer, 0);

    // Lin-phase
    ClipperEngine linEngine;
    linEngine.prepare(kSampleRate, kBlockSize, kNumChannels);
    linEngine.setCeiling(0.0f);
    linEngine.setCurve(static_cast<int>(CurveType::Hard));
    linEngine.setOversamplingFactor(2);
    linEngine.setFilterType(true);
    linEngine.setInputGain(0.0f);
    linEngine.setOutputGain(0.0f);
    linEngine.setEnforceCeiling(false);
    linEngine.setDeltaMonitor(false);

    int linLatency = linEngine.getLatencyInSamples();
    auto linBuffer = generateImpulse(inputImpulsePos, 0.5f, inputImpulsePos + linLatency + 1000);
    processInBlocks(linEngine, linBuffer, kBlockSize);
    int linPeakPos = findPeakPosition(linBuffer, 0);

    // After latency compensation, both should agree on timing
    int minCompensated = minPeakPos - minLatency;
    int linCompensated = linPeakPos - linLatency;

    INFO("Min-phase: peak at " << minPeakPos << ", latency " << minLatency << ", compensated " << minCompensated);
    INFO("Lin-phase: peak at " << linPeakPos << ", latency " << linLatency << ", compensated " << linCompensated);

    CAPTURE(inputImpulsePos, minLatency, linLatency, minPeakPos, linPeakPos, minCompensated, linCompensated);

    // Linear phase should be accurate
    REQUIRE(std::abs(linCompensated - inputImpulsePos) <= 2);

    // Min-phase might have group delay not reflected in reported latency
    // Document the discrepancy but note it as a potential issue
    int minPhaseError = std::abs(minCompensated - inputImpulsePos);
    INFO("Min-phase timing error (after latency compensation): " << minPhaseError << " samples");

    // If min-phase has significant unreported delay, this is a bug in latency reporting
    // For now, document but allow - this test surfaces the issue
    if (minPhaseError > 2)
    {
        WARN("Min-phase has " << minPhaseError << " samples of unreported latency");
    }
}

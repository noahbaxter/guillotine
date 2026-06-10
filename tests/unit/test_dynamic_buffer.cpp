#include <catch2/catch_test_macros.hpp>
#include <catch2/generators/catch_generators.hpp>
#include "dsp/ClipperEngine.h"
#include "test_utils.h"
#include <cmath>
#include <cstdint>

using dsp::ClipperEngine;
using dsp::CurveType;
using namespace test_utils;

// =============================================================================
// Dynamic / variable buffer size handling  [engine][buffersize]
//
// Regression for issue #1 (FL Studio dry/wet breakage). prepareToPlay's block
// size is only an ESTIMATE; some hosts send larger blocks. Internal buffers
// (dryBuffer, envSampleData_, oversampler storage) are sized to the estimate, so
// an oversized block used to overrun them -> corrupted IIR state -> permanent DC
// latch. ClipperEngine::process now re-blocks oversized buffers.
//
// DIAGNOSING A REGRESSION (or a future dynamic-buffer bug): the failure mode is
// a heap-buffer-overflow (the original landed at ClipperEngine.cpp:262). On a
// normal build it surfaces as a crash/assertion here; for a deterministic,
// located report rebuild the unit tests with AddressSanitizer:
//   cmake -B build-asan -S tests/unit -DCMAKE_CXX_FLAGS="-fsanitize=address -g" \
//         -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address" && cmake --build build-asan
//   ./build-asan/unit_tests_artefacts/Release/unit_tests "[buffersize]"
// =============================================================================

namespace {

// Impulse "clicks" every `spacing` samples, emitted only in complete +/- pairs
// so the block is DC-balanced for ANY length (a lone unipolar click in a tiny
// block would read as a false DC offset).
juce::AudioBuffer<float> generateClicks(int numSamples, int spacing, float amplitude)
{
    spacing = std::max(1, spacing);
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();
    int numClicks = (numSamples + spacing - 1) / spacing;
    numClicks -= (numClicks % 2);  // round down to a full +/- pair
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* d = buffer.getWritePointer(ch);
        for (int k = 0; k < numClicks; ++k)
            d[k * spacing] = (k % 2 == 0) ? amplitude : -amplitude;
    }
    return buffer;
}

// Healthy output: every sample finite & bounded, and (over a window large enough
// for the oversampler's filter tail to average out) no large DC offset -- the
// latch is a finite, in-range ~-0.94 that a plain isfinite() check would miss.
bool isCleanOutput(const juce::AudioBuffer<float>& buf, float peakBound = 4.0f, float dcLimit = 0.3f)
{
    const int n = buf.getNumSamples();
    if (n == 0) return true;
    const bool checkDc = n >= 64;
    for (int ch = 0; ch < buf.getNumChannels(); ++ch)
    {
        const auto* d = buf.getReadPointer(ch);
        double sum = 0.0;
        for (int i = 0; i < n; ++i)
        {
            const float v = d[i];
            if (!std::isfinite(v) || std::abs(v) > peakBound)
                return false;
            sum += v;
        }
        if (checkDc && std::abs(sum / n) > dcLimit)
            return false;
    }
    return true;
}

// Fresh default-FL-style instance: 4x min-phase (IIR), gain-match, true peak.
void configureDefault(ClipperEngine& engine, float dryWet)
{
    engine.setFilterType(false);
    engine.setOversamplingFactor(2);  // 4x
    engine.applyPendingChanges();
    engine.setCurve(static_cast<int>(CurveType::Hard));
    engine.setCeiling(0.0f);
    engine.setInputGain(0.0f);
    engine.setOutputGain(0.0f);
    engine.setGainMode(1);            // Match
    engine.setEnforceCeiling(true);
    engine.setDeltaMonitor(false);
    engine.setDryWetMix(dryWet);
    engine.reset();
}

} // namespace

// -----------------------------------------------------------------------------
// REGRESSION: a continuous stream of arbitrary block sizes -- tiny, normal, and
// well above the prepared maximum -- with state carried across blocks (no
// re-prepare), like FL's variable buffers. ~3s of audio with dry/wet engaged.
// Before the fix this overran/latched; now it must stay clean throughout.
// -----------------------------------------------------------------------------
TEST_CASE("Dynamic buffers: oversized and variable blocks stay clean", "[engine][buffersize]")
{
    constexpr int preparedMax = 128;
    ClipperEngine engine;
    engine.prepare(kSampleRate, preparedMax, kNumChannels);
    configureDefault(engine, 0.5f);  // dry/wet engaged (the FL trigger)

    uint32_t state = 0x12345678u;
    auto nextSize = [&state, preparedMax]() {  // sizes in [1, 4*preparedMax]: tiny/normal/oversized
        state = state * 1664525u + 1013904223u;
        return 1 + static_cast<int>((state >> 8) % (4u * static_cast<unsigned>(preparedMax)));
    };

    const int totalSamples = static_cast<int>(3.0 * kSampleRate);
    for (int block = 0, processed = 0; processed < totalSamples; ++block)
    {
        const int n = nextSize();
        processed += n;
        CAPTURE(block, n);
        auto buf = generateClicks(n, 16, 0.9f);
        engine.process(buf);
        REQUIRE(isCleanOutput(buf));
    }
}

// -----------------------------------------------------------------------------
// CORRECTNESS: FL-style call pattern must be transparent at EVERY oversampling
// factor and filter type, with the DEFAULT gain-match mode. Two engines stream
// the identical settled sine; the reference is fed fixed full blocks, the other
// FL-like variable sizes (tiny, normal, and above the prepared max, which
// triggers the re-block path). State carries across calls, so once both streams
// settle the outputs must be sample-identical -- any divergence is a chunk-
// boundary discontinuity (the 1.2.2 "buzz with oversampling" report).
// -----------------------------------------------------------------------------
TEST_CASE("Dynamic buffers: variable FL-style blocks are transparent at all OS factors", "[engine][buffersize]")
{
    const int osIndex = GENERATE(1, 2, 3, 5);       // 2x, 4x, 8x, 32x
    const bool linearPhase = GENERATE(false, true);
    const bool deltaMonitor = GENERATE(false, true);
    constexpr int preparedMax = 128;
    constexpr int totalSamples = 44100;             // 1s stream

    CAPTURE(osIndex, linearPhase, deltaMonitor);

    auto configure = [&](ClipperEngine& e) {
        e.prepare(kSampleRate, preparedMax, kNumChannels);
        e.setFilterType(linearPhase);
        e.setOversamplingFactor(osIndex);
        e.applyPendingChanges();
        e.setCurve(static_cast<int>(CurveType::Hard));
        e.setCeiling(-6.0f);
        e.setInputGain(6.0f);        // drive into the clipper
        e.setOutputGain(0.0f);
        e.setGainMode(1);            // Match (the default) -- exercised per chunk
        e.setEnforceCeiling(true);
        e.setDeltaMonitor(deltaMonitor);
        e.setDryWetMix(0.5f);        // dry path engaged (the FL trigger)
        e.setBypass(false);
        e.reset();
    };

    ClipperEngine fixed, variable;
    configure(fixed);
    configure(variable);

    auto stream = generateSine(440.0f, totalSamples, 0.8f);

    // Reference: fixed full blocks
    juce::AudioBuffer<float> outFixed(kNumChannels, totalSamples);
    for (int ch = 0; ch < kNumChannels; ++ch)
        outFixed.copyFrom(ch, 0, stream, ch, 0, totalSamples);
    for (int offset = 0; offset < totalSamples; offset += preparedMax)
    {
        int n = std::min(preparedMax, totalSamples - offset);
        juce::AudioBuffer<float> blk(outFixed.getArrayOfWritePointers(), kNumChannels, offset, n);
        fixed.process(blk);
    }

    // FL-like variable sizes in [1, 4*preparedMax]
    juce::AudioBuffer<float> outVar(kNumChannels, totalSamples);
    for (int ch = 0; ch < kNumChannels; ++ch)
        outVar.copyFrom(ch, 0, stream, ch, 0, totalSamples);
    uint32_t state = 0xCAFEBABEu;
    for (int offset = 0; offset < totalSamples;)
    {
        state = state * 1664525u + 1013904223u;
        int n = 1 + static_cast<int>((state >> 8) % (4u * static_cast<unsigned>(preparedMax)));
        n = std::min(n, totalSamples - offset);
        juce::AudioBuffer<float> blk(outVar.getArrayOfWritePointers(), kNumChannels, offset, n);
        variable.process(blk);
        offset += n;
    }

    // Skip the settling head (smoothers + filter warm-up), then compare.
    const int settle = 8192;
    float maxDiff = 0.0f;
    int worstIndex = -1;
    for (int ch = 0; ch < kNumChannels; ++ch)
        for (int i = settle; i < totalSamples; ++i)
        {
            float d = std::abs(outFixed.getReadPointer(ch)[i] - outVar.getReadPointer(ch)[i]);
            if (d > maxDiff) { maxDiff = d; worstIndex = i; }
        }

    INFO("max sample diff = " << maxDiff << " at sample " << worstIndex);
    REQUIRE(maxDiff < 1.0e-4f);
}

// -----------------------------------------------------------------------------
// CORRECTNESS: re-blocking must be transparent -- output identical to a single
// call. Two engines fed the same settled signal: one prepared large (processes a
// 512 block directly), one prepared small (re-blocks it into 8x64). Manual gain +
// a settled mix remove per-chunk auto-gain/ramp differences.
// -----------------------------------------------------------------------------
TEST_CASE("Dynamic buffers: re-blocking matches a single call", "[engine][buffersize]")
{
    auto configure = [](ClipperEngine& e, int prepared) {
        e.prepare(kSampleRate, prepared, kNumChannels);
        e.setFilterType(false);
        e.setOversamplingFactor(2);  // 4x
        e.applyPendingChanges();
        e.setCurve(static_cast<int>(CurveType::Hard));
        e.setCeiling(-6.0f);
        e.setInputGain(6.0f);        // drive into the clipper
        e.setOutputGain(0.0f);
        e.setGainMode(0);            // Manual: no per-chunk auto-gain
        e.setEnforceCeiling(true);
        e.setDeltaMonitor(false);
        e.setDryWetMix(0.5f);        // dry path engaged
        e.reset();
    };
    ClipperEngine single, chunked;
    configure(single, 512);
    configure(chunked, 64);  // re-blocks the same 512 block into 8x64

    // Identical warm-up so filter states + smoothers align before comparing.
    for (int b = 0; b < 8; ++b)
    {
        auto wa = generateSine(440.0f, 512, 0.8f);
        auto wb = generateSine(440.0f, 512, 0.8f);
        single.process(wa);
        chunked.process(wb);
    }

    auto a = generateSine(440.0f, 512, 0.8f);
    auto b = generateSine(440.0f, 512, 0.8f);
    single.process(a);
    chunked.process(b);

    float maxDiff = 0.0f;
    for (int ch = 0; ch < kNumChannels; ++ch)
        for (int i = 0; i < 512; ++i)
            maxDiff = std::max(maxDiff, std::abs(a.getReadPointer(ch)[i] - b.getReadPointer(ch)[i]));

    INFO("max sample diff between single-call and re-blocked = " << maxDiff);
    REQUIRE(maxDiff < 1.0e-5f);
}

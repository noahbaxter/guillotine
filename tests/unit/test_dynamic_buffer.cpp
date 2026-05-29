#include <catch2/catch_test_macros.hpp>
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

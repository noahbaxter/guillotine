#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <oversimple/Oversampling.hpp>
#include <memory>

namespace dsp {

class Oversampler
{
public:
    enum class FilterType { MinimumPhase, LinearPhase };

    // UI indices: 0=1x, 1=2x, 2=4x, 3=8x, 4=16x, 5=32x
    static constexpr int NumFactors = 6;

    Oversampler();

    void prepare(double sampleRate, int maxBlockSize, int numChannels);
    void reset();

    void setOversamplingFactor(int factorIndex);  // 0=1x, 1=2x, 2=4x, 3=8x, 4=16x, 5=32x
    void setFilterType(FilterType type);

    int getOversamplingFactor() const;
    int getLatencyInSamples() const;

    // Process up: returns pointer to oversampled data and sets numOversampledSamples
    // Returns nullptr if 1x (no oversampling)
    float* const* processSamplesUp(juce::AudioBuffer<float>& inputBuffer, int& numOversampledSamples);

    // Process down: downsamples back to original rate
    void processSamplesDown(juce::AudioBuffer<float>& outputBuffer, int numOriginalSamples);

private:
    std::unique_ptr<oversimple::TOversampling<float>> oversampler;

    int currentFactorIndex = 0;  // 0=1x (bypass), 1=2x, etc.
    FilterType currentFilterType = FilterType::MinimumPhase;
    int numChannels = 2;
    int maxBlockSize = 512;
    bool isPrepared = false;

    void rebuildOversampler();
};

} // namespace dsp

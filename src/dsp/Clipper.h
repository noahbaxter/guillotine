#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include "SaturatorCurves.h"

namespace dsp {

class Clipper
{
public:
    Clipper() = default;

    void prepare(double sampleRate);
    void process(juce::AudioBuffer<float>& buffer);
    void process(juce::dsp::AudioBlock<float>& block);
    void processInternal(float* const* channelData, int numChannels, int numSamples);

    void setCeiling(float linearAmplitude);
    void setCurve(CurveType curve);
    void setCurveExponent(float exponent);
    void setStereoLink(bool enabled);

private:
    float processSample(float sample, float ceilVal, float expVal) const;
    float calculateGainReduction(float peakLevel, float ceilVal, float expVal) const;

    CurveType curveType = CurveType::Hard;
    bool stereoLinkEnabled = false;

    // Parameter smoothing (2ms ramp to match input/output gain)
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear> smoothedCeiling{1.0f};
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear> smoothedExponent{2.0f};
    double lastSampleRate = 0.0;  // Track sample rate to avoid unnecessary reset()
};

} // namespace dsp

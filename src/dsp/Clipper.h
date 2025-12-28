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
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    void process(juce::dsp::AudioBlock<float>& block);
    void processInternal(float* const* channelData, int numChannels, int numSamples);

    void setCeiling(float linearAmplitude);
    void setCurve(CurveType curve);
    void setCurveExponent(float exponent);
    void setStereoLink(bool enabled);

private:
    float processSample(float sample, float ceiling, float exponent) const;
    float calculateGainReduction(float peakLevel, float ceiling, float exponent) const;

    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Multiplicative> ceilingSmoothed;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear> curveExponentSmoothed;
    CurveType curve = CurveType::Hard;
    bool stereoLinkEnabled = false;
};

} // namespace dsp

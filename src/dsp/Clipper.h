#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include "SaturatorCurves.h"

namespace dsp {

class Clipper
{
public:
    Clipper() = default;

    void prepare(const juce::dsp::ProcessSpec& spec);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);
    void process(juce::dsp::AudioBlock<float>& block);
    void processInternal(float* const* channelData, int numChannels, int numSamples);

    void setCeiling(float linearAmplitude);
    void setCurve(CurveType curve);
    void setCurveExponent(float exponent);
    void setStereoLink(bool enabled);

private:
    float processSample(float sample) const;
    float calculateGainReduction(float peakLevel) const;

    float ceiling = 1.0f;
    CurveType curve = CurveType::Hard;
    float curveExponent = 2.0f;
    bool stereoLinkEnabled = false;
};

} // namespace dsp

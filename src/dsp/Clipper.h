#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

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
    void setSharpness(float sharpness);  // 0.0 = soft tanh, 1.0 = hard clip
    void setStereoLink(bool enabled);

private:
    float processSample(float sample) const;
    float calculateGainReduction(float peakLevel) const;

    float ceiling = 1.0f;
    float sharpness = 0.5f;
    float k = 1.0f;  // tanh scaling factor, derived from sharpness
    bool stereoLinkEnabled = false;

    void updateK();
};

} // namespace dsp

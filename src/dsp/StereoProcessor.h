#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

namespace dsp {

class StereoProcessor
{
public:
    StereoProcessor() = default;

    void setMidSideMode(bool enabled);
    bool isMidSideMode() const { return midSideEnabled; }

    // Call before processing to convert L/R to M/S
    void encodeToMidSide(juce::AudioBuffer<float>& buffer);

    // Call after processing to convert M/S back to L/R
    void decodeFromMidSide(juce::AudioBuffer<float>& buffer);

private:
    bool midSideEnabled = false;
};

} // namespace dsp

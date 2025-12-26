#include "StereoProcessor.h"

namespace dsp {

void StereoProcessor::setMidSideMode(bool enabled)
{
    midSideEnabled = enabled;
}

void StereoProcessor::encodeToMidSide(juce::AudioBuffer<float>& buffer)
{
    if (!midSideEnabled || buffer.getNumChannels() < 2)
        return;

    float* left = buffer.getWritePointer(0);
    float* right = buffer.getWritePointer(1);

    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        float l = left[i];
        float r = right[i];
        left[i] = (l + r) * 0.5f;   // mid
        right[i] = (l - r) * 0.5f;  // side
    }
}

void StereoProcessor::decodeFromMidSide(juce::AudioBuffer<float>& buffer)
{
    if (!midSideEnabled || buffer.getNumChannels() < 2)
        return;

    float* mid = buffer.getWritePointer(0);
    float* side = buffer.getWritePointer(1);

    for (int i = 0; i < buffer.getNumSamples(); ++i)
    {
        float m = mid[i];
        float s = side[i];
        mid[i] = m + s;   // left
        side[i] = m - s;  // right
    }
}

} // namespace dsp

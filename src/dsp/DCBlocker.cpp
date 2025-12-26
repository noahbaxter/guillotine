#include "DCBlocker.h"

namespace dsp {

void DCBlocker::prepare(double sampleRate, int numChannels)
{
    constexpr float cutoffHz = 5.0f;
    R = 1.0f - (juce::MathConstants<float>::twoPi * cutoffHz / static_cast<float>(sampleRate));

    x1.resize(static_cast<size_t>(numChannels), 0.0f);
    y1.resize(static_cast<size_t>(numChannels), 0.0f);
}

void DCBlocker::reset()
{
    std::fill(x1.begin(), x1.end(), 0.0f);
    std::fill(y1.begin(), y1.end(), 0.0f);
}

void DCBlocker::process(juce::AudioBuffer<float>& buffer)
{
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        auto chIdx = static_cast<size_t>(ch);

        for (int i = 0; i < buffer.getNumSamples(); ++i)
        {
            float x = data[i];
            float y = x - x1[chIdx] + R * y1[chIdx];
            x1[chIdx] = x;
            y1[chIdx] = y;
            data[i] = y;
        }
    }
}

} // namespace dsp

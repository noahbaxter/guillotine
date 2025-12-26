#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <vector>

namespace dsp {

class DCBlocker
{
public:
    DCBlocker() = default;

    void prepare(double sampleRate, int numChannels);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);

private:
    // 1-pole highpass: y[n] = x[n] - x[n-1] + R * y[n-1]
    std::vector<float> x1;  // previous input per channel
    std::vector<float> y1;  // previous output per channel
    float R = 0.9995f;      // coefficient for ~5Hz cutoff at 44.1kHz
};

} // namespace dsp

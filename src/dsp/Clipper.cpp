#include "Clipper.h"
#include <cmath>
#include <vector>

namespace dsp {

void Clipper::prepare(const juce::dsp::ProcessSpec& /*spec*/)
{
    updateK();
}

void Clipper::reset()
{
    // stateless
}

void Clipper::setCeiling(float linearAmplitude)
{
    ceiling = linearAmplitude;
}

void Clipper::setSharpness(float newSharpness)
{
    sharpness = juce::jlimit(0.0f, 1.0f, newSharpness);
    updateK();
}

void Clipper::setStereoLink(bool enabled)
{
    stereoLinkEnabled = enabled;
}

void Clipper::updateK()
{
    // k controls tanh steepness: higher k = harder knee
    // sharpness 0.0 -> k=1 (gentle), sharpness 1.0 -> k=10 (near-hard)
    k = 1.0f + sharpness * sharpness * 9.0f;
}

float Clipper::processSample(float sample) const
{
    if (ceiling <= 0.0f)
        return 0.0f;

    float normalized = sample / ceiling;

    // Pure hard clip at max sharpness
    if (sharpness >= 0.999f)
        return std::clamp(normalized, -1.0f, 1.0f) * ceiling;

    // Tanh soft clip with gain compensation
    float tanhK = std::tanh(k);
    float clipped = std::tanh(normalized * k) / tanhK;

    return clipped * ceiling;
}

float Clipper::calculateGainReduction(float peakLevel) const
{
    if (peakLevel <= ceiling)
        return 1.0f;

    float targetPeak = std::abs(processSample(peakLevel));
    return targetPeak / peakLevel;
}

void Clipper::processInternal(float* const* channelData, int numChannels, int numSamples)
{
    if (stereoLinkEnabled && numChannels >= 2)
    {
        // Stereo link: find max peak across channels, apply same reduction
        for (int i = 0; i < numSamples; ++i)
        {
            float maxPeak = 0.0f;
            for (int ch = 0; ch < numChannels; ++ch)
                maxPeak = std::max(maxPeak, std::abs(channelData[ch][i]));

            if (maxPeak > ceiling)
            {
                float gainReduction = calculateGainReduction(maxPeak);
                for (int ch = 0; ch < numChannels; ++ch)
                    channelData[ch][i] *= gainReduction;
            }
        }
    }
    else
    {
        // Independent channel processing
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* data = channelData[ch];
            for (int i = 0; i < numSamples; ++i)
                data[i] = processSample(data[i]);
        }
    }
}

void Clipper::process(juce::AudioBuffer<float>& buffer)
{
    processInternal(buffer.getArrayOfWritePointers(),
                    buffer.getNumChannels(),
                    buffer.getNumSamples());
}

void Clipper::process(juce::dsp::AudioBlock<float>& block)
{
    // Build array of channel pointers from AudioBlock
    const int numChannels = static_cast<int>(block.getNumChannels());
    const int numSamples = static_cast<int>(block.getNumSamples());

    std::vector<float*> channelPtrs(static_cast<size_t>(numChannels));
    for (int ch = 0; ch < numChannels; ++ch)
        channelPtrs[static_cast<size_t>(ch)] = block.getChannelPointer(static_cast<size_t>(ch));

    processInternal(channelPtrs.data(), numChannels, numSamples);
}

} // namespace dsp

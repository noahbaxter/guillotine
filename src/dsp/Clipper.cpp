#include "Clipper.h"
#include <cmath>
#include <vector>

namespace dsp {

void Clipper::prepare(const juce::dsp::ProcessSpec& /*spec*/)
{
}

void Clipper::reset()
{
    // stateless
}

void Clipper::setCeiling(float linearAmplitude)
{
    ceiling = linearAmplitude;
    updateKneeCache();
}

void Clipper::setSharpness(float newSharpness)
{
    sharpness = juce::jlimit(0.0f, 1.0f, newSharpness);
    updateKneeCache();
}

void Clipper::updateKneeCache()
{
    knee = (1.0f - sharpness) * ceiling * 0.5f;
    kneeStart = ceiling - knee;
}

void Clipper::setStereoLink(bool enabled)
{
    stereoLinkEnabled = enabled;
}

float Clipper::processSample(float sample) const
{
    if (ceiling <= 0.0f)
        return 0.0f;

    float absVal = std::abs(sample);
    float sign = (sample >= 0.0f) ? 1.0f : -1.0f;

    // Hard clip mode (sharpness 100%)
    if (sharpness >= 0.999f)
    {
        if (absVal <= ceiling)
            return sample;
        return sign * ceiling;
    }

    // Below knee - pass through unchanged
    if (absVal <= kneeStart)
        return sample;

    // In knee region or above - apply soft compression
    float x = absVal - kneeStart;

    // Quadratic compression curve: t² gives compression (output < input)
    // f(x) = kneeStart + knee * t² for x in [0, knee], where t = x/knee
    // - At t=0: output = kneeStart (continuous with passthrough)
    // - At t=1: output = ceiling (reaches limit exactly)
    // - For 0<t<1: t² < t, so output < input (compression)
    if (x <= knee)
    {
        float t = x / knee;  // 0 to 1 within knee
        float compressed = kneeStart + knee * t * t;
        return sign * compressed;
    }

    // Above ceiling - hard limit
    return sign * ceiling;
}

float Clipper::calculateGainReduction(float peakLevel) const
{
    if (peakLevel <= kneeStart)
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

            if (maxPeak > kneeStart)
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

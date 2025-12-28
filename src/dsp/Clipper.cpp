#include "Clipper.h"
#include <cmath>
#include <vector>

namespace dsp {

void Clipper::setCeiling(float linearAmplitude)
{
    ceiling = linearAmplitude;
}

void Clipper::setCurve(CurveType newCurve)
{
    curveType = newCurve;
}

void Clipper::setCurveExponent(float exponent)
{
    curveExponent = exponent;
}

void Clipper::setStereoLink(bool enabled)
{
    stereoLinkEnabled = enabled;
}

float Clipper::processSample(float sample) const
{
    return curves::applyWithCeiling(curveType, sample, ceiling, curveExponent);
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
            for (int i = 0; i < numSamples; ++i)
                channelData[ch][i] = processSample(channelData[ch][i]);
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
    const int numChannels = static_cast<int>(block.getNumChannels());
    const int numSamples = static_cast<int>(block.getNumSamples());

    std::vector<float*> channelPtrs(static_cast<size_t>(numChannels));
    for (int ch = 0; ch < numChannels; ++ch)
        channelPtrs[static_cast<size_t>(ch)] = block.getChannelPointer(static_cast<size_t>(ch));

    processInternal(channelPtrs.data(), numChannels, numSamples);
}

} // namespace dsp

#include "Clipper.h"
#include <cmath>
#include <vector>

namespace dsp {

void Clipper::prepare(double sampleRate)
{
    constexpr double rampTimeSeconds = 0.002;  // 2ms smoothing
    ceilingSmoothed.reset(sampleRate, rampTimeSeconds);
    curveExponentSmoothed.reset(sampleRate, rampTimeSeconds);
    ceilingSmoothed.setCurrentAndTargetValue(1.0f);
    curveExponentSmoothed.setCurrentAndTargetValue(2.0f);
}

void Clipper::reset()
{
    ceilingSmoothed.setCurrentAndTargetValue(ceilingSmoothed.getTargetValue());
    curveExponentSmoothed.setCurrentAndTargetValue(curveExponentSmoothed.getTargetValue());
}

void Clipper::setCeiling(float linearAmplitude)
{
    ceilingSmoothed.setTargetValue(linearAmplitude);
}

void Clipper::setCurve(CurveType newCurve)
{
    curve = newCurve;
}

void Clipper::setCurveExponent(float exponent)
{
    curveExponentSmoothed.setTargetValue(exponent);
}

void Clipper::setStereoLink(bool enabled)
{
    stereoLinkEnabled = enabled;
}

float Clipper::processSample(float sample, float ceiling, float exponent) const
{
    return curves::applyWithCeiling(curve, sample, ceiling, exponent);
}

float Clipper::calculateGainReduction(float peakLevel, float ceiling, float exponent) const
{
    if (peakLevel <= ceiling)
        return 1.0f;

    float targetPeak = std::abs(processSample(peakLevel, ceiling, exponent));
    return targetPeak / peakLevel;
}

void Clipper::processInternal(float* const* channelData, int numChannels, int numSamples)
{
    if (stereoLinkEnabled && numChannels >= 2)
    {
        // Stereo link: find max peak across channels, apply same reduction
        for (int i = 0; i < numSamples; ++i)
        {
            float ceiling = ceilingSmoothed.getNextValue();
            float exponent = curveExponentSmoothed.getNextValue();

            float maxPeak = 0.0f;
            for (int ch = 0; ch < numChannels; ++ch)
                maxPeak = std::max(maxPeak, std::abs(channelData[ch][i]));

            if (maxPeak > ceiling)
            {
                float gainReduction = calculateGainReduction(maxPeak, ceiling, exponent);
                for (int ch = 0; ch < numChannels; ++ch)
                    channelData[ch][i] *= gainReduction;
            }
        }
    }
    else
    {
        // Independent channel processing - sample-by-sample for smooth transitions
        for (int i = 0; i < numSamples; ++i)
        {
            float ceiling = ceilingSmoothed.getNextValue();
            float exponent = curveExponentSmoothed.getNextValue();

            for (int ch = 0; ch < numChannels; ++ch)
                channelData[ch][i] = processSample(channelData[ch][i], ceiling, exponent);
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

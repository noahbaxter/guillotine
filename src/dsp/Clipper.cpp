#include "Clipper.h"
#include <cmath>

namespace dsp {

void Clipper::prepare(double sampleRate, int numChannels)
{
    blockChannelPtrs.resize(static_cast<size_t>(numChannels));

    // Only reset SmoothedValue when sample rate changes
    // reset() interrupts smoothing by setting current=target, so avoid calling it repeatedly
    if (sampleRate != lastSampleRate)
    {
        lastSampleRate = sampleRate;
        // 2ms smoothing to match input/output gain ramps
        smoothedCeiling.reset(sampleRate, 0.002);
        smoothedExponent.reset(sampleRate, 0.002);
    }
}

void Clipper::setCeiling(float linearAmplitude)
{
    smoothedCeiling.setTargetValue(linearAmplitude);
}

void Clipper::setCurve(CurveType newCurve)
{
    curveType = newCurve;
}

void Clipper::setCurveExponent(float exponent)
{
    smoothedExponent.setTargetValue(exponent);
}

void Clipper::setStereoLink(bool enabled)
{
    stereoLinkEnabled = enabled;
}

float Clipper::processSample(float sample, float ceilVal, float expVal) const
{
    return curves::applyWithCeiling(curveType, sample, ceilVal, expVal);
}

float Clipper::calculateGainReduction(float peakLevel, float ceilVal, float expVal) const
{
    // Only check for zero to avoid division by zero
    // Don't skip based on ceiling - soft curves shape signal at all levels
    if (peakLevel <= 0.0f)
        return 1.0f;

    float targetPeak = std::abs(processSample(peakLevel, ceilVal, expVal));
    return targetPeak / peakLevel;
}

void Clipper::processInternal(float* const* channelData, int numChannels, int numSamples)
{
    if (stereoLinkEnabled && numChannels >= 2)
    {
        // Stereo link: find max peak across channels, apply same gain reduction
        // Always process - soft curves shape signal at all levels, not just above ceiling
        for (int i = 0; i < numSamples; ++i)
        {
            float ceilVal = smoothedCeiling.getNextValue();
            float expVal = smoothedExponent.getNextValue();

            float maxPeak = 0.0f;
            for (int ch = 0; ch < numChannels; ++ch)
                maxPeak = std::max(maxPeak, std::abs(channelData[ch][i]));

            float gainReduction = calculateGainReduction(maxPeak, ceilVal, expVal);
            for (int ch = 0; ch < numChannels; ++ch)
                channelData[ch][i] *= gainReduction;
        }
    }
    else
    {
        // Independent channel processing - get smoothed values once per sample
        for (int i = 0; i < numSamples; ++i)
        {
            float ceilVal = smoothedCeiling.getNextValue();
            float expVal = smoothedExponent.getNextValue();
            for (int ch = 0; ch < numChannels; ++ch)
                channelData[ch][i] = processSample(channelData[ch][i], ceilVal, expVal);
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

    // Use pre-allocated member (from prepare()) to avoid audio-thread allocation
    for (int ch = 0; ch < numChannels; ++ch)
        blockChannelPtrs[static_cast<size_t>(ch)] = block.getChannelPointer(static_cast<size_t>(ch));

    processInternal(blockChannelPtrs.data(), numChannels, numSamples);
}

} // namespace dsp

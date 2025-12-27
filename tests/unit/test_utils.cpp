#include "test_utils.h"
#include <vector>

namespace test_utils {

juce::AudioBuffer<float> generateSine(float frequency, int numSamples, float amplitude)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i)
        {
            data[i] = amplitude * std::sin(2.0 * kPi * frequency * i / kSampleRate);
        }
    }
    return buffer;
}

juce::AudioBuffer<float> generateDC(float level, int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i)
            data[i] = level;
    }
    return buffer;
}

float calculateRMS(const juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    if (numSamples < 0)
        numSamples = buffer.getNumSamples() - startSample;

    float sumSquares = 0.0f;
    int totalSamples = 0;

    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto* data = buffer.getReadPointer(ch);
        for (int i = startSample; i < startSample + numSamples; ++i)
        {
            sumSquares += data[i] * data[i];
            totalSamples++;
        }
    }

    return std::sqrt(sumSquares / totalSamples);
}

float calculatePeak(const juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    if (numSamples < 0)
        numSamples = buffer.getNumSamples() - startSample;

    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        auto* data = buffer.getReadPointer(ch);
        for (int i = startSample; i < startSample + numSamples; ++i)
            peak = std::max(peak, std::abs(data[i]));
    }
    return peak;
}

juce::AudioBuffer<float> generateSilence(int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();
    return buffer;
}

juce::AudioBuffer<float> generateImpulse(int position, float amplitude, int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        if (position >= 0 && position < numSamples)
            buffer.getWritePointer(ch)[position] = amplitude;
    }
    return buffer;
}

juce::AudioBuffer<float> generateStep(int position, float level, int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        for (int i = position; i < numSamples; ++i)
            data[i] = level;
    }
    return buffer;
}

juce::AudioBuffer<float> generateAttackDecay(int attackSamples, int decaySamples, float peak, int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();

    int peakPos = attackSamples;
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        // Attack: linear ramp up
        for (int i = 0; i < attackSamples && i < numSamples; ++i)
            data[i] = peak * static_cast<float>(i) / static_cast<float>(attackSamples);
        // Peak
        if (peakPos < numSamples)
            data[peakPos] = peak;
        // Decay: exponential decay (e^-3 ≈ 0.05 at end)
        for (int i = peakPos + 1; i < numSamples && i < peakPos + decaySamples; ++i)
        {
            float t = static_cast<float>(i - peakPos) / static_cast<float>(decaySamples);
            data[i] = peak * std::exp(-3.0f * t);
        }
    }
    return buffer;
}

juce::AudioBuffer<float> generateBurst(const std::vector<int>& positions, float amplitude, int numSamples)
{
    juce::AudioBuffer<float> buffer(kNumChannels, numSamples);
    buffer.clear();
    for (int ch = 0; ch < kNumChannels; ++ch)
    {
        auto* data = buffer.getWritePointer(ch);
        for (int pos : positions)
        {
            if (pos >= 0 && pos < numSamples)
                data[pos] = amplitude;
        }
    }
    return buffer;
}

int findPeakPosition(const juce::AudioBuffer<float>& buffer, int channel)
{
    auto* data = buffer.getReadPointer(channel);
    int numSamples = buffer.getNumSamples();

    int peakPos = 0;
    float peakVal = 0.0f;
    for (int i = 0; i < numSamples; ++i)
    {
        float absVal = std::abs(data[i]);
        if (absVal > peakVal)
        {
            peakVal = absVal;
            peakPos = i;
        }
    }
    return peakPos;
}

float measurePreRinging(const juce::AudioBuffer<float>& buffer, int peakPos, int channel)
{
    auto* data = buffer.getReadPointer(channel);
    float maxPreRing = 0.0f;
    for (int i = 0; i < peakPos; ++i)
        maxPreRing = std::max(maxPreRing, std::abs(data[i]));
    return maxPreRing;
}

int measureSettlingTime(const juce::AudioBuffer<float>& buffer, float targetLevel, float tolerance, int startSample, int channel)
{
    auto* data = buffer.getReadPointer(channel);
    int numSamples = buffer.getNumSamples();

    for (int i = startSample; i < numSamples; ++i)
    {
        if (std::abs(data[i] - targetLevel) <= tolerance)
        {
            // Check it stays settled
            bool settled = true;
            for (int j = i; j < std::min(i + 100, numSamples); ++j)
            {
                if (std::abs(data[j] - targetLevel) > tolerance)
                {
                    settled = false;
                    break;
                }
            }
            if (settled)
                return i - startSample;
        }
    }
    return -1;  // Never settled
}

TransientMetrics analyzeTransient(const juce::AudioBuffer<float>& buffer, int expectedPeakPos, float targetLevel, int channel)
{
    TransientMetrics metrics;
    auto* data = buffer.getReadPointer(channel);
    int numSamples = buffer.getNumSamples();

    // Find actual peak
    metrics.peakPosition = findPeakPosition(buffer, channel);
    metrics.peakAmplitude = std::abs(data[metrics.peakPosition]);

    // Measure pre-ringing (before expected peak position)
    metrics.preRingingMax = 0.0f;
    for (int i = 0; i < expectedPeakPos; ++i)
        metrics.preRingingMax = std::max(metrics.preRingingMax, std::abs(data[i]));

    // Measure post-ringing (after peak settles toward target)
    metrics.postRingingMax = 0.0f;
    int searchStart = metrics.peakPosition + 10;  // Skip immediate peak area
    for (int i = searchStart; i < numSamples; ++i)
    {
        float deviation = std::abs(data[i] - targetLevel);
        metrics.postRingingMax = std::max(metrics.postRingingMax, deviation);
    }

    // Settling time
    metrics.settlingTime = measureSettlingTime(buffer, targetLevel, 0.01f, metrics.peakPosition, channel);

    return metrics;
}

} // namespace test_utils

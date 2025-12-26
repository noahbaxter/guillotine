#include "ClipperEngine.h"

namespace dsp {

ClipperEngine::ClipperEngine()
{
    inputGain.setGainDecibels(0.0f);
    outputGain.setGainDecibels(0.0f);
}

void ClipperEngine::prepare(double sampleRate, int maxBlockSize, int numChannels)
{
    currentSampleRate = sampleRate;
    currentNumChannels = numChannels;

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(maxBlockSize);
    spec.numChannels = static_cast<juce::uint32>(numChannels);

    inputGain.prepare(spec);
    outputGain.prepare(spec);
    clipper.prepare(spec);
    oversampler.prepare(sampleRate, maxBlockSize, numChannels);
    dcBlocker.prepare(sampleRate, numChannels);

    // Prepare dry buffer for delta monitoring
    dryBuffer.setSize(numChannels, maxBlockSize);
}

void ClipperEngine::reset()
{
    inputGain.reset();
    outputGain.reset();
    oversampler.reset();
    dcBlocker.reset();
    clipper.reset();
}

void ClipperEngine::setInputGain(float dB)
{
    inputGain.setGainDecibels(dB);
}

void ClipperEngine::setOutputGain(float dB)
{
    outputGain.setGainDecibels(dB);
}

void ClipperEngine::setCeiling(float dB)
{
    float linear = juce::Decibels::decibelsToGain(dB);
    clipper.setCeiling(linear);
}

void ClipperEngine::setSharpness(float sharpness)
{
    clipper.setSharpness(sharpness);
}

void ClipperEngine::setOversamplingFactor(int factorIndex)
{
    oversampler.setOversamplingFactor(factorIndex);
}

void ClipperEngine::setFilterType(bool isLinearPhase)
{
    oversampler.setFilterType(isLinearPhase ? Oversampler::FilterType::LinearPhase
                                            : Oversampler::FilterType::MinimumPhase);
}

void ClipperEngine::setChannelMode(bool isMidSide)
{
    stereoProcessor.setMidSideMode(isMidSide);
}

void ClipperEngine::setStereoLink(bool enabled)
{
    clipper.setStereoLink(enabled);
}

void ClipperEngine::setDeltaMonitor(bool enabled)
{
    deltaMonitorEnabled = enabled;
}

int ClipperEngine::getLatencyInSamples() const
{
    return oversampler.getLatencyInSamples();
}

void ClipperEngine::process(juce::AudioBuffer<float>& buffer)
{
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();

    // Store dry signal for delta monitoring
    if (deltaMonitorEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
            dryBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // 1. Input gain
    juce::dsp::AudioBlock<float> block(buffer);
    inputGain.process(juce::dsp::ProcessContextReplacing<float>(block));

    // 2. M/S encode (if enabled)
    stereoProcessor.encodeToMidSide(buffer);

    // 3. Upsample and clip
    int numOversampledSamples = 0;
    float* const* oversampledData = oversampler.processSamplesUp(buffer, numOversampledSamples);

    // 4. Clip (process on oversampled data or original buffer)
    if (oversampledData != nullptr)
    {
        // Process oversampled data through clipper
        clipper.processInternal(oversampledData, numChannels, numOversampledSamples);
    }
    else
    {
        // 1x oversampling - process original buffer directly
        clipper.process(buffer);
    }

    // 5. Downsample
    oversampler.processSamplesDown(buffer, numSamples);

    // 6. M/S decode (if enabled)
    stereoProcessor.decodeFromMidSide(buffer);

    // 7. DC block
    dcBlocker.process(buffer);

    // 8. Output gain
    juce::dsp::AudioBlock<float> outputBlock(buffer);
    outputGain.process(juce::dsp::ProcessContextReplacing<float>(outputBlock));

    // 9. Delta monitor: output = wet - dry
    if (deltaMonitorEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* wet = buffer.getWritePointer(ch);
            const float* dry = dryBuffer.getReadPointer(ch);
            for (int i = 0; i < numSamples; ++i)
                wet[i] -= dry[i];
        }
    }
}

} // namespace dsp

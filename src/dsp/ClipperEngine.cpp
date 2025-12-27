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

    // Prepare dry buffer and oversampler for delta monitoring
    dryBuffer.setSize(numChannels, maxBlockSize);
    dryOversampler.prepare(sampleRate, maxBlockSize, numChannels);
}

void ClipperEngine::reset()
{
    inputGain.reset();
    outputGain.reset();
    oversampler.reset();
    clipper.reset();
    dryOversampler.reset();
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
    ceilingLinear = juce::Decibels::decibelsToGain(dB);
    clipper.setCeiling(ceilingLinear);
}

void ClipperEngine::setSharpness(float sharpness)
{
    clipper.setSharpness(sharpness);
}

void ClipperEngine::setOversamplingFactor(int factorIndex)
{
    oversampler.setOversamplingFactor(factorIndex);
    dryOversampler.setOversamplingFactor(factorIndex);
}

void ClipperEngine::setFilterType(bool isLinearPhase)
{
    auto filterType = isLinearPhase ? Oversampler::FilterType::LinearPhase
                                    : Oversampler::FilterType::MinimumPhase;

    // Both oversamplers use the same filter type for phase-matched delta monitoring
    oversampler.setFilterType(filterType);
    dryOversampler.setFilterType(filterType);
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

void ClipperEngine::setEnforceCeiling(bool enabled)
{
    enforceCeilingEnabled = enabled;
}

void ClipperEngine::setBypass(bool enabled)
{
    bypassed = enabled;
}

int ClipperEngine::getLatencyInSamples() const
{
    return oversampler.getLatencyInSamples();
}

void ClipperEngine::process(juce::AudioBuffer<float>& buffer)
{
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();

    // 1. Input gain (always applied, even when bypassed)
    juce::dsp::AudioBlock<float> block(buffer);
    inputGain.process(juce::dsp::ProcessContextReplacing<float>(block));

    // Skip clipping and makeup gain when bypassed
    // Input gain still applies so users can hear pre-clip level
    if (bypassed)
    {
        // Still sanitize NaN/Inf even when bypassed
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* data = buffer.getWritePointer(ch);
            for (int i = 0; i < numSamples; ++i)
            {
                if (!std::isfinite(data[i]))
                    data[i] = 0.0f;
            }
        }
        return;
    }

    // Store dry signal for delta monitoring (after input gain)
    if (deltaMonitorEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
            dryBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // 2. M/S encode (if enabled)
    stereoProcessor.encodeToMidSide(buffer);
    if (deltaMonitorEnabled)
        stereoProcessor.encodeToMidSide(dryBuffer);

    // 3. Upsample
    int numOversampledSamples = 0;
    float* const* oversampledData = oversampler.processSamplesUp(buffer, numOversampledSamples);

    // Process dry through same filter chain (for phase matching)
    int dryOversampledSamples = 0;
    if (deltaMonitorEnabled)
        dryOversampler.processSamplesUp(dryBuffer, dryOversampledSamples);

    // 4. Clip wet signal only (dry passes through unclipped)
    if (oversampledData != nullptr)
    {
        clipper.processInternal(oversampledData, numChannels, numOversampledSamples);
    }
    else
    {
        // 1x oversampling - process original buffer directly
        clipper.process(buffer);
    }

    // 5. Downsample
    oversampler.processSamplesDown(buffer, numSamples);
    if (deltaMonitorEnabled)
        dryOversampler.processSamplesDown(dryBuffer, numSamples);

    // 6. M/S decode (if enabled)
    stereoProcessor.decodeFromMidSide(buffer);
    if (deltaMonitorEnabled)
        stereoProcessor.decodeFromMidSide(dryBuffer);

    // 7. Enforce ceiling (final hard limiter to catch filter overshoot) - wet only
    if (enforceCeilingEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* data = buffer.getWritePointer(ch);
            for (int i = 0; i < numSamples; ++i)
                data[i] = std::clamp(data[i], -ceilingLinear, ceilingLinear);
        }
    }

    // 8. Output gain
    juce::dsp::AudioBlock<float> outputBlock(buffer);
    outputGain.process(juce::dsp::ProcessContextReplacing<float>(outputBlock));

    if (deltaMonitorEnabled)
    {
        juce::dsp::AudioBlock<float> dryOutputBlock(dryBuffer);
        outputGain.process(juce::dsp::ProcessContextReplacing<float>(dryOutputBlock));
    }

    // 9. Delta monitor: output = dry - wet (what was clipped off)
    // Both signals have been through the same filter chain, so they're phase-aligned
    if (deltaMonitorEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* wet = buffer.getWritePointer(ch);
            const float* dry = dryBuffer.getReadPointer(ch);
            for (int i = 0; i < numSamples; ++i)
                wet[i] = dry[i] - wet[i];
        }
    }

    // 10. Sanitize output - replace NaN/Inf with 0 (defensive against oversimple bugs)
    for (int ch = 0; ch < numChannels; ++ch)
    {
        float* data = buffer.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i)
        {
            if (!std::isfinite(data[i]))
                data[i] = 0.0f;
        }
    }
}

} // namespace dsp

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
    
    // Always save user's preference (unless delta is already overriding it)
    if (!filterTypeWasOverriddenByDelta)
    {
        userFilterTypePreference = filterType;
    }
    
    // If delta is enabled, keep linear-phase (ignore user's filter change)
    if (deltaMonitorEnabled)
    {
        return;
    }
    
    // Apply filter type to both oversamplers
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
    if (enabled == deltaMonitorEnabled)
        return;  // Already in desired state
    
    if (enabled)
    {
        // Force both oversamplers to linear phase for perfect delta alignment
        oversampler.setFilterType(Oversampler::FilterType::LinearPhase);
        dryOversampler.setFilterType(Oversampler::FilterType::LinearPhase);
        filterTypeWasOverriddenByDelta = true;
    }
    else
    {
        // Restore user's filter type preference
        oversampler.setFilterType(userFilterTypePreference);
        dryOversampler.setFilterType(userFilterTypePreference);
        filterTypeWasOverriddenByDelta = false;
    }
    
    deltaMonitorEnabled = enabled;
}

void ClipperEngine::setEnforceCeiling(bool enabled)
{
    enforceCeilingEnabled = enabled;
}

int ClipperEngine::getLatencyInSamples() const
{
    return oversampler.getLatencyInSamples();
}

void ClipperEngine::process(juce::AudioBuffer<float>& buffer)
{
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();

    // Store dry signal for delta monitoring (before any processing)
    if (deltaMonitorEnabled)
    {
        for (int ch = 0; ch < numChannels; ++ch)
            dryBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // 1. Input gain
    juce::dsp::AudioBlock<float> block(buffer);
    inputGain.process(juce::dsp::ProcessContextReplacing<float>(block));

    // Apply input gain to dry buffer too (for delta calculation)
    if (deltaMonitorEnabled)
    {
        juce::dsp::AudioBlock<float> dryBlock(dryBuffer);
        inputGain.process(juce::dsp::ProcessContextReplacing<float>(dryBlock));
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
}

} // namespace dsp

#include "ClipperEngine.h"
#include <cmath>

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
    inputGain.setRampDurationSeconds(0.002);  // 2ms smoothing
    outputGain.prepare(spec);
    outputGain.setRampDurationSeconds(0.002);  // 2ms smoothing
    clipper.prepare(sampleRate, numChannels);
    oversampler.prepare(sampleRate, maxBlockSize, numChannels);

    // Set up ceiling smoothing (only when sample rate changes to avoid interrupting ramp)
    if (sampleRate != lastSampleRate)
    {
        lastSampleRate = sampleRate;
        smoothedCeilingLinear.reset(sampleRate, 0.002);
    }

    // Prepare dry buffer and oversampler for phase-coherent dry/wet mixing
    dryBuffer.setSize(numChannels, maxBlockSize);
    dryOversampler.prepare(sampleRate, maxBlockSize, numChannels);

    // Smooth mix parameter (5ms ramp to avoid zipper noise)
    smoothedMix.reset(sampleRate, 0.005);
}

void ClipperEngine::reset()
{
    inputGain.reset();
    outputGain.reset();
    oversampler.reset();
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
    float linear = juce::Decibels::decibelsToGain(dB);
    smoothedCeilingLinear.setTargetValue(linear);
    clipper.setCeiling(linear);
}

void ClipperEngine::setCurve(int curveIndex)
{
    clipper.setCurve(static_cast<CurveType>(curveIndex));
}

void ClipperEngine::setCurveExponent(float exponent)
{
    clipper.setCurveExponent(exponent);
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

void ClipperEngine::setStereoMode(int mode)
{
    // 0 = Stereo Link (L/R + linked)
    // 1 = L/R (unlinked)
    // 2 = M/S (unlinked)
    stereoProcessor.setMidSideMode(mode == 2);
    clipper.setStereoLink(mode == 0);
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

void ClipperEngine::setDryWetMix(float mix)
{
    smoothedMix.setTargetValue(mix);
}

int ClipperEngine::getLatencyInSamples() const
{
    return oversampler.getLatencyInSamples();
}

void ClipperEngine::applyPendingChanges()
{
    oversampler.applyPendingChanges();
    dryOversampler.applyPendingChanges();
}

void ClipperEngine::process(juce::AudioBuffer<float>& buffer)
{
    int numSamples = buffer.getNumSamples();
    int numChannels = buffer.getNumChannels();

    // 1. Input gain (always applied, even when bypassed)
    juce::dsp::AudioBlock<float> block(buffer);
    inputGain.process(juce::dsp::ProcessContextReplacing<float>(block));

    // Capture pre-clip peak (after input gain, before clipping)
    float preClipPeak = 0.0f;
    for (int ch = 0; ch < numChannels; ++ch)
    {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < numSamples; ++i)
        {
            float absVal = std::abs(data[i]);
            if (absVal > preClipPeak)
                preClipPeak = absVal;
        }
    }
    lastPreClipPeak.store(preClipPeak, std::memory_order_relaxed);

    // Skip clipping when bypassed (input gain still applies)
    if (bypassed)
    {
        lastPostClipPeak.store(preClipPeak, std::memory_order_relaxed);
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

    // 2. Determine if dry path needed (for delta monitoring or dry/wet mixing)
    float currentMix = smoothedMix.getCurrentValue();
    float targetMix = smoothedMix.getTargetValue();
    bool needsDryPath = deltaMonitorEnabled || currentMix < 0.999f || targetMix < 0.999f;

    // 3. Copy dry signal (after input gain, before processing)
    if (needsDryPath)
    {
        for (int ch = 0; ch < numChannels; ++ch)
            dryBuffer.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // 4. M/S encode both paths
    stereoProcessor.encodeToMidSide(buffer);
    if (needsDryPath)
        stereoProcessor.encodeToMidSide(dryBuffer);

    // 5. Upsample both (matched filters = phase aligned)
    int numOversampledSamples = 0;
    float* const* oversampledData = oversampler.processSamplesUp(buffer, numOversampledSamples);

    int dryOversampledSamples = 0;
    if (needsDryPath)
        dryOversampler.processSamplesUp(dryBuffer, dryOversampledSamples);

    // 6. Clip wet signal only (dry passes through unclipped)
    if (oversampledData != nullptr)
        clipper.processInternal(oversampledData, numChannels, numOversampledSamples);
    else
        clipper.process(buffer);  // 1x oversampling

    // 7. Downsample both
    oversampler.processSamplesDown(buffer, numSamples);
    if (needsDryPath)
        dryOversampler.processSamplesDown(dryBuffer, numSamples);

    // 8. M/S decode both
    stereoProcessor.decodeFromMidSide(buffer);
    if (needsDryPath)
        stereoProcessor.decodeFromMidSide(dryBuffer);

    // 9. Enforce ceiling on WET only (before mixing, so dry stays truly dry)
    if (enforceCeilingEnabled)
    {
        for (int i = 0; i < numSamples; ++i)
        {
            float ceil = smoothedCeilingLinear.getNextValue();
            for (int ch = 0; ch < numChannels; ++ch)
            {
                float* data = buffer.getWritePointer(ch);
                data[i] = std::clamp(data[i], -ceil, ceil);
            }
        }
    }

    // 10. Capture post-clip peak (wet signal after clipping, before mix/output gain)
    float postClipPeak = 0.0f;
    for (int ch = 0; ch < numChannels; ++ch)
    {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < numSamples; ++i)
        {
            float absVal = std::abs(data[i]);
            if (absVal > postClipPeak)
                postClipPeak = absVal;
        }
    }
    lastPostClipPeak.store(postClipPeak, std::memory_order_relaxed);

    // 11. Delta monitor OR phase-coherent dry/wet mix
    if (deltaMonitorEnabled)
    {
        // Delta: output = dry - wet (what was clipped off)
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* wet = buffer.getWritePointer(ch);
            const float* dry = dryBuffer.getReadPointer(ch);
            for (int i = 0; i < numSamples; ++i)
                wet[i] = dry[i] - wet[i];
        }
    }
    else if (needsDryPath)
    {
        // Mix: output = dry * (1-mix) + wet * mix
        // Both signals passed through matched oversamplers, so they're phase-aligned
        for (int i = 0; i < numSamples; ++i)
        {
            float m = smoothedMix.getNextValue();
            float dryGain = 1.0f - m;
            for (int ch = 0; ch < numChannels; ++ch)
            {
                float* wet = buffer.getWritePointer(ch);
                const float* dry = dryBuffer.getReadPointer(ch);
                wet[i] = dry[i] * dryGain + wet[i] * m;
            }
        }
    }

    // 12. Output gain
    juce::dsp::AudioBlock<float> outputBlock(buffer);
    outputGain.process(juce::dsp::ProcessContextReplacing<float>(outputBlock));

    // 13. Sanitize output - replace NaN/Inf with 0
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

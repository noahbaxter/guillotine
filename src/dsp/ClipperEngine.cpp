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
    // Clamp once and size ALL internal buffers from the clamped value, so the
    // re-block path in process() can rely on them holding >= preparedMaxBlock_
    // samples even if a host prepares with 0.
    preparedMaxBlock_ = std::max(1, maxBlockSize);

    juce::dsp::ProcessSpec spec;
    spec.sampleRate = sampleRate;
    spec.maximumBlockSize = static_cast<juce::uint32>(preparedMaxBlock_);
    spec.numChannels = static_cast<juce::uint32>(numChannels);

    inputGain.prepare(spec);
    inputGain.setRampDurationSeconds(0.002);  // 2ms smoothing
    outputGain.prepare(spec);
    outputGain.setRampDurationSeconds(0.002);  // 2ms smoothing
    clipper.prepare(sampleRate, numChannels);
    oversampler.prepare(sampleRate, preparedMaxBlock_, numChannels);

    // Set up ceiling smoothing (only when sample rate changes to avoid interrupting ramp)
    if (sampleRate != lastSampleRate)
    {
        lastSampleRate = sampleRate;
        smoothedCeilingLinear.reset(sampleRate, 0.002);
    }

    // Prepare dry buffer and oversampler for phase-coherent dry/wet mixing
    dryBuffer.setSize(numChannels, preparedMaxBlock_);
    dryOversampler.prepare(sampleRate, preparedMaxBlock_, numChannels);

    // Smooth mix parameter (5ms ramp to avoid zipper noise)
    smoothedMix.reset(sampleRate, 0.005);

    // Envelope follower: instant attack, 100ms release
    envReleaseCoeff_ = std::exp(-1.0f / static_cast<float>(sampleRate * 0.100));
    envFollowerState_ = 0.0f;
    envSampleData_.resize(static_cast<size_t>(preparedMaxBlock_), 0.0f);
    envSampleCount_ = 0;
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
    cachedInputGainDb = dB;
    inputGain.setGainDecibels(dB);
}

void ClipperEngine::setOutputGain(float dB)
{
    // Only apply user's output gain in manual mode
    if (gainMode == 0)
        outputGain.setGainDecibels(dB);
}

void ClipperEngine::setCeiling(float dB)
{
    cachedCeilingDb = dB;
    float linear = juce::Decibels::decibelsToGain(dB);
    smoothedCeilingLinear.setTargetValue(linear);
    clipper.setCeiling(linear);
}

void ClipperEngine::setCurve(int curveIndex)
{
    cachedCurveType = static_cast<CurveType>(curveIndex);
    clipper.setCurve(cachedCurveType);
}

void ClipperEngine::setCurveExponent(float exponent)
{
    cachedExponent = exponent;
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

void ClipperEngine::setGainMode(int mode)
{
    gainMode = mode;
}

float ClipperEngine::computeAutoGain() const
{
    if (gainMode == 2)
        return -cachedCeilingDb;

    // Match mode: run two reference signals through the curve, blend based on ceiling depth.
    // Transient ref (exp decay, CF~12dB) for drum-like content.
    // Tonal ref (Gaussian, CF~6dB) for sustained content.
    // Shallow ceiling → transient-weighted, deep ceiling → tonal-weighted.
    constexpr int N = 32;
    constexpr float decayRate = 8.0f;   // exp(-8t), CF ≈ 12dB
    constexpr float gaussAlpha = 25.5f; // exp(-25.5*(t-0.5)²), CF ≈ 6dB

    float ceilLin = juce::Decibels::decibelsToGain(cachedCeilingDb);
    float inputLin = juce::Decibels::decibelsToGain(cachedInputGainDb);

    float transientSumSqOrig = 0.0f, transientSumSqClip = 0.0f;
    float tonalSumSqOrig = 0.0f, tonalSumSqClip = 0.0f;

    for (int i = 0; i < N; ++i)
    {
        float t = (static_cast<float>(i) + 0.5f) / static_cast<float>(N);

        // Transient: exponential decay
        float transient = std::exp(-decayRate * t);
        float transDriven = transient * inputLin;
        float transClipped = curves::applyWithCeiling(cachedCurveType, transDriven, ceilLin, cachedExponent);
        transientSumSqOrig += transient * transient;
        transientSumSqClip += transClipped * transClipped;

        // Tonal: Gaussian bell curve
        float dt = t - 0.5f;
        float tonal = std::exp(-gaussAlpha * dt * dt);
        float tonalDriven = tonal * inputLin;
        float tonalClipped = curves::applyWithCeiling(cachedCurveType, tonalDriven, ceilLin, cachedExponent);
        tonalSumSqOrig += tonal * tonal;
        tonalSumSqClip += tonalClipped * tonalClipped;
    }

    auto computeComp = [N](float sumSqOrig, float sumSqClip) -> float {
        float rmsOrig = std::sqrt(sumSqOrig / static_cast<float>(N));
        float rmsClip = std::sqrt(sumSqClip / static_cast<float>(N));
        if (rmsClip <= 0.0f || rmsOrig <= 0.0f)
            return 0.0f;
        return 20.0f * std::log10(rmsOrig / rmsClip);
    };

    float transientComp = computeComp(transientSumSqOrig, transientSumSqClip);
    float tonalComp = computeComp(tonalSumSqOrig, tonalSumSqClip);

    // Blend: 0.0 = pure transient, 1.0 = pure tonal
    // Linear map from -6dB ceiling (transient) to -18dB ceiling (tonal), clamped
    float blend = (cachedCeilingDb - (-6.0f)) / (-18.0f - (-6.0f));
    blend = std::clamp(blend, 0.0f, 1.0f);

    float compensation = transientComp + blend * (tonalComp - transientComp);

    // Progressive reduction: pull back slightly at deep ceilings where match still feels hot.
    // Linear ramp: 0dB extra at 0dB ceiling, -matchReductionDb at -60dB ceiling.
    constexpr float matchReductionDb = 2.0f;
    float reductionBlend = std::clamp(cachedCeilingDb / -60.0f, 0.0f, 1.0f);
    compensation -= matchReductionDb * reductionBlend;

    // Clamp: match should never exceed maximize (handles Arctan/Tanh at shallow ceilings)
    return std::min(std::max(compensation, 0.0f), -cachedCeilingDb);
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

    // Re-block oversized buffers: prepareToPlay's block size is only an estimate
    // and some hosts (notably FL Studio) send more samples than that. Internal
    // buffers (dryBuffer, envSampleData_, oversampler storage) are sized to the
    // estimate, so processing an oversized block would overrun them. Split into
    // chunks of <= preparedMaxBlock_; filter state flows continuously, so this
    // matches a single call for well-behaved hosts and adds no latency.
    if (numSamples > preparedMaxBlock_)
    {
        for (int offset = 0; offset < numSamples; offset += preparedMaxBlock_)
        {
            int chunk = std::min(preparedMaxBlock_, numSamples - offset);
            juce::AudioBuffer<float> sub(buffer.getArrayOfWritePointers(), numChannels, offset, chunk);
            process(sub);  // each chunk <= preparedMaxBlock_, so no further recursion
        }
        return;
    }

    // 1. Input gain (always applied, even when bypassed)
    juce::dsp::AudioBlock<float> block(buffer);
    inputGain.process(juce::dsp::ProcessContextReplacing<float>(block));

    // Capture input peak (after input gain, before clipping)
    {
        float inputPeak = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
        {
            const float* data = buffer.getReadPointer(ch);
            for (int i = 0; i < numSamples; ++i)
            {
                float absVal = std::abs(data[i]);
                if (absVal > inputPeak)
                    inputPeak = absVal;
            }
        }
        lastInputPeak.store(inputPeak, std::memory_order_relaxed);
    }

    // Capture pre-clip envelope per sample (after input gain, before clipping)
    // Envelope follower: instant attack, exponential release
    envSampleCount_ = numSamples;
    for (int i = 0; i < numSamples; ++i)
    {
        float maxAbs = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
        {
            float absVal = std::abs(buffer.getReadPointer(ch)[i]);
            if (absVal > maxAbs)
                maxAbs = absVal;
        }

        if (maxAbs > envFollowerState_)
            envFollowerState_ = maxAbs;
        else
            envFollowerState_ *= envReleaseCoeff_;

        envSampleData_[static_cast<size_t>(i)] = envFollowerState_;
    }

    // Skip clipping when bypassed (input gain still applies)
    if (bypassed)
    {
        lastPostClipPeak.store(envFollowerState_, std::memory_order_relaxed);
        lastOutputPeak.store(lastInputPeak.load(std::memory_order_relaxed), std::memory_order_relaxed);
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
    // dryView trims the persistent dryBuffer to this block's length. The dry
    // oversampler must consume exactly numSamples per call: feeding it the
    // full-size dryBuffer would run its filter state ahead through stale tail
    // samples whenever the host block is shorter than the prepared size, and
    // the dry path drifts out of alignment with the wet path (issue #1).
    juce::AudioBuffer<float> dryView(dryBuffer.getArrayOfWritePointers(), numChannels, 0, numSamples);
    if (needsDryPath)
    {
        for (int ch = 0; ch < numChannels; ++ch)
            dryView.copyFrom(ch, 0, buffer, ch, 0, numSamples);
    }

    // 4. M/S encode both paths
    stereoProcessor.encodeToMidSide(buffer);
    if (needsDryPath)
        stereoProcessor.encodeToMidSide(dryView);

    // 5. Upsample both (matched filters = phase aligned)
    int numOversampledSamples = 0;
    float* const* oversampledData = oversampler.processSamplesUp(buffer, numOversampledSamples);

    int dryOversampledSamples = 0;
    if (needsDryPath)
        dryOversampler.processSamplesUp(dryView, dryOversampledSamples);

    // 6. Clip wet signal only (dry passes through unclipped)
    if (oversampledData != nullptr)
        clipper.processInternal(oversampledData, numChannels, numOversampledSamples);
    else
        clipper.process(buffer);  // 1x oversampling

    // 7. Downsample both
    oversampler.processSamplesDown(buffer, numSamples);
    if (needsDryPath)
        dryOversampler.processSamplesDown(dryView, numSamples);

    // 8. M/S decode both
    stereoProcessor.decodeFromMidSide(buffer);
    if (needsDryPath)
        stereoProcessor.decodeFromMidSide(dryView);

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
            const float* dry = dryView.getReadPointer(ch);
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
                const float* dry = dryView.getReadPointer(ch);
                wet[i] = dry[i] * dryGain + wet[i] * m;
            }
        }
    }

    // 12. Output gain (auto modes override the user's manual value)
    // Skip auto gain in delta mode — compensation is meaningless on the difference signal
    // Scale by dry/wet mix — dry signal doesn't need compensation
    if (gainMode != 0 && !deltaMonitorEnabled)
        outputGain.setGainDecibels(computeAutoGain() * smoothedMix.getCurrentValue());
    else if (gainMode != 0 && deltaMonitorEnabled)
        outputGain.setGainDecibels(0.0f);

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

    // 14. Capture output peak (after output gain + sanitize)
    {
        float outputPeak = 0.0f;
        for (int ch = 0; ch < numChannels; ++ch)
        {
            const float* data = buffer.getReadPointer(ch);
            for (int i = 0; i < numSamples; ++i)
            {
                float absVal = std::abs(data[i]);
                if (absVal > outputPeak)
                    outputPeak = absVal;
            }
        }
        lastOutputPeak.store(outputPeak, std::memory_order_relaxed);
    }
}

} // namespace dsp

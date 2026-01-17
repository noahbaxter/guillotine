#include "Oversampler.h"

namespace dsp {

Oversampler::Oversampler()
{
    // Oversampler created in prepare()
}

void Oversampler::rebuildOversampler()
{
    if (currentFactorIndex == 0)
    {
        // 1x = no oversampling needed
        oversampler.reset();
        return;
    }

    // Create oversampler with manual stage configuration for 32x support
    // JUCE's constructor only supports up to 16x (factor=4), so we build manually
    oversampler = std::make_unique<juce::dsp::Oversampling<float>>(
        static_cast<size_t>(numChannels_));

    oversampler->clearOversamplingStages();

    auto juceFilterType = (currentFilterType == FilterType::LinearPhase)
        ? juce::dsp::Oversampling<float>::filterHalfBandFIREquiripple
        : juce::dsp::Oversampling<float>::filterHalfBandPolyphaseIIR;

    // Add stages based on factor index (1=2x, 2=4x, 3=8x, 4=16x, 5=32x)
    int numStages = currentFactorIndex;

    for (int n = 0; n < numStages; ++n)
    {
        // IIR (min-phase) filters have inherent transient ringing at low OS rates
        // that cannot be tuned away - this is a fundamental limitation of polyphase IIR.
        // Use 8x+ for best min-phase results, or use linear phase for lower rates.
        // enforce_ceiling=true provides a safety net regardless of filter choice.
        bool isIIR = (currentFilterType == FilterType::MinimumPhase);
        float twUp, twDown, gaindBUp, gaindBDown;

        if (isIIR)
        {
            // IIR: moderate settings - can't avoid ringing at low rates
            twUp   = 0.10f;
            twDown = 0.10f;
            gaindBUp   = -70.0f;
            gaindBDown = -60.0f;
        }
        else
        {
            // FIR: tight transitions, high attenuation (no ringing)
            twUp   = (n == 0) ? 0.05f : 0.08f;
            twDown = (n == 0) ? 0.05f : 0.08f;
            gaindBUp   = -90.0f;
            gaindBDown = -80.0f;
        }

        oversampler->addOversamplingStage(juceFilterType, twUp, gaindBUp, twDown, gaindBDown);
    }

    oversampler->initProcessing(static_cast<size_t>(maxBlockSize_));
    oversampler->reset();
}

void Oversampler::prepare(double /*sampleRate*/, int maxBlock, int channels)
{
    numChannels_ = channels;
    maxBlockSize_ = maxBlock;

    // Initialize pending values to match current (avoids spurious rebuild on first process)
    pendingFactorIndex.store(currentFactorIndex, std::memory_order_relaxed);
    pendingFilterType.store((currentFilterType == FilterType::LinearPhase) ? 1 : 0, std::memory_order_relaxed);
    needsRebuild.store(false, std::memory_order_relaxed);

    rebuildOversampler();
    isPrepared = true;
}

void Oversampler::reset()
{
    if (oversampler)
        oversampler->reset();
}

void Oversampler::setOversamplingFactor(int factorIndex)
{
    int newIndex = std::clamp(factorIndex, 0, NumFactors - 1);
    if (currentFactorIndex != newIndex || pendingFactorIndex.load(std::memory_order_relaxed) != newIndex)
    {
        // Defer rebuild to audio thread to avoid race condition
        pendingFactorIndex.store(newIndex, std::memory_order_relaxed);
        needsRebuild.store(true, std::memory_order_release);
    }
}

void Oversampler::setFilterType(FilterType type)
{
    int typeInt = (type == FilterType::LinearPhase) ? 1 : 0;
    if (currentFilterType != type || pendingFilterType.load(std::memory_order_relaxed) != typeInt)
    {
        // Defer rebuild to audio thread to avoid race condition
        pendingFilterType.store(typeInt, std::memory_order_relaxed);
        needsRebuild.store(true, std::memory_order_release);
    }
}

int Oversampler::getOversamplingFactor() const
{
    if (currentFactorIndex == 0)
        return 1;
    return 1 << currentFactorIndex;  // 2^factorIndex
}

int Oversampler::getLatencyInSamples() const
{
    if (currentFactorIndex == 0 || !oversampler)
        return 0;

    return static_cast<int>(std::round(oversampler->getLatencyInSamples()));
}

void Oversampler::applyPendingChanges()
{
    if (needsRebuild.load(std::memory_order_acquire))
    {
        currentFactorIndex = pendingFactorIndex.load(std::memory_order_relaxed);
        currentFilterType = (pendingFilterType.load(std::memory_order_relaxed) == 1)
            ? FilterType::LinearPhase : FilterType::MinimumPhase;
        needsRebuild.store(false, std::memory_order_relaxed);
        rebuildOversampler();
    }
}

float* const* Oversampler::processSamplesUp(juce::AudioBuffer<float>& inputBuffer, int& numOversampledSamples)
{
    // Apply any pending parameter changes (deferred from setters to audio thread)
    if (needsRebuild.load(std::memory_order_acquire))
    {
        currentFactorIndex = pendingFactorIndex.load(std::memory_order_relaxed);
        currentFilterType = (pendingFilterType.load(std::memory_order_relaxed) == 1)
            ? FilterType::LinearPhase : FilterType::MinimumPhase;
        needsRebuild.store(false, std::memory_order_relaxed);
        rebuildOversampler();
    }

    if (currentFactorIndex == 0 || !oversampler || !isPrepared)
    {
        numOversampledSamples = inputBuffer.getNumSamples();
        return nullptr;  // Signal to use original buffer
    }

    // Create AudioBlock from input buffer
    juce::dsp::AudioBlock<float> inputBlock(inputBuffer);

    // Upsample - returns AudioBlock pointing to internal storage
    oversampledBlock = oversampler->processSamplesUp(inputBlock);

    numOversampledSamples = static_cast<int>(oversampledBlock.getNumSamples());

    // Build array of channel pointers for compatibility with existing API
    // (channelPtrs pre-allocated in prepare() to avoid audio-thread allocation)
    for (int ch = 0; ch < numChannels_; ++ch)
        channelPtrs[static_cast<size_t>(ch)] = oversampledBlock.getChannelPointer(static_cast<size_t>(ch));

    return channelPtrs.data();
}

void Oversampler::processSamplesDown(juce::AudioBuffer<float>& outputBuffer, int numOriginalSamples)
{
    if (currentFactorIndex == 0 || !oversampler || !isPrepared)
        return;

    // Create AudioBlock from output buffer (only the portion we need)
    juce::dsp::AudioBlock<float> outputBlock(outputBuffer);
    auto subBlock = outputBlock.getSubBlock(0, static_cast<size_t>(numOriginalSamples));

    // Downsample from internal storage back to output buffer
    oversampler->processSamplesDown(subBlock);
}

} // namespace dsp

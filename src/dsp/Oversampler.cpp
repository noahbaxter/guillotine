#include "Oversampler.h"

namespace dsp {

Oversampler::Oversampler()
{
    // Oversampler created in prepare()
}

void Oversampler::rebuildOversampler()
{
    oversimple::OversamplingSettings settings;
    settings.maxOrder = 5;  // Up to 32x
    settings.numUpSampledChannels = static_cast<uint32_t>(numChannels);
    settings.numDownSampledChannels = static_cast<uint32_t>(numChannels);
    settings.maxNumInputSamples = static_cast<uint32_t>(maxBlockSize);
    settings.upSampleOutputBufferType = oversimple::BufferType::plain;
    settings.upSampleInputBufferType = oversimple::BufferType::plain;
    settings.downSampleOutputBufferType = oversimple::BufferType::plain;
    settings.downSampleInputBufferType = oversimple::BufferType::plain;
    settings.order = (currentFactorIndex > 0) ? static_cast<uint32_t>(currentFactorIndex) : 1;
    settings.isUsingLinearPhase = (currentFilterType == FilterType::LinearPhase);
    settings.firTransitionBand = 4.0;
    settings.fftBlockSize = 1024;

    oversampler = std::make_unique<oversimple::TOversampling<float>>(settings);
    oversampler->reset();  // Zero-initialize filter buffers
}

void Oversampler::prepare(double /*sampleRate*/, int maxBlock, int channels)
{
    numChannels = channels;
    maxBlockSize = maxBlock;

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
    if (currentFactorIndex != newIndex)
    {
        currentFactorIndex = newIndex;
        if (isPrepared && oversampler && newIndex > 0)
        {
            oversampler->setOrder(static_cast<uint32_t>(newIndex));
            oversampler->reset();  // Clear filter state after order change
        }
    }
}

void Oversampler::setFilterType(FilterType type)
{
    if (currentFilterType != type)
    {
        currentFilterType = type;
        if (isPrepared && oversampler)
        {
            oversampler->setUseLinearPhase(type == FilterType::LinearPhase);
            oversampler->reset();  // Clear filter state after type change
        }
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

    bool isLinearPhase = (currentFilterType == FilterType::LinearPhase);
    return static_cast<int>(oversampler->getLatency(
        static_cast<uint32_t>(currentFactorIndex),
        isLinearPhase));
}

float* const* Oversampler::processSamplesUp(juce::AudioBuffer<float>& inputBuffer, int& numOversampledSamples)
{
    if (currentFactorIndex == 0 || !oversampler || !isPrepared)
    {
        numOversampledSamples = inputBuffer.getNumSamples();
        return nullptr;  // Signal to use original buffer
    }

    uint32_t numSamples = oversampler->upSample(
        inputBuffer.getArrayOfWritePointers(),
        static_cast<uint32_t>(inputBuffer.getNumSamples()));

    numOversampledSamples = static_cast<int>(numSamples);

    auto& output = oversampler->getUpSampleOutput();
    // Build array of channel pointers
    static thread_local std::vector<float*> channelPtrs;
    channelPtrs.resize(static_cast<size_t>(numChannels));
    for (int ch = 0; ch < numChannels; ++ch)
        channelPtrs[static_cast<size_t>(ch)] = output[ch].data();

    return channelPtrs.data();
}

void Oversampler::processSamplesDown(juce::AudioBuffer<float>& outputBuffer, int numOriginalSamples)
{
    if (currentFactorIndex == 0 || !oversampler || !isPrepared)
        return;

    auto& upSampledOutput = oversampler->getUpSampleOutput();

    // Build non-const array of pointers for downSample
    static thread_local std::vector<float*> outputPtrs;
    outputPtrs.resize(static_cast<size_t>(numChannels));
    for (int ch = 0; ch < numChannels; ++ch)
        outputPtrs[static_cast<size_t>(ch)] = outputBuffer.getWritePointer(ch);

    oversampler->downSample(
        upSampledOutput.get(),
        static_cast<uint32_t>(upSampledOutput.getNumSamples()),
        outputPtrs.data(),
        static_cast<uint32_t>(numOriginalSamples));
}

} // namespace dsp

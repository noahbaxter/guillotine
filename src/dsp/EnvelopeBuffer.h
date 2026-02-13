#pragma once

#include <array>
#include <atomic>
#include <cstdint>

namespace dsp {

template <size_t BufferSize = 400>
class EnvelopeBuffer
{
public:
    static constexpr size_t kBufferSize = BufferSize;
    EnvelopeBuffer() = default;

    void prepare(double sampleRate, double pointDuration)
    {
        sampleRate_ = sampleRate;
        samplesPerPoint_ = static_cast<int>(sampleRate * pointDuration);
        samplesSinceWrite_ = 0;
        currentPrePeak_ = 0.0f;
        currentPostPeak_ = 0.0f;
    }

    void reset()
    {
        writePos_.store(0, std::memory_order_relaxed);
        samplesSinceWrite_ = 0;
        currentPrePeak_ = 0.0f;
        currentPostPeak_ = 0.0f;
        preClipBuffer_.fill(0.0f);
        postClipBuffer_.fill(0.0f);
        thresholdBuffer_.fill(0.0f);
    }

    // Per-sample pre-clip envelope + per-block post-clip peak
    void processSamples(const float* envData, int numSamples,
                        float postClipPeak, float threshold)
    {
        if (postClipPeak > currentPostPeak_)
            currentPostPeak_ = postClipPeak;

        for (int i = 0; i < numSamples; ++i)
        {
            float env = envData[i];
            if (env > currentPrePeak_)
                currentPrePeak_ = env;

            samplesSinceWrite_++;

            if (samplesSinceWrite_ >= samplesPerPoint_)
            {
                int pos = writePos_.load(std::memory_order_relaxed);
                preClipBuffer_[pos] = currentPrePeak_;
                postClipBuffer_[pos] = currentPostPeak_;
                thresholdBuffer_[pos] = threshold;

                pos = (pos + 1) % static_cast<int>(BufferSize);
                writePos_.store(pos, std::memory_order_relaxed);

                samplesSinceWrite_ = 0;
                currentPrePeak_ = 0.0f;
                currentPostPeak_ = 0.0f;
            }
        }
    }

    // Getters for UI (read from any thread)
    const std::array<float, BufferSize>& getPreClipBuffer() const { return preClipBuffer_; }
    const std::array<float, BufferSize>& getPostClipBuffer() const { return postClipBuffer_; }
    const std::array<float, BufferSize>& getThresholdBuffer() const { return thresholdBuffer_; }
    int getWritePosition() const { return writePos_.load(std::memory_order_relaxed); }

private:
    std::array<float, BufferSize> preClipBuffer_{};
    std::array<float, BufferSize> postClipBuffer_{};
    std::array<float, BufferSize> thresholdBuffer_{};
    std::atomic<int> writePos_{0};

    double sampleRate_ = 44100.0;
    int samplesPerPoint_ = 441;  // 10ms at 44.1kHz
    int samplesSinceWrite_ = 0;
    float currentPrePeak_ = 0.0f;
    float currentPostPeak_ = 0.0f;
};

} // namespace dsp

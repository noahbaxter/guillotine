#pragma once

#include <JuceHeader.h>
#include <array>

// Envelope renderer - draws scrolling envelope/transient display with clip visualization
// Not a Component - call draw() from parent's paint() to control layering
class EnvelopeRenderer
{
public:
    EnvelopeRenderer() = default;

    // Draw the envelope into the given bounds
    void draw(juce::Graphics& g, juce::Rectangle<float> bounds);

    // Connect to processor's envelope buffer
    template <size_t N>
    void setEnvelopeSource(const std::array<float, N>* buffer, const std::array<float, N>* thresholds, const std::atomic<int>* writePos)
    {
        envelopeBuffer = buffer->data();
        envelopeClipThresholds = thresholds->data();
        envelopeBufferSize = static_cast<int>(N);
        envelopeWritePos = writePos;
    }

    // Set clip threshold in dB (0 = 0dB/no clip, 1 = -60dB/max clip)
    // Maps knob position to dB threshold
    void setClipAmount(float amount);
    float getClipAmount() const { return clipAmount; }

private:
    const float* envelopeBuffer = nullptr;
    const float* envelopeClipThresholds = nullptr;
    int envelopeBufferSize = 0;
    const std::atomic<int>* envelopeWritePos = nullptr;

    float clipAmount = 0.0f;  // 0 = no clip, 1 = max clip (-60dB threshold)

    // Threshold range in dB
    static constexpr float minThresholdDb = 0.0f;    // No clipping
    static constexpr float maxThresholdDb = -60.0f;  // Max clipping

    // Visual settings
    static constexpr float envelopeStroke = 2.0f;

    juce::Colour normalColour{0xffffffff};    // Normal signal (white)
    juce::Colour clippedColour{0xffff4a4a};   // Clipped portion (red)
};

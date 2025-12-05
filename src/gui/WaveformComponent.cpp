#include "WaveformComponent.h"

void EnvelopeRenderer::draw(juce::Graphics& g, juce::Rectangle<float> bounds)
{
    if (envelopeBuffer == nullptr || envelopeWritePos == nullptr)
        return;

    const int writePos = envelopeWritePos->load();
    const float width = bounds.getWidth();
    const float height = bounds.getHeight();
    const float bottom = bounds.getBottom();

    // How many points to display
    const int pointsToShow = juce::jmin(envelopeBufferSize, static_cast<int>(width));
    if (pointsToShow < 2)
        return;

    // Note: We no longer use a global clipAmount here.
    // Instead, each envelope point has its own stored threshold from when it was recorded.

    // Store segments with their clip state for drawing
    struct Segment {
        juce::Path path;
        bool clipped;
    };
    std::vector<Segment> segments;
    segments.push_back({juce::Path(), false});

    bool pathStarted = false;

    for (int i = 0; i < pointsToShow; ++i)
    {
        // Read from buffer, oldest to newest (scrolling left)
        const int bufferIndex = (writePos - pointsToShow + i + envelopeBufferSize);
        const int wrappedIndex = ((bufferIndex % envelopeBufferSize) + envelopeBufferSize) % envelopeBufferSize;
        const float envelope = envelopeBuffer[wrappedIndex];

        const float x = bounds.getX() + (static_cast<float>(i) / static_cast<float>(pointsToShow - 1)) * width;

        // Convert to dB scale for better visual representation
        // Map -60dB to 0dB range to height (0dB = top, -60dB = bottom)
        const float minDb = -60.0f;
        const float db = envelope > 0.0f ? 20.0f * log10f(envelope) : minDb;
        const float normalizedDb = juce::jlimit(0.0f, 1.0f, (db - minDb) / (0.0f - minDb));
        const float y = bottom - normalizedDb * height;

        // Determine if this point exceeds its stored threshold
        const float pointThreshold = envelopeClipThresholds[wrappedIndex];
        const float pointThresholdDb = minThresholdDb + pointThreshold * (maxThresholdDb - minThresholdDb);
        const float pointThresholdLinear = juce::Decibels::decibelsToGain(pointThresholdDb);
        const bool isClipped = envelope > pointThresholdLinear;

        if (!pathStarted)
        {
            segments.back().path.startNewSubPath(x, y);
            segments.back().clipped = isClipped;
            pathStarted = true;
        }
        else
        {
            // If clip state changed, start a new segment
            if (isClipped != segments.back().clipped)
            {
                segments.back().path.lineTo(x, y);
                segments.push_back({juce::Path(), isClipped});
                segments.back().path.startNewSubPath(x, y);
            }
            else
            {
                segments.back().path.lineTo(x, y);
            }
        }
    }

    // Draw all segments with appropriate colors
    for (const auto& seg : segments)
    {
        g.setColour(seg.clipped ? clippedColour : normalColour);
        g.strokePath(seg.path, juce::PathStrokeType(envelopeStroke));
    }
}

void EnvelopeRenderer::setClipAmount(float amount)
{
    clipAmount = juce::jlimit(0.0f, 1.0f, amount);
}

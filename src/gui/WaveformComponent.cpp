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

    // Prepare smoothed envelope data
    std::vector<float> smoothedEnvelopes(pointsToShow);
    std::vector<float> smoothedThresholds(pointsToShow);

    // Apply smoothing by averaging neighboring points
    const int smoothingWindow = juce::jmax(1, static_cast<int>(smoothingFactor * 10.0f));

    for (int i = 0; i < pointsToShow; ++i)
    {

        // Apply smoothing by averaging neighboring points
        float sumEnvelope = 0.0f;
        float sumThreshold = 0.0f;
        int count = 0;

        for (int offset = -smoothingWindow; offset <= smoothingWindow; ++offset)
        {
            const int smoothIndex = juce::jlimit(0, pointsToShow - 1, i + offset);
            const int smoothBufferIndex = (writePos - pointsToShow + smoothIndex + envelopeBufferSize);
            const int smoothWrappedIndex = ((smoothBufferIndex % envelopeBufferSize) + envelopeBufferSize) % envelopeBufferSize;

            sumEnvelope += envelopeBuffer[smoothWrappedIndex];
            sumThreshold += envelopeClipThresholds[smoothWrappedIndex];
            count++;
        }

        smoothedEnvelopes[i] = sumEnvelope / count;
        smoothedThresholds[i] = sumThreshold / count;
    }

    // Create filled paths for blood-like effect
    juce::Path whiteFillPath;
    juce::Path redFillPath;

    whiteFillPath.startNewSubPath(bounds.getX(), bottom);
    redFillPath.startNewSubPath(bounds.getX(), bottom);

    for (int i = 0; i < pointsToShow; ++i)
    {
        const float envelope = smoothedEnvelopes[i];
        const float pointThreshold = smoothedThresholds[i];

        const float x = bounds.getX() + (static_cast<float>(i) / static_cast<float>(pointsToShow - 1)) * width;

        // Convert to dB scale for better visual representation
        // Map -60dB to 0dB range to height (0dB = top, -60dB = bottom)
        const float minDb = -60.0f;
        const float db = envelope > 0.0f ? 20.0f * log10f(envelope) : minDb;
        const float normalizedDb = juce::jlimit(0.0f, 1.0f, (db - minDb) / (0.0f - minDb));
        const float y = bottom - normalizedDb * height;

        // Calculate clip threshold position
        const float pointThresholdDb = minThresholdDb + pointThreshold * (maxThresholdDb - minThresholdDb);
        const float pointThresholdLinear = juce::Decibels::decibelsToGain(pointThresholdDb);
        const float thresholdDb = pointThresholdLinear > 0.0f ? 20.0f * log10f(pointThresholdLinear) : minDb;
        const float normalizedThresholdDb = juce::jlimit(0.0f, 1.0f, (thresholdDb - minDb) / (0.0f - minDb));
        const float thresholdY = bottom - normalizedThresholdDb * height;

        // Determine if this point exceeds its stored threshold
        const bool isClipped = envelope > pointThresholdLinear;

        if (isClipped)
        {
            // For clipped points: white fill from bottom to threshold, red fill from threshold to waveform
            whiteFillPath.lineTo(x, thresholdY);
            redFillPath.lineTo(x, y);
        }
        else
        {
            // For normal points: white fill from bottom to waveform
            whiteFillPath.lineTo(x, y);
            redFillPath.lineTo(x, thresholdY);
        }
    }

    // Close the paths
    whiteFillPath.lineTo(bounds.getRight(), bottom);
    whiteFillPath.closeSubPath();

    redFillPath.lineTo(bounds.getRight(), bottom);
    redFillPath.closeSubPath();

    // Draw filled areas (blood-like effect)
    g.setColour(normalColour);
    g.fillPath(whiteFillPath);

    g.setColour(clippedColour);
    // g.fillPath(redFillPath);

    // Optional: draw outline for definition
    g.setColour(juce::Colours::black.withAlpha(0.3f));
    juce::Path outlinePath;
    outlinePath.startNewSubPath(bounds.getX(), bottom);

    for (int i = 0; i < pointsToShow; ++i)
    {
        const float envelope = smoothedEnvelopes[i];
        const float minDb = -60.0f;
        const float db = envelope > 0.0f ? 20.0f * log10f(envelope) : minDb;
        const float normalizedDb = juce::jlimit(0.0f, 1.0f, (db - minDb) / (0.0f - minDb));
        const float x = bounds.getX() + (static_cast<float>(i) / static_cast<float>(pointsToShow - 1)) * width;
        const float y = bottom - normalizedDb * height;
        outlinePath.lineTo(x, y);
    }

    outlinePath.lineTo(bounds.getRight(), bottom);
    // g.strokePath(outlinePath, juce::PathStrokeType(1.0f));
}

void EnvelopeRenderer::setClipAmount(float amount)
{
    clipAmount = juce::jlimit(0.0f, 1.0f, amount);
}

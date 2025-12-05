#pragma once

#include <JuceHeader.h>
#include "WaveformComponent.h"

// Forward declaration
class GuillotineProcessor;

class GuillotineComponent : public juce::Component,
                            private juce::Timer
{
public:
    GuillotineComponent();
    ~GuillotineComponent() override = default;

    // Connect to processor for waveform data
    void setProcessor(GuillotineProcessor* processor);

    GuillotineProcessor* getProcessor() const { return processor; }

    void paint(juce::Graphics& g) override;
    void resized() override;

    // Set blade position: 0.0 = blade at top (min clip), 1.0 = blade at bottom (max clip)
    void setBladePosition(float position);
    float getBladePosition() const { return bladePosition; }

private:
    void timerCallback() override { repaint(); }

    GuillotineProcessor* processor = nullptr;

    juce::Image baseImage;
    juce::Image bladeImage;
    juce::Image ropeImage;
    juce::Image sideImage;

    EnvelopeRenderer envelope;

    float bladePosition = 0.0f;  // 0.0 to 1.0

    // Maximum vertical offset for blade travel (in normalized coordinates)
    static constexpr float maxBladeTravel = 0.35f;

    // Offset from blade position to where rope clips (increase to extend rope further down)
    static constexpr float ropeClipOffset = 0.20f;

    // Waveform positioning (normalized coordinates within component bounds)
    // These define where the waveform sits between the guillotine posts
    static constexpr float waveformLeft = 0.12f;
    static constexpr float waveformRight = 0.88f;
    static constexpr float waveformTop = 0.35f;
    static constexpr float waveformBottom = 0.75f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineComponent)
};

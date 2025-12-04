#pragma once

#include <JuceHeader.h>

class GuillotineComponent : public juce::Component
{
public:
    GuillotineComponent();
    ~GuillotineComponent() override = default;

    void paint(juce::Graphics& g) override;
    void resized() override;

    // Set blade position: 0.0 = blade at top (min clip), 1.0 = blade at bottom (max clip)
    void setBladePosition(float position);
    float getBladePosition() const { return bladePosition; }

private:
    juce::Image baseImage;
    juce::Image bladeImage;
    juce::Image ropeImage;
    juce::Image sideImage;

    float bladePosition = 0.0f;  // 0.0 to 1.0

    // Maximum vertical offset for blade travel (in normalized coordinates)
    static constexpr float maxBladeTravel = 0.35f;

    // Offset from blade position to where rope clips (increase to extend rope further down)
    static constexpr float ropeClipOffset = 0.20f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineComponent)
};

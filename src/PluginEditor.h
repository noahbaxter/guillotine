#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"
#include "gui/GuillotineComponent.h"

class GuillotineEditor : public juce::AudioProcessorEditor,
                          private juce::Slider::Listener
{
public:
    explicit GuillotineEditor(GuillotineProcessor&);
    ~GuillotineEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void sliderValueChanged(juce::Slider* slider) override;

    GuillotineProcessor& audioProcessor;

    GuillotineComponent guillotine;
    juce::Slider clipSlider;
    juce::Label clipLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineEditor)
};

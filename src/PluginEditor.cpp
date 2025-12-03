#include "PluginProcessor.h"
#include "PluginEditor.h"

AudioPluginEditor::AudioPluginEditor(AudioPluginProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    // Gain slider
    gainSlider.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    gainSlider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 80, 20);
    addAndMakeVisible(gainSlider);

    gainLabel.setText("Gain", juce::dontSendNotification);
    gainLabel.setJustificationType(juce::Justification::centred);
    addAndMakeVisible(gainLabel);

    gainAttachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment>(
        audioProcessor.getAPVTS(), "gain", gainSlider);

    setSize(300, 200);
}

AudioPluginEditor::~AudioPluginEditor()
{
}

void AudioPluginEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1e1e1e));

    g.setColour(juce::Colours::white);
    g.setFont(18.0f);
    g.drawFittedText("Audio Plugin", getLocalBounds().removeFromTop(40), juce::Justification::centred, 1);
}

void AudioPluginEditor::resized()
{
    auto bounds = getLocalBounds();
    bounds.removeFromTop(40);

    auto sliderArea = bounds.reduced(40);
    gainLabel.setBounds(sliderArea.removeFromTop(20));
    gainSlider.setBounds(sliderArea);
}

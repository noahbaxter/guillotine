#include "PluginProcessor.h"
#include "PluginEditor.h"

GuillotineEditor::GuillotineEditor(GuillotineProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    // Guillotine visualization
    addAndMakeVisible(guillotine);

    // Clip control slider (knob)
    clipSlider.setSliderStyle(juce::Slider::RotaryVerticalDrag);
    clipSlider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 80, 20);
    clipSlider.setRange(0.0, 1.0, 0.01);
    clipSlider.setValue(0.0);
    clipSlider.addListener(this);
    addAndMakeVisible(clipSlider);

    clipLabel.setText("Clip", juce::dontSendNotification);
    clipLabel.setJustificationType(juce::Justification::centred);
    addAndMakeVisible(clipLabel);

    // Window size: maintain 5:6 aspect for guillotine plus space for knob
    setSize(400, 580);
}

GuillotineEditor::~GuillotineEditor()
{
    clipSlider.removeListener(this);
}

void GuillotineEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1e1e1e));
}

void GuillotineEditor::resized()
{
    auto bounds = getLocalBounds();

    // Bottom area for knob
    auto knobArea = bounds.removeFromBottom(100);
    clipLabel.setBounds(knobArea.removeFromTop(20));
    clipSlider.setBounds(knobArea.reduced(20, 0));

    // Rest for guillotine visualization
    guillotine.setBounds(bounds.reduced(10));
}

void GuillotineEditor::sliderValueChanged(juce::Slider* slider)
{
    if (slider == &clipSlider)
    {
        guillotine.setBladePosition(static_cast<float>(slider->getValue()));
    }
}

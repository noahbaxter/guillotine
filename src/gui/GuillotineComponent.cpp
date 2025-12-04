#include "GuillotineComponent.h"
#include "BinaryData.h"

GuillotineComponent::GuillotineComponent()
{
    // Load images from embedded binary resources
    baseImage = juce::ImageCache::getFromMemory(BinaryData::base_png, BinaryData::base_pngSize);
    bladeImage = juce::ImageCache::getFromMemory(BinaryData::blade_png, BinaryData::blade_pngSize);
    sideImage = juce::ImageCache::getFromMemory(BinaryData::side_png, BinaryData::side_pngSize);
}

void GuillotineComponent::paint(juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat();

    if (!baseImage.isValid() || !bladeImage.isValid() || !sideImage.isValid())
    {
        g.setColour(juce::Colours::red);
        g.drawText("Images not loaded!", bounds, juce::Justification::centred);
        return;
    }

    // Calculate the blade offset based on position
    float bladeOffsetY = bladePosition * maxBladeTravel * bounds.getHeight();

    // Draw base layer (static)
    g.drawImage(baseImage, bounds, juce::RectanglePlacement::centred);

    // Draw blade layer (moves down based on bladePosition)
    auto bladeBounds = bounds.translated(0.0f, bladeOffsetY);
    g.drawImage(bladeImage, bladeBounds, juce::RectanglePlacement::centred);

    // Draw side/frame layer (static, on top)
    g.drawImage(sideImage, bounds, juce::RectanglePlacement::centred);
}

void GuillotineComponent::resized()
{
    // Nothing special needed here - paint handles the scaling
}

void GuillotineComponent::setBladePosition(float position)
{
    bladePosition = juce::jlimit(0.0f, 1.0f, position);
    repaint();
}

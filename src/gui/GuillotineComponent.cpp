#include "GuillotineComponent.h"
#include "BinaryData.h"
#include "../PluginProcessor.h"

GuillotineComponent::GuillotineComponent()
{
    // Load images from embedded binary resources
    baseImage = juce::ImageCache::getFromMemory(BinaryData::base_png, BinaryData::base_pngSize);
    bladeImage = juce::ImageCache::getFromMemory(BinaryData::blade_png, BinaryData::blade_pngSize);
    ropeImage = juce::ImageCache::getFromMemory(BinaryData::rope_png, BinaryData::rope_pngSize);
    sideImage = juce::ImageCache::getFromMemory(BinaryData::side_png, BinaryData::side_pngSize);

    // Start refresh timer for waveform animation
    startTimerHz(60);
}

void GuillotineComponent::setProcessor(GuillotineProcessor* proc)
{
    processor = proc;
    if (processor != nullptr)
    {
        envelope.setEnvelopeSource(&processor->getEnvelopeBuffer(), &processor->getEnvelopeClipThresholds(), &processor->getEnvelopeWritePosition());
    }
}

void GuillotineComponent::paint(juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat();

    if (!baseImage.isValid() || !bladeImage.isValid() || !ropeImage.isValid() || !sideImage.isValid())
    {
        g.setColour(juce::Colours::red);
        g.drawText("Images not loaded!", bounds, juce::Justification::centred);
        return;
    }

    // Calculate the blade offset based on position
    float bladeOffsetY = bladePosition * maxBladeTravel * bounds.getHeight();

    // Layer order (back to front): rope -> blade -> waveform -> base -> side

    // 1. Draw rope (clipped to only show above the blade)
    {
        juce::Graphics::ScopedSaveState saveState(g);
        // Clip region: from top of bounds down to blade position
        auto clipRect = bounds.withBottom(bounds.getY() + bladeOffsetY + bounds.getHeight() * ropeClipOffset);
        g.reduceClipRegion(clipRect.toNearestInt());
        g.drawImage(ropeImage, bounds, juce::RectanglePlacement::centred);
    }

    // 2. Draw blade layer (moves down based on bladePosition, behind waveform)
    auto bladeBounds = bounds.translated(0.0f, bladeOffsetY);
    g.drawImage(bladeImage, bladeBounds, juce::RectanglePlacement::centred);

    // 3. Draw envelope (between the posts, in front of blade but behind base)
    {
        auto envelopeBounds = juce::Rectangle<float>(
            bounds.getX() + bounds.getWidth() * waveformLeft,
            bounds.getY() + bounds.getHeight() * waveformTop,
            bounds.getWidth() * (waveformRight - waveformLeft),
            bounds.getHeight() * (waveformBottom - waveformTop)
        );
        envelope.draw(g, envelopeBounds);
    }

    // 4. Draw base layer (main guillotine with hole - blade goes through it)
    g.drawImage(baseImage, bounds, juce::RectanglePlacement::centred);

    // 5. Draw side/frame layer (static, on top of everything)
    g.drawImage(sideImage, bounds, juce::RectanglePlacement::centred);
}

void GuillotineComponent::resized()
{
    // Nothing special needed here - paint handles the scaling
}

void GuillotineComponent::setBladePosition(float position)
{
    bladePosition = juce::jlimit(0.0f, 1.0f, position);
    // Sync envelope clip amount (blade down = more clipping = lower threshold)
    envelope.setClipAmount(bladePosition);

    // Note: threshold is now managed via APVTS and WebView relay system

    repaint();
}

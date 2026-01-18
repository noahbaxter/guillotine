#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

class GuillotineEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit GuillotineEditor(GuillotineProcessor&);
    ~GuillotineEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    std::optional<juce::WebBrowserComponent::Resource> getResource(const juce::String& url);
    void pushVersionOnce();

    GuillotineProcessor& audioProcessor;
    bool versionPushed = false;

    // WebView relay objects (bridge between WebView and parameters)
    juce::WebSliderRelay inputGainRelay;
    juce::WebSliderRelay outputGainRelay;
    juce::WebSliderRelay ceilingRelay;
    juce::WebSliderRelay curveRelay;
    juce::WebSliderRelay curveExponentRelay;
    juce::WebSliderRelay oversamplingRelay;
    juce::WebSliderRelay filterTypeRelay;
    juce::WebSliderRelay stereoModeRelay;
    juce::WebSliderRelay deltaMonitorRelay;
    juce::WebSliderRelay bypassClipperRelay;

    // WebView component (must be declared after relays)
    juce::WebBrowserComponent webView;

    // Parameter attachments (connect relays to APVTS parameters)
    juce::WebSliderParameterAttachment inputGainAttachment;
    juce::WebSliderParameterAttachment outputGainAttachment;
    juce::WebSliderParameterAttachment ceilingAttachment;
    juce::WebSliderParameterAttachment curveAttachment;
    juce::WebSliderParameterAttachment curveExponentAttachment;
    juce::WebSliderParameterAttachment oversamplingAttachment;
    juce::WebSliderParameterAttachment filterTypeAttachment;
    juce::WebSliderParameterAttachment stereoModeAttachment;
    juce::WebSliderParameterAttachment deltaMonitorAttachment;
    juce::WebSliderParameterAttachment bypassClipperAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineEditor)
};

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
    void checkForUpdate();
    void setViewMode(bool advanced);

    GuillotineProcessor& audioProcessor;
    bool versionPushed = false;
    bool updateCheckDone = false;
    bool advancedMode = true;
    int timerTicks = 0;

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
    juce::WebSliderRelay enforceCeilingRelay;
    juce::WebSliderRelay dryWetRelay;
    juce::WebSliderRelay gainModeRelay;

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
    juce::WebSliderParameterAttachment enforceCeilingAttachment;
    juce::WebSliderParameterAttachment dryWetAttachment;
    juce::WebSliderParameterAttachment gainModeAttachment;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineEditor)
};

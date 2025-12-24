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
    static const char* getMimeForExtension(const juce::String& extension);

    GuillotineProcessor& audioProcessor;

    juce::WebBrowserComponent webView {
        juce::WebBrowserComponent::Options{}
            .withNativeIntegrationEnabled()
            .withNativeFunction("setParameter", [this](const juce::var& args, auto complete) {
                if (args.isArray() && args.size() >= 2)
                {
                    auto paramId = args[0].toString();
                    auto value = static_cast<float>(args[1]);
                    handleParameterChange(paramId, value);
                }
                complete({});
            })
            .withResourceProvider([this](const auto& url) { return getResource(url); },
                                  juce::URL { "http://localhost/" }.getOrigin())
    };

    void handleParameterChange(const juce::String& paramId, float value);
    void pushEnvelopeData();

    float lastClipValue = 0.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineEditor)
};

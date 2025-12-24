#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "BinaryData.h"

GuillotineEditor::GuillotineEditor(GuillotineProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    addAndMakeVisible(webView);

    webView.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());

    setSize(600, 500);

    // Start timer to push envelope data at 60Hz
    startTimerHz(60);
}

GuillotineEditor::~GuillotineEditor()
{
    stopTimer();
}

void GuillotineEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1e1e1e));
}

void GuillotineEditor::resized()
{
    webView.setBounds(getLocalBounds());
}

void GuillotineEditor::timerCallback()
{
    pushEnvelopeData();
}

void GuillotineEditor::handleParameterChange(const juce::String& paramId, float value)
{
    if (paramId == "clip")
    {
        lastClipValue = value;
        audioProcessor.setClipThreshold(value);
    }
}

void GuillotineEditor::pushEnvelopeData()
{
    const auto& envelope = audioProcessor.getEnvelopeBuffer();
    const auto& thresholds = audioProcessor.getEnvelopeClipThresholds();
    const int writePos = audioProcessor.getEnvelopeWritePosition().load();

    // Build JSON array for envelope data
    juce::String envelopeJson = "[";
    juce::String thresholdsJson = "[";

    for (int i = 0; i < GuillotineProcessor::envelopeBufferSize; ++i)
    {
        if (i > 0)
        {
            envelopeJson += ",";
            thresholdsJson += ",";
        }
        envelopeJson += juce::String(envelope[i], 6);
        thresholdsJson += juce::String(thresholds[i], 6);
    }

    envelopeJson += "]";
    thresholdsJson += "]";

    // Call JavaScript function to update the waveform
    juce::String js = "if (window.updateEnvelope) { window.updateEnvelope({ "
                      "envelope: " + envelopeJson + ", "
                      "thresholds: " + thresholdsJson + ", "
                      "writePos: " + juce::String(writePos) + " }); }";

    webView.evaluateJavascript(js, nullptr);
}

std::optional<juce::WebBrowserComponent::Resource> GuillotineEditor::getResource(const juce::String& url)
{
    auto urlToRetrieve = url == "/" ? juce::String("index.html")
                                    : url.fromFirstOccurrenceOf("/", false, false);

    // Resource lookup table - add new web files here
    struct ResourceEntry { const char* path; const void* data; int size; const char* mime; };
    static const ResourceEntry resources[] = {
        // HTML
        { "index.html",              BinaryData::index_html,      BinaryData::index_htmlSize,      "text/html" },
        // JavaScript
        { "main.js",                 BinaryData::main_js,         BinaryData::main_jsSize,         "text/javascript" },
        { "lib/juce-bridge.js",      BinaryData::jucebridge_js,   BinaryData::jucebridge_jsSize,   "text/javascript" },
        { "components/guillotine.js",BinaryData::guillotine_js,   BinaryData::guillotine_jsSize,   "text/javascript" },
        { "components/visualizer.js",BinaryData::visualizer_js,   BinaryData::visualizer_jsSize,   "text/javascript" },
        { "components/knob.js",      BinaryData::knob_js,         BinaryData::knob_jsSize,         "text/javascript" },
        // CSS (with alias)
        { "main.css",                BinaryData::main_css,        BinaryData::main_cssSize,        "text/css" },
        { "styles/main.css",         BinaryData::main_css,        BinaryData::main_cssSize,        "text/css" },
        // Assets
        { "assets/base.png",         BinaryData::base_png,        BinaryData::base_pngSize,        "image/png" },
        { "assets/blade.png",        BinaryData::blade_png,       BinaryData::blade_pngSize,       "image/png" },
        { "assets/rope.png",         BinaryData::rope_png,        BinaryData::rope_pngSize,        "image/png" },
        { "assets/side.png",         BinaryData::side_png,        BinaryData::side_pngSize,        "image/png" },
    };

    for (const auto& res : resources)
    {
        if (urlToRetrieve == res.path)
        {
            std::vector<std::byte> bytes(res.size);
            std::memcpy(bytes.data(), res.data, res.size);
            return juce::WebBrowserComponent::Resource { std::move(bytes), juce::String(res.mime) };
        }
    }

    return std::nullopt;
}

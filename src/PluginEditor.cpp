#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "BinaryData.h"

GuillotineEditor::GuillotineEditor(GuillotineProcessor& p)
    : AudioProcessorEditor(&p), audioProcessor(p)
{
    addAndMakeVisible(webView);

    webView.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());

    setSize(400, 580);

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

    // Serve files from BinaryData
    const void* data = nullptr;
    int size = 0;
    juce::String mimeType;

    if (urlToRetrieve == "index.html")
    {
        data = BinaryData::index_html;
        size = BinaryData::index_htmlSize;
        mimeType = "text/html";
    }
    else if (urlToRetrieve == "main.js")
    {
        data = BinaryData::main_js;
        size = BinaryData::main_jsSize;
        mimeType = "text/javascript";
    }
    else if (urlToRetrieve == "main.css")
    {
        data = BinaryData::main_css;
        size = BinaryData::main_cssSize;
        mimeType = "text/css";
    }
    else if (urlToRetrieve == "assets/base.png")
    {
        data = BinaryData::base_png;
        size = BinaryData::base_pngSize;
        mimeType = "image/png";
    }
    else if (urlToRetrieve == "assets/blade.png")
    {
        data = BinaryData::blade_png;
        size = BinaryData::blade_pngSize;
        mimeType = "image/png";
    }
    else if (urlToRetrieve == "assets/rope.png")
    {
        data = BinaryData::rope_png;
        size = BinaryData::rope_pngSize;
        mimeType = "image/png";
    }
    else if (urlToRetrieve == "assets/side.png")
    {
        data = BinaryData::side_png;
        size = BinaryData::side_pngSize;
        mimeType = "image/png";
    }

    if (data != nullptr && size > 0)
    {
        std::vector<std::byte> bytes(size);
        std::memcpy(bytes.data(), data, size);
        return juce::WebBrowserComponent::Resource { std::move(bytes), mimeType };
    }

    return std::nullopt;
}

const char* GuillotineEditor::getMimeForExtension(const juce::String& extension)
{
    if (extension == "html" || extension == "htm") return "text/html";
    if (extension == "js") return "text/javascript";
    if (extension == "css") return "text/css";
    if (extension == "png") return "image/png";
    if (extension == "jpg" || extension == "jpeg") return "image/jpeg";
    if (extension == "svg") return "image/svg+xml";
    if (extension == "json") return "application/json";
    return "application/octet-stream";
}

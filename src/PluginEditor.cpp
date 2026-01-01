#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "BinaryData.h"

GuillotineEditor::GuillotineEditor(GuillotineProcessor& p)
    : AudioProcessorEditor(&p),
      audioProcessor(p),
      // Initialize relay objects with parameter IDs
      inputGainRelay{"inputGain"},
      outputGainRelay{"outputGain"},
      ceilingRelay{"ceiling"},
      curveRelay{"curve"},
      curveExponentRelay{"curveExponent"},
      oversamplingRelay{"oversampling"},
      filterTypeRelay{"filterType"},
      channelModeRelay{"channelMode"},
      stereoLinkRelay{"stereoLink"},
      deltaMonitorRelay{"deltaMonitor"},
      bypassClipperRelay{"bypassClipper"},
      // Initialize WebView with relays
      webView{
          juce::WebBrowserComponent::Options{}
              .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
              .withWinWebView2Options(
                  juce::WebBrowserComponent::Options::WinWebView2{}
                      .withUserDataFolder(juce::File::getSpecialLocation(
                          juce::File::SpecialLocationType::tempDirectory)))
              .withNativeIntegrationEnabled()
              .withResourceProvider(
                  [this](const auto& url) { return getResource(url); })
              .withOptionsFrom(inputGainRelay)
              .withOptionsFrom(outputGainRelay)
              .withOptionsFrom(ceilingRelay)
              .withOptionsFrom(curveRelay)
              .withOptionsFrom(curveExponentRelay)
              .withOptionsFrom(oversamplingRelay)
              .withOptionsFrom(filterTypeRelay)
              .withOptionsFrom(channelModeRelay)
              .withOptionsFrom(stereoLinkRelay)
              .withOptionsFrom(deltaMonitorRelay)
              .withOptionsFrom(bypassClipperRelay)
      },
      // Initialize parameter attachments (connect relays to APVTS)
      inputGainAttachment{
          *audioProcessor.getAPVTS().getParameter("inputGain"),
          inputGainRelay, nullptr},
      outputGainAttachment{
          *audioProcessor.getAPVTS().getParameter("outputGain"),
          outputGainRelay, nullptr},
      ceilingAttachment{
          *audioProcessor.getAPVTS().getParameter("ceiling"),
          ceilingRelay, nullptr},
      curveAttachment{
          *audioProcessor.getAPVTS().getParameter("curve"),
          curveRelay, nullptr},
      curveExponentAttachment{
          *audioProcessor.getAPVTS().getParameter("curveExponent"),
          curveExponentRelay, nullptr},
      oversamplingAttachment{
          *audioProcessor.getAPVTS().getParameter("oversampling"),
          oversamplingRelay, nullptr},
      filterTypeAttachment{
          *audioProcessor.getAPVTS().getParameter("filterType"),
          filterTypeRelay, nullptr},
      channelModeAttachment{
          *audioProcessor.getAPVTS().getParameter("channelMode"),
          channelModeRelay, nullptr},
      stereoLinkAttachment{
          *audioProcessor.getAPVTS().getParameter("stereoLink"),
          stereoLinkRelay, nullptr},
      deltaMonitorAttachment{
          *audioProcessor.getAPVTS().getParameter("deltaMonitor"),
          deltaMonitorRelay, nullptr},
      bypassClipperAttachment{
          *audioProcessor.getAPVTS().getParameter("bypassClipper"),
          bypassClipperRelay, nullptr}
{
    addAndMakeVisible(webView);

    // Enable resizing with aspect ratio lock (1.2:1 = 600x500)
    setResizable(true, true);
    getConstrainer()->setFixedAspectRatio(600.0 / 500.0);
    setResizeLimits(480, 400, 1200, 1000);
    setSize(600, 500);

    // Delay navigation to allow WebView2 async initialization on Windows
    juce::MessageManager::callAsync([safeThis = juce::Component::SafePointer<GuillotineEditor>(this)]() {
        if (safeThis != nullptr)
            safeThis->webView.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    });

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
    pushVersionOnce();
    pushEnvelopeData();
}

void GuillotineEditor::pushVersionOnce()
{
    if (versionPushed) return;

    // Only mark as pushed if the element exists (page is loaded)
    juce::String js = "if (document.getElementById('version-num')) { "
                      "document.getElementById('version-num').textContent = 'v" JucePlugin_VersionString "'; "
                      "true; } else { false; }";
    webView.evaluateJavascript(js, [this](juce::WebBrowserComponent::EvaluationResult result) {
        if (result.getResult() && result.getResult()->toString() == "true") {
            versionPushed = true;
        }
    });
}

void GuillotineEditor::pushEnvelopeData()
{
    const auto& preClip = audioProcessor.getEnvelopePreClip();
    const auto& postClip = audioProcessor.getEnvelopePostClip();
    const auto& thresholds = audioProcessor.getEnvelopeClipThresholds();
    const int writePos = audioProcessor.getEnvelopeWritePosition().load();

    // Build JSON arrays for envelope data
    juce::String preClipJson = "[";
    juce::String postClipJson = "[";
    juce::String thresholdsJson = "[";

    for (int i = 0; i < GuillotineProcessor::envelopeBufferSize; ++i)
    {
        if (i > 0)
        {
            preClipJson += ",";
            postClipJson += ",";
            thresholdsJson += ",";
        }
        preClipJson += juce::String(preClip[i], 6);
        postClipJson += juce::String(postClip[i], 6);
        thresholdsJson += juce::String(thresholds[i], 6);
    }

    preClipJson += "]";
    postClipJson += "]";
    thresholdsJson += "]";

    // Call JavaScript function to update the waveform
    // preClip = after input gain, before clipping (RED - what gets clipped off)
    // postClip = after clipping, before output gain (WHITE - what you hear)
    juce::String js = "if (window.updateEnvelope) { window.updateEnvelope({ "
                      "preClip: " + preClipJson + ", "
                      "postClip: " + postClipJson + ", "
                      "thresholds: " + thresholdsJson + ", "
                      "writePos: " + juce::String(writePos) + " }); }";

    webView.evaluateJavascript(js, nullptr);
}

std::optional<juce::WebBrowserComponent::Resource> GuillotineEditor::getResource(const juce::String& url)
{
    // Extract path from URL - handle both relative paths and full URLs
    // WebView2 sends full URLs like "https://juce.backend/assets/base.png"
    // We need to extract just "assets/base.png"
    juce::String urlToRetrieve;

    if (url == "/" || url.endsWithIgnoreCase("juce.backend/") || url.endsWithIgnoreCase("juce.backend"))
    {
        urlToRetrieve = "index.html";
    }
    else if (url.contains("juce.backend/"))
    {
        // Full URL: extract everything after "juce.backend/"
        urlToRetrieve = url.fromLastOccurrenceOf("juce.backend/", false, true);
    }
    else if (url.startsWith("/"))
    {
        // Relative path like "/assets/base.png" -> "assets/base.png"
        urlToRetrieve = url.substring(1);
    }
    else
    {
        // Already a relative path
        urlToRetrieve = url;
    }

    // Handle empty path (root)
    if (urlToRetrieve.isEmpty())
        urlToRetrieve = "index.html";

    // Resource lookup table - add new web files here
    struct ResourceEntry { const char* path; const void* data; int size; const char* mime; };
    static const ResourceEntry resources[] = {
        // HTML
        { "index.html",              BinaryData::index_html,      BinaryData::index_htmlSize,      "text/html" },
        // JavaScript - core
        { "main.js",                 BinaryData::main_js,         BinaryData::main_jsSize,         "text/javascript" },
        { "lib/juce-bridge.js",      BinaryData::jucebridge_js,   BinaryData::jucebridge_jsSize,   "text/javascript" },
        { "lib/component-loader.js", BinaryData::componentloader_js, BinaryData::componentloader_jsSize, "text/javascript" },
        { "lib/guillotine-utils.js", BinaryData::guillotineutils_js, BinaryData::guillotineutils_jsSize, "text/javascript" },
        { "lib/svg-utils.js",        BinaryData::svgutils_js,       BinaryData::svgutils_jsSize,       "text/javascript" },
        { "lib/theme.js",            BinaryData::theme_js,          BinaryData::theme_jsSize,          "text/javascript" },
        { "lib/saturation-curves.js", BinaryData::saturationcurves_js, BinaryData::saturationcurves_jsSize, "text/javascript" },
        { "lib/config.js",            BinaryData::config_js,         BinaryData::config_jsSize,         "text/javascript" },
        { "lib/utils.js",             BinaryData::utils_js,          BinaryData::utils_jsSize,          "text/javascript" },
        { "lib/delta-mode.css",      BinaryData::deltamode_css,     BinaryData::deltamode_cssSize,     "text/css" },
        // JUCE frontend library
        { "lib/juce/index.js",       BinaryData::index_js,        BinaryData::index_jsSize,        "text/javascript" },
        { "lib/juce/check_native_interop.js", BinaryData::check_native_interop_js, BinaryData::check_native_interop_jsSize, "text/javascript" },
        // Components - views
        { "components/views/guillotine.js",   BinaryData::guillotine_js,   BinaryData::guillotine_jsSize,   "text/javascript" },
        { "components/views/guillotine.css",  BinaryData::guillotine_css,  BinaryData::guillotine_cssSize,  "text/css" },
        { "components/views/microscope.js",   BinaryData::microscope_js,   BinaryData::microscope_jsSize,   "text/javascript" },
        { "components/views/microscope.css",  BinaryData::microscope_css,  BinaryData::microscope_cssSize,  "text/css" },
        // Components - controls
        { "components/controls/knob.js",   BinaryData::knob_js,   BinaryData::knob_jsSize,   "text/javascript" },
        { "components/controls/knob.css",  BinaryData::knob_css,  BinaryData::knob_cssSize,  "text/css" },
        { "components/controls/lever.js",  BinaryData::lever_js,  BinaryData::lever_jsSize,  "text/javascript" },
        { "components/controls/lever.css", BinaryData::lever_css, BinaryData::lever_cssSize, "text/css" },
        { "components/controls/toggle.js", BinaryData::toggle_js, BinaryData::toggle_jsSize, "text/javascript" },
        // Components - display
        { "components/display/waveform.js",   BinaryData::waveform_js,   BinaryData::waveform_jsSize,   "text/javascript" },
        { "components/display/waveform.css",  BinaryData::waveform_css,  BinaryData::waveform_cssSize,  "text/css" },
        { "components/display/digits.js",   BinaryData::digits_js,   BinaryData::digits_jsSize,   "text/javascript" },
        { "components/display/digits.css",  BinaryData::digits_css,  BinaryData::digits_cssSize,  "text/css" },
        { "components/display/blood-pool.js",   BinaryData::bloodpool_js,   BinaryData::bloodpool_jsSize,   "text/javascript" },
        { "components/display/blood-pool.css",  BinaryData::bloodpool_css,  BinaryData::bloodpool_cssSize,  "text/css" },
        // CSS - global
        { "main.css",                BinaryData::main_css,        BinaryData::main_cssSize,        "text/css" },
        // Assets
        { "assets/base.png",         BinaryData::base_png,        BinaryData::base_pngSize,        "image/png" },
        { "assets/blade.png",        BinaryData::blade_png,       BinaryData::blade_pngSize,       "image/png" },
        { "assets/rope.png",         BinaryData::rope_png,        BinaryData::rope_pngSize,        "image/png" },
        { "assets/side.png",         BinaryData::side_png,        BinaryData::side_pngSize,        "image/png" },
        { "assets/switch.png",       BinaryData::switch_png,      BinaryData::switch_pngSize,      "image/png" },
        { "assets/guillotine-logo.png", BinaryData::guillotinelogo_png, BinaryData::guillotinelogo_pngSize, "image/png" },
        // Numeric sprites
        { "assets/numeric/num-0.png",   BinaryData::num0_png,       BinaryData::num0_pngSize,       "image/png" },
        { "assets/numeric/num-1.png",   BinaryData::num1_png,       BinaryData::num1_pngSize,       "image/png" },
        { "assets/numeric/num-2.png",   BinaryData::num2_png,       BinaryData::num2_pngSize,       "image/png" },
        { "assets/numeric/num-3.png",   BinaryData::num3_png,       BinaryData::num3_pngSize,       "image/png" },
        { "assets/numeric/num-4.png",   BinaryData::num4_png,       BinaryData::num4_pngSize,       "image/png" },
        { "assets/numeric/num-5.png",   BinaryData::num5_png,       BinaryData::num5_pngSize,       "image/png" },
        { "assets/numeric/num-6.png",   BinaryData::num6_png,       BinaryData::num6_pngSize,       "image/png" },
        { "assets/numeric/num-7.png",   BinaryData::num7_png,       BinaryData::num7_pngSize,       "image/png" },
        { "assets/numeric/num-8.png",   BinaryData::num8_png,       BinaryData::num8_pngSize,       "image/png" },
        { "assets/numeric/num-9.png",   BinaryData::num9_png,       BinaryData::num9_pngSize,       "image/png" },
        { "assets/numeric/num-dot.png", BinaryData::numdot_png,     BinaryData::numdot_pngSize,     "image/png" },
        // Text artwork for comparison
        { "assets/text/text-1.png",     BinaryData::text1_png,      BinaryData::text1_pngSize,      "image/png" },
        { "assets/text/text-2.png",     BinaryData::text2_png,      BinaryData::text2_pngSize,      "image/png" },
        { "assets/text/text-lockslip.png", BinaryData::textlockslip_png, BinaryData::textlockslip_pngSize, "image/png" },
        // Control labels (replacing font-rendered text)
        { "assets/text/controls/andy.png",      BinaryData::andy_png,        BinaryData::andy_pngSize,        "image/png" },
        { "assets/text/controls/blade.png",     BinaryData::blade_png2,      BinaryData::blade_png2Size,      "image/png" },
        { "assets/text/controls/ceiling.png",   BinaryData::ceiling_png,     BinaryData::ceiling_pngSize,     "image/png" },
        { "assets/text/controls/dB.png",        BinaryData::dB_png,          BinaryData::dB_pngSize,          "image/png" },
        { "assets/text/controls/input.png",     BinaryData::input_png,       BinaryData::input_pngSize,       "image/png" },
        { "assets/text/controls/output.png",    BinaryData::output_png,      BinaryData::output_pngSize,      "image/png" },
        { "assets/text/controls/oversample.png", BinaryData::oversample_png, BinaryData::oversample_pngSize, "image/png" },
        { "assets/text/controls/x.png",         BinaryData::x_png,           BinaryData::x_pngSize,           "image/png" },
        // Curve type labels
        { "assets/text/controls/blades/atan.png",  BinaryData::atan_png,   BinaryData::atan_pngSize,   "image/png" },
        { "assets/text/controls/blades/cubic.png", BinaryData::cubic_png,  BinaryData::cubic_pngSize,  "image/png" },
        { "assets/text/controls/blades/hard.png",  BinaryData::hard_png,   BinaryData::hard_pngSize,   "image/png" },
        { "assets/text/controls/blades/knee.png",  BinaryData::knee_png,   BinaryData::knee_pngSize,   "image/png" },
        { "assets/text/controls/blades/quint.png", BinaryData::quint_png,  BinaryData::quint_pngSize,  "image/png" },
        { "assets/text/controls/blades/t2.png",    BinaryData::t2_png,     BinaryData::t2_pngSize,     "image/png" },
        { "assets/text/controls/blades/tanh.png",  BinaryData::tanh_png,   BinaryData::tanh_pngSize,   "image/png" },
        // Wood textures
        { "assets/original/wood-1.png", BinaryData::wood1_png,      BinaryData::wood1_pngSize,      "image/png" },
        { "assets/original/wood-2.png", BinaryData::wood2_png,      BinaryData::wood2_pngSize,      "image/png" },
        { "assets/original/wood-3.png", BinaryData::wood3_png,      BinaryData::wood3_pngSize,      "image/png" },
        // Fonts
        { "assets/fonts/zeyada.ttf",    BinaryData::zeyada_ttf,     BinaryData::zeyada_ttfSize,     "application/x-font-ttf" },
        { "assets/fonts/cedarville.ttf", BinaryData::cedarville_ttf, BinaryData::cedarville_ttfSize, "application/x-font-ttf" },
        { "assets/fonts/dawning.ttf",   BinaryData::dawning_ttf,    BinaryData::dawning_ttfSize,    "application/x-font-ttf" },
        // Textures
        { "assets/grunge-texture.jpg",  BinaryData::grungetexture_jpg, BinaryData::grungetexture_jpgSize, "image/jpeg" },
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

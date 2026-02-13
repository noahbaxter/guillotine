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
      stereoModeRelay{"stereoMode"},
      deltaMonitorRelay{"deltaMonitor"},
      bypassClipperRelay{"bypassClipper"},
      enforceCeilingRelay{"enforceCeiling"},
      dryWetRelay{"dryWet"},
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
              .withOptionsFrom(stereoModeRelay)
              .withOptionsFrom(deltaMonitorRelay)
              .withOptionsFrom(bypassClipperRelay)
              .withOptionsFrom(enforceCeilingRelay)
              .withOptionsFrom(dryWetRelay)
              .withNativeFunction("setViewMode", [this](const auto& args, auto complete) {
                  bool advanced = args.size() > 0 && args[0].toString() == "true";
                  setViewMode(advanced);
                  complete({});
              })
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
      stereoModeAttachment{
          *audioProcessor.getAPVTS().getParameter("stereoMode"),
          stereoModeRelay, nullptr},
      deltaMonitorAttachment{
          *audioProcessor.getAPVTS().getParameter("deltaMonitor"),
          deltaMonitorRelay, nullptr},
      bypassClipperAttachment{
          *audioProcessor.getAPVTS().getParameter("bypassClipper"),
          bypassClipperRelay, nullptr},
      enforceCeilingAttachment{
          *audioProcessor.getAPVTS().getParameter("enforceCeiling"),
          enforceCeilingRelay, nullptr},
      dryWetAttachment{
          *audioProcessor.getAPVTS().getParameter("dryWet"),
          dryWetRelay, nullptr}
{
    addAndMakeVisible(webView);
    webView.setWantsKeyboardFocus(false);
    webView.setOpaque(false);  // Let parent's dark background show through during load

    // Enable resizing with aspect ratio lock (1.2:1 = 600x500)
    setResizable(true, true);
    getConstrainer()->setFixedAspectRatio(600.0 / 500.0);
    setResizeLimits(480, 400, 1200, 1000);
    setSize(900, 750);

    // Delay navigation to allow WebView2 async initialization on Windows
    juce::MessageManager::callAsync([safeThis = juce::Component::SafePointer<GuillotineEditor>(this)]() {
        if (safeThis != nullptr)
            safeThis->webView.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    });

    // Start timer for version injection (stops after first success)
    startTimerHz(60);
}

GuillotineEditor::~GuillotineEditor()
{
    stopTimer();
}

void GuillotineEditor::paint(juce::Graphics& g)
{
    g.fillAll(juce::Colour(0xff1a1a1a));  // Match web/main.css html background
}

void GuillotineEditor::resized()
{
    auto bounds = getLocalBounds();

    // In basic mode, keep the WebView at advanced-mode width so the HTML layout
    // never changes. The editor window simply clips the right panel off-screen.
    if (!advancedMode)
        bounds.setWidth(juce::roundToInt(bounds.getHeight() * (600.0 / 500.0)));

    webView.setBounds(bounds);
}

void GuillotineEditor::timerCallback()
{
    pushVersionOnce();
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


void GuillotineEditor::setViewMode(bool advanced)
{
    advancedMode = advanced;

    int currentHeight = getHeight();

    if (advanced)
    {
        double ratio = 600.0 / 500.0;  // 1.2:1
        getConstrainer()->setFixedAspectRatio(ratio);
        setResizeLimits(480, 400, 1200, 1000);
        int newWidth = juce::roundToInt(currentHeight * ratio);
        newWidth = juce::jlimit(480, 1200, newWidth);
        setSize(newWidth, currentHeight);
    }
    else
    {
        double ratio = 2.0 / 3.0;  // 0.667:1
        getConstrainer()->setFixedAspectRatio(ratio);
        setResizeLimits(300, 450, 670, 1000);
        int newWidth = juce::roundToInt(currentHeight * ratio);
        newWidth = juce::jlimit(300, 670, newWidth);
        setSize(newWidth, currentHeight);
    }
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

    // Dynamic endpoint: serve envelope data as binary (Float32 array + uint32 writePos)
    // JS fetches this at 60Hz instead of C++ pushing JSON via evaluateJavascript
    if (urlToRetrieve == "envelope.bin")
    {
        const auto& preClip = audioProcessor.getEnvelopePreClip();
        const int writePos = audioProcessor.getEnvelopeWritePosition();
        constexpr int bufSize = GuillotineProcessor::envelopeBufferSize;

        // Binary format: N floats (preClip) + 1 uint32 (writePos)
        constexpr size_t floatBytes = bufSize * sizeof(float);
        constexpr size_t totalBytes = floatBytes + sizeof(uint32_t);

        std::vector<std::byte> bytes(totalBytes);
        std::memcpy(bytes.data(), preClip.data(), floatBytes);

        uint32_t writePosU32 = static_cast<uint32_t>(writePos);
        std::memcpy(bytes.data() + floatBytes, &writePosU32, sizeof(uint32_t));

        return juce::WebBrowserComponent::Resource { std::move(bytes), "application/octet-stream" };
    }

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
        { "lib/crt-effect.js",       BinaryData::crteffect_js,      BinaryData::crteffect_jsSize,      "text/javascript" },
        { "lib/saturation-curves.js", BinaryData::saturationcurves_js, BinaryData::saturationcurves_jsSize, "text/javascript" },
        { "lib/config.js",            BinaryData::config_js,         BinaryData::config_jsSize,         "text/javascript" },
        { "lib/utils.js",             BinaryData::utils_js,          BinaryData::utils_jsSize,          "text/javascript" },
        { "lib/blade-state.js",      BinaryData::bladestate_js,     BinaryData::bladestate_jsSize,     "text/javascript" },
        { "lib/delta-mode.css",      BinaryData::deltamode_css,     BinaryData::deltamode_cssSize,     "text/css" },
        { "lib/crt-effects.css",     BinaryData::crteffects_css,    BinaryData::crteffects_cssSize,    "text/css" },
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
        { "components/controls/dropdown.js",  BinaryData::dropdown_js,  BinaryData::dropdown_jsSize,  "text/javascript" },
        { "components/controls/dropdown.css", BinaryData::dropdown_css, BinaryData::dropdown_cssSize, "text/css" },
        { "components/controls/toggle.js", BinaryData::toggle_js, BinaryData::toggle_jsSize, "text/javascript" },
        // Components - display
        { "components/display/waveform.js",   BinaryData::waveform_js,   BinaryData::waveform_jsSize,   "text/javascript" },
        { "components/display/waveform.css",  BinaryData::waveform_css,  BinaryData::waveform_cssSize,  "text/css" },
        { "components/display/digits.js",   BinaryData::digits_js,   BinaryData::digits_jsSize,   "text/javascript" },
        { "components/display/digits.css",  BinaryData::digits_css,  BinaryData::digits_cssSize,  "text/css" },
        { "components/display/blood-pool.js",   BinaryData::bloodpool_js,   BinaryData::bloodpool_jsSize,   "text/javascript" },
        { "components/display/blood-pool.css",  BinaryData::bloodpool_css,  BinaryData::bloodpool_cssSize,  "text/css" },
        { "components/display/blood-line.js",   BinaryData::bloodline_js,   BinaryData::bloodline_jsSize,   "text/javascript" },
        // CSS - global
        { "main.css",                BinaryData::main_css,        BinaryData::main_cssSize,        "text/css" },
        // Assets - branding
        { "assets/branding/logo.png",         BinaryData::logo_png,        BinaryData::logo_pngSize,        "image/png" },
        { "assets/branding/signature.png",    BinaryData::signature_png,   BinaryData::signature_pngSize,   "image/png" },
        { "assets/branding/lockslip.png",     BinaryData::lockslip_png,    BinaryData::lockslip_pngSize,    "image/png" },
        { "assets/branding/decorative-1.png", BinaryData::decorative1_png, BinaryData::decorative1_pngSize, "image/png" },
        { "assets/branding/decorative-2.png", BinaryData::decorative2_png, BinaryData::decorative2_pngSize, "image/png" },
        // Assets - guillotine
        { "assets/guillotine/base.png",         BinaryData::base_png,        BinaryData::base_pngSize,        "image/png" },
        { "assets/guillotine/base-outline.png", BinaryData::baseoutline_png, BinaryData::baseoutline_pngSize, "image/png" },
        { "assets/guillotine/blade.png",        BinaryData::blade_png,       BinaryData::blade_pngSize,       "image/png" },
        { "assets/guillotine/blade-outline.png", BinaryData::bladeoutline_png, BinaryData::bladeoutline_pngSize, "image/png" },
        { "assets/guillotine/rope.png",         BinaryData::rope_png,        BinaryData::rope_pngSize,        "image/png" },
        { "assets/guillotine/side-fill.png",    BinaryData::sidefill_png,    BinaryData::sidefill_pngSize,    "image/png" },
        { "assets/guillotine/side-outline.png", BinaryData::sideoutline_png, BinaryData::sideoutline_pngSize, "image/png" },
        // Assets - labels
        { "assets/labels/input.png",      BinaryData::input_png,      BinaryData::input_pngSize,      "image/png" },
        { "assets/labels/output.png",     BinaryData::output_png,     BinaryData::output_pngSize,     "image/png" },
        { "assets/labels/ceiling.png",    BinaryData::ceiling_png,    BinaryData::ceiling_pngSize,    "image/png" },
        { "assets/labels/blade.png",      BinaryData::blade_png2,     BinaryData::blade_png2Size,     "image/png" },
        { "assets/labels/oversample.png", BinaryData::oversample_png, BinaryData::oversample_pngSize, "image/png" },
        { "assets/labels/dB.png",         BinaryData::dB_png,         BinaryData::dB_pngSize,         "image/png" },
        { "assets/labels/x.png",          BinaryData::x_png,          BinaryData::x_pngSize,          "image/png" },
        // Assets - curves
        { "assets/curves/hard.png",  BinaryData::hard_png,  BinaryData::hard_pngSize,  "image/png" },
        { "assets/curves/tanh.png",  BinaryData::tanh_png,  BinaryData::tanh_pngSize,  "image/png" },
        { "assets/curves/atan.png",  BinaryData::atan_png,  BinaryData::atan_pngSize,  "image/png" },
        { "assets/curves/quint.png", BinaryData::quint_png, BinaryData::quint_pngSize, "image/png" },
        { "assets/curves/cubic.png", BinaryData::cubic_png, BinaryData::cubic_pngSize, "image/png" },
        { "assets/curves/knee.png",  BinaryData::knee_png,  BinaryData::knee_pngSize,  "image/png" },
        { "assets/curves/t2.png",    BinaryData::t2_png,    BinaryData::t2_pngSize,    "image/png" },
        // Assets - digits
        { "assets/digits/0.png",   BinaryData::_0_png,   BinaryData::_0_pngSize,   "image/png" },
        { "assets/digits/1.png",   BinaryData::_1_png,   BinaryData::_1_pngSize,   "image/png" },
        { "assets/digits/2.png",   BinaryData::_2_png,   BinaryData::_2_pngSize,   "image/png" },
        { "assets/digits/3.png",   BinaryData::_3_png,   BinaryData::_3_pngSize,   "image/png" },
        { "assets/digits/4.png",   BinaryData::_4_png,   BinaryData::_4_pngSize,   "image/png" },
        { "assets/digits/5.png",   BinaryData::_5_png,   BinaryData::_5_pngSize,   "image/png" },
        { "assets/digits/6.png",   BinaryData::_6_png,   BinaryData::_6_pngSize,   "image/png" },
        { "assets/digits/7.png",   BinaryData::_7_png,   BinaryData::_7_pngSize,   "image/png" },
        { "assets/digits/8.png",   BinaryData::_8_png,   BinaryData::_8_pngSize,   "image/png" },
        { "assets/digits/9.png",   BinaryData::_9_png,   BinaryData::_9_pngSize,   "image/png" },
        { "assets/digits/dot.png", BinaryData::dot_png,  BinaryData::dot_pngSize,  "image/png" },
        // Assets - toggles
        { "assets/toggles/base.png",   BinaryData::base_png2,   BinaryData::base_png2Size,   "image/png" },
        { "assets/toggles/middle.png", BinaryData::middle_png,  BinaryData::middle_pngSize,  "image/png" },
        { "assets/toggles/stem.png",   BinaryData::stem_png,    BinaryData::stem_pngSize,    "image/png" },
        // Assets - icons
        { "assets/icons/true-peak.svg",    BinaryData::truepeak_svg,    BinaryData::truepeak_svgSize,    "image/svg+xml" },
        { "assets/icons/linear-phase.svg", BinaryData::linearphase_svg, BinaryData::linearphase_svgSize, "image/svg+xml" },
        { "assets/icons/min-phase.svg",    BinaryData::minphase_svg,    BinaryData::minphase_svgSize,    "image/svg+xml" },
        { "assets/icons/stereo-link.svg",  BinaryData::stereolink_svg,  BinaryData::stereolink_svgSize,  "image/svg+xml" },
        { "assets/icons/lr.svg",           BinaryData::lr_svg,          BinaryData::lr_svgSize,          "image/svg+xml" },
        { "assets/icons/ms.svg",           BinaryData::ms_svg,          BinaryData::ms_svgSize,          "image/svg+xml" },
        // Assets - textures
        { "assets/textures/wood-1.png", BinaryData::wood1_png,  BinaryData::wood1_pngSize,  "image/png" },
        { "assets/textures/wood-2.png", BinaryData::wood2_png,  BinaryData::wood2_pngSize,  "image/png" },
        { "assets/textures/wood-3.png", BinaryData::wood3_png,  BinaryData::wood3_pngSize,  "image/png" },
        { "assets/textures/grunge.jpg", BinaryData::grunge_jpg, BinaryData::grunge_jpgSize, "image/jpeg" },
        // Assets - fonts
        { "assets/fonts/zeyada.ttf",    BinaryData::zeyada_ttf, BinaryData::zeyada_ttfSize, "application/x-font-ttf" },
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

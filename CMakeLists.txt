cmake_minimum_required(VERSION 3.22)

# Read version from VERSION file
file(READ "${CMAKE_SOURCE_DIR}/VERSION" GUILLOTINE_VERSION)
string(STRIP "${GUILLOTINE_VERSION}" GUILLOTINE_VERSION)

project(Guillotine VERSION ${GUILLOTINE_VERSION} LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Use existing JUCE submodule
add_subdirectory(third_party/JUCE)

# CLAP support via clap-juce-extensions
add_subdirectory(third_party/clap-juce-extensions EXCLUDE_FROM_ALL)

# On Windows with MSVC, install WebView2 if not present
if(MSVC)
    set(WEBVIEW2_VERSION "1.0.3485.44")
    set(WEBVIEW2_PACKAGE_DIR "${CMAKE_SOURCE_DIR}/packages/Microsoft.Web.WebView2.${WEBVIEW2_VERSION}")

    if(NOT EXISTS "${WEBVIEW2_PACKAGE_DIR}")
        message(STATUS "Installing WebView2 NuGet package...")
        execute_process(
            COMMAND powershell -ExecutionPolicy Bypass -NoProfile -File
                "${CMAKE_SOURCE_DIR}/scripts/DownloadWebView2.ps1"
            WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
            RESULT_VARIABLE WEBVIEW2_RESULT
        )
        if(NOT WEBVIEW2_RESULT EQUAL 0)
            message(FATAL_ERROR "Failed to install WebView2 package. Result: ${WEBVIEW2_RESULT}")
        endif()
    endif()

    # Point JUCE's FindWebView2 to our local package
    set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${CMAKE_SOURCE_DIR}/packages" CACHE PATH "" FORCE)
endif()

# Plugin definition
juce_add_plugin(Guillotine
    VERSION ${PROJECT_VERSION}
    COMPANY_NAME "Dichotic Studios"
    BUNDLE_ID "com.dichoticstudios.guillotine"
    PLUGIN_MANUFACTURER_CODE Dich
    PLUGIN_CODE Gltn
    FORMATS VST3 AU LV2 Standalone
    PRODUCT_NAME "Guillotine"
    PLUGIN_DESC "A clipping plugin with guillotine visualization"

    # WebView requirements
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE

    # Plugin characteristics
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE

    # VST3 category
    VST3_CATEGORIES Fx

    # LV2 URI (required for LV2 format)
    LV2URI https://dichoticstudios.com/plugins/guillotine
)

# CLAP plugin wrapper
clap_juce_extensions_plugin(
    TARGET Guillotine
    CLAP_ID "com.dichoticstudios.guillotine"
    CLAP_FEATURES audio-effect distortion
)

# Generate JuceHeader.h (without 'using namespace juce')
juce_generate_juce_header(Guillotine)

# Source files
target_sources(Guillotine
    PRIVATE
        src/PluginProcessor.cpp
        src/PluginProcessor.h
        src/PluginEditor.cpp
        src/PluginEditor.h
        src/dsp/ClipperEngine.cpp
        src/dsp/ClipperEngine.h
        src/dsp/Clipper.cpp
        src/dsp/Clipper.h
        src/dsp/StereoProcessor.cpp
        src/dsp/StereoProcessor.h
        src/dsp/Oversampler.cpp
        src/dsp/Oversampler.h
        src/dsp/SaturatorCurves.h
)

# Binary data for web files and assets
juce_add_binary_data(GuillotineData
    NAMESPACE BinaryData
    SOURCES
        # Web - core
        web/index.html
        web/main.js
        web/main.css
        # Web - lib
        web/lib/juce-bridge.js
        web/lib/component-loader.js
        web/lib/guillotine-utils.js
        web/lib/svg-utils.js
        web/lib/theme.js
        web/lib/crt-effect.js
        web/lib/saturation-curves.js
        web/lib/config.js
        web/lib/delta-mode.css
        web/lib/crt-effects.css
        web/lib/utils.js
        # Web - JUCE frontend lib
        web/lib/juce/index.js
        web/lib/juce/check_native_interop.js
        # Web - components/views
        web/components/views/guillotine.js
        web/components/views/guillotine.css
        web/components/views/microscope.js
        web/components/views/microscope.css
        # Web - components/controls
        web/components/controls/knob.js
        web/components/controls/knob.css
        web/components/controls/lever.js
        web/components/controls/lever.css
        web/components/controls/dropdown.js
        web/components/controls/dropdown.css
        web/components/controls/toggle.js
        # Web - components/display
        web/components/display/waveform.js
        web/components/display/waveform.css
        web/components/display/digits.js
        web/components/display/digits.css
        web/components/display/blood-pool.js
        web/components/display/blood-pool.css
        web/components/display/blood-line.js
        # Web - assets/branding
        web/assets/branding/logo.png
        web/assets/branding/signature.png
        web/assets/branding/lockslip.png
        web/assets/branding/decorative-1.png
        web/assets/branding/decorative-2.png
        # Web - assets/guillotine
        web/assets/guillotine/base.png
        web/assets/guillotine/base-outline.png
        web/assets/guillotine/blade.png
        web/assets/guillotine/blade-outline.png
        web/assets/guillotine/rope.png
        web/assets/guillotine/side-fill.png
        web/assets/guillotine/side-outline.png
        # Web - assets/labels
        web/assets/labels/input.png
        web/assets/labels/output.png
        web/assets/labels/ceiling.png
        web/assets/labels/blade.png
        web/assets/labels/oversample.png
        web/assets/labels/dB.png
        web/assets/labels/x.png
        # Web - assets/curves
        web/assets/curves/hard.png
        web/assets/curves/tanh.png
        web/assets/curves/atan.png
        web/assets/curves/quint.png
        web/assets/curves/cubic.png
        web/assets/curves/knee.png
        web/assets/curves/t2.png
        # Web - assets/digits
        web/assets/digits/0.png
        web/assets/digits/1.png
        web/assets/digits/2.png
        web/assets/digits/3.png
        web/assets/digits/4.png
        web/assets/digits/5.png
        web/assets/digits/6.png
        web/assets/digits/7.png
        web/assets/digits/8.png
        web/assets/digits/9.png
        web/assets/digits/dot.png
        # Web - assets/toggles
        web/assets/toggles/base.png
        web/assets/toggles/middle.png
        web/assets/toggles/stem.png
        # Web - assets/icons
        web/assets/icons/true-peak.svg
        web/assets/icons/linear-phase.svg
        web/assets/icons/min-phase.svg
        web/assets/icons/stereo-link.svg
        web/assets/icons/lr.svg
        web/assets/icons/ms.svg
        # Web - assets/textures
        web/assets/textures/wood-1.png
        web/assets/textures/wood-2.png
        web/assets/textures/wood-3.png
        web/assets/textures/grunge.jpg
        # Web - assets/fonts
        web/assets/fonts/zeyada.ttf
)

# Compile definitions
target_compile_definitions(Guillotine
    PUBLIC
        JUCE_STRICT_REFCOUNTEDPOINTER=1
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
    PRIVATE
        DONT_SET_USING_JUCE_NAMESPACE=1
)

# Link libraries
target_link_libraries(Guillotine
    PRIVATE
        GuillotineData
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_dsp
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

# Platform-specific compiler flags
if(APPLE)
    target_compile_options(Guillotine PRIVATE
        -Wno-deprecated-declarations
        -Wno-comma
    )
endif()

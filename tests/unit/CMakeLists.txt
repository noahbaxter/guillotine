cmake_minimum_required(VERSION 3.15)
project(AudioPluginUnitTests VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add JUCE
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/JUCE ${CMAKE_BINARY_DIR}/JUCE)

# Unit test executable
juce_add_console_app(unit_tests PRODUCT_NAME "AudioPlugin Unit Tests")

target_sources(unit_tests PRIVATE
    Main.cpp
    UnitTests.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../src/PluginProcessor.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../../src/PluginEditor.cpp
)

target_include_directories(unit_tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../../src
    ${CMAKE_CURRENT_SOURCE_DIR}/../../JuceLibraryCode
)

target_compile_definitions(unit_tests PRIVATE
    JUCE_STANDALONE_APPLICATION=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JucePlugin_Name="AudioPlugin"
    JucePlugin_Build_VST3=0
    JucePlugin_Build_AU=0
)

target_link_libraries(unit_tests PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_processors
    juce::juce_core
    juce::juce_data_structures
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
)

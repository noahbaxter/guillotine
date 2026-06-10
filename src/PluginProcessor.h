#pragma once

#include <JuceHeader.h>
#include <array>
#include <atomic>
#include "dsp/ClipperEngine.h"
#include "dsp/EnvelopeBuffer.h"

class GuillotineProcessor : public juce::AudioProcessor
{
public:
    // Display dB range for threshold visualization (-60 to 0 dB)
    static constexpr float displayDbRange = 60.0f;

    // Envelope buffer for waveform display
    // NOTE: envelopePointsPerSecond must match WAVEFORM_POINTS_PER_SECOND in web/lib/config.js
    static constexpr int envelopePointsPerSecond = 200;
    static constexpr double envelopeHistorySeconds = 5.0;   // Total history length
    static constexpr double envelopePointDuration = 1.0 / envelopePointsPerSecond;
    static constexpr int envelopeBufferSize = static_cast<int>(envelopeHistorySeconds * envelopePointsPerSecond);
    GuillotineProcessor();
    ~GuillotineProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

#ifndef JucePlugin_PreferredChannelConfigurations
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
#endif

    juce::AudioProcessorValueTreeState& getAPVTS() { return apvts; }

    // Envelope buffer access for GUI
    // PreClip = after input gain, before clipping (RED in display - what gets clipped off)
    // PostClip = after input gain AND clipping, before output gain (WHITE in display - what you hear)
    const std::array<float, envelopeBufferSize>& getEnvelopePreClip() const { return envelopeBuffer.getPreClipBuffer(); }
    const std::array<float, envelopeBufferSize>& getEnvelopePostClip() const { return envelopeBuffer.getPostClipBuffer(); }
    const std::array<float, envelopeBufferSize>& getEnvelopeClipThresholds() const { return envelopeBuffer.getThresholdBuffer(); }
    int getEnvelopeWritePosition() const { return envelopeBuffer.getWritePosition(); }

    // Peak levels (linear amplitude)
    float getInputPeak() const { return clipperEngine.getLastInputPeak(); }
    float getOutputPeak() const { return clipperEngine.getLastOutputPeak(); }

    // Test oscillator for UI development (1Hz ramp)
    void setTestOscEnabled(bool enabled) { testOscEnabled = enabled; }
    bool isTestOscEnabled() const { return testOscEnabled; }

private:
    juce::AudioProcessorValueTreeState apvts;

    // Ring buffer for envelope visualization (peak detection)
    dsp::EnvelopeBuffer<envelopeBufferSize> envelopeBuffer;

    // Test oscillator (1Hz ramp for UI development) - toggle via setTestOscEnabled()
    bool testOscEnabled = false;
    double testOscPhase = 0.0;
    double sampleRate = 44100.0;

    // DSP engine
    dsp::ClipperEngine clipperEngine;
    int lastReportedLatency = 0;
    int preparedBlockSize = 1;  // prepareToPlay's estimate; larger host blocks are chunked to this

    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineProcessor)
};

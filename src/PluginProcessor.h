#pragma once

#include <JuceHeader.h>
#include <array>
#include <atomic>

class GuillotineProcessor : public juce::AudioProcessor
{
public:
    // Envelope buffer for waveform display
    // ~400 points at 5ms intervals = 2 seconds of history
    static constexpr int envelopeBufferSize = 400;
    static constexpr int samplesPerEnvelopePoint = 220;  // ~5ms at 44.1kHz
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
    const std::array<float, envelopeBufferSize>& getEnvelopeBuffer() const { return envelopeBuffer; }
    const std::array<float, envelopeBufferSize>& getEnvelopeClipThresholds() const { return envelopeClipThresholds; }
    const std::atomic<int>& getEnvelopeWritePosition() const { return envelopeWritePos; }

    // Set current clip threshold (called from GUI when blade position changes)
    void setClipThreshold(float threshold) { currentClipThreshold = juce::jlimit(0.0f, 1.0f, threshold); }

private:
    juce::AudioProcessorValueTreeState apvts;

    // Ring buffer for envelope visualization (peak detection)
    std::array<float, envelopeBufferSize> envelopeBuffer{};
    std::array<float, envelopeBufferSize> envelopeClipThresholds{};  // Store threshold used for each envelope point
    std::atomic<int> envelopeWritePos{0};
    float currentPeak = 0.0f;
    int samplesSincePeak = 0;
    float currentClipThreshold = 1.0f;  // Current clip threshold (1.0 = no clipping)

    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(GuillotineProcessor)
};

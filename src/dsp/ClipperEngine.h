#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include "Clipper.h"
#include "DCBlocker.h"
#include "Oversampler.h"
#include "StereoProcessor.h"

namespace dsp {

class ClipperEngine
{
public:
    ClipperEngine();

    void prepare(double sampleRate, int maxBlockSize, int numChannels);
    void reset();
    void process(juce::AudioBuffer<float>& buffer);

    // Parameter setters
    void setInputGain(float dB);
    void setOutputGain(float dB);
    void setCeiling(float dB);
    void setSharpness(float sharpness);           // 0-1
    void setOversamplingFactor(int factorIndex);  // 0=1x, 1=2x, 2=4x, 3=8x, 4=16x, 5=32x
    void setFilterType(bool isLinearPhase);
    void setChannelMode(bool isMidSide);
    void setStereoLink(bool enabled);
    void setDeltaMonitor(bool enabled);

    int getLatencyInSamples() const;

private:
    // DSP blocks
    juce::dsp::Gain<float> inputGain;
    juce::dsp::Gain<float> outputGain;
    StereoProcessor stereoProcessor;
    Oversampler oversampler;
    Clipper clipper;
    DCBlocker dcBlocker;

    // Delta monitoring
    juce::AudioBuffer<float> dryBuffer;
    bool deltaMonitorEnabled = false;

    // State
    double currentSampleRate = 44100.0;
    int currentNumChannels = 2;
};

} // namespace dsp

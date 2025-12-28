#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>

#include "Clipper.h"
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
    void setCurve(int curveIndex);                // 0=Hard, 1=Quintic, 2=Cubic, 3=Tanh, 4=Arctan, 5=Knee, 6=T2
    void setCurveExponent(float exponent);        // For Knee/T2 modes: 1.0-4.0
    void setOversamplingFactor(int factorIndex);  // 0=1x, 1=2x, ... 5=32x
    void setFilterType(bool isLinearPhase);
    void setChannelMode(bool isMidSide);
    void setStereoLink(bool enabled);
    void setDeltaMonitor(bool enabled);
    void setEnforceCeiling(bool enabled);
    void setBypass(bool enabled);

    int getLatencyInSamples() const;

    // Envelope peaks for display (captured during processing)
    // PreClip = after input gain, before clipping (RED)
    // PostClip = after clipping, before output gain (WHITE)
    float getLastPreClipPeak() const { return lastPreClipPeak; }
    float getLastPostClipPeak() const { return lastPostClipPeak; }

private:
    // DSP blocks
    juce::dsp::Gain<float> inputGain;
    juce::dsp::Gain<float> outputGain;
    StereoProcessor stereoProcessor;
    Oversampler oversampler;
    Clipper clipper;

    // Delta monitoring - requires separate oversampler for dry path
    // Both oversamplers use the same filter type for phase-matched cancellation
    juce::AudioBuffer<float> dryBuffer;
    Oversampler dryOversampler;
    bool deltaMonitorEnabled = false;

    // Envelope peaks for display (updated each process call)
    float lastPreClipPeak = 0.0f;
    float lastPostClipPeak = 0.0f;

    // Enforce ceiling (final hard limiter after downsampling)
    bool enforceCeilingEnabled = true;
    float ceilingLinear = 1.0f;

    // Bypass clipper (still applies input/output gain)
    bool bypassed = false;

    // State
    double currentSampleRate = 44100.0;
    int currentNumChannels = 2;
};

} // namespace dsp

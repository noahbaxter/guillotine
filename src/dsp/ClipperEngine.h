#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include <atomic>

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
    void setStereoMode(int mode);  // 0=Stereo Link, 1=L/R, 2=M/S
    void setDeltaMonitor(bool enabled);
    void setEnforceCeiling(bool enabled);
    void setBypass(bool enabled);
    void setDryWetMix(float mix);  // 0.0 = dry, 1.0 = wet

    int getLatencyInSamples() const;
    void applyPendingChanges();  // Force oversampler rebuild if pending (call from message thread)

    // Per-sample envelope data for waveform display (filled each process call)
    const std::vector<float>& getEnvelopeData() const { return envSampleData_; }
    int getEnvelopeSampleCount() const { return envSampleCount_; }

    // Post-clip peak (single value per block, used by EnvelopeBuffer for postClip)
    float getLastPostClipPeak() const { return lastPostClipPeak.load(std::memory_order_relaxed); }

private:
    // DSP blocks
    juce::dsp::Gain<float> inputGain;
    juce::dsp::Gain<float> outputGain;
    StereoProcessor stereoProcessor;
    Oversampler oversampler;
    Clipper clipper;

    // Dry path uses matched oversampler for phase-coherent dry/wet mixing
    // (also used for delta monitoring - subtracting wet from dry)
    juce::AudioBuffer<float> dryBuffer;
    Oversampler dryOversampler;
    bool deltaMonitorEnabled = false;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear> smoothedMix{1.0f};

    // Per-sample envelope follower output (pre-clip, for waveform display)
    std::vector<float> envSampleData_;
    int envSampleCount_ = 0;

    // Post-clip peak (single value per block)
    std::atomic<float> lastPostClipPeak{0.0f};

    // Enforce ceiling (final hard limiter after downsampling)
    bool enforceCeilingEnabled = true;
    juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear> smoothedCeilingLinear{1.0f};
    double lastSampleRate = 0.0;  // Track to avoid unnecessary reset()

    // Bypass clipper (still applies input/output gain)
    bool bypassed = false;

    // Envelope follower for smooth waveform display
    float envFollowerState_ = 0.0f;
    float envReleaseCoeff_ = 0.99977f;  // ~100ms at 44.1kHz

    // State
    double currentSampleRate = 44100.0;
    int currentNumChannels = 2;
};

} // namespace dsp

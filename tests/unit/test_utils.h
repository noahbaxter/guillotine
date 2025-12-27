#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <cmath>
#include <vector>

namespace test_utils {

// Shared constants
constexpr double kSampleRate = 44100.0;
constexpr int kBlockSize = 512;
constexpr int kNumChannels = 2;
constexpr double kPi = 3.14159265358979323846;

// Tolerances
constexpr float kRoundTripTolerance = 0.02f;   // 2% for filter round-trips
constexpr float kDcTolerance = 0.001f;         // DC preservation
constexpr float kClipperTolerance = 0.0001f;   // Tight tolerance for clipper math

// Signal generators
juce::AudioBuffer<float> generateSine(float frequency, int numSamples, float amplitude = 0.5f);
juce::AudioBuffer<float> generateDC(float level, int numSamples);
juce::AudioBuffer<float> generateSilence(int numSamples);
juce::AudioBuffer<float> generateImpulse(int position, float amplitude, int numSamples);
juce::AudioBuffer<float> generateStep(int position, float level, int numSamples);
juce::AudioBuffer<float> generateAttackDecay(int attackSamples, int decaySamples, float peak, int numSamples);
juce::AudioBuffer<float> generateBurst(const std::vector<int>& positions, float amplitude, int numSamples);

// Measurement helpers
float calculateRMS(const juce::AudioBuffer<float>& buffer, int startSample = 0, int numSamples = -1);
float calculatePeak(const juce::AudioBuffer<float>& buffer, int startSample = 0, int numSamples = -1);
int findPeakPosition(const juce::AudioBuffer<float>& buffer, int channel = 0);
float measurePreRinging(const juce::AudioBuffer<float>& buffer, int peakPos, int channel = 0);
int measureSettlingTime(const juce::AudioBuffer<float>& buffer, float targetLevel, float tolerance, int startSample, int channel = 0);

// Analysis
struct TransientMetrics {
    int peakPosition;
    float peakAmplitude;
    float preRingingMax;
    float postRingingMax;
    int settlingTime;  // samples to reach target after peak
};
TransientMetrics analyzeTransient(const juce::AudioBuffer<float>& buffer, int expectedPeakPos, float targetLevel, int channel = 0);

} // namespace test_utils

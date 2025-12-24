#include "PluginProcessor.h"
#include "PluginEditor.h"

GuillotineProcessor::GuillotineProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
    : AudioProcessor(BusesProperties()
#if ! JucePlugin_IsMidiEffect
#if ! JucePlugin_IsSynth
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
#endif
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)
#endif
                         ),
      apvts(*this, nullptr, "Parameters", createParameterLayout())
#endif
{
}

GuillotineProcessor::~GuillotineProcessor()
{
}

juce::AudioProcessorValueTreeState::ParameterLayout GuillotineProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{"gain", 1},
        "Gain",
        juce::NormalisableRange<float>(-60.0f, 12.0f, 0.1f),
        0.0f,
        juce::AudioParameterFloatAttributes().withLabel("dB")));

    return {params.begin(), params.end()};
}

const juce::String GuillotineProcessor::getName() const
{
    return JucePlugin_Name;
}

bool GuillotineProcessor::acceptsMidi() const
{
#if JucePlugin_WantsMidiInput
    return true;
#else
    return false;
#endif
}

bool GuillotineProcessor::producesMidi() const
{
#if JucePlugin_ProducesMidiOutput
    return true;
#else
    return false;
#endif
}

bool GuillotineProcessor::isMidiEffect() const
{
#if JucePlugin_IsMidiEffect
    return true;
#else
    return false;
#endif
}

double GuillotineProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int GuillotineProcessor::getNumPrograms()
{
    return 1;
}

int GuillotineProcessor::getCurrentProgram()
{
    return 0;
}

void GuillotineProcessor::setCurrentProgram(int index)
{
    juce::ignoreUnused(index);
}

const juce::String GuillotineProcessor::getProgramName(int index)
{
    juce::ignoreUnused(index);
    return {};
}

void GuillotineProcessor::changeProgramName(int index, const juce::String& newName)
{
    juce::ignoreUnused(index, newName);
}

void GuillotineProcessor::prepareToPlay(double newSampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(samplesPerBlock);
    sampleRate = newSampleRate;
    testOscPhase = 0.0;
}

void GuillotineProcessor::releaseResources()
{
}

#ifndef JucePlugin_PreferredChannelConfigurations
bool GuillotineProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
#if JucePlugin_IsMidiEffect
    juce::ignoreUnused(layouts);
    return true;
#else
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono() &&
        layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

#if ! JucePlugin_IsSynth
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
#endif

    return true;
#endif
}
#endif

void GuillotineProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ignoreUnused(midiMessages);
    juce::ScopedNoDenormals noDenormals;

    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    // Clear any output channels that don't have input data
    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, buffer.getNumSamples());

    // Get gain parameter value and convert from dB to linear
    float gainDb = apvts.getRawParameterValue("gain")->load();
    float gainLinear = juce::Decibels::decibelsToGain(gainDb);

    // Apply gain to all channels
    for (int channel = 0; channel < totalNumInputChannels; ++channel)
    {
        auto* channelData = buffer.getWritePointer(channel);

        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            channelData[sample] *= gainLinear;
        }
    }

    // Convert threshold (0-1) to linear amplitude
    // threshold=0 → 0dB (1.0 linear, no clipping)
    // threshold=1 → -60dB (0.001 linear, max clipping)
    const float thresholdDb = -currentClipThreshold * 60.0f;
    const float thresholdLinear = juce::Decibels::decibelsToGain(thresholdDb);

    // Apply clipping to audio
    for (int channel = 0; channel < totalNumInputChannels; ++channel)
    {
        auto* channelData = buffer.getWritePointer(channel);
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            channelData[sample] = juce::jlimit(-thresholdLinear, thresholdLinear, channelData[sample]);
        }
    }

    // Compute envelope (peak detection) for visualization
    const double testOscFreq = 1.0;  // 1 Hz ramp
    const double phaseIncrement = testOscFreq / sampleRate;

    for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
    {
        float monoSample = 0.0f;

        if (testOscEnabled)
        {
            // Generate 1Hz logarithmic ramp: looks linear on dB scale
            // Phase 0→1 maps to -60dB→0dB (exponential in amplitude)
            const float minTestDb = -60.0f;
            const float dbValue = minTestDb + static_cast<float>(testOscPhase) * (-minTestDb);
            monoSample = juce::Decibels::decibelsToGain(dbValue);

            testOscPhase += phaseIncrement;
            if (testOscPhase >= 1.0)
                testOscPhase -= 1.0;
        }
        else
        {
            // Get mono mix from actual input (post-clipping)
            for (int channel = 0; channel < totalNumInputChannels; ++channel)
                monoSample += std::abs(buffer.getSample(channel, sample));
            monoSample /= static_cast<float>(std::max(1, totalNumInputChannels));
        }

        // Track peak within current window
        if (monoSample > currentPeak)
            currentPeak = monoSample;

        samplesSincePeak++;

        // Store peak and reset when window is complete
        if (samplesSincePeak >= samplesPerEnvelopePoint)
        {
            int writePos = envelopeWritePos.load();
            envelopeBuffer[writePos] = currentPeak;
            envelopeClipThresholds[writePos] = currentClipThreshold;
            writePos = (writePos + 1) % envelopeBufferSize;
            envelopeWritePos.store(writePos);

            currentPeak = 0.0f;
            samplesSincePeak = 0;
        }
    }
}

bool GuillotineProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorEditor* GuillotineProcessor::createEditor()
{
    return new GuillotineEditor(*this);
}

void GuillotineProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml(state.createXml());
    copyXmlToBinary(*xml, destData);
}

void GuillotineProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml(getXmlFromBinary(data, sizeInBytes));
    if (xml != nullptr && xml->hasTagName(apvts.state.getType()))
    {
        apvts.replaceState(juce::ValueTree::fromXml(*xml));
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new GuillotineProcessor();
}

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

    // Curve type: 0=Hard, 1=Quintic, 2=Cubic, 3=Tanh, 4=Arctan, 5=Knee, 6=T2
    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{"curve", 1},
        "Curve",
        juce::StringArray{"Hard", "Quintic", "Cubic", "Tanh", "Arctan", "Knee", "T2"},
        0));  // Default to hard clip

    // Curve exponent (for Knee/T2 modes: 4.0=maximum softness, 1.0=minimum softness)
    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{"curveExponent", 1},
        "Curve Exponent",
        juce::NormalisableRange<float>(1.0f, 4.0f),
        4.0f));

    // Oversampling: 0=1x, 1=2x, 2=4x, 3=8x, 4=16x, 5=32x
    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{"oversampling", 1},
        "Oversampling",
        juce::StringArray{"1x", "2x", "4x", "8x", "16x", "32x"},
        0));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{"inputGain", 1},
        "Input Gain",
        juce::NormalisableRange<float>(-24.0f, 24.0f),
        0.0f,
        juce::AudioParameterFloatAttributes().withLabel("dB")));

    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{"outputGain", 1},
        "Output Gain",
        juce::NormalisableRange<float>(-24.0f, 24.0f),
        0.0f,
        juce::AudioParameterFloatAttributes().withLabel("dB")));

    // Ceiling (clip threshold in dB)
    params.push_back(std::make_unique<juce::AudioParameterFloat>(
        juce::ParameterID{"ceiling", 1},
        "Ceiling",
        juce::NormalisableRange<float>(-60.0f, 0.0f),
        0.0f,
        juce::AudioParameterFloatAttributes().withLabel("dB")));

    // Filter type: 0=Minimum Phase, 1=Linear Phase
    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{"filterType", 1},
        "Filter Type",
        juce::StringArray{"Minimum Phase", "Linear Phase"},
        0));

    // Channel mode: 0=L/R, 1=M/S
    params.push_back(std::make_unique<juce::AudioParameterChoice>(
        juce::ParameterID{"channelMode", 1},
        "Channel Mode",
        juce::StringArray{"L/R", "M/S"},
        0));

    // Stereo link
    params.push_back(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{"stereoLink", 1},
        "Stereo Link",
        false));

    // Delta monitor
    params.push_back(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{"deltaMonitor", 1},
        "Delta Monitor",
        false));

    // Bypass clipper (blade up = bypassed, blade down = active)
    params.push_back(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{"bypassClipper", 1},
        "Bypass Clipper",
        true));  // Default to bypassed (blade up)

    // Enforce ceiling - hard limit output to ceiling after downsampling
    params.push_back(std::make_unique<juce::AudioParameterBool>(
        juce::ParameterID{"enforceCeiling", 1},
        "Enforce Ceiling",
        true));  // Default to enforced (true peak safe)

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
    sampleRate = newSampleRate;
    testOscPhase = 0.0;

    clipperEngine.prepare(newSampleRate, samplesPerBlock, getTotalNumInputChannels());
    lastReportedLatency = 0;
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

    // Get parameter values from APVTS
    float inputGainDb = apvts.getRawParameterValue("inputGain")->load();
    float outputGainDb = apvts.getRawParameterValue("outputGain")->load();
    int curveType = static_cast<int>(apvts.getRawParameterValue("curve")->load());
    float curveExponent = apvts.getRawParameterValue("curveExponent")->load();
    float ceilingDb = apvts.getRawParameterValue("ceiling")->load();
    int oversamplingChoice = static_cast<int>(apvts.getRawParameterValue("oversampling")->load());
    int filterType = static_cast<int>(apvts.getRawParameterValue("filterType")->load());
    int channelMode = static_cast<int>(apvts.getRawParameterValue("channelMode")->load());
    bool stereoLink = apvts.getRawParameterValue("stereoLink")->load() > 0.5f;
    bool deltaMonitor = apvts.getRawParameterValue("deltaMonitor")->load() > 0.5f;
    bool bypassClipper = apvts.getRawParameterValue("bypassClipper")->load() > 0.5f;
    bool enforceCeiling = apvts.getRawParameterValue("enforceCeiling")->load() > 0.5f;

    // Choice index now directly maps to factor index: 0=1x, 1=2x, ... 5=32x
    int oversamplingFactor = oversamplingChoice;

    // Update clipper engine parameters
    clipperEngine.setInputGain(inputGainDb);
    clipperEngine.setOutputGain(outputGainDb);
    clipperEngine.setCurve(curveType);
    clipperEngine.setCurveExponent(curveExponent);
    clipperEngine.setCeiling(ceilingDb);
    clipperEngine.setOversamplingFactor(oversamplingFactor);
    clipperEngine.setFilterType(filterType == 1);  // 1 = linear phase
    clipperEngine.setChannelMode(channelMode == 1);  // 1 = M/S
    clipperEngine.setStereoLink(stereoLink);
    clipperEngine.setDeltaMonitor(deltaMonitor);
    clipperEngine.setEnforceCeiling(enforceCeiling);

    // Update latency if changed
    int currentLatency = clipperEngine.getLatencyInSamples();
    if (currentLatency != lastReportedLatency)
    {
        setLatencySamples(currentLatency);
        updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withLatencyChanged(true));
        lastReportedLatency = currentLatency;
    }

    // Test oscillator for UI development
    if (testOscEnabled)
    {
        const double testOscFreq = 1.0;
        const double phaseIncrement = testOscFreq / sampleRate;
        float inputGainLinear = juce::Decibels::decibelsToGain(inputGainDb);

        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            const float minTestDb = -60.0f;
            const float dbValue = minTestDb + static_cast<float>(testOscPhase) * (-minTestDb);
            float testSample = juce::Decibels::decibelsToGain(dbValue) * inputGainLinear;

            for (int channel = 0; channel < totalNumInputChannels; ++channel)
                buffer.setSample(channel, sample, testSample);

            testOscPhase += phaseIncrement;
            if (testOscPhase >= 1.0)
                testOscPhase -= 1.0;
        }
    }

    // Process through clipper engine (applies inputGain, clip, outputGain)
    // Engine captures synchronized peaks internally:
    // - preClipPeak: after input gain, before clipping (RED - what gets clipped off)
    // - postClipPeak: after clipping, before output gain (WHITE - what you hear)
    clipperEngine.setBypass(bypassClipper);
    clipperEngine.process(buffer);

    // Get peaks from engine (both captured in the same process() call, synchronized)
    float enginePreClipPeak = clipperEngine.getLastPreClipPeak();
    float enginePostClipPeak = clipperEngine.getLastPostClipPeak();

    // Accumulate peaks across blocks
    if (enginePreClipPeak > preClipPeak)
        preClipPeak = enginePreClipPeak;
    if (enginePostClipPeak > postClipPeak)
        postClipPeak = enginePostClipPeak;

    // Track samples and write to ring buffer at intervals
    // Use 'if' not 'while' - only write one point per block to avoid writing
    // zeros when multiple envelope points would be written from one block
    samplesSincePeak += buffer.getNumSamples();

    if (samplesSincePeak >= samplesPerEnvelopePoint)
    {
        int writePos = envelopeWritePos.load();
        envelopePreClip[writePos] = preClipPeak;
        envelopePostClip[writePos] = postClipPeak;
        envelopeClipThresholds[writePos] = -ceilingDb / displayDbRange;
        writePos = (writePos + 1) % envelopeBufferSize;
        envelopeWritePos.store(writePos);

        preClipPeak = 0.0f;
        postClipPeak = 0.0f;
        samplesSincePeak = 0;  // Reset fully instead of subtracting
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

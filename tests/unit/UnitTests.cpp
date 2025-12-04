#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

class PluginUnitTests : public juce::UnitTest
{
public:
    PluginUnitTests() : juce::UnitTest("Guillotine Unit Tests") {}

    void runTest() override
    {
        beginTest("Parameter creation and ranges");
        {
            GuillotineProcessor processor;
            auto& apvts = processor.getAPVTS();

            auto* gainParam = apvts.getParameter("gain");
            expect(gainParam != nullptr, "Gain parameter should exist");

            if (gainParam != nullptr)
            {
                auto range = gainParam->getNormalisableRange();
                expectWithinAbsoluteError(range.start, -60.0f, 0.01f, "Min gain should be -60 dB");
                expectWithinAbsoluteError(range.end, 12.0f, 0.01f, "Max gain should be +12 dB");

                // Check default value (0 dB)
                float defaultNormalized = gainParam->getDefaultValue();
                float defaultValue = range.convertFrom0to1(defaultNormalized);
                expectWithinAbsoluteError(defaultValue, 0.0f, 0.1f, "Default gain should be 0 dB");
            }
        }

        beginTest("State save/load roundtrip");
        {
            juce::MemoryBlock stateData;
            float testGainValue = -6.0f;

            // Create processor, set gain, save state
            {
                GuillotineProcessor processor;
                auto* gainParam = processor.getAPVTS().getParameter("gain");
                gainParam->setValueNotifyingHost(gainParam->getNormalisableRange().convertTo0to1(testGainValue));
                processor.getStateInformation(stateData);
            }

            // Create new processor, load state, verify
            {
                GuillotineProcessor processor;
                processor.setStateInformation(stateData.getData(), static_cast<int>(stateData.getSize()));

                auto* gainParam = processor.getAPVTS().getParameter("gain");
                float loadedValue = gainParam->getNormalisableRange().convertFrom0to1(gainParam->getValue());
                expectWithinAbsoluteError(loadedValue, testGainValue, 0.1f, "Loaded gain should match saved value");
            }
        }

    }
};

static PluginUnitTests pluginUnitTests;

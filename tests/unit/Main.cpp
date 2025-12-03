#include <juce_core/juce_core.h>

int main(int argc, char* argv[])
{
    // Check for --list flag to output test names
    bool listOnly = false;
    for (int i = 1; i < argc; ++i)
    {
        if (juce::String(argv[i]) == "--list")
            listOnly = true;
    }

    juce::UnitTestRunner runner;
    runner.runAllTests();

    // Output results in a parseable format for pytest
    // Format: "RESULT:test_name:PASS" or "RESULT:test_name:FAIL:message"
    for (int i = 0; i < runner.getNumResults(); ++i)
    {
        auto* result = runner.getResult(i);
        juce::String testName = result->unitTestName + " / " + result->subcategoryName;

        if (listOnly)
        {
            std::cout << "TEST:" << testName << std::endl;
        }
        else
        {
            if (result->failures == 0)
            {
                std::cout << "RESULT:" << testName << ":PASS" << std::endl;
            }
            else
            {
                std::cout << "RESULT:" << testName << ":FAIL:" << result->messages.joinIntoString("; ") << std::endl;
            }
        }
    }

    // Return exit code based on failures
    int failures = 0;
    for (int i = 0; i < runner.getNumResults(); ++i)
    {
        if (runner.getResult(i)->failures > 0)
            failures += runner.getResult(i)->failures;
    }

    return failures == 0 ? 0 : 1;
}

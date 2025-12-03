# JUCE Plugin Template

**Delete this file after setup.**

A minimal JUCE audio plugin template with testing and CI/CD.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/juce-plugin-template.git MyPlugin
cd MyPlugin

# 2. Initialize submodules
git submodule update --init --recursive

# 3. Run setup script
./scripts/init.sh

# 4. Clean up template files
rm scripts/init.sh TEMPLATE.md

# 5. Build
./scripts/build.sh
```

## What's Included

```
.
├── src/                        # Plugin source code
│   ├── PluginProcessor.cpp/h   # DSP and audio processing
│   └── PluginEditor.cpp/h      # GUI
├── scripts/
│   ├── build.sh                # Build script (macOS)
│   └── init.sh                 # Template initialization (delete after use)
├── tests/
│   ├── unit/                   # C++ unit tests (JUCE UnitTest)
│   ├── integration/            # Python integration tests (pedalboard)
│   ├── compliance/             # pluginval validation
│   ├── fixtures/               # Reference audio files
│   └── utils.py                # Test utilities
├── .github/workflows/
│   └── build.yml               # CI/CD: build, test, release
├── third_party/
│   └── JUCE/                   # JUCE framework (submodule)
└── AudioPlugin.jucer           # JUCE project file
```

## Testing Architecture

Three layers of testing, all runnable via `pytest`:

1. **Unit Tests** (`tests/unit/`) - C++ tests using JUCE's UnitTest framework
2. **Integration Tests** (`tests/integration/`) - Python tests using Spotify's pedalboard to process audio through the actual plugin
3. **Compliance Tests** (`tests/compliance/`) - pluginval VST3/AU validation

```bash
# Run all tests
pytest tests/ -v

# Run specific test types
pytest tests/unit/ -v        # C++ unit tests
pytest tests/integration/ -v # Integration tests
pytest tests/compliance/ -v  # pluginval
```

## CI/CD

GitHub Actions workflow handles:
- Multi-platform builds (Windows, macOS, Linux)
- Automated testing
- Release creation on git tags

### Creating a Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Prerequisites

- **macOS**: Xcode
- **Windows**: Visual Studio 2022
- **Linux**: GCC, Make, ALSA/JACK dev libraries
- **Testing**: Python 3.9+, pluginval

## The init.sh Script

The initialization script renames all template placeholders:

- Renames `AudioPlugin.jucer` to `YourPlugin.jucer`
- Updates class names (`AudioPluginProcessor` → `YourPluginProcessor`)
- Updates plugin metadata (name, description, company, plugin codes)
- Updates build scripts and CI/CD workflow

## Adding Parameters

```cpp
// In PluginProcessor.cpp createParameterLayout()
params.push_back(std::make_unique<juce::AudioParameterFloat>(
    juce::ParameterID{"myParam", 1},
    "My Parameter",
    juce::NormalisableRange<float>(0.0f, 1.0f),
    0.5f));
```

## Adding DSP

```cpp
// In PluginProcessor.cpp processBlock()
void YourPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    // Your DSP here
}
```

## Updating Reference Files

When you intentionally change DSP output:

```bash
python tests/generate_references.py
git add tests/fixtures/
git commit -m "Update reference files for new DSP behavior"
```

## Resources

- [JUCE Documentation](https://juce.com/learn/documentation)
- [JUCE Tutorials](https://juce.com/learn/tutorials)
- [pedalboard](https://github.com/spotify/pedalboard) - Python audio plugin host
- [pluginval](https://github.com/Tracktion/pluginval) - Plugin validation

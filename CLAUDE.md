# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guillotine is a JUCE-based audio plugin (VST3/AU) implementing a clipping effect with animated guillotine visualization. Built for macOS with Dichotic Studios branding.

## Build Commands

```bash
./scripts/build.sh              # Build Release, install to ~/Library/Audio/Plug-Ins/
./scripts/build.sh debug        # Debug build
./scripts/build.sh clean        # Clean build artifacts
./scripts/build.sh regen        # Regenerate Xcode project from .jucer file
./scripts/build.sh --no-install # Build without installing
./scripts/standalone.sh        # Quick UI preview - builds standalone app and launches it
./scripts/watch.sh             # Auto-reload: watches src/ and assets/, rebuilds on change
```

Build outputs: `Builds/MacOSX/build/Release/Guillotine.vst3` and `.component`

## Testing

```bash
# Setup (one time)
python3 -m venv .venv && source .venv/bin/activate
pip install -r tests/requirements.txt

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/integration/test_integration.py -v
```

Test types:
- `tests/integration/` - Plugin DSP tests using pedalboard library
- `tests/compliance/` - pluginval DAW compatibility checks
- `tests/unit/` - C++ unit tests (CMake-based)

## Architecture

**DSP Layer:**
- `src/PluginProcessor.cpp` - Audio processing, gain parameter, envelope ring buffer (400 points, ~2s history)

**UI Layer:**
- `src/PluginEditor.cpp` - Plugin window, hosts GuillotineComponent + clip slider
- `src/gui/GuillotineComponent.cpp` - Main visual: 60Hz timer, layered PNG rendering (rope→blade→waveform→base→side)
- `src/gui/WaveformComponent.cpp` - EnvelopeRenderer for scrolling waveform with clip visualization (white=normal, red=clipped)

**Assets:**
- `assets/*.png` - Embedded via JUCE BinaryData (base, blade, rope, side)

## Key Details

- JUCE framework lives in `third_party/JUCE/` (git submodule)
- Project config in `Guillotine.jucer` - edit this for build settings, then run `./scripts/build.sh regen`
- Envelope buffer: 220 samples/point at 44.1kHz, atomic write position for thread safety
- Blade position 0.0-1.0 maps to 35% vertical travel

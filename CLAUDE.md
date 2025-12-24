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

**Note:** When `watch.sh` is running, it handles all builds automatically. Don't manually trigger builds - just save files and watch will rebuild.

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

**WebView UI:**
- `web/` - HTML/JS/CSS for the plugin UI, served via WebView
- `web/components/` - Modular JS components (knob.js, visualizer.js, etc.)

## Adding New Web Assets

When adding new files to the web UI (JS, CSS, images), you must:

1. **Add to `.jucer`** - Add a `<FILE>` entry with `resource="1"` to embed as BinaryData
2. **Register in `PluginEditor.cpp`** - Add entry to the `resources[]` table in `getResource()`
3. **Rebuild** - Run `./scripts/build.sh regen` to regenerate BinaryData

Example for adding `web/components/foo.js`:
```xml
<!-- In Guillotine.jucer, under the web GROUP -->
<FILE id="WebFoo" name="foo.js" compile="0" resource="1" file="web/components/foo.js"/>
```
```cpp
// In PluginEditor.cpp getResource()
{ "components/foo.js", BinaryData::foo_js, BinaryData::foo_jsSize, "text/javascript" },
```

JUCE BinaryData naming: `my-file.js` → `myfile_js`, `num-0.png` → `num0_png`

## Key Details

- JUCE framework lives in `third_party/JUCE/` (git submodule)
- Project config in `Guillotine.jucer` - edit this for build settings, then run `./scripts/build.sh regen`
- Envelope buffer: 220 samples/point at 44.1kHz, atomic write position for thread safety
- Blade position 0.0-1.0 maps to 35% vertical travel

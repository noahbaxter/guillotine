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

**Note:** When `watch.sh` is running, it handles all builds automatically including Xcode project regeneration from `.jucer` changes. Don't manually trigger builds or regen - just save files and watch will rebuild.

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

**CRITICAL:** JUCE BinaryData naming uses underscores, hyphens become underscores:
- `my-file.js` → `myfile_js` (hyphen removed, becomes underscore before suffix)
- `num-0.png` → `num0_png`
- `guillotine-logo.png` → `guillotinelogo_png`

**For PNG images:** Crop to remove unnecessary whitespace using ImageMagick before committing:
```bash
magick convert assets/image.png -trim -fuzz 0% -format "%wx%h%O\n" info:  # Check bounds
magick convert assets/image.png -crop WxH+X+Y +repage assets/image.png    # Crop in place
```
This ensures consistent alignment across layered images (e.g., guillotine blade/rope/base must stay aligned).

## Web Component Patterns

**Use HTML templates, not algorithmic generation:**
- Define component HTML as template strings in JavaScript, not via `createElement()` loops
- Easier to visualize structure, less error-prone, cleaner diff history
- Example: Guillotine component uses template with hardcoded layers for rope/blade/base
- Query elements with `querySelector()` after inserting template into DOM

**Centralize animation logic:**
- Extract reusable animation functions to `web/lib/guillotine-utils.js`
- Define animation durations in `GUILLOTINE_CONFIG` and `LEVER_CONFIG` constants
- Support direction-aware easing (fast drop, slow raise for gravity-like effects)
- Use `requestAnimationFrame` with cleanup functions that can be cancelled
- Each component should have `animateTo()` methods that accept options from utils

## Key Details

- JUCE framework lives in `third_party/JUCE/` (git submodule)
- Project config in `Guillotine.jucer` - edit this for build settings, then run `./scripts/build.sh regen`
- Envelope buffer: 220 samples/point at 44.1kHz, atomic write position for thread safety
- Blade position 0.0-1.0 maps to 35% vertical travel
- **Blade travel multiplier (1.25x):** Accounts for `object-fit: contain` constraining rendered image size; scales travel distance to match visual size

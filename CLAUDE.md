# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Guillotine is a JUCE-based audio plugin implementing a clipping effect with animated guillotine visualization. Supports VST3/AU on macOS, VST3 on Windows, and VST3/LV2/CLAP on Linux. Built by Dichotic Studios.

## Build Commands

```bash
./scripts/build.sh              # Build Release, install to /Library/Audio/Plug-Ins/ (requires sudo)
./scripts/build.sh debug        # Debug build
./scripts/build.sh clean        # Clean build artifacts
./scripts/build.sh --no-install # Build without installing
./scripts/standalone.sh         # Quick UI preview - builds standalone app and launches it
./scripts/watch.sh              # Auto-reload: watches src/, web/ and rebuilds on change
./scripts/validate.sh           # Run pluginval at strictness 10 (or pass level: ./scripts/validate.sh 5)
```

**Build system:** CMake with Xcode generator. First build runs `cmake -B build -G Xcode` automatically.

Build outputs: `build/Guillotine_artefacts/Release/VST3/Guillotine.vst3` and `AU/Guillotine.component`

## Testing

```bash
# Setup (one time)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/integration/test_integration.py -v
```

Test types:
- `tests/clipper/` - Clipper DSP tests (delta, hard clip, oversampling, intersample, smoothing)
- `tests/integration/` - Plugin-level tests (gain, bypass, NaN defense, invariance)
- `tests/compliance/` - pluginval DAW compatibility checks
- `tests/unit/` - C++ unit tests (CMake-based, Catch2): clipper, oversampler, envelope buffer, transient

## Architecture

**DSP Layer:**
- `src/PluginProcessor.cpp` - Audio processing, parameter management
- `src/dsp/ClipperEngine.cpp` - Main DSP chain: gain → M/S → oversample → clip → downsample
- `src/dsp/Clipper.cpp` - Saturation curve implementations (hard, tanh, arctan, etc.) with parameter smoothing
- `src/dsp/Oversampler.cpp` - Polyphase oversampling with deferred rebuild for thread safety
- `src/dsp/StereoProcessor.cpp` - M/S encoding, stereo link
- `src/dsp/EnvelopeBuffer.h` - Thread-safe ring buffer for waveform visualization

**UI Layer (WebView):**
- `src/PluginEditor.cpp` - JUCE WebBrowserComponent, serves web resources via `getResource()`
- `web/index.html` - Entry point, loads main.js
- `web/main.js` - App initialization, JUCE parameter binding
- `web/lib/juce-bridge.js` - C++/JS communication bridge

**Web Components:**
- `web/components/controls/` - knob.js, lever.js, toggle.js (interactive controls)
- `web/components/display/` - waveform.js, digits.js, blood-pool.js (visualizations)
- `web/components/views/` - guillotine.js, microscope.js (main views)
- `web/lib/` - Utilities: config.js, theme.js, guillotine-utils.js, saturation-curves.js

**Assets:**
- `web/assets/` - All images: guillotine graphics, toggles, numeric digits, text labels, textures, fonts

**DSP Chain (ClipperEngine.cpp):**
```
Input → InputGain → M/S Encode → Upsample → Clipper → Downsample → M/S Decode → EnforceCeiling → OutputGain → Delta Monitor → Output
       ↓                                                                                                              ↓
       └──────────────────────────────── Dry (matched oversample) ──────────────────────────────────────────────→ Mix → Output
```

**Parameters:**
| Parameter | Range | Notes |
|-----------|-------|-------|
| curve | 0-6 | Hard, Tanh, Atan, Quint, Cubic, Knee, T2 |
| curveExponent | 0.1-10 | Smoothed (2ms ramp) |
| oversampling | 0-5 | 1x/2x/4x/8x/16x/32x |
| inputGain | -24 to +24 dB | |
| outputGain | -24 to +24 dB | |
| ceiling | -24 to 0 dB | Smoothed, linked to blade position |
| filterType | 0-1 | Linear phase / Min phase |
| stereoMode | 0-1 | L/R / M/S |
| enforceCeiling | bool | Hard limit on output |
| deltaMonitor | bool | Output clipped signal only |
| dryWet | 0-100% | Phase-coherent mixing |
| bypass | bool | Blade up/down |

**Known Limitations:**
- Min-phase group delay: IIR filters have frequency-dependent delay not reflected in reported latency. Use linear phase when timing precision matters.

## Adding New Web Assets

When adding new files to the web UI (JS, CSS, images), you must:

1. **Add to `CMakeLists.txt`** - Add file path to the `juce_add_binary_data(GuillotineData ...)` section
2. **Register in `PluginEditor.cpp`** - Add entry to the `resources[]` table in `getResource()`
3. **Rebuild** - CMake will regenerate BinaryData on next build

Example for adding `web/components/foo.js`:
```cmake
# In CMakeLists.txt, under juce_add_binary_data(GuillotineData SOURCES ...)
web/components/foo.js
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
magick convert web/assets/image.png -trim -fuzz 0% -format "%wx%h%O\n" info:  # Check bounds
magick convert web/assets/image.png -crop WxH+X+Y +repage web/assets/image.png    # Crop in place
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

## Windows WebView2 Build Notes

The plugin uses JUCE's WebBrowserComponent for its UI. On Windows, this requires WebView2 (Edge Chromium).

**Key CMakeLists.txt settings:**
```cmake
target_compile_definitions(Guillotine PUBLIC JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1)
```

This flag:
- Enables WebView2 backend (required for `withResourceProvider` API)
- Statically links the WebView2 loader (no `WebView2Loader.dll` to distribute)

**Without WebView2, Windows falls back to IE which doesn't support:**
- `Options::withResourceProvider()` - our custom resource serving
- Modern web features the UI depends on

**Runtime requirements:**
- Windows 10 (mid-2022+) and Windows 11 have WebView2 pre-installed
- Older systems need Edge or the WebView2 Runtime installed

## Key Details

- JUCE framework lives in `third_party/JUCE/` (git submodule)
- Build config in `CMakeLists.txt` - VERSION is read from `VERSION` file automatically
- Blade position 0.0-1.0 maps to 35% vertical travel
- **Blade travel multiplier (1.25x):** Accounts for `object-fit: contain` constraining rendered image size; scales travel distance to match visual size

## Thread Safety

The DSP layer uses several patterns to avoid race conditions between audio and UI threads:

- **EnvelopeBuffer**: Ring buffer with atomic write position - audio thread writes, UI reads safely
- **Atomic peak meters**: `std::atomic<float>` for input/output levels read by UI
- **Parameter smoothing**: `juce::SmoothedValue` prevents zipper noise on parameter changes
- **Deferred oversampler rebuild**: Settings changes flag `needsRebuild` atomic; rebuild happens at next `processBlock()` start, not mid-process
- **Pre-allocated vectors**: All vectors sized in `prepare()` to avoid audio-thread allocations

## Workflow Rules

**Building:**
- NEVER run build commands yourself - always ask the user to build and test
- Propose changes, then say "build and test when ready"

**Versioning:**
- NEVER increment or commit changes to the `VERSION` file - only the user can do that
- DO remind the user to bump the version when shipping a release if they haven't already

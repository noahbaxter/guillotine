# Guillotine Roadmap

## v1.0.3 - Dry/Wet Mix (Current)

Focus: Phase-coherent dry/wet mixing.

- [x] Dry/wet knob synced to DSP parameter
- [x] Matched oversamplers for phase-coherent mixing
- [x] True clip tests for M/S decode overshoot
- [x] Dry/wet phase coherence test suite

## v1.1 - Distribution & Install

Focus: Make installation painless for users.

- macOS code signing + notarization
- Windows code signing
- AAX build (Pro Tools)
- Proper installers (PKG for macOS, Inno/WiX for Windows)
- CI automation for signed releases

## v1.2 - Features

Focus: High-demand features from testers.

- Input/output clip lights (TBD: on guillotine legs vs separate meters by knobs)
- Ceiling knob moves guillotine blade slightly up/down (visual connection to microscope)
- Hard-soft curve control

---

## Completed

### v1.0.2
- [x] Atomic peak meters (thread safety)
- [x] Oversampler rebuild race condition fix (deferred rebuild)
- [x] Process block allocation fix (pre-allocated vectors)
- [x] Ceiling/exponent parameter smoothing
- [x] EnvelopeBuffer class extraction with unit tests
- [x] UI toggles for hidden params (filter type, channel mode, stereo link, true clip)

### v1.0.1
- [x] Keyboard focus stealing fix
- [x] UI flash on plugin load fix
- [x] Waveform scroll speed independent of sample rate/buffer size
- [x] Waveform edge glitches fix
- [x] Silent signal display fix
- [x] Microscope zoom presets (12-60dB via dropdown/scroll wheel)
- [x] 12dB reference gridlines
- [x] Scale-dependent waveform smoothing
- [x] CRT visual effects (scanlines, vignette, jitter)
- [x] Delta mode memory (persists across bypass)
- [x] Delta mode color transition animation
- [x] Binary envelope transfer (JSON → Float32Array)
- [x] Pure CMake build system (removed Projucer)

### v1.0
- [x] Window resizing
- [x] Readable mode (R key)
- [x] Blade pot label readability
- [x] Windows build fixes
- [x] -24dB zoom toggle

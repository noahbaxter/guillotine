# Guillotine - Feature Ideas

Categorized bank of potential features. Pull from here into ROADMAP.md when planning releases.

---

## Metering & Visualization

- [ ] Input/output meters on gain knobs
- [ ] Peak level readout
- [ ] Gain reduction / max clipped dB indicator
- [ ] Make clipped peaks more visible (contrast at subtle amounts)
- [x] ~~Adjust zoom behavior for small peak shaving~~ (v1.0.1: zoom presets 12-60dB)
- [x] ~~Microscope view red waveform visibility fix~~ (v1.0.1: better red color)
- [x] ~~Consider -12dB default scale instead of -60dB~~ (v1.0.1: defaults to -24dB, user can pick)

---

## Controls & Parameters

- [x] ~~Dry/wet knob (phase-coherent mixing)~~ (v1.0.3)
- [x] ~~UI toggles for hidden params (filter type, channel mode, true clip, stereo link)~~ (v1.0.2)
- [ ] Readable mode as UI toggle (not just R key)
- [ ] Resize handle / size menu (more discoverable)
- [ ] Valhalla-style status bar for hovered control description
- [ ] Oversampling CPU indicator (color/glow showing cost)
- [ ] Hard-to-soft clipping curve (continuous 0-100% blend)
- [ ] Exponent modes for soft clip range expansion
- [ ] Link mode as fader (0-100%) instead of toggle

---

## Gain Management

- [ ] Input/output linking (input up = output down by same amount)
- [ ] Delta monitoring when bypassed (show what WOULD clip)

### Needs Prototyping
Rough ideas to explore - exact UX TBD:

- [ ] LUFS-based perceived volume matching
- [ ] Headroom gained display
- [ ] Post-clip LUFS estimate (if normalized to ceiling)
- [ ] "Maximize" mode - push output based on ceiling reduction
- [ ] One-shot peak-match button
- [ ] Gain lock mode - lock output, auto-compensate other params
- [ ] AGC system (auto-trim based on RMS/LUFS)

---

## Stereo & Multiband

- [ ] Stereo link tooltip/diagram explaining behavior
- [ ] Multiband clipping (Low/Mid/High bands)
- [ ] M/S option per band
- [ ] HP/LP filter before clip stage (simpler than full multiband)

---

## Creative / Experimental

- [ ] Randomized threshold / jitter mode
- [ ] Sidechain input - clip based on external signal
- [ ] Additional wacky curve algorithms
- [ ] Separate "creative mode" toggle from production curves (TBD)

---

## UX & Polish

- [ ] Preset system
- [ ] Community preset contributions (Discord etc.)
- [ ] Compare mode (A/B current vs saved state)
- [ ] Copy/paste settings between instances
- [ ] Update notification system
- [ ] Cross-platform validation checklist (FL/Cubase/S1/Ableton/Bitwig)

---

## DSP Bugs (Fix Before Shipping)

- [x] ~~**Clipper.cpp:83** - `std::vector` allocates on EVERY process call. Move to member variable.~~ (v1.0.2: pre-allocated in prepare())
- [x] ~~**Oversampler rebuild race** - setOversamplingFactor/setFilterType call rebuildOversampler() which allocates. If UI changes these during playback = crash/glitch. Needs deferred rebuild or atomic swap.~~ (v1.0.2: deferred rebuild with atomics)
- [x] ~~**Ceiling/exponent not smoothed** - setCeiling() and setCurveExponent() update immediately, rapid automation causes zipper noise. Input/output gains have 2ms smoothing, these don't.~~ (v1.0.2: SmoothedValue for all params)
- [x] ~~**Peak meters not atomic** - lastPreClipPeak/lastPostClipPeak (ClipperEngine.h:58-59) written by audio thread, read by UI. Should be `std::atomic<float>`.~~ (v1.0.2: atomic peak meters)

## Performance

- [ ] Move clipper engine param updates out of process block
- [ ] Alternative filter implementations (HIIR etc.)
- [x] ~~**WebView waveform optimization**~~ (v1.0.1: switched to binary fetch + Float32Array, removed unused arrays)

---

## Test Suite Gaps (from comprehensive review)

### Critical - Zero Coverage
- [ ] **Saturation curve tests** - Only "Hard" is tested. Quintic, Cubic, Tanh, Arctan, Knee, T2 have ZERO tests. Add: clips at ceiling, preserves dynamics, correct harmonic character.
- [ ] **Determinism tests** - Verify same input → identical output every time. Catches uninitialized state, threading bugs.
- [ ] **Denormal handling** - Denormal inputs (tiny floats) can cause CPU spikes. Test they're flushed to zero.

### Important - Edge Cases
- [ ] **Parameter smoothing / zipper noise** - Automate ceiling rapidly, detect clicks via derivative analysis or spectral sidebands.
- [ ] **Latency compensation verification** - Impulse test: measure actual delay vs reported_latency_samples.
- [ ] **Edge buffer sizes** - Test 0 samples, 1 sample at all OS rates. DAWs do weird things.

### Nice to Have - Quality Metrics
- [ ] **THD measurements** - Quantify harmonic distortion per curve. Hard clip >15%, tanh 5-15%.
- [ ] **Aliasing measurements** - Compare aliased energy at 1x vs 4x vs 16x OS.
- [ ] **Memory allocation detection** - C++ test to catch heap allocs in processBlock (requires Catch2 + allocation hooks).

### Already Well Tested ✓
- Hard clip ceiling enforcement
- NaN/Inf input sanitization
- Sample rate and block size invariance
- Delta monitoring (silence when not clipping, reconstruction)
- Intersample peak detection
- M/S encoding/decoding (C++ unit tests)
- Stereo link behavior
- Latency reporting (basic)
- pluginval DAW compliance
- True clip M/S decode overshoot (v1.0.3)
- Dry/wet phase coherence (v1.0.3)

---

## Sources

Feedback collected from:
- Discord beta testing (shutdown, Gyan, Alex, Nathan, Charles, Szymon)
- Instagram comments
- DMs (J.Sparrow)

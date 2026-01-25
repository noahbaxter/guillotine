# Guillotine - Feature Ideas

Brainstorm bank. Pull from here into ROADMAP.md when planning releases.

---

## Metering & Visualization

- [ ] Peak level readout
- [ ] Gain reduction / max clipped dB indicator
- [ ] Make clipped peaks more visible (contrast at subtle amounts)

---

## Controls & Parameters

- [ ] Readable mode as UI toggle (not just R key)
- [ ] Resize handle / size menu (more discoverable than drag)
- [ ] Valhalla-style status bar for hovered control description
- [ ] Oversampling CPU indicator (color/glow showing cost)
- [ ] Link mode as fader (0-100%) instead of toggle

---

## Gain Management

- [ ] Input/output linking (input up = output down by same amount)
- [ ] Delta monitoring when bypassed (show what WOULD clip)

### Needs Prototyping
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
- [ ] Separate "creative mode" toggle from production curves

---

## UX & Polish

- [ ] Preset system
- [ ] Community preset contributions (Discord etc.)
- [ ] Compare mode (A/B current vs saved state)
- [ ] Copy/paste settings between instances
- [ ] Update notification system

---

## Performance

- [ ] Move clipper engine param updates out of process block
- [ ] Alternative filter implementations (HIIR etc.)

---

## Test Suite Gaps

### Critical - Zero Coverage
- [ ] Saturation curve tests - Only "Hard" is tested. Quintic, Cubic, Tanh, Arctan, Knee, T2 need tests.
- [ ] Determinism tests - Verify same input → identical output every time.
- [ ] Denormal handling - Denormal inputs can cause CPU spikes.

### Important - Edge Cases
- [ ] Parameter smoothing / zipper noise - Automate ceiling rapidly, detect clicks.
- [ ] Latency compensation verification - Impulse test: actual delay vs reported.
- [ ] Edge buffer sizes - Test 0 samples, 1 sample at all OS rates.

### Nice to Have - Quality Metrics
- [ ] THD measurements per curve
- [ ] Aliasing measurements at various OS rates
- [ ] Memory allocation detection in processBlock

---

## Sources

Feedback from: Discord beta testing, Instagram comments, DMs

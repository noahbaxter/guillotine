# Guillotine

A hard clipping plugin with extra soft clipping modes, oversampling, and an animated guillotine!

## Installation

**macOS** (signed & notarized)
- Download the `.pkg` installer from [Releases](https://github.com/noahbaxter/guillotine/releases)
- Double-click to install
- VST3 and AU plugins install to `/Library/Audio/Plug-Ins/`

**Windows**
- Download the `.exe` installer from [Releases](https://github.com/noahbaxter/guillotine/releases)
- If SmartScreen appears, click "More info" → "Run anyway" (plugin is not signed)
- Plugin installs to `C:\Program Files\Common Files\VST3\`

**Linux**
- Download the `.zip` from [Releases](https://github.com/noahbaxter/guillotine/releases)
- Contains VST3, LV2, and CLAP formats
- Extract to `~/.vst3/`, `~/.lv2/`, or `~/.clap/` as appropriate
- **Requires WebKitGTK** for the UI (see below)

### Linux UI Requirements

The plugin UI uses WebKitGTK. Without it, you'll see a white screen instead of the interface.

| Distro | Install Command |
|--------|-----------------|
| Ubuntu/Debian | `sudo apt install libwebkit2gtk-4.1-0` |
| Fedora | `sudo dnf install webkit2gtk4.1` |
| Arch | `sudo pacman -S webkit2gtk-4.1` |
| openSUSE | `sudo zypper install libwebkit2gtk-4_1-0` |

If version 4.1 isn't available, 4.0 works too (e.g., `libwebkit2gtk-4.0-37` on Ubuntu).

## Quick Start

1. **Click the guillotine** (or lever) to activate the clipper
2. **Drag the ceiling knob** to set your clipping threshold
3. **Push signal into it** with the input gain knob
4. Watch the waveform in the microscope view - red areas show what's being clipped

## Controls

### Knobs

All knobs work the same way:
- **Drag up/down** to change value
- **Shift + drag** for fine control (0.1x sensitivity)
- **Double-click** the knob to reset to default
- **Double-click** the value display to type a value

| Control | Range | Description |
|---------|-------|-------------|
| **Curve** | 7 types | Saturation curve shape (see Curves below) |
| **Exponent** | 1.0–4.0 | Curve softness (only for Knee and T² curves) |
| **Ceiling** | 0 to -60 dB | Clipping threshold |
| **Dry/Wet** | 0–100% | Parallel mix (0% = bypass, 100% = full effect) |
| **Oversampling** | 1x–32x | Quality vs CPU tradeoff |
| **Input Gain** | ±24 dB | Drive signal into clipper |
| **Output Gain** | ±24 dB | Compensate for volume changes |
| **Gain Mode** | 3-way | Manual / Match / Maximize (see Gain Mode below) |

### Toggles

| Control | Description |
|---------|-------------|
| **True Peak** | Hard ceiling at output - guarantees signal never exceeds ceiling |
| **Filter Type** | Min Phase (low latency) or Linear Phase (no phase distortion) |
| **Stereo Mode** | Stereo Link / Dual Mono / M/S |

### Clip Light

The red LED next to the output knob lights up when the output signal exceeds 0 dBFS. This can happen when:
- **True Peak is off** and intersample peaks overshoot
- **Dry/Wet is between 0–100%** — the dry signal retains its original peaks, so mixing it with the clipped signal can push the sum above 0 dBFS, even with gain compensation active

If the clip light is triggering during parallel mixing, lower the ceiling instead of driving input gain into it. A lower ceiling gives the dry signal headroom to live in during the mix.

### Microscope View

The waveform display on the right shows your signal in detail:
- **White** = signal below ceiling
- **Red** = signal being clipped
- **Red line** = ceiling threshold (drag to adjust)
- **dB labels** along gridlines show the current scale
- **Dropdown (▾)** = scale presets (-12dB to -60dB) and time window (1.5s or 3.0s)
- **Scroll wheel** = cycle through scale presets

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **R** | Toggle readable mode (clean text instead of stylized graphics) |

## Modes

### Delta Monitor

Click the blood pool (or "DELTA" text) to hear only what's being clipped - the difference between dry and wet signal. Useful for:
- Hearing exactly what you're removing
- Setting threshold by ear
- Checking if you're clipping too aggressively

The UI shifts to red tones when delta mode is active.

### Bypass

Click the guillotine blade or lever to bypass. When bypassed:
- Blade raises up
- No processing occurs
- Dry/wet at 0% has the same effect

## Gain Mode

The three-way toggle above the output knob controls how output gain is managed:

| Mode | Behavior | As you clip harder |
|------|----------|--------------------|
| **Manual** | You control output gain | Output gets quieter |
| **Match (=)** | Auto-compensates for lost energy | Output stays roughly the same |
| **Maximize (↑)** | Boosts by ceiling amount (back to 0 dBFS) | Output gets louder |

### How Match Mode Works

Match mode doesn't analyze your audio in real-time. Instead, it runs two static reference signals through your current curve and ceiling settings and measures how much RMS energy each one loses:

- **Transient reference** — an exponential decay (~12 dB crest factor), modeling a drum hit where only the peak tip gets clipped
- **Tonal reference** — a Gaussian bell curve (~6 dB crest factor), modeling sustained content like guitars or synths where more energy sits near the ceiling

These two references give different compensation values because signal shape matters: at the same crest factor, a Gaussian loses ~2 dB more energy to clipping than an exponential decay. The final compensation blends between them based on ceiling depth:

- **Above -6 dB** ceiling → pure transient reference (light clipping mostly affects peaks)
- **Below -18 dB** ceiling → pure tonal reference (heavy clipping eats into sustained energy)
- **Between -6 and -18 dB** → linear blend

A small progressive reduction (-2 dB across the full 0 to -60 dB range) pulls the compensation back slightly at extreme settings where it tends to run hot. The result is clamped so match mode never boosts more than maximize mode.

This approach was validated against all 7 curves across the full ceiling and exponent range. The exact crest factor values don't matter much — compensation converges above ~6 dB CF for any given shape. What matters is the shape difference between transient and tonal content, which is consistent across curves.

| Ceiling | Hard | Quintic | Cubic | Tanh | Arctan | Knee | T² | Maximize |
|---------|------|---------|-------|------|--------|------|----|----------|
| **-3 dB** | +0.6 | +0.8 | +1.2 | +2.0 | +3.0 | +0.7 | +2.1 | +3 |
| **-6 dB** | +2.0 | +2.1 | +2.4 | +3.1 | +6.0 | +2.1 | +3.0 | +6 |
| **-12 dB** | +7.0 | +7.1 | +7.2 | +7.6 | +10.2 | +7.0 | +7.4 | +12 |
| **-18 dB** | +13.4 | +13.4 | +13.4 | +13.6 | +15.2 | +13.4 | +13.6 | +18 |
| **-24 dB** | +18.6 | +18.6 | +18.7 | +18.8 | +20.0 | +18.6 | +18.7 | +24 |

_Values in dB. Softer curves (Arctan, Tanh) lose more energy and get more compensation. At deep ceilings all curves converge toward maximize._

The compensation recalculates whenever you change the ceiling, curve, exponent, or input gain. It's not perfect for every source — it's meant to get you in the ballpark. Use Manual mode when you need precise control.

### Quick Decision Guide

| Situation | Recommended |
|-----------|-------------|
| Getting started, just exploring | Match |
| A/B comparing clipped vs dry | Match |
| Precise gain staging for mastering | Manual |
| Maximum loudness, don't care about matching | Maximize |

## Curves

| Curve | Behavior |
|-------|----------|
| **Hard** | Brickwall - flat-tops the waveform at ceiling, maximum harmonic content |
| **Quintic** | Very transparent - almost linear until near ceiling, then gentle rolloff |
| **Cubic** | Gentle saturation - more headroom than quintic, subtle harmonic addition |
| **Tanh** | Smooth S-curve - gradual onset, transparent at low levels |
| **Arctan** | Softest - compresses immediately, very gradual limiting, never truly hard clips |
| **Knee** | Experimental - adjustable soft knee. High exponent = knee starts at 5% of ceiling, very destructive |
| **T²** | Experimental - power-law shaping. Quirk: high ceiling + high exponent can reduce quiet signals. Very strange |

For **Knee** and **T²** curves, the Exponent knob controls softness:
- **1.0** = sharp transition (more like hard clip)
- **4.0** = very soft transition (more like saturation)

## Oversampling

Higher oversampling = better quality but more CPU and latency.

### Quick Recommendations

| Goal | Setting |
|------|---------|
| Live/tracking | Min Phase, any rate (2-4 samples latency) |
| Drums | Min Phase 16x (low latency, no pre-ringing) |
| Mixing | Linear Phase 4x (good quality, 73 samples) |
| Mastering | Linear Phase 8x+ with True Peak on |
| Maximum quality | Linear Phase 16x or 32x |

### Filter Types

**Minimum Phase (IIR)** — Use for tracking, live performance, low-latency monitoring
- Near-zero latency (2-4 samples) — no audible delay
- Preserves transient timing — the attack hits exactly when it should
- Frequency-dependent phase shift — usually inaudible, but can matter when summing with unprocessed signal
- Higher intersample overshoot — enable True Peak if ceiling must be exact

**Linear Phase (FIR)** — Use for mixing, mastering, offline rendering
- Phase-coherent — no frequency-dependent delay, safe for parallel processing and M/S work
- Better aliasing rejection (~69dB vs ~60dB) — cleaner harmonics
- Adds latency (55-88 samples) — DAW handles this via PDC, but not suitable for live monitoring
- Slight pre-ringing on sharp transients — symmetric impulse response rings before and after

### Detailed Comparison

<details>
<summary>Performance tables (click to expand)</summary>

**Minimum Phase (IIR)**
| OS | Intersample | Aliasing | Latency | CPU |
|----|-------------|----------|---------|-----|
| 1x | +8.9 dB | -41 dB | 0 samp | 0.007 ms |
| 2x | +7.5 dB | -58 dB | 2 samp | 0.03 ms |
| 4x | +6.4 dB | -59 dB | 3 samp | 0.07 ms |
| 8x | +5.5 dB | -60 dB | 4 samp | 0.12 ms |
| 16x | +4.1 dB | -60 dB | 4 samp | 0.21 ms |
| 32x | +2.5 dB | -60 dB | 4 samp | 0.34 ms |
| *64x* | *+2.6 dB* | *-60 dB* | *5 samp* | *0.54 ms* |
| *128x* | *+2.6 dB* | *-60 dB* | *5 samp* | *0.90 ms* |

**Linear Phase (FIR)**
| OS | Intersample | Aliasing | Latency | CPU |
|----|-------------|----------|---------|-----|
| 1x | +8.9 dB | -41 dB | 0 samp | 0.007 ms |
| 2x | +3.7 dB | -69 dB | 55 samp | 0.06 ms |
| 4x | +2.1 dB | -69 dB | 73 samp | 0.12 ms |
| 8x | +2.3 dB | -69 dB | 81 samp | 0.24 ms |
| 16x | +2.1 dB | -69 dB | 86 samp | 0.44 ms |
| 32x | +2.3 dB | -69 dB | 88 samp | 0.85 ms |
| *64x* | *+2.2 dB* | *-69 dB* | *89 samp* | *1.68 ms* |
| *128x* | *+2.1 dB* | *-69 dB* | *89 samp* | *3.28 ms* |

*Italicized rows were tested but not included in the plugin - no quality benefit over 32x, but 2-4x the CPU cost.*

- **Intersample**: True peak overshoot above ceiling (lower = better)
- **Aliasing**: Harmonic foldback rejection (more negative = better)
- **Latency**: Processing delay at 44.1kHz
- **CPU**: Time per 512-sample buffer

</details>

## Stereo Modes

| Mode | Behavior |
|------|----------|
| **Stereo Link** | Both channels clip together based on the louder channel |
| **L/R** | Each channel clips independently |
| **M/S** | Mid and Side channels processed separately |

### When to Use Each

**Stereo Link** — Safe default for most uses
- Both channels clip together based on whichever is louder
- Stereo image stays rock-solid, no wandering or pumping
- Trade-off: you leave headroom on the table if one side is quieter

Best for: Mix buses, mastering, drum buses, anything where image stability matters.

**L/R (Dual Mono)** — Maximum loudness, least control
- Each channel uses all available headroom independently
- Stereo image can shift if one side clips harder than the other
- On aggressive settings, the center can "wobble" toward whichever side is quieter

Best for: Sound design, creative effects, processing truly independent sources. Rarely right for full mixes.

**M/S (Mid/Side)** — Loud center, preserved width
- Encodes to Mid (center) and Side (width), clips both, decodes back
- In most mixes, loud stuff lives in the center (kick, snare, vocal) and quiet stuff lives in the sides (reverb, room, stereo width)
- Result: you slam the center content hard while spatial information barely touches the clipper

Best for: Aggressive loudness on centered material without crushing reverb tails and stereo width.

### Quick Decision Guide

| Situation | Recommended |
|-----------|-------------|
| Mastering / mix bus | Stereo Link or M/S |
| Drum bus | Stereo Link |
| Aggressive loudness, mostly centered content | M/S |
| Creative destruction, image movement is fine | L/R |
| Wide stereo pads, room mics | Stereo Link |

## Building

```bash
./scripts/build.sh              # Release build + install
./scripts/build.sh debug        # Debug build
./scripts/standalone.sh         # Quick UI preview
./scripts/watch.sh              # Auto-rebuild on file changes
```

## Testing

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/ -v
```

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.

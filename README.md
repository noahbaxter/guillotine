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

### Toggles

| Control | Description |
|---------|-------------|
| **True Peak** | Hard ceiling at output - guarantees signal never exceeds ceiling |
| **Filter Type** | Min Phase (low latency) or Linear Phase (no phase distortion) |
| **Stereo Mode** | Stereo Link / L+R Independent / Mid-Side |

### Microscope View

The waveform display on the right shows your signal in detail:
- **White** = signal below ceiling
- **Red** = signal being clipped
- **Red line** = ceiling threshold (drag to adjust)
- **Scroll wheel** = zoom in/out (12dB to 60dB range)

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

# Guillotine Plugin - Feature Completion Checklist

## v1 Features

### High Priority (Core Functionality)
- [x] **Replaced oversimple with JUCE oversampling** - JUCE's dsp::Oversampling is 10-40x faster, has 7dB better aliasing rejection, and 14dB lower THD than oversimple. Now supports all rates: 1x/2x/4x/8x/16x/32x.
- [x] **BUG: Bypass mode doesn't sanitize NaN/Inf** - Fixed: bypass now sanitizes NaN/Inf before returning.
- [x] **DSP Unit Tests** - C++ unit tests for Clipper, Oversampler, StereoProcessor, ClipperEngine, Delta Monitor, Transients (tests/unit/)
- [x] **Parameter smoothing** - SmoothedValue for ceiling/curveExponent in Clipper (2ms ramp). Tests need updating for smoothed behavior.
- [x] **Bidirectional parameter sync** - Backend → UI (DAW automation should update knobs)
- [x] **True bypass hookup** - Connect blade up/down to actual DSP bypass
- [x] **Dry/wet control** - Phase-coherent mixing with matched oversamplers (v1.0.3)
- [x] **Toggle buttons** - filterType, stereoMode, enforceCeiling all have UI toggles (v1.0.2)
- [ ] **Tests for saturation curves** - SaturatorCurves.h has 7 curve implementations, only Hard is tested
- [ ] **Tests for dual envelope buffers** - Verify preClip/postClip sync for display accuracy

### Low Priority (Cleanup)
- [x] **Remove legacy `gain` parameter** - Unused, kept "for compatibility"
- [x] **Remove DCBlocker** - Was causing more issues than it solved

---

## Current State

### DSP Chain (ClipperEngine.cpp)
```
Input → InputGain → M/S Encode → Upsample → Clipper → Downsample → M/S Decode → EnforceCeiling → OutputGain → Delta Monitor → Output
       ↓                                                                                                              ↓
       └──────────────────────────────── Dry (matched oversample) ──────────────────────────────────────────────→ Mix → Output
```

### Parameters
| Parameter | C++ | UI | Bidirectional |
|-----------|-----|-----|---------------|
| curve | ✓ | ✓ | ✓ |
| curveExponent | ✓ | ✓ | ✓ |
| oversampling | ✓ | ✓ | ✓ |
| inputGain | ✓ | ✓ | ✓ |
| outputGain | ✓ | ✓ | ✓ |
| ceiling | ✓ | ✓ | ✓ |
| filterType | ✓ | ✓ | ✓ |
| stereoMode | ✓ | ✓ | ✓ |
| enforceCeiling | ✓ | ✓ | ✓ |
| deltaMonitor | ✓ | ✓ | ✓ |
| dryWet | ✓ | ✓ | ✓ |
| bypass | ✓ | ✓ | ✓ |

---

## Deferred (Post-v1)
- Preset system
- **Investigate alternative filter implementations** - Currently using JUCE's built-in oversampling. Could consider direct HIIR integration or other libraries if better intersample control is needed (currently ~2dB overshoot at all rates).

## Known Limitations
- **Min-phase group delay** - IIR filters have frequency-dependent delay not reflected in reported latency. This is inherent to min-phase design, not a bug. Use linear phase when timing precision matters.

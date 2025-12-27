# Guillotine Plugin - Feature Completion Checklist

## v1 Features

### High Priority (Core Functionality)
- [ ] **BUG: Min-phase has ~7 samples unreported latency** - Linear phase latency is accurate, but min-phase filters have group delay not reflected in getLatencyInSamples(). See test_transient.cpp warning.
- [x] **Replaced oversimple with JUCE oversampling** - JUCE's dsp::Oversampling is 10-40x faster, has 7dB better aliasing rejection, and 14dB lower THD than oversimple. Now supports all rates: 1x/2x/4x/8x/16x/32x.
- [x] **BUG: Bypass mode doesn't sanitize NaN/Inf** - Fixed: bypass now sanitizes NaN/Inf before returning.
- [x] **DSP Unit Tests** - C++ unit tests for Clipper, Oversampler, StereoProcessor, ClipperEngine, Delta Monitor, Transients (tests/unit/)
- [ ] **Parameter smoothing** - Use SmoothedValue for ceiling/sharpness to prevent automation clicks
- [x] **Bidirectional parameter sync** - Backend → UI (DAW automation should update knobs)
- [x] **True bypass hookup** - Connect blade up/down to actual DSP bypass
- [ ] **Dry/wet control** - New parameter, DSP blend logic, UI knob

### Medium Priority (Completeness)
- [ ] **Toggle buttons** for stereoLink, channelMode (M/S), filterType (lin/min phase)
  - Parameters exist in C++, just need UI controls
- [ ] **True peak safety** - enforceCeiling limiter exists but may need ISP metering

### Low Priority (Cleanup)
- [x] **Remove legacy `gain` parameter** - Unused, kept "for compatibility"
- [x] **Remove DCBlocker** - Was causing more issues than it solved

---

## Current State

### DSP Chain (ClipperEngine.cpp)
```
Input → InputGain → M/S Encode → Upsample → Clipper → Downsample → M/S Decode → EnforceCeiling → OutputGain → Delta Monitor → Output
```

### Parameters
| Parameter | C++ | UI | Bidirectional |
|-----------|-----|-----|---------------|
| sharpness | ✓ | ✓ | ✓ |
| oversampling | ✓ | ✓ | ✓ |
| inputGain | ✓ | ✓ | ✓ |
| outputGain | ✓ | ✓ | ✓ |
| ceiling | ✓ | ✓ | ✓ |
| filterType | ✓ | ✗ | - |
| channelMode | ✓ | ✗ | - |
| stereoLink | ✓ | ✗ | - |
| deltaMonitor | ✓ | ✓ | ✓ |
| dryWet | ✗ | ✗ | - |
| bypass | ✓ | ✓ | ✓ |

---

## Deferred (Post-v1)
- Preset system
- **Investigate alternative filter implementations** - Currently using JUCE's built-in oversampling. Could consider direct HIIR integration or other libraries if better intersample control is needed (currently ~2dB overshoot at all rates).

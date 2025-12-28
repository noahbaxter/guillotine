# Guillotine

A clipper plugin with oversampling and multiple curve modes.

## Oversampling & Filter Types

### Filter Types

**Minimum Phase (IIR Polyphase)**
- Very low latency (2-4 samples)
- Better transient preservation
- Higher intersample overshoot at low OS rates
- Best for: Live performance, real-time tracking

**Linear Phase (FIR Equiripple)**
- No phase distortion
- Better aliasing rejection (~69dB vs ~60dB)
- Higher latency (55-88 samples)
- Best for: Mixing/mastering, offline rendering

### Performance Comparison

**Minimum Phase (IIR)**
| OS | Intersample | Aliasing | Attack | Latency | CPU |
|----|-------------|----------|--------|---------|-----|
| 1x | +8.9 dB | -41 dB | 0 samp | 0 samp | 0.007 ms |
| 2x | +7.5 dB | -58 dB | 1 samp | 2 samp | 0.03 ms |
| 4x | +6.4 dB | -59 dB | 1 samp | 3 samp | 0.07 ms |
| 8x | +5.5 dB | -60 dB | 2 samp | 4 samp | 0.12 ms |
| 16x | +4.1 dB | -60 dB | 1 samp | 4 samp | 0.21 ms |
| 32x | +2.5 dB | -60 dB | 1 samp | 4 samp | 0.34 ms |
| *64x* | *+2.6 dB* | *-60 dB* | *1 samp* | *5 samp* | *0.54 ms* |
| *128x* | *+2.6 dB* | *-60 dB* | *1 samp* | *5 samp* | *0.90 ms* |

**Linear Phase (FIR)**
| OS | Intersample | Aliasing | Attack | Latency | CPU |
|----|-------------|----------|--------|---------|-----|
| 1x | +8.9 dB | -41 dB | 0 samp | 0 samp | 0.007 ms |
| 2x | +3.7 dB | -69 dB | 0 samp | 55 samp | 0.06 ms |
| 4x | +2.1 dB | -69 dB | 4 samp | 73 samp | 0.12 ms |
| 8x | +2.3 dB | -69 dB | 1 samp | 81 samp | 0.24 ms |
| 16x | +2.1 dB | -69 dB | 4 samp | 86 samp | 0.44 ms |
| 32x | +2.3 dB | -69 dB | 2 samp | 88 samp | 0.85 ms |
| *64x* | *+2.2 dB* | *-69 dB* | *1 samp* | *89 samp* | *1.68 ms* |
| *128x* | *+2.1 dB* | *-69 dB* | *3 samp* | *89 samp* | *3.28 ms* |

*Italicized rows tested but not included in plugin (no benefit, 2-4x CPU cost).*

- **Intersample**: True peak overshoot above ceiling (lower = better, 0dB = perfect)
- **Aliasing**: Harmonic foldback rejection (more negative = better)
- **Attack**: Transient smear in samples (lower = punchier)
- **Latency**: Processing delay at 44.1kHz
- **CPU**: Time per 512-sample buffer

### Recommendations

- **Guaranteed ceiling**: Use `enforce_ceiling` ON (hard limiter catches any overshoot)
- **Best quality**: Linear Phase 4x+ (~2dB overshoot, excellent aliasing rejection)
- **Lowest latency**: Minimum Phase at any rate (2-4 samples)
- **Best balance**: 4x Linear Phase (good quality, moderate CPU, 73 samples latency)

## Building

```bash
./scripts/build.sh
```

## Testing

```bash
source .venv/bin/activate  # or: python3 -m venv .venv && pip install -r tests/requirements.txt
pytest tests/ -v
```

## License

MIT

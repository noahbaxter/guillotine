# Guillotine Clip

## Commands

```bash
./scripts/build.sh              # Release build + install (requires sudo)
./scripts/build.sh debug        # Debug build
./scripts/build.sh clean        # Clean build artifacts
./scripts/build.sh --no-install # Build without installing
./scripts/standalone.sh         # UI preview - builds standalone and launches it
./scripts/watch.sh              # Auto-rebuild on src/ and web/ changes
./scripts/validate.sh           # pluginval at strictness 10 (pass level: ./scripts/validate.sh 5)
pytest tests/ -v                # Python integration tests
```

## Adding Web Assets

New JS/CSS/images need registration in two places or the build silently breaks:
1. `CMakeLists.txt` — add to `juce_add_binary_data(GuillotineData SOURCES ...)`
2. `PluginEditor.cpp` — add entry to the `resources[]` table in `getResource()`

BinaryData naming: hyphens in filenames are **dropped entirely**, not converted to underscores.
`my-file.js` becomes `myfile_js` (not `my_file_js`). Wrong name = cryptic linker error.

PNG images: crop whitespace with ImageMagick before committing. Guillotine layers
(blade/rope/base) must stay pixel-aligned or the animation breaks.

## Watch Out

**Never touch `VERSION`** — only the user bumps it.

The blade travel multiplier (1.25x in the JS) is intentional: `object-fit: contain` shrinks
the rendered image size, so travel is scaled up to match visual size. Don't "fix" it.

`computeAutoGain()` runs on the message thread, not the audio thread. It fires on parameter
changes, not in `processBlock()`.

Min-phase filter group delay is frequency-dependent and not reflected in reported latency.
Known limitation, not a bug.

## Workflow Rules

Building, testing, and running validation locally is fine — do it directly.
Still surface results and proposed changes clearly before committing.

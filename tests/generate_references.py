#!/usr/bin/env python3
"""
Generate reference audio files for regression tests.
Run this when plugin behavior changes intentionally.

Usage:
    python tests/generate_references.py

To add new test signals:
    1. Add .wav files to tests/fixtures/input/
    2. Run this script to generate references
"""

import soundfile as sf
from pathlib import Path
from pedalboard import load_plugin
from utils import generate_sine

FIXTURES_DIR = Path(__file__).parent / "fixtures"
INPUT_DIR = FIXTURES_DIR / "input"
REFERENCES_DIR = FIXTURES_DIR / "references"
PLUGIN_PATH = Path.home() / "Library/Audio/Plug-Ins/VST3/Guillotine.vst3"

# Test configurations: (param_value, suffix)
# Add more settings here as plugin grows
GAIN_SETTINGS = [
    (0.0, "unity"),
    (-6.0, "minus_6db"),
    (6.0, "plus_6db"),
]


def ensure_default_input():
    """Create default sine input if no input files exist."""
    INPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not any(INPUT_DIR.glob("*.wav")):
        sine = generate_sine(freq=440.0, duration=1.0, sr=44100, amplitude=0.5)
        default_file = INPUT_DIR / "sine_440hz.wav"
        sf.write(default_file, sine, 44100)
        print(f"Created default input: {default_file}")


def main():
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    REFERENCES_DIR.mkdir(parents=True, exist_ok=True)

    # Ensure at least one input file exists
    ensure_default_input()

    # Check plugin exists
    if not PLUGIN_PATH.exists():
        print(f"Error: Plugin not found at {PLUGIN_PATH}")
        print("Run ./scripts/build.sh first")
        return 1

    print(f"Loading plugin from {PLUGIN_PATH}")
    plugin = load_plugin(str(PLUGIN_PATH))

    # Find all input files
    input_files = sorted(INPUT_DIR.glob("*.wav"))
    if not input_files:
        print("Error: No input files found in fixtures/input/")
        return 1

    print(f"Found {len(input_files)} input file(s)")

    # Generate references for each input × each setting
    for input_file in input_files:
        audio, sr = sf.read(input_file, dtype='float32')
        if audio.ndim == 1:
            audio = audio.reshape(-1, 1)

        stem = input_file.stem  # e.g., "sine_440hz"
        print(f"\nProcessing: {input_file.name}")

        for gain, suffix in GAIN_SETTINGS:
            plugin.gain_db = gain
            output = plugin.process(audio, sr)

            ref_file = REFERENCES_DIR / f"{stem}_{suffix}.wav"
            sf.write(ref_file, output, sr)
            print(f"  → {ref_file.name} (gain={gain}dB)")

    print("\nReference files generated successfully!")
    print("Commit fixtures/ to track expected plugin behavior.")
    return 0


if __name__ == "__main__":
    exit(main())

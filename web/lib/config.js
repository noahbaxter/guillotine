// Display configuration - centralized for easy view switching
// To change default view: adjust DEFAULT_PRESET_INDEX to point to the desired preset

// Scale presets for microscope zoom cycling
// maxDb = headroom above 0dB, gridStep = dB between gridlines
const SCALE_PRESETS = [
  { label: '-12', minDb: -12, maxDb: 3,  gridStep: 3  },
  { label: '-24', minDb: -24, maxDb: 6,  gridStep: 6  },
  { label: '-36', minDb: -36, maxDb: 6,  gridStep: 12 },
  { label: '-48', minDb: -48, maxDb: 6,  gridStep: 12 },
  { label: '-60', minDb: -60, maxDb: 6,  gridStep: 12 }
];

// Default preset index (which zoom level starts active)
const DEFAULT_PRESET_INDEX = 1;

// Derive config from presets
const defaultPreset = SCALE_PRESETS[DEFAULT_PRESET_INDEX];
const maxPreset = SCALE_PRESETS.reduce((max, p) => p.minDb < max.minDb ? p : max);

export const DISPLAY_CONFIG = {
  // Maximum ceiling threshold (always 0dB - the "no clipping" point)
  maxCeilingDb: 0,

  // Top of waveform display (headroom above 0dB, varies by preset)
  displayMaxDb: defaultPreset.maxDb,

  // Default view minimum (what the microscope shows on startup)
  defaultMinDb: defaultPreset.minDb,

  // Full range for threshold calculations - uses deepest preset
  // This is the C++ parameter range: 0dB to -60dB
  rangeDb: Math.abs(maxPreset.minDb),

  // Scale presets for microscope zoom cycling
  scalePresets: SCALE_PRESETS,

  // Default display range for microscope (index into scalePresets)
  defaultScalePresetIndex: DEFAULT_PRESET_INDEX
};

// Waveform display settings
const WAVEFORM_POINTS_PER_SECOND = 200; // NOTE: must match envelopePointsPerSecond in src/PluginProcessor.h

// Time scale presets for microscope X axis (seconds shown)
const TIME_PRESETS = [
  { label: '1.5s',  seconds: 1.5 },
  { label: '3s',    seconds: 3 },
];

const DEFAULT_TIME_PRESET_INDEX = 0;

export const WAVEFORM_CONFIG = {
  pointsPerSecond: WAVEFORM_POINTS_PER_SECOND,
  pointsToShow: TIME_PRESETS[DEFAULT_TIME_PRESET_INDEX].seconds * WAVEFORM_POINTS_PER_SECOND,
  defaultGridStepDb: defaultPreset.gridStep,
  timePresets: TIME_PRESETS,
  defaultTimePresetIndex: DEFAULT_TIME_PRESET_INDEX,
};

// Export individual values for convenience
export const DEFAULT_MIN_DB = DISPLAY_CONFIG.defaultMinDb;
export const MAX_CEILING_DB = DISPLAY_CONFIG.maxCeilingDb;
export const DISPLAY_DB_RANGE = DISPLAY_CONFIG.rangeDb;  // Always 60 (full range)
export { SCALE_PRESETS, TIME_PRESETS };

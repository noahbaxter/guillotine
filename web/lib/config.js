// Display configuration - centralized for easy view switching
// To change default view: adjust DEFAULT_PRESET_INDEX to point to the desired preset

// Scale presets for microscope zoom cycling
// Each preset shows a different minimum dB while maintaining 0dB as max
const SCALE_PRESETS = [
  { label: '-24', minDb: -24 },
  { label: '-48', minDb: -48 },
  { label: '-60', minDb: -60 }
];

// Default preset index (which zoom level starts active)
const DEFAULT_PRESET_INDEX = 0;

// Derive config from presets
const defaultPreset = SCALE_PRESETS[DEFAULT_PRESET_INDEX];
const maxPreset = SCALE_PRESETS.reduce((max, p) => p.minDb < max.minDb ? p : max);

export const DISPLAY_CONFIG = {
  // Maximum ceiling threshold (always 0dB - the "no clipping" point)
  maxCeilingDb: 0,

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

// Export individual values for convenience
export const DEFAULT_MIN_DB = DISPLAY_CONFIG.defaultMinDb;
export const MAX_CEILING_DB = DISPLAY_CONFIG.maxCeilingDb;
export const DISPLAY_DB_RANGE = DISPLAY_CONFIG.rangeDb;  // Always 60 (full range)
export { SCALE_PRESETS };

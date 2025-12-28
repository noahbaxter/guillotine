// Centralized color system for Guillotine plugin
// Single source of truth - injects CSS variables and provides JS getters

let deltaMode = false;
const listeners = [];

// All colors defined here - CSS variables are injected from these
const COLORS = {
  // Base surfaces
  surfaceBody: '#1a1a1a',
  surfacePanel: '#141414',
  surfaceOverlay: 'rgba(20, 20, 20, 0.95)',

  // Knob
  knobDialLight: '#3a3a3a',
  knobDialDark: '#2a2a2a',
  knobIndicator: '#888',

  // Text
  textPrimary: '#fff',
  textSecondary: '#888',
  textTertiary: '#aaa',

  // White overlays (borders, highlights, glows)
  white10: 'rgba(255, 255, 255, 0.1)',
  white15: 'rgba(255, 255, 255, 0.15)',
  white20: 'rgba(255, 255, 255, 0.2)',
  white50: 'rgba(255, 255, 255, 0.5)',
  white70: 'rgba(255, 255, 255, 0.7)',
  white80: 'rgba(255, 255, 255, 0.8)',
  white90: 'rgba(255, 255, 255, 0.9)',

  // Black shadows
  shadow40: 'rgba(0, 0, 0, 0.4)',
  shadow50: 'rgba(0, 0, 0, 0.5)',
  shadow80: 'rgba(0, 0, 0, 0.8)',

  // Blood/red colors - normal mode
  bloodLine1: 'rgba(139, 0, 0, 0.85)',
  bloodLine2: 'rgba(139, 0, 0, 0.65)',
  bloodPuddle: 'rgba(100, 0, 0, 0.85)',
  bloodThreshold: 'rgba(220, 60, 60, 1)',
  bloodThresholdBypass: 'rgba(200, 60, 60, 0.75)',
  bloodClipped: 'rgba(120, 20, 20, 0.25)',
  bloodGlow: 'rgba(180, 30, 30, 0.6)',
  bloodAccent: 'rgba(180, 30, 30, 1)',

  // Waveform - normal mode
  waveformTop: 'rgba(255, 255, 255, 0.7)',
  waveformMid: 'rgba(255, 255, 255, 0.5)',
  waveformBottom: 'rgba(255, 255, 255, 0.3)',
  waveformOutline: 'rgba(255, 255, 255, 0.9)',

  // Clipped outline (null in normal mode)
  clippedOutline: null,

  // Delta mode text color for labels
  deltaText: 'rgba(255, 255, 255, 0.5)',
};

// Delta mode overrides - only colors that change
const DELTA_OVERRIDES = {
  bloodLine1: 'rgba(200, 0, 0, 1)',
  bloodLine2: 'rgba(180, 0, 0, 0.95)',
  bloodPuddle: 'rgba(150, 0, 0, 1)',
  bloodPuddleHover: 'rgba(130, 0, 0, 0.95)',
  bloodThreshold: 'rgba(220, 40, 40, 1)',
  bloodThresholdBypass: 'rgba(240, 70, 70, 0.95)',
  bloodClipped: 'rgba(180, 30, 30, 0.55)',
  bloodGlow: 'rgba(200, 0, 0, 0.7)',
  clippedOutline: 'rgba(255, 40, 40, 1)',
  deltaText: 'rgba(255, 100, 100, 1)',

  waveformTop: 'rgba(255, 255, 255, 0.25)',
  waveformMid: 'rgba(255, 255, 255, 0.12)',
  waveformBottom: 'rgba(255, 255, 255, 0.05)',
  waveformOutline: 'rgba(255, 255, 255, 0.35)',
};

// Convert camelCase to kebab-case for CSS variable names
function toKebab(str) {
  return str.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

// Inject all colors as CSS custom properties
function injectCSSVariables() {
  const root = document.documentElement;
  const activeColors = deltaMode
    ? { ...COLORS, ...DELTA_OVERRIDES }
    : COLORS;

  for (const [key, value] of Object.entries(activeColors)) {
    const cssVar = `--color-${toKebab(key)}`;
    root.style.setProperty(cssVar, value || 'transparent');
  }
}

// Initialize CSS variables on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSSVariables);
  } else {
    injectCSSVariables();
  }
}

// Getters for canvas components (return current values based on mode)
export function getBloodColors() {
  return deltaMode
    ? { line1: DELTA_OVERRIDES.bloodLine1, line2: DELTA_OVERRIDES.bloodLine2 }
    : { line1: COLORS.bloodLine1, line2: COLORS.bloodLine2 };
}

export function getThresholdColor(active) {
  if (deltaMode) {
    return active ? DELTA_OVERRIDES.bloodThreshold : DELTA_OVERRIDES.bloodThresholdBypass;
  }
  return active ? COLORS.bloodThreshold : COLORS.bloodThresholdBypass;
}

export function getClippedColor() {
  return deltaMode ? DELTA_OVERRIDES.bloodClipped : COLORS.bloodClipped;
}

export function getClippedOutlineColor() {
  return deltaMode ? DELTA_OVERRIDES.clippedOutline : COLORS.clippedOutline;
}

export function getWaveformColors() {
  if (deltaMode) {
    return {
      gradientTop: DELTA_OVERRIDES.waveformTop,
      gradientMid: DELTA_OVERRIDES.waveformMid,
      gradientBottom: DELTA_OVERRIDES.waveformBottom,
      outline: DELTA_OVERRIDES.waveformOutline
    };
  }
  return {
    gradientTop: COLORS.waveformTop,
    gradientMid: COLORS.waveformMid,
    gradientBottom: COLORS.waveformBottom,
    outline: COLORS.waveformOutline
  };
}

// State management
export function isDeltaMode() {
  return deltaMode;
}

export function setDeltaMode(enabled) {
  if (deltaMode === enabled) return;
  deltaMode = enabled;

  // Update CSS variables for DOM element transitions
  injectCSSVariables();

  // Toggle CSS class on body for transition effects
  document.body.classList.toggle('delta-mode', enabled);

  // Notify listeners (canvas components) to redraw
  listeners.forEach(fn => fn(enabled));
}

export function onDeltaModeChange(callback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

// Export color constants for direct access if needed
export { COLORS, DELTA_OVERRIDES };

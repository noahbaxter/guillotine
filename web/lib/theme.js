// Theme Module - Color system for Guillotine plugin
// Manages colors and CSS variables for normal/delta modes

let deltaMode = false;
let deltaTransition = 0;  // 0 = normal, 1 = delta (animated)
let cancelDeltaAnimation = null;
let readableMode = false;
const listeners = [];
const readableListeners = [];

// Animation duration (matches guillotine blade)
const DELTA_TRANSITION_MS = 150;

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
  bloodClipped: 'rgba(160, 30, 30, 0.4)',
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
  deltaText: 'rgba(255, 40, 40, 1)',

  waveformTop: 'rgba(140, 140, 140, 0.5)',      // Darker grey, more opaque to counter CRT lightening
  waveformMid: 'rgba(100, 100, 100, 0.3)',
  waveformBottom: 'rgba(80, 80, 80, 0.15)',
  waveformOutline: 'rgba(180, 180, 180, 0.5)',
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

// Initialize on load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSSVariables);
  } else {
    injectCSSVariables();
  }
}

// Color getters for canvas components
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

// Parse rgba string to [r, g, b, a] array
function parseRgba(color) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return [+match[1], +match[2], +match[3], match[4] !== undefined ? +match[4] : 1];
  }
  return [255, 255, 255, 1];
}

// Interpolate between two rgba colors
function lerpColor(colorA, colorB, t) {
  const a = parseRgba(colorA);
  const b = parseRgba(colorB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  const alpha = a[3] + (b[3] - a[3]) * t;
  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}

export function getWaveformColors() {
  const t = deltaTransition;
  if (t === 0) {
    return {
      gradientTop: COLORS.waveformTop,
      gradientMid: COLORS.waveformMid,
      gradientBottom: COLORS.waveformBottom,
      outline: COLORS.waveformOutline,
      background: '#000'
    };
  }
  if (t === 1) {
    return {
      gradientTop: DELTA_OVERRIDES.waveformTop,
      gradientMid: DELTA_OVERRIDES.waveformMid,
      gradientBottom: DELTA_OVERRIDES.waveformBottom,
      outline: DELTA_OVERRIDES.waveformOutline,
      background: '#000'
    };
  }
  // Interpolate during transition
  return {
    gradientTop: lerpColor(COLORS.waveformTop, DELTA_OVERRIDES.waveformTop, t),
    gradientMid: lerpColor(COLORS.waveformMid, DELTA_OVERRIDES.waveformMid, t),
    gradientBottom: lerpColor(COLORS.waveformBottom, DELTA_OVERRIDES.waveformBottom, t),
    outline: lerpColor(COLORS.waveformOutline, DELTA_OVERRIDES.waveformOutline, t),
    background: '#000'
  };
}

// Delta mode state
export function isDeltaMode() {
  return deltaMode;
}

export function setDeltaMode(enabled) {
  if (deltaMode === enabled) return;
  deltaMode = enabled;

  // Cancel any in-progress animation
  if (cancelDeltaAnimation) cancelDeltaAnimation();

  // Animate transition
  const startValue = deltaTransition;
  const targetValue = enabled ? 1 : 0;
  const startTime = performance.now();
  let animationId = null;

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / DELTA_TRANSITION_MS, 1);
    deltaTransition = startValue + (targetValue - startValue) * progress;

    if (progress < 1) {
      animationId = requestAnimationFrame(animate);
    } else {
      deltaTransition = targetValue;
      cancelDeltaAnimation = null;
    }
  };

  animationId = requestAnimationFrame(animate);
  cancelDeltaAnimation = () => {
    if (animationId) cancelAnimationFrame(animationId);
  };

  injectCSSVariables();
  document.body.classList.toggle('delta-mode', enabled);
  listeners.forEach(fn => fn(enabled));
}

export function onDeltaModeChange(callback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

// Readable mode - swaps stylized images for clean text
export function isReadableMode() {
  return readableMode;
}

export function setReadableMode(enabled) {
  if (readableMode === enabled) return;
  readableMode = enabled;
  document.body.classList.toggle('readable-mode', enabled);
  readableListeners.forEach(fn => fn(enabled));
}

export function toggleReadableMode() {
  setReadableMode(!readableMode);
}

export function onReadableModeChange(callback) {
  readableListeners.push(callback);
  return () => {
    const idx = readableListeners.indexOf(callback);
    if (idx !== -1) readableListeners.splice(idx, 1);
  };
}

export { COLORS, DELTA_OVERRIDES };

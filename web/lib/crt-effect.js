// CRT Effect Module - scanlines, vignette, chromatic aberration, jitter
// Effects scale with window size to maintain consistent appearance

// =============================================================================
// CONFIG - Tweak these values to adjust CRT appearance
// =============================================================================
const CONFIG = {
  // Scaling
  referenceHeight: 300,       // Height (px) where effects appear at 1:1 scale

  // Waveform jitter (old equipment wobble)
  jitterBase: 1.2,            // Jitter amount at reference size (uses scale²)
  jitterMinThreshold: 0.3,    // Skip jitter if below this value

  // Scanlines
  scanlineGapBase: 1,         // Gap between scanlines (px at 1x scale)
  scanlineSizeBase: 3,        // Total scanline cycle size (px at 1x scale)
  scanlineOpacity: 0.25,      // Darkness of scanlines (0-1)

  // Phosphor glow / bloom
  glowRadius: 6,              // Blur radius (px)
  glowOpacity: 0.6,           // Glow intensity (0-1)

  // Vignette (radial darkening/lightening at edges)
  vignetteCenterOpacity: 0.22,  // Center opacity (lower = less effect)
  vignetteEdgeOpacity: 0.62,    // Edge opacity (higher = more darkening)
};
// =============================================================================

let currentScale = 1.0;

function init() {
  document.body.classList.add('crt-enabled');
  applyConfigVars();
  updateScaledVars(1.0);
}

// Apply static config values as CSS variables
function applyConfigVars() {
  const root = document.documentElement.style;
  root.setProperty('--crt-scanline-opacity', CONFIG.scanlineOpacity);
  root.setProperty('--crt-glow-radius', CONFIG.glowRadius + 'px');
  root.setProperty('--crt-glow-opacity', CONFIG.glowOpacity);
  root.setProperty('--crt-vignette-center-opacity', CONFIG.vignetteCenterOpacity);
  root.setProperty('--crt-vignette-edge-opacity', CONFIG.vignetteEdgeOpacity);
}

export function setScale(height) {
  currentScale = height / CONFIG.referenceHeight;
  updateScaledVars(currentScale);
}

// Update scale-dependent CSS variables
function updateScaledVars(scale) {
  const root = document.documentElement.style;
  const gap = Math.max(1, Math.round(CONFIG.scanlineGapBase * scale));
  const size = Math.max(2, Math.round(CONFIG.scanlineSizeBase * scale));
  root.setProperty('--crt-scanline-gap', gap + 'px');
  root.setProperty('--crt-scanline-size', size + 'px');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

// Apply jitter to waveform points - uses scale² so small sizes have minimal jitter
export function applyJitter(points) {
  const jitter = CONFIG.jitterBase * currentScale * currentScale;
  if (jitter < CONFIG.jitterMinThreshold) return points;
  return points.map(p => ({
    x: p.x + (Math.random() - 0.5) * jitter * 0.3,
    y: p.y + (Math.random() - 0.5) * jitter * 2
  }));
}

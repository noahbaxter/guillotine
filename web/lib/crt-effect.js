// CRT Effect Module - scanlines, vignette, chromatic aberration, jitter
// Effects scale with window size to maintain consistent appearance

const JITTER_BASE = 1.2;        // Jitter amount at reference size
const REFERENCE_HEIGHT = 300;   // Height where effects appear at 1:1 scale

let currentScale = 1.0;

function init() {
  document.body.classList.add('crt-enabled');
  updateScanlineVars(1.0);
}

export function setScale(height) {
  currentScale = height / REFERENCE_HEIGHT;
  updateScanlineVars(currentScale);
}

function updateScanlineVars(scale) {
  const gap = Math.max(1, Math.round(scale));
  const size = Math.max(2, Math.round(3 * scale));
  document.documentElement.style.setProperty('--crt-scanline-gap', gap + 'px');
  document.documentElement.style.setProperty('--crt-scanline-size', size + 'px');
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
  const jitter = JITTER_BASE * currentScale * currentScale;
  if (jitter < 0.3) return points;  // Skip if negligible
  return points.map(p => ({
    x: p.x + (Math.random() - 0.5) * jitter * 0.3,
    y: p.y + (Math.random() - 0.5) * jitter * 2
  }));
}

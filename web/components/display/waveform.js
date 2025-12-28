// Waveform Component - Envelope visualization with clipping display
// Draws envelope with clipping visualization based on current threshold

import { loadStyles } from '../../lib/component-loader.js';
import { getClippedColor, getClippedOutlineColor, getWaveformColors } from '../../lib/theme.js';
import { CurveType, applyWithCeiling } from '../../lib/saturation-curves.js';
import { DISPLAY_CONFIG } from '../../lib/config.js';

const DEFAULTS = {
  displayMinDb: DISPLAY_CONFIG.defaultMinDb,
  displayMaxDb: DISPLAY_CONFIG.maxCeilingDb,
  smoothingFactor: 0.3
};

export class Waveform {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'waveform';
    this.ctx = this.canvas.getContext('2d');
    this.data = null;
    this.threshold = 0;
    this.thresholdY = 0;
    this.bladeJitterFn = null;  // Function to get blade jitter offset at x
    this.active = true;  // When false, skip drawing clipped regions
    this.cutPosition = 1;  // 0 = cut at top (no clipping), 1 = cut at threshold (full clipping)

    // Soft clipping simulation
    this.curveMode = CurveType.Hard;  // 0=Hard, 1=Quintic, 2=Cubic, 3=Tanh, 4=Arctan, 5=T²
    this.ceilingLinear = 1.0;  // Threshold in linear amplitude
    this.curveExponent = 2.0;  // For T² mode: 1.0=linear, 2.0=squared, up to 4.0

    this.ready = this.init();
    this.render = this.render.bind(this);
    this.animationId = null;
  }

  async init() {
    if (!Waveform.stylesLoaded) {
      await loadStyles('components/display/waveform.css');
      Waveform.stylesLoaded = true;
    }
    this.container.appendChild(this.canvas);
  }

  setBounds(left, top, width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.left = left + 'px';
    this.canvas.style.top = top + 'px';
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.updateThresholdY();
  }

  setThreshold(value) {
    this.threshold = Math.max(0, Math.min(1, value));
    this.updateThresholdY();
  }

  setBladeJitter(jitterFn) {
    this.bladeJitterFn = jitterFn;
  }

  setActive(active) {
    this.active = active;
  }

  setCutPosition(value) {
    this.cutPosition = Math.max(0, Math.min(1, value));
  }

  setCurveMode(mode) {
    this.curveMode = mode;
  }

  setCeilingLinear(value) {
    this.ceilingLinear = Math.max(0.0001, value);
  }

  setCurveExponent(value) {
    this.curveExponent = Math.max(1.0, Math.min(4.0, value));
  }

  updateThresholdY() {
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    this.thresholdY = this.threshold * height;
  }

  updateData(data) {
    this.data = data;
  }

  start() {
    if (!this.animationId) {
      this.animationId = requestAnimationFrame(this.render);
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render() {
    this.draw();
    this.animationId = requestAnimationFrame(this.render);
  }

  draw() {
    if (!this.data) return;

    // Use preClip (input signal after input gain, before clipping) for display
    // We simulate clipping in JS using the saturation curves
    const { preClip: envelope, writePos } = this.data;
    const { smoothingFactor } = this.options;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    // Compute both raw input and soft-clipped output points
    const { rawPoints, clippedPoints } = this.computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor);

    // Get current colors from theme (force normal white when bypassed/inactive)
    const waveformColors = getWaveformColors(!this.active);
    const clippedColor = getClippedColor();
    const clippedOutlineColor = getClippedOutlineColor();

    // Create gradient for waveform fill (fades from top to bottom)
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, waveformColors.gradientTop);
    gradient.addColorStop(0.5, waveformColors.gradientMid);
    gradient.addColorStop(1, waveformColors.gradientBottom);

    // Draw RED (input/raw) as ghost waveform FIRST (behind white)
    // Only when actively clipping (cutPosition > 0)
    if (this.cutPosition > 0) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, height);
      for (let i = 0; i < rawPoints.length; i++) {
        this.ctx.lineTo(rawPoints[i].x, rawPoints[i].y);
      }
      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fillStyle = clippedColor;
      this.ctx.fill();

      // Red outline on raw waveform edge (only in delta mode)
      if (clippedOutlineColor) {
        this.ctx.beginPath();
        this.ctx.moveTo(rawPoints[0].x, rawPoints[0].y);
        for (let i = 1; i < rawPoints.length; i++) {
          this.ctx.lineTo(rawPoints[i].x, rawPoints[i].y);
        }
        this.ctx.strokeStyle = clippedOutlineColor;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    }

    // When bypassed, show raw waveform; when active, show clipped waveform
    const whitePoints = this.active ? clippedPoints : rawPoints;

    // Draw opaque black background ONLY where white waveform will be (blocks red from showing through)
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);
    for (let i = 0; i < whitePoints.length; i++) {
      this.ctx.lineTo(whitePoints[i].x, whitePoints[i].y);
    }
    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.save();
    this.ctx.clip();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.restore();

    // Draw WHITE waveform on top (clipped when active, raw when bypassed)
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);
    for (let i = 0; i < whitePoints.length; i++) {
      this.ctx.lineTo(whitePoints[i].x, whitePoints[i].y);
    }
    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    // Draw white outline on upper edge
    this.ctx.beginPath();
    this.ctx.moveTo(whitePoints[0].x, whitePoints[0].y);
    for (let i = 1; i < whitePoints.length; i++) {
      this.ctx.lineTo(whitePoints[i].x, whitePoints[i].y);
    }
    this.ctx.strokeStyle = waveformColors.outline;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor) {
    const { displayMinDb, displayMaxDb } = this.options;
    const rawPoints = [];      // Input signal (for RED ghost)
    const clippedPoints = [];  // Soft-clipped signal (for WHITE)
    const smoothWindow = Math.max(1, Math.floor(smoothingFactor * 10));

    for (let i = 0; i < pointsToShow; i++) {
      let sum = 0;
      let count = 0;
      for (let offset = -smoothWindow; offset <= smoothWindow; offset++) {
        const idx = Math.max(0, Math.min(pointsToShow - 1, i + offset));
        const bufIdx = (writePos - pointsToShow + idx + bufferSize * 2) % bufferSize;
        sum += envelope[bufIdx];
        count++;
      }
      const env = sum / count;  // Raw input amplitude

      const x = (i / (pointsToShow - 1)) * width;

      // Raw input point (for RED)
      const rawDb = env > 0 ? 20 * Math.log10(env) : displayMinDb;
      const rawNormDb = (rawDb - displayMinDb) / (displayMaxDb - displayMinDb);
      const rawY = height - Math.max(0, Math.min(1, rawNormDb)) * height;
      rawPoints.push({ x, y: rawY });

      // Soft-clipped output point (for WHITE)
      const clippedEnv = applyWithCeiling(this.curveMode, env, this.ceilingLinear, this.curveExponent);
      const clippedDb = clippedEnv > 0 ? 20 * Math.log10(clippedEnv) : displayMinDb;
      const clippedNormDb = (clippedDb - displayMinDb) / (displayMaxDb - displayMinDb);
      const clippedY = height - Math.max(0, Math.min(1, clippedNormDb)) * height;
      clippedPoints.push({ x, y: clippedY });
    }

    return { rawPoints, clippedPoints };
  }

  destroy() {
    this.stop();
    this.canvas.remove();
  }
}

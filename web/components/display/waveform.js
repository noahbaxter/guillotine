// Waveform Component - Envelope visualization with clipping display

import { loadStyles } from '../../lib/component-loader.js';
import { getClippedColor, getClippedOutlineColor, getWaveformColors } from '../../lib/theme.js';
import { applyJitter } from '../../lib/crt-effect.js';
import { applyWithCeiling } from '../../lib/saturation-curves.js';
import { DISPLAY_CONFIG, WAVEFORM_CONFIG } from '../../lib/config.js';

// Envelope follower tuning
const ENVELOPE = {
  readOffset: 4,          // Samples behind write head (race condition safety margin)
  releaseMs: 300,         // Decay time to 1% (higher = smoother, lower = snappier)
};

const RELEASE_COEFF = Math.exp(Math.log(0.01) / (ENVELOPE.releaseMs / 1000 * 100));

function smoothEnvelope(envelope, writePos, pointsToShow) {
  const bufferSize = envelope.length;
  const smoothed = new Float32Array(bufferSize);
  const startIdx = (writePos - pointsToShow - ENVELOPE.readOffset + bufferSize) % bufferSize;

  let env = 0;
  for (let i = 0; i < pointsToShow; i++) {
    const idx = (startIdx + i) % bufferSize;
    const raw = envelope[idx];
    if (raw >= env) {
      env = raw;  // Instant attack
    } else {
      env = raw + RELEASE_COEFF * (env - raw);  // Exponential decay
    }
    smoothed[idx] = env;
  }

  return smoothed;
}

export class Waveform {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = {
      displayMinDb: DISPLAY_CONFIG.defaultMinDb,
      displayMaxDb: DISPLAY_CONFIG.maxCeilingDb,
      ...options
    };
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'waveform';
    this.ctx = this.canvas.getContext('2d');

    // State
    this.data = null;
    this.active = true;
    this.cutPosition = 1;
    this.curveMode = 0;
    this.ceilingLinear = 1.0;
    this.curveExponent = 2.0;

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

  // Setters
  setBounds(left, top, width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    Object.assign(this.canvas.style, {
      left: left + 'px', top: top + 'px',
      width: width + 'px', height: height + 'px'
    });
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setActive(active) { this.active = active; }
  setCutPosition(v) { this.cutPosition = Math.max(0, Math.min(1, v)); }
  setCurveMode(mode) { this.curveMode = mode; }
  setCeilingLinear(v) { this.ceilingLinear = Math.max(0.0001, v); }
  setCurveExponent(v) { this.curveExponent = Math.max(1.0, Math.min(4.0, v)); }
  updateData(data) { this.data = data; }

  // Animation
  start() { if (!this.animationId) this.animationId = requestAnimationFrame(this.render); }
  stop() { if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; } }
  render() { this.draw(); this.animationId = requestAnimationFrame(this.render); }

  // Path helper - builds closed waveform path from points
  buildPath(points, width, height) {
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);
    for (const p of points) this.ctx.lineTo(p.x, p.y);
    this.ctx.lineTo(width, height);
    this.ctx.closePath();
  }

  // Stroke helper - draws outline along points
  strokePath(points) {
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
    this.ctx.stroke();
  }

  draw() {
    if (!this.data) return;

    const { preClip: envelope, writePos } = this.data;
    const { displayMinDb, displayMaxDb } = this.options;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;
    const pointsToShow = Math.min(bufferSize, WAVEFORM_CONFIG.pointsToShow);

    this.ctx.clearRect(0, 0, width, height);
    if (pointsToShow < 2) return;

    // Draw gridlines
    this.drawGridlines(width, height, displayMinDb, displayMaxDb);

    // Compute points
    const smoothed = smoothEnvelope(envelope, writePos, pointsToShow);
    const { rawPoints, clippedPoints } = this.computePoints(smoothed, writePos, pointsToShow, bufferSize, width, height);

    // Apply jitter
    const jitteredRaw = applyJitter(rawPoints);
    const jitteredClipped = applyJitter(clippedPoints);

    // Get colors
    const colors = getWaveformColors(!this.active);
    const clippedColor = getClippedColor();
    const clippedOutline = getClippedOutlineColor();

    // Draw red (raw input) ghost waveform behind white
    if (this.cutPosition > 0) {
      this.buildPath(jitteredRaw, width, height);
      this.ctx.fillStyle = clippedColor;
      this.ctx.fill();

      if (clippedOutline) {
        this.ctx.strokeStyle = clippedOutline;
        this.ctx.lineWidth = 1.5;
        this.strokePath(jitteredRaw);
      }
    }

    // Draw white (clipped output) waveform
    const points = this.active ? jitteredClipped : jitteredRaw;

    // Background fill to block red (skipped in delta mode to let red show through)
    if (colors.background) {
      this.buildPath(points, width, height);
      this.ctx.save();
      this.ctx.clip();
      this.ctx.fillStyle = colors.background;
      this.ctx.fillRect(0, 0, width, height);
      this.ctx.restore();
    }

    // Solid fill
    this.buildPath(points, width, height);
    this.ctx.fillStyle = colors.gradientTop;
    this.ctx.fill();

    // Outline
    this.ctx.strokeStyle = colors.outline;
    this.ctx.lineWidth = 1.5;
    this.strokePath(points);
  }

  drawGridlines(width, height, minDb, maxDb) {
    const dbRange = maxDb - minDb;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;

    for (let db = 0; db >= -DISPLAY_CONFIG.rangeDb; db -= WAVEFORM_CONFIG.gridStepDb) {
      if (db < minDb || db > maxDb) continue;
      const y = Math.round((maxDb - db) / dbRange * height) + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
  }

  computePoints(envelope, writePos, pointsToShow, bufferSize, width, height) {
    const { displayMinDb, displayMaxDb } = this.options;
    const dbRange = displayMaxDb - displayMinDb;
    const rawPoints = [];
    const clippedPoints = [];

    for (let i = 0; i < pointsToShow; i++) {
      const bufIdx = (writePos - pointsToShow - ENVELOPE.readOffset + i + bufferSize) % bufferSize;
      const env = envelope[bufIdx];
      const x = (i / (pointsToShow - 1)) * width;

      // Raw input (red)
      const rawDb = env > 0 ? 20 * Math.log10(env) : -100;
      const rawY = height - Math.min(1, (rawDb - displayMinDb) / dbRange) * height;
      rawPoints.push({ x, y: rawY });

      // Clipped output (white)
      const clippedEnv = applyWithCeiling(this.curveMode, env, this.ceilingLinear, this.curveExponent);
      const clippedDb = clippedEnv > 0 ? 20 * Math.log10(clippedEnv) : -100;
      const clippedY = height - Math.min(1, (clippedDb - displayMinDb) / dbRange) * height;
      clippedPoints.push({ x, y: clippedY });
    }

    return { rawPoints, clippedPoints };
  }

  destroy() {
    this.stop();
    this.canvas.remove();
  }
}

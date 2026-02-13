// Waveform Component - Envelope visualization with clipping display

import { loadStyles } from '../../lib/component-loader.js';
import { getClippedColor, getClippedOutlineColor, getWaveformColors } from '../../lib/theme.js';
import { applyJitter } from '../../lib/crt-effect.js';
import { applyWithCeiling } from '../../lib/saturation-curves.js';
import { DISPLAY_CONFIG, WAVEFORM_CONFIG } from '../../lib/config.js';

// Envelope display tuning
const ENVELOPE = {
  readOffset: 4,          // Samples behind write head (race condition safety margin)
  roundJoins: true,       // Round line joins/caps (softens corners for free)
  outlineRatio: 0.016,    // Outline width as fraction of canvas height
};

export class Waveform {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = {
      displayMinDb: DISPLAY_CONFIG.defaultMinDb,
      displayMaxDb: DISPLAY_CONFIG.displayMaxDb,
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
    this.pointsToShow = WAVEFORM_CONFIG.pointsToShow;
    this.gridStep = WAVEFORM_CONFIG.defaultGridStepDb;

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
  setPointsToShow(n) { this.pointsToShow = n; }
  updateData(data) { this.data = data; }

  // Animation
  start() { if (!this.animationId) this.animationId = requestAnimationFrame(this.render); }
  stop() { if (this.animationId) { cancelAnimationFrame(this.animationId); this.animationId = null; } }
  render() { this.draw(); this.animationId = requestAnimationFrame(this.render); }

  // Smooth curve through points using quadratic bezier via midpoints
  smoothCurveTo(points) {
    if (points.length < 3) {
      for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
      return;
    }
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    this.ctx.lineTo(midX, midY);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      this.ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
    }
    this.ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // Path helper - builds closed waveform path from points
  buildPath(points, width, height) {
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);
    this.ctx.lineTo(points[0].x, points[0].y);
    this.smoothCurveTo(points);
    this.ctx.lineTo(width, height);
    this.ctx.closePath();
  }

  // Stroke helper - draws outline along points
  strokePath(points) {
    if (ENVELOPE.roundJoins) {
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
    }
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    this.smoothCurveTo(points);
    this.ctx.stroke();
  }

  draw() {
    if (!this.data) return;

    const { preClip: envelope, writePos } = this.data;
    const { displayMinDb, displayMaxDb } = this.options;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;
    const pointsToShow = Math.min(bufferSize, this.pointsToShow);

    const outlineWidth = Math.max(1.5, height * ENVELOPE.outlineRatio);

    this.ctx.clearRect(0, 0, width, height);
    if (pointsToShow < 2) return;

    // Draw gridlines (lines only, labels drawn after waveform)
    this.drawGridlines(width, height, displayMinDb, displayMaxDb);

    // Compute points
    const { rawPoints, clippedPoints } = this.computePoints(envelope, writePos, pointsToShow, bufferSize, width, height);

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
        this.ctx.lineWidth = outlineWidth;
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
    this.ctx.lineWidth = outlineWidth;
    this.strokePath(points);

    // Draw dB labels on top of waveforms
    this.drawGridLabels(width, height, displayMinDb, displayMaxDb);
  }

  drawGridlines(width, height, minDb, maxDb) {
    const dbRange = maxDb - minDb;
    const step = this.gridStep;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;

    for (let db = 0; db >= -DISPLAY_CONFIG.rangeDb; db -= step) {
      if (db < minDb || db > maxDb) continue;
      const y = Math.round((maxDb - db) / dbRange * height) + 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
  }

  drawGridLabels(_width, height, minDb, maxDb) {
    const dbRange = maxDb - minDb;
    const step = this.gridStep;
    const fontSize = Math.max(8, height * 0.04);
    const labelPad = 6;
    const labelOffset = fontSize * 0.25;

    this.ctx.font = `${fontSize}px monospace`;
    this.ctx.textBaseline = 'top';

    for (let db = 0; db >= -DISPLAY_CONFIG.rangeDb; db -= step) {
      if (db < minDb || db > maxDb) continue;
      if (db === minDb) continue;

      const y = Math.round((maxDb - db) / dbRange * height) + 0.5;
      const label = (db >= 0 ? `+${db}` : `${db}`) + 'dB';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      this.ctx.fillText(label, labelPad, y + labelOffset);
    }

    // Top label — hide when range is too wide (36dB+)
    if (maxDb > 0 && dbRange <= 30) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      this.ctx.fillText(`+${maxDb}dB`, labelPad, labelPad);
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

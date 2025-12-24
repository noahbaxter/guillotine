// Waveform Component - Envelope visualization with clipping display
// Draws envelope with clipping visualization based on current threshold

import { loadStyles } from '../../lib/component-loader.js';

const DEFAULTS = {
  displayMinDb: -60,
  displayMaxDb: 0,
  smoothingFactor: 0.3,
  normalColor: 'rgba(255, 255, 255, 0.9)',
  clippedColor: 'rgba(180, 30, 30, 0.9)'
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

    const { envelope, writePos } = this.data;
    const { smoothingFactor, normalColor, clippedColor } = this.options;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    const points = this.computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor);
    const threshY = this.thresholdY;

    // Draw white fill (waveform capped at threshold)
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);

    for (let i = 0; i < pointsToShow; i++) {
      const x = points[i].x;
      const y = points[i].y;
      this.ctx.lineTo(x, Math.max(y, threshY));
    }

    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.fillStyle = normalColor;
    this.ctx.fill();

    // Draw red fill (portion above threshold)
    this.drawClippedRegions(points, threshY, clippedColor);
  }

  computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor) {
    const { displayMinDb, displayMaxDb } = this.options;
    const points = [];
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
      const env = sum / count;

      const x = (i / (pointsToShow - 1)) * width;
      const db = env > 0 ? 20 * Math.log10(env) : displayMinDb;
      const normDb = (db - displayMinDb) / (displayMaxDb - displayMinDb);
      const y = height - Math.max(0, Math.min(1, normDb)) * height;

      points.push({ x, y });
    }

    return points;
  }

  drawClippedRegions(points, threshY, color) {
    this.ctx.beginPath();
    let inClip = false;

    for (let i = 0; i < points.length; i++) {
      const { x, y } = points[i];
      const isClipped = y < threshY;

      if (isClipped) {
        if (!inClip) {
          this.ctx.moveTo(x, threshY);
          inClip = true;
        }
        this.ctx.lineTo(x, y);
      } else if (inClip) {
        this.ctx.lineTo(x, threshY);
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.beginPath();
        inClip = false;
      }
    }

    if (inClip) {
      const lastX = points[points.length - 1].x;
      this.ctx.lineTo(lastX, threshY);
      this.ctx.closePath();
      this.ctx.fillStyle = color;
      this.ctx.fill();
    }
  }

  destroy() {
    this.stop();
    this.canvas.remove();
  }
}

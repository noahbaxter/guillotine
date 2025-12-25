// Waveform Component - Envelope visualization with clipping display
// Draws envelope with clipping visualization based on current threshold

import { loadStyles } from '../../lib/component-loader.js';

const DEFAULTS = {
  displayMinDb: -60,
  displayMaxDb: 0,
  smoothingFactor: 0.3,
  clippedColor: 'rgba(120, 20, 20, 0.25)'  // Ghostly remnant of clipped signal
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
    const { smoothingFactor, clippedColor } = this.options;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    const points = this.computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor);
    const threshY = this.thresholdY;

    // Jittered threshold function
    const getJitteredThreshY = (x) => {
      if (this.bladeJitterFn) {
        return threshY + this.bladeJitterFn(x);
      }
      return threshY;
    };

    // Create gradient for waveform fill (fades from top to bottom)
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

    // Draw white fill (follows jittery blade edge)
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);

    const edge = [];
    for (let i = 0; i < pointsToShow; i++) {
      const x = points[i].x;
      const y = points[i].y;
      // Cap at jittered threshold (blade line)
      const jitteredThresh = getJitteredThreshY(x);
      const edgeY = Math.max(y, jitteredThresh);
      edge.push({ x, y: edgeY });
      this.ctx.lineTo(x, edgeY);
    }

    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.fillStyle = gradient;
    this.ctx.fill();

    // Draw white outline on upper edge (follows jitter)
    this.ctx.beginPath();
    this.ctx.moveTo(edge[0].x, edge[0].y);
    for (let i = 1; i < edge.length; i++) {
      this.ctx.lineTo(edge[i].x, edge[i].y);
    }
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Draw red fill (portion above threshold) - ghostly remnant
    this.drawClippedRegions(points, clippedColor, getJitteredThreshY);
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

  drawClippedRegions(points, color, getJitteredThreshY) {
    this.ctx.beginPath();
    let inClip = false;
    let clipStartX = 0;

    for (let i = 0; i < points.length; i++) {
      const { x, y } = points[i];
      const jitteredThreshY = getJitteredThreshY(x);
      const isClipped = y < jitteredThreshY;

      if (isClipped) {
        if (!inClip) {
          clipStartX = x;
          this.ctx.moveTo(x, jitteredThreshY);
          inClip = true;
        }
        this.ctx.lineTo(x, y);
      } else if (inClip) {
        this.ctx.lineTo(x, getJitteredThreshY(x));
        // Draw jagged bottom edge back to start
        for (let bx = x; bx >= clipStartX; bx -= 2) {
          this.ctx.lineTo(bx, getJitteredThreshY(bx));
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.beginPath();
        inClip = false;
      }
    }

    if (inClip) {
      const lastX = points[points.length - 1].x;
      this.ctx.lineTo(lastX, getJitteredThreshY(lastX));
      // Draw jagged bottom edge back to start
      for (let bx = lastX; bx >= clipStartX; bx -= 2) {
        this.ctx.lineTo(bx, getJitteredThreshY(bx));
      }
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

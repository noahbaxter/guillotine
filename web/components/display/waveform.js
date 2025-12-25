// Waveform Component - Envelope visualization with clipping display
// Draws envelope with clipping visualization based on current threshold

import { loadStyles } from '../../lib/component-loader.js';
import { getClippedColor, getClippedOutlineColor, getWaveformColors } from '../../lib/theme.js';

const DEFAULTS = {
  displayMinDb: -60,
  displayMaxDb: 0,
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
    const { smoothingFactor } = this.options;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    const points = this.computePoints(envelope, writePos, pointsToShow, bufferSize, width, height, smoothingFactor);

    // Effective threshold based on cutPosition: 0 = top (no clipping), 1 = at threshold (full clipping)
    const effectiveThreshY = this.thresholdY * this.cutPosition;

    // Jittered threshold function
    const getJitteredThreshY = (x) => {
      if (this.bladeJitterFn) {
        return effectiveThreshY + this.bladeJitterFn(x) * this.cutPosition;
      }
      return effectiveThreshY;
    };

    // Get current colors from theme
    const waveformColors = getWaveformColors();
    const clippedColor = getClippedColor();
    const clippedOutlineColor = getClippedOutlineColor();

    // Create gradient for waveform fill (fades from top to bottom)
    const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, waveformColors.gradientTop);
    gradient.addColorStop(0.5, waveformColors.gradientMid);
    gradient.addColorStop(1, waveformColors.gradientBottom);

    // Draw white fill (capped at blade edge when active, full when bypassed)
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);

    const edge = [];
    for (let i = 0; i < pointsToShow; i++) {
      const x = points[i].x;
      const y = points[i].y;
      // Cap at jittered threshold when cutting (cutPosition > 0)
      const edgeY = this.cutPosition > 0 ? Math.max(y, getJitteredThreshY(x)) : y;
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
    this.ctx.strokeStyle = waveformColors.outline;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Draw red fill (portion above threshold) - only when cutting (cutPosition > 0)
    if (this.cutPosition > 0) {
      this.drawClippedRegions(points, clippedColor, clippedOutlineColor, getJitteredThreshY);
    }
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

  drawClippedRegions(points, color, outlineColor, getJitteredThreshY) {
    this.ctx.beginPath();
    let inClip = false;
    let clipStartX = 0;
    const outlineSegments = [];  // Store outline points for each clipped region

    for (let i = 0; i < points.length; i++) {
      const { x, y } = points[i];
      const jitteredThreshY = getJitteredThreshY(x);
      const isClipped = y < jitteredThreshY;

      if (isClipped) {
        if (!inClip) {
          clipStartX = x;
          this.ctx.moveTo(x, jitteredThreshY);
          outlineSegments.push([]);  // Start new outline segment
          // Include entry point at threshold level for steep edge visibility
          outlineSegments[outlineSegments.length - 1].push({ x, y: jitteredThreshY });
          inClip = true;
        }
        this.ctx.lineTo(x, y);
        // Track the actual waveform point for outline
        if (outlineSegments.length > 0) {
          outlineSegments[outlineSegments.length - 1].push({ x, y });
        }
      } else if (inClip) {
        // Include exit point at threshold level for steep edge visibility
        const exitThreshY = getJitteredThreshY(x);
        if (outlineSegments.length > 0) {
          outlineSegments[outlineSegments.length - 1].push({ x, y: exitThreshY });
        }
        this.ctx.lineTo(x, exitThreshY);
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

    // Draw red outline on top edge of clipped regions (only in delta mode)
    if (outlineColor && outlineSegments.length > 0) {
      this.ctx.strokeStyle = outlineColor;
      this.ctx.fillStyle = outlineColor;
      this.ctx.lineWidth = 2;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      for (const segment of outlineSegments) {
        if (segment.length === 1) {
          // Single point - draw a small circle so it's visible
          this.ctx.beginPath();
          this.ctx.arc(segment[0].x, segment[0].y, 2, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (segment.length > 1) {
          this.ctx.beginPath();
          this.ctx.moveTo(segment[0].x, segment[0].y);
          for (let i = 1; i < segment.length; i++) {
            this.ctx.lineTo(segment[i].x, segment[i].y);
          }
          this.ctx.stroke();
        }
      }
    }
  }

  destroy() {
    this.stop();
    this.canvas.remove();
  }
}

// Waveform/Envelope Visualizer Component

const DEFAULTS = {
  minDb: -60,
  maxThresholdDb: 0,
  minThresholdDb: -24,
  smoothingFactor: 0.3,
  normalColor: 'rgba(255, 255, 255, 0.9)',
  clippedColor: 'rgba(180, 30, 30, 0.9)'
};

export class Visualizer {
  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.data = null;

    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    container.appendChild(this.canvas);

    this.render = this.render.bind(this);
    this.animationId = null;
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

    const { envelope, thresholds, writePos } = this.data;
    const { minDb, minThresholdDb, maxThresholdDb, smoothingFactor, normalColor, clippedColor } = this.options;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    // Apply smoothing
    const smoothed = this.smoothData(envelope, thresholds, writePos, pointsToShow, bufferSize, smoothingFactor);

    // Draw normal (white) fill
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);

    for (let i = 0; i < pointsToShow; i++) {
      const { x, y, thresholdY, isClipped } = this.getPointData(i, pointsToShow, width, height, smoothed, minDb, minThresholdDb, maxThresholdDb);
      this.ctx.lineTo(x, isClipped ? thresholdY : y);
    }

    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.fillStyle = normalColor;
    this.ctx.fill();

    // Draw clipped (red) portions
    this.drawClippedRegions(pointsToShow, width, height, smoothed, minDb, minThresholdDb, maxThresholdDb, clippedColor);
  }

  smoothData(envelope, thresholds, writePos, pointsToShow, bufferSize, factor) {
    const smoothedEnvelopes = [];
    const smoothedThresholds = [];
    const window = Math.max(1, Math.floor(factor * 10));

    for (let i = 0; i < pointsToShow; i++) {
      let sumEnv = 0, sumThresh = 0, count = 0;

      for (let offset = -window; offset <= window; offset++) {
        const idx = Math.max(0, Math.min(pointsToShow - 1, i + offset));
        const bufIdx = (writePos - pointsToShow + idx + bufferSize * 2) % bufferSize;
        sumEnv += envelope[bufIdx];
        sumThresh += thresholds[bufIdx];
        count++;
      }

      smoothedEnvelopes[i] = sumEnv / count;
      smoothedThresholds[i] = sumThresh / count;
    }

    return { envelopes: smoothedEnvelopes, thresholds: smoothedThresholds };
  }

  getPointData(i, pointsToShow, width, height, smoothed, minDb, minThresholdDb, maxThresholdDb) {
    const env = smoothed.envelopes[i];
    const thresh = smoothed.thresholds[i];
    const x = (i / (pointsToShow - 1)) * width;

    const db = env > 0 ? 20 * Math.log10(env) : minDb;
    const normDb = Math.max(0, Math.min(1, (db - minDb) / -minDb));
    const y = height - normDb * height;

    const threshDb = minThresholdDb + thresh * (maxThresholdDb - minThresholdDb);
    const threshLin = Math.pow(10, threshDb / 20);
    const threshDbVal = threshLin > 0 ? 20 * Math.log10(threshLin) : minDb;
    const normThreshDb = Math.max(0, Math.min(1, (threshDbVal - minDb) / -minDb));
    const thresholdY = height - normThreshDb * height;

    return { x, y, thresholdY, isClipped: env > threshLin };
  }

  drawClippedRegions(pointsToShow, width, height, smoothed, minDb, minThresholdDb, maxThresholdDb, color) {
    this.ctx.beginPath();
    let inClip = false;

    for (let i = 0; i < pointsToShow; i++) {
      const { x, y, thresholdY, isClipped } = this.getPointData(i, pointsToShow, width, height, smoothed, minDb, minThresholdDb, maxThresholdDb);

      if (isClipped) {
        if (!inClip) {
          this.ctx.moveTo(x, thresholdY);
          inClip = true;
        }
        this.ctx.lineTo(x, y);
      } else if (inClip) {
        this.ctx.lineTo(x, thresholdY);
        inClip = false;
      }
    }

    if (inClip) this.ctx.lineTo(width, height);

    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  destroy() {
    this.stop();
    this.canvas.remove();
  }
}

// Guillotine WebView UI

// === Constants ===
const MIN_DB = -60;
const MAX_THRESHOLD_DB = 0;
const MIN_THRESHOLD_DB = -24;
const SMOOTHING_FACTOR = 0.3;
const MAX_BLADE_TRAVEL = 0.35;
const ROPE_CLIP_OFFSET = 0.10;

// Waveform positioning (matching JUCE values)
const WAVEFORM_LEFT = 0.31;
const WAVEFORM_RIGHT = 0.69;
const WAVEFORM_TOP = 0.28;
const WAVEFORM_BOTTOM = 0.78;

// === Waveform Renderer ===
class WaveformRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.envelopeData = null;
    this.normalColor = 'rgba(255, 255, 255, 0.9)';
    this.clippedColor = 'rgba(180, 30, 30, 0.9)';
  }

  updateData(data) {
    this.envelopeData = data;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.scale(dpr, dpr);
  }

  draw() {
    if (!this.envelopeData) return;

    const { envelope, thresholds, writePos } = this.envelopeData;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const bufferSize = envelope.length;

    this.ctx.clearRect(0, 0, width, height);

    const pointsToShow = Math.min(bufferSize, Math.floor(width));
    if (pointsToShow < 2) return;

    // Apply smoothing
    const smoothedEnvelopes = [];
    const smoothedThresholds = [];
    const smoothingWindow = Math.max(1, Math.floor(SMOOTHING_FACTOR * 10));

    for (let i = 0; i < pointsToShow; i++) {
      let sumEnvelope = 0;
      let sumThreshold = 0;
      let count = 0;

      for (let offset = -smoothingWindow; offset <= smoothingWindow; offset++) {
        const smoothIndex = Math.max(0, Math.min(pointsToShow - 1, i + offset));
        const bufferIndex = (writePos - pointsToShow + smoothIndex + bufferSize * 2) % bufferSize;
        sumEnvelope += envelope[bufferIndex];
        sumThreshold += thresholds[bufferIndex];
        count++;
      }

      smoothedEnvelopes[i] = sumEnvelope / count;
      smoothedThresholds[i] = sumThreshold / count;
    }

    // Draw white (normal) fill
    this.ctx.beginPath();
    this.ctx.moveTo(0, height);

    for (let i = 0; i < pointsToShow; i++) {
      const env = smoothedEnvelopes[i];
      const pointThreshold = smoothedThresholds[i];
      const x = (i / (pointsToShow - 1)) * width;

      // Convert to dB scale
      const db = env > 0 ? 20 * Math.log10(env) : MIN_DB;
      const normalizedDb = Math.max(0, Math.min(1, (db - MIN_DB) / (0 - MIN_DB)));
      const y = height - normalizedDb * height;

      // Calculate threshold position
      const thresholdDb = MIN_THRESHOLD_DB + pointThreshold * (MAX_THRESHOLD_DB - MIN_THRESHOLD_DB);
      const thresholdLinear = Math.pow(10, thresholdDb / 20);
      const thresholdDbVal = thresholdLinear > 0 ? 20 * Math.log10(thresholdLinear) : MIN_DB;
      const normalizedThresholdDb = Math.max(0, Math.min(1, (thresholdDbVal - MIN_DB) / (0 - MIN_DB)));
      const thresholdY = height - normalizedThresholdDb * height;

      const isClipped = env > thresholdLinear;

      if (isClipped) {
        this.ctx.lineTo(x, thresholdY);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.lineTo(width, height);
    this.ctx.closePath();
    this.ctx.fillStyle = this.normalColor;
    this.ctx.fill();

    // Draw clipped portions (red)
    this.ctx.beginPath();
    let inClip = false;

    for (let i = 0; i < pointsToShow; i++) {
      const env = smoothedEnvelopes[i];
      const pointThreshold = smoothedThresholds[i];
      const x = (i / (pointsToShow - 1)) * width;

      const db = env > 0 ? 20 * Math.log10(env) : MIN_DB;
      const normalizedDb = Math.max(0, Math.min(1, (db - MIN_DB) / (0 - MIN_DB)));
      const y = height - normalizedDb * height;

      const thresholdDb = MIN_THRESHOLD_DB + pointThreshold * (MAX_THRESHOLD_DB - MIN_THRESHOLD_DB);
      const thresholdLinear = Math.pow(10, thresholdDb / 20);
      const thresholdDbVal = thresholdLinear > 0 ? 20 * Math.log10(thresholdLinear) : MIN_DB;
      const normalizedThresholdDb = Math.max(0, Math.min(1, (thresholdDbVal - MIN_DB) / (0 - MIN_DB)));
      const thresholdY = height - normalizedThresholdDb * height;

      const isClipped = env > thresholdLinear;

      if (isClipped) {
        if (!inClip) {
          this.ctx.moveTo(x, thresholdY);
          inClip = true;
        }
        this.ctx.lineTo(x, y);
      } else {
        if (inClip) {
          this.ctx.lineTo(x, thresholdY);
          inClip = false;
        }
      }
    }

    if (inClip) {
      this.ctx.lineTo(width, height);
    }

    this.ctx.fillStyle = this.clippedColor;
    this.ctx.fill();
  }
}

// === Guillotine Renderer ===
class GuillotineRenderer {
  constructor(container) {
    this.container = container;
    this.blade = container.querySelector('#blade');
    this.rope = container.querySelector('#rope');
    this.bladePosition = 0;
  }

  setBladePosition(position) {
    this.bladePosition = Math.max(0, Math.min(1, position));
    this.updateVisuals();
  }

  updateVisuals() {
    const containerHeight = this.container.clientHeight;
    const offset = this.bladePosition * MAX_BLADE_TRAVEL * containerHeight;

    this.blade.style.transform = 'translateY(' + offset + 'px)';

    const clipBottom = 100 - ((this.bladePosition * MAX_BLADE_TRAVEL + ROPE_CLIP_OFFSET) * 100);
    this.rope.style.clipPath = 'inset(0 0 ' + Math.max(0, clipBottom) + '% 0)';
  }
}

// === Main App ===
class GuillotineApp {
  constructor() {
    this.canvas = document.getElementById('waveform');
    this.container = document.getElementById('guillotine-container');
    this.clipSlider = document.getElementById('clip-slider');

    this.waveform = new WaveformRenderer(this.canvas);
    this.guillotine = new GuillotineRenderer(this.container);

    this.setupEventListeners();
    this.setupJuceBridge();
    this.positionWaveform();
    this.startRenderLoop();

    window.addEventListener('resize', () => this.positionWaveform());
  }

  setupEventListeners() {
    this.clipSlider.addEventListener('input', () => {
      const value = parseFloat(this.clipSlider.value);
      this.guillotine.setBladePosition(value);
      this.sendParameterToJuce('clip', value);
    });
  }

  setupJuceBridge() {
    window.updateEnvelope = (data) => {
      this.waveform.updateData(data);
    };

    window.setClipAmount = (amount) => {
      this.clipSlider.value = amount;
      this.guillotine.setBladePosition(amount);
    };
  }

  sendParameterToJuce(id, value) {
    if (window.__JUCE__ && window.__JUCE__.backend) {
      window.__JUCE__.backend.setParameter(id, value);
    }
  }

  positionWaveform() {
    const baseImg = document.getElementById('base');

    if (!baseImg.complete) {
      baseImg.onload = () => this.positionWaveform();
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    const imgAspect = baseImg.naturalWidth / baseImg.naturalHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let imgWidth, imgHeight;
    if (containerAspect > imgAspect) {
      imgHeight = containerRect.height;
      imgWidth = imgHeight * imgAspect;
    } else {
      imgWidth = containerRect.width;
      imgHeight = imgWidth / imgAspect;
    }

    const imgLeft = (containerRect.width - imgWidth) / 2;
    const imgTop = (containerRect.height - imgHeight) / 2;

    const waveLeft = imgLeft + WAVEFORM_LEFT * imgWidth;
    const waveTop = imgTop + WAVEFORM_TOP * imgHeight;
    const waveWidth = (WAVEFORM_RIGHT - WAVEFORM_LEFT) * imgWidth;
    const waveHeight = (WAVEFORM_BOTTOM - WAVEFORM_TOP) * imgHeight;

    this.canvas.style.left = waveLeft + 'px';
    this.canvas.style.top = waveTop + 'px';
    this.canvas.style.width = waveWidth + 'px';
    this.canvas.style.height = waveHeight + 'px';

    this.waveform.resize(waveWidth, waveHeight);
  }

  startRenderLoop() {
    const render = () => {
      this.waveform.draw();
      requestAnimationFrame(render);
    };
    render();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GuillotineApp());
} else {
  new GuillotineApp();
}

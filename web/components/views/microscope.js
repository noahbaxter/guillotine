// Microscope Component - Zoomed waveform view with draggable threshold line

import { loadStyles } from '../../lib/component-loader.js';
import { animateValue } from '../../lib/guillotine-utils.js';
import { Waveform } from '../display/waveform.js';
import { Digits } from '../display/digits.js';

const SCALE_PRESETS = [
  { label: '-24', minDb: -24 },
  { label: '-48', minDb: -48 },
  { label: '-60', minDb: -60 }
];

const MAX_JITTER = 20;

const DEFAULTS = {
  displayMinDb: -60,
  displayMaxDb: 0
};

export class Microscope {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.threshold = 0.5;
    this.sharpness = 1.0;  // 0 = dull/jittery, 1 = sharp/flat
    this.active = true;    // When false: dotted line, no red clipping
    this.cutPosition = 1;  // 0 = cut at top (no visible clipping), 1 = cut at threshold line
    this.cancelCutAnimation = null;
    this.bladeBasePattern = [];  // Fixed random pattern, scaled by sharpness when drawing
    this.lineYFrac = 0;
    this.onThresholdChange = null;
    this.onScaleChange = null;
    this.dragging = false;
    this.currentPresetIndex = 2;

    this.ready = this.init();
  }

  async init() {
    if (!Microscope.stylesLoaded) {
      await loadStyles('components/views/microscope.css');
      Microscope.stylesLoaded = true;
    }

    // Waveform area
    this.waveformArea = document.createElement('div');
    this.waveformArea.className = 'microscope__waveform';
    this.container.appendChild(this.waveformArea);

    // Scale button
    this.scaleButton = document.createElement('button');
    this.scaleButton.className = 'microscope__scale-btn';
    this.container.appendChild(this.scaleButton);

    // Threshold line container with canvas, label, and drag handle
    this.thresholdLine = document.createElement('div');
    this.thresholdLine.className = 'microscope__threshold-line';

    // Canvas for jittery blade line
    this.bladeCanvas = document.createElement('canvas');
    this.bladeCanvas.className = 'microscope__blade-canvas';
    this.thresholdLine.appendChild(this.bladeCanvas);

    this.thresholdLabelContainer = document.createElement('div');
    this.thresholdLabelContainer.className = 'microscope__threshold-label';
    this.thresholdLine.appendChild(this.thresholdLabelContainer);

    this.dragHandle = document.createElement('div');
    this.dragHandle.className = 'microscope__drag-handle';
    this.thresholdLine.appendChild(this.dragHandle);

    this.container.appendChild(this.thresholdLine);

    // Create waveform
    this.waveform = new Waveform(this.waveformArea, this.options);

    // Create digits for threshold label
    this.thresholdLabel = new Digits(this.thresholdLabelContainer, {
      scale: 0.3,
      color: 'red',
      glow: false
    });
    await this.thresholdLabel.ready;

    // Add dB suffix as sibling to digits (appended to container so it won't be cleared by render)
    this.dbSuffix = document.createElement('span');
    this.dbSuffix.className = 'microscope__db-suffix';
    this.dbSuffix.textContent = 'dB';
    this.thresholdLabelContainer.appendChild(this.dbSuffix);

    // External scale labels (in HTML, outside microscope)
    this.labelTop = document.getElementById('label-top');
    this.labelBottom = document.getElementById('label-bottom');
    if (this.labelBottom) {
      this.labelBottom.textContent = this.options.displayMinDb + 'dB';
    }

    this.updateScaleButtonText();
    this.bindEvents();
    this.updateFromThreshold();
  }

  updateScaleButtonText() {
    const preset = SCALE_PRESETS[this.currentPresetIndex];
    this.scaleButton.textContent = preset.label + 'dB';
  }

  yFracToDb(yFrac) {
    const { displayMinDb, displayMaxDb } = this.options;
    return displayMaxDb - yFrac * (displayMaxDb - displayMinDb);
  }

  dbToYFrac(db) {
    const { displayMinDb, displayMaxDb } = this.options;
    return (displayMaxDb - db) / (displayMaxDb - displayMinDb);
  }

  thresholdToDb(threshold) {
    return -threshold * 60;
  }

  dbToThreshold(db) {
    return Math.max(0, Math.min(1, -db / 60));
  }

  updateFromThreshold() {
    const threshDb = this.thresholdToDb(this.threshold);
    this.lineYFrac = this.dbToYFrac(threshDb);
    this.lineYFrac = Math.max(0, Math.min(1, this.lineYFrac));
    this.updateVisuals();
  }

  updateVisuals() {
    if (!this.thresholdLine) return;

    const rect = this.container.getBoundingClientRect();
    const y = this.lineYFrac * rect.height;
    this.thresholdLine.style.top = y + 'px';

    const db = this.yFracToDb(this.lineYFrac);
    this.thresholdLabel.setValue(db.toFixed(1));

    this.waveform.setThreshold(this.lineYFrac);
  }

  setScale(minDb) {
    this.options.displayMinDb = minDb;
    if (this.labelBottom) {
      this.labelBottom.textContent = minDb + 'dB';
    }
    this.waveform.options.displayMinDb = minDb;

    const idx = SCALE_PRESETS.findIndex(p => p.minDb === minDb);
    if (idx !== -1) this.currentPresetIndex = idx;
    this.updateScaleButtonText();

    this.updateFromThreshold();
    if (this.onScaleChange) this.onScaleChange(minDb);
  }

  cycleScale() {
    this.currentPresetIndex = (this.currentPresetIndex + 1) % SCALE_PRESETS.length;
    this.setScale(SCALE_PRESETS[this.currentPresetIndex].minDb);
  }

  bindEvents() {
    const onMouseDown = (e) => {
      this.dragging = true;
      this.thresholdLine.classList.add('microscope__threshold-line--dragging');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.dragging) return;

      const rect = this.container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const yFrac = Math.max(0, Math.min(1, y / rect.height));

      this.lineYFrac = yFrac;
      this.updateVisuals();

      const db = this.yFracToDb(yFrac);
      const newThreshold = this.dbToThreshold(db);

      if (newThreshold !== this.threshold) {
        this.threshold = newThreshold;
        if (this.onThresholdChange) {
          this.onThresholdChange(this.threshold);
        }
      }
    };

    const onMouseUp = () => {
      this.dragging = false;
      this.thresholdLine.classList.remove('microscope__threshold-line--dragging');
    };

    this.thresholdLine.addEventListener('mousedown', onMouseDown);
    this.dragHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.scaleButton.addEventListener('click', () => this.cycleScale());

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.cleanup = () => {
      this.thresholdLine.removeEventListener('mousedown', onMouseDown);
      this.dragHandle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.resizeObserver.disconnect();
    };
  }

  handleResize() {
    const rect = this.container.getBoundingClientRect();
    this.waveform.setBounds(0, 0, rect.width, rect.height);
    this.setupBladeCanvas(rect.width);
    this.updateVisuals();
  }

  setupBladeCanvas(width) {
    const dpr = window.devicePixelRatio || 1;
    const height = MAX_JITTER * 2;  // Tall enough for max jitter
    this.bladeCanvas.width = width * dpr;
    this.bladeCanvas.height = height * dpr;
    this.bladeCanvas.style.width = width + 'px';
    this.bladeCanvas.style.height = height + 'px';
    this.bladeWidth = width;
    this.bladeHeight = height;
    this.bladeDpr = dpr;
    this.generateBasePattern();
    this.drawJitteryBlade();
  }

  generateBasePattern() {
    this.bladeBasePattern = [];
    for (let x = 0; x <= this.bladeWidth; x += 2) {
      this.bladeBasePattern.push(Math.random() - 0.5);  // Normalized: -0.5 to 0.5
    }
    this.updateWaveformJitter();
  }

  updateWaveformJitter() {
    const pattern = this.bladeBasePattern;
    const sharpness = this.sharpness;
    this.waveform.setBladeJitter((x) => {
      const i = Math.floor(x / 2);
      const p = pattern[i] || 0;
      return p * (1 - sharpness) * MAX_JITTER;
    });
  }

  drawJitteryBlade() {
    if (!this.bladeCanvas || !this.bladeBasePattern.length) return;

    const ctx = this.bladeCanvas.getContext('2d');
    ctx.setTransform(this.bladeDpr, 0, 0, this.bladeDpr, 0, 0);
    ctx.clearRect(0, 0, this.bladeWidth, this.bladeHeight);

    const centerY = this.bladeHeight / 2;
    const jitterScale = (1 - this.sharpness) * MAX_JITTER;

    ctx.beginPath();
    ctx.moveTo(0, centerY + this.bladeBasePattern[0] * jitterScale);

    for (let i = 1; i < this.bladeBasePattern.length; i++) {
      const x = i * 2;
      const y = centerY + this.bladeBasePattern[i] * jitterScale;
      ctx.lineTo(x, y);
    }

    // Solid line when active, dotted when bypassed
    if (this.active) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(180, 30, 30, 0.9)';
      ctx.lineWidth = 2;
    } else {
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(200, 60, 60, 0.75)';
      ctx.lineWidth = 2.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  setSharpness(value) {
    this.sharpness = Math.max(0, Math.min(1, value));
    this.drawJitteryBlade();
    this.updateWaveformJitter();
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;

    // Cancel any in-progress animation
    if (this.cancelCutAnimation) {
      this.cancelCutAnimation();
    }

    // Animate cut position: 0 = top (no clipping visible), 1 = at threshold (full clipping)
    this.cancelCutAnimation = animateValue(this.cutPosition, active ? 1 : 0, {
      onFrame: (value) => {
        this.cutPosition = value;
        this.waveform.setCutPosition(value);
        this.drawJitteryBlade();
      },
      onComplete: () => {
        this.cancelCutAnimation = null;
      }
    });

    this.waveform.setActive(active);
  }

  showThresholdLabel() {
    this.thresholdLine.classList.add('microscope__threshold-line--dragging');
  }

  hideThresholdLabel() {
    this.thresholdLine.classList.remove('microscope__threshold-line--dragging');
  }

  setThreshold(value) {
    this.threshold = Math.max(0, Math.min(1, value));
    this.updateFromThreshold();
  }

  getThreshold() {
    return this.threshold;
  }

  getThresholdDb() {
    return this.thresholdToDb(this.threshold);
  }

  updateData(data) {
    this.waveform.updateData(data);
  }

  start() {
    this.handleResize();
    this.waveform.start();
  }

  stop() {
    this.waveform.stop();
  }

  destroy() {
    this.stop();
    if (this.cancelCutAnimation) this.cancelCutAnimation();
    if (this.cleanup) this.cleanup();
    this.waveform.destroy();
    this.thresholdLabel.destroy();
    this.thresholdLine.remove();
    this.waveformArea.remove();
    this.scaleButton.remove();
  }
}

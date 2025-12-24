// Microscope Component - Zoomed waveform view with draggable threshold line

import { loadStyles } from '../../lib/component-loader.js';
import { Visualizer } from '../visualizer/visualizer.js';
import { SpriteNumber } from '../sprite-number/sprite-number.js';

const SCALE_PRESETS = [
  { label: '-24', minDb: -24 },
  { label: '-48', minDb: -48 },
  { label: '-60', minDb: -60 }
];

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
    this.lineYFrac = 0;
    this.onThresholdChange = null;
    this.onScaleChange = null;
    this.dragging = false;
    this.currentPresetIndex = 2;

    this.ready = this.init();
  }

  async init() {
    if (!Microscope.stylesLoaded) {
      await loadStyles('components/microscope/microscope.css');
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

    // Threshold line with label and drag handle
    this.thresholdLine = document.createElement('div');
    this.thresholdLine.className = 'microscope__threshold-line';

    this.thresholdLabelContainer = document.createElement('div');
    this.thresholdLabelContainer.className = 'microscope__threshold-label';
    this.thresholdLine.appendChild(this.thresholdLabelContainer);

    this.dragHandle = document.createElement('div');
    this.dragHandle.className = 'microscope__drag-handle';
    this.thresholdLine.appendChild(this.dragHandle);

    this.container.appendChild(this.thresholdLine);

    // Create visualizer
    this.visualizer = new Visualizer(this.waveformArea, this.options);

    // Create sprite number for threshold label
    this.thresholdLabel = new SpriteNumber(this.thresholdLabelContainer, {
      scale: 0.45,
      color: 'red',
      glow: false
    });
    await this.thresholdLabel.ready;

    // Add dB suffix after sprite number
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

    this.visualizer.setThreshold(this.lineYFrac);
  }

  setScale(minDb) {
    this.options.displayMinDb = minDb;
    if (this.labelBottom) {
      this.labelBottom.textContent = minDb + 'dB';
    }
    this.visualizer.options.displayMinDb = minDb;

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
    this.visualizer.setBounds(0, 0, rect.width, rect.height);
    this.updateVisuals();
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
    this.visualizer.updateData(data);
  }

  start() {
    this.handleResize();
    this.visualizer.start();
  }

  stop() {
    this.visualizer.stop();
  }

  destroy() {
    this.stop();
    if (this.cleanup) this.cleanup();
    this.visualizer.destroy();
    this.thresholdLabel.destroy();
    this.thresholdLine.remove();
    this.waveformArea.remove();
    this.scaleButton.remove();
  }
}

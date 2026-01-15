// Microscope Component - Zoomed waveform view with draggable threshold line

import { loadStyles } from '../../lib/component-loader.js';
import { animateValue } from '../../lib/guillotine-utils.js';
import { setScale as setCrtScale } from '../../lib/crt-effect.js';
import { Waveform } from '../display/waveform.js';
import { Digits } from '../display/digits.js';
import { Dropdown } from '../controls/dropdown.js';
import { getThresholdColor, onDeltaModeChange } from '../../lib/theme.js';
import { SCALE_PRESETS, DISPLAY_CONFIG, DISPLAY_DB_RANGE } from '../../lib/config.js';
import { pxToEm, createDbSuffix } from '../../lib/utils.js';

const MAX_JITTER = 25;

const DEFAULTS = {
  displayMinDb: SCALE_PRESETS[DISPLAY_CONFIG.defaultScalePresetIndex].minDb,
  displayMaxDb: DISPLAY_CONFIG.maxCeilingDb
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
    this.currentPresetIndex = DISPLAY_CONFIG.defaultScalePresetIndex;

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

    // Scale dropdown
    this.scaleDropdownContainer = document.createElement('div');
    this.scaleDropdownContainer.className = 'microscope__scale-dropdown';
    this.container.appendChild(this.scaleDropdownContainer);

    this.scaleDropdown = new Dropdown(this.scaleDropdownContainer, {
      options: SCALE_PRESETS.map(p => ({ label: `${Math.abs(p.minDb)}dB`, value: p.minDb })),
      value: this.currentPresetIndex,
      onChange: (idx) => this.setScale(SCALE_PRESETS[idx].minDb)
    });

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
    const { container: dbSuffix } = createDbSuffix('microscope__db-suffix');
    this.thresholdLabelContainer.appendChild(dbSuffix);

    // External scale labels (in HTML, outside microscope) - use Digits for consistent transitions
    this.labelTop = document.getElementById('label-top');
    this.labelBottom = document.getElementById('label-bottom');
    const labelTopContainer = this.labelTop?.querySelector('.microscope-label__num');
    const labelBottomContainer = this.labelBottom?.querySelector('.microscope-label__num');

    if (labelTopContainer) {
      this.labelTopDigits = new Digits(labelTopContainer, { scale: 0.35 });
      this.labelTopDigits.ready.then(() => this.labelTopDigits.setValue('0'));
    }
    if (labelBottomContainer) {
      this.labelBottomDigits = new Digits(labelBottomContainer, { scale: 0.35 });
      this.labelBottomDigits.ready.then(() => this.labelBottomDigits.setValue(this.options.displayMinDb));
    }


    // Redraw blade when delta mode changes
    onDeltaModeChange(() => this.drawJitteryBlade());

    this.updateScaleDropdown();
    this.bindEvents();
    this.updateFromThreshold();
  }

  updateScaleDropdown() {
    this.scaleDropdown.setValue(this.currentPresetIndex);
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
    return -threshold * DISPLAY_DB_RANGE;
  }

  dbToThreshold(db) {
    return Math.max(0, Math.min(1, -db / DISPLAY_DB_RANGE));
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
  }

  setScale(minDb) {
    this.options.displayMinDb = minDb;
    if (this.labelBottomDigits) {
      this.labelBottomDigits.setValue(minDb);
    }
    this.waveform.options.displayMinDb = minDb;

    const idx = SCALE_PRESETS.findIndex(p => p.minDb === minDb);
    if (idx !== -1) this.currentPresetIndex = idx;
    this.updateScaleDropdown();

    this.updateFromThreshold();
    if (this.onScaleChange) this.onScaleChange(minDb);
  }

  cycleScale(direction = 1) {
    const len = SCALE_PRESETS.length;
    this.currentPresetIndex = (this.currentPresetIndex + direction + len) % len;
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

    // Scroll wheel to change scale (scroll up = zoom in = tighter range)
    const onWheel = (e) => {
      e.preventDefault();
      // Scroll up (negative deltaY) = zoom in = go to smaller range (e.g. -12)
      // Scroll down (positive deltaY) = zoom out = go to larger range (e.g. -60)
      const direction = e.deltaY > 0 ? 1 : -1;
      const newIndex = Math.max(0, Math.min(SCALE_PRESETS.length - 1, this.currentPresetIndex + direction));
      if (newIndex !== this.currentPresetIndex) {
        this.setScale(SCALE_PRESETS[newIndex].minDb);
      }
    };
    this.container.addEventListener('wheel', onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.cleanup = () => {
      this.thresholdLine.removeEventListener('mousedown', onMouseDown);
      this.dragHandle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.container.removeEventListener('wheel', onWheel);
      this.resizeObserver.disconnect();
    };
  }

  handleResize() {
    const rect = this.container.getBoundingClientRect();
    this.waveform.setBounds(0, 0, rect.width, rect.height);
    this.setupBladeCanvas(rect.width);
    this.updateVisuals();
    setCrtScale(rect.height);  // Scale CRT effects with container size
  }

  setupBladeCanvas(width) {
    const dpr = window.devicePixelRatio || 1;
    const heightPx = MAX_JITTER * 2;  // Tall enough for max jitter (40px at base)
    this.bladeCanvas.width = width * dpr;
    this.bladeCanvas.height = heightPx * dpr;
    this.bladeCanvas.style.width = '100%';
    this.bladeCanvas.style.height = pxToEm(heightPx) + 'em';
    this.bladeWidth = width;
    this.bladeHeight = heightPx;
    this.bladeDpr = dpr;
    this.generateBasePattern();
    this.drawJitteryBlade();
  }

  generateBasePattern() {
    this.bladeBasePattern = [];
    for (let x = 0; x <= this.bladeWidth; x += 2) {
      this.bladeBasePattern.push(Math.random() - 0.5);  // Normalized: -0.5 to 0.5
    }
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
    ctx.strokeStyle = getThresholdColor(this.active);
    if (this.active) {
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
    } else {
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  setSharpness(value) {
    this.sharpness = Math.max(0, Math.min(1, value));
    this.drawJitteryBlade();
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

  setCurveMode(mode) {
    this.waveform.setCurveMode(mode);
  }

  setCeilingLinear(value) {
    this.waveform.setCeilingLinear(value);
  }

  setCurveExponent(value) {
    this.waveform.setCurveExponent(value);
  }

  start() {
    this.handleResize();
    this.waveform.start();
    this.startEnvelopePolling();
  }

  stop() {
    this.stopEnvelopePolling();
    this.waveform.stop();
  }

  startEnvelopePolling() {
    if (this.envelopePollId) return;

    const poll = async () => {
      try {
        const response = await fetch('envelope.bin');
        if (!response.ok) return;

        const buffer = await response.arrayBuffer();
        // Binary format: 400 floats + 1 uint32 = 1604 bytes
        const floats = new Float32Array(buffer, 0, 400);
        const writePos = new DataView(buffer).getUint32(1600, true); // little-endian

        this.waveform.updateData({ preClip: floats, writePos });
      } catch {
        // Ignore fetch errors (e.g., during page load)
      }
    };

    // Poll at 60Hz (16.67ms)
    this.envelopePollId = setInterval(poll, 16);
    poll(); // Initial fetch
  }

  stopEnvelopePolling() {
    if (this.envelopePollId) {
      clearInterval(this.envelopePollId);
      this.envelopePollId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.cancelCutAnimation) this.cancelCutAnimation();
    if (this.cleanup) this.cleanup();
    this.waveform.destroy();
    this.thresholdLabel.destroy();
    if (this.labelTopDigits) this.labelTopDigits.destroy();
    if (this.labelBottomDigits) this.labelBottomDigits.destroy();
    this.scaleDropdown.destroy();
    this.thresholdLine.remove();
    this.waveformArea.remove();
    this.scaleDropdownContainer.remove();
  }
}

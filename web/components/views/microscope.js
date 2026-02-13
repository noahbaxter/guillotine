// Microscope Component - Zoomed waveform view with draggable threshold line

import { loadStyles } from '../../lib/component-loader.js';
import { animateValue } from '../../lib/guillotine-utils.js';
import { setScale as setCrtScale } from '../../lib/crt-effect.js';
import { Waveform } from '../display/waveform.js';
import { getThresholdColor, getNeonColors } from '../../lib/theme.js';
import { setGlowSource, isGlowing, onGlowChange, onSharpnessChange } from '../../lib/blade-state.js';
import { SCALE_PRESETS, TIME_PRESETS, DISPLAY_CONFIG, DISPLAY_DB_RANGE, WAVEFORM_CONFIG } from '../../lib/config.js';
import { pxToEm } from '../../lib/utils.js';

const MAX_JITTER = 25;

const DEFAULTS = {
  displayMinDb: SCALE_PRESETS[DISPLAY_CONFIG.defaultScalePresetIndex].minDb,
  displayMaxDb: DISPLAY_CONFIG.displayMaxDb
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
    this.hoverGlow = false;   // Hover state (threshold line)
    this.currentPresetIndex = DISPLAY_CONFIG.defaultScalePresetIndex;
    this.currentTimePresetIndex = WAVEFORM_CONFIG.defaultTimePresetIndex;

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

    // Scale trigger button + popup panel
    this.scaleTrigger = document.createElement('button');
    this.scaleTrigger.className = 'microscope__scale-trigger';
    this.scaleTrigger.textContent = '▾';
    this.container.appendChild(this.scaleTrigger);

    this.scalePanel = document.createElement('div');
    this.scalePanel.className = 'microscope__scale-panel';
    this.scalePanel.innerHTML = `
      <div class="microscope__scale-column" data-type="scale">
        <div class="microscope__scale-header">Scale</div>
        ${SCALE_PRESETS.map((p, i) => `<button class="microscope__scale-option" data-index="${i}">${p.minDb}dB</button>`).join('')}
      </div>
      <div class="microscope__scale-column" data-type="time">
        <div class="microscope__scale-header">Time</div>
        ${TIME_PRESETS.map((p, i) => `<button class="microscope__scale-option" data-index="${i}">${p.label}</button>`).join('')}
      </div>
    `;
    this.scaleTrigger.appendChild(this.scalePanel);

    this.scalePanel.addEventListener('click', (e) => {
      const option = e.target.closest('.microscope__scale-option');
      if (!option) return;
      const column = option.closest('.microscope__scale-column');
      const idx = parseInt(option.dataset.index, 10);
      if (column.dataset.type === 'scale') {
        this.setScale(SCALE_PRESETS[idx].minDb);
      } else {
        this.setTimeScale(idx);
      }
    });

    this.scaleTrigger.addEventListener('click', (e) => {
      if (e.target.closest('.microscope__scale-panel')) return;
      this.toggleScalePanel();
    });

    this.onScalePanelClickOutside = (e) => {
      if (!this.scaleTrigger.contains(e.target)) {
        this.closeScalePanel();
      }
    };
    document.addEventListener('click', this.onScalePanelClickOutside);

    // Threshold line container with canvas, label, and drag handle
    this.thresholdLine = document.createElement('div');
    this.thresholdLine.className = 'microscope__threshold-line';

    // Canvas for jittery blade line
    this.bladeCanvas = document.createElement('canvas');
    this.bladeCanvas.className = 'microscope__blade-canvas';
    this.thresholdLine.appendChild(this.bladeCanvas);

    this.dragHandle = document.createElement('div');
    this.dragHandle.className = 'microscope__drag-handle';
    this.thresholdLine.appendChild(this.dragHandle);

    this.container.appendChild(this.thresholdLine);

    // Create waveform
    this.waveform = new Waveform(this.waveformArea, this.options);

    // Subscribe to centralized blade state
    this.unsubGlow = onGlowChange(() => this.drawJitteryBlade());
    this.unsubSharpness = onSharpnessChange((value) => {
      this.sharpness = value;
      this.drawJitteryBlade();
    });

    this.updateScalePanel();
    this.bindEvents();
    this.updateFromThreshold();
  }

  toggleScalePanel() {
    const opening = !this.scalePanel.classList.contains('microscope__scale-panel--open');
    this.scalePanel.classList.toggle('microscope__scale-panel--open');
    this.scaleTrigger.classList.toggle('microscope__scale-trigger--open', opening);
  }

  closeScalePanel() {
    this.scalePanel.classList.remove('microscope__scale-panel--open');
    this.scaleTrigger.classList.remove('microscope__scale-trigger--open');
  }

  updateScalePanel() {
    const columns = this.scalePanel.querySelectorAll('.microscope__scale-column');
    columns.forEach(col => {
      const type = col.dataset.type;
      const activeIndex = type === 'scale' ? this.currentPresetIndex : this.currentTimePresetIndex;
      col.querySelectorAll('.microscope__scale-option').forEach((el, idx) => {
        el.classList.toggle('microscope__scale-option--active', idx === activeIndex);
      });
    });
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
  }

  setScale(minDb) {
    const preset = SCALE_PRESETS.find(p => p.minDb === minDb);
    this.options.displayMinDb = minDb;
    this.waveform.options.displayMinDb = minDb;

    if (preset) {
      this.options.displayMaxDb = preset.maxDb;
      this.waveform.options.displayMaxDb = preset.maxDb;
      this.waveform.gridStep = preset.gridStep;
      const idx = SCALE_PRESETS.indexOf(preset);
      if (idx !== -1) this.currentPresetIndex = idx;
    }
    this.updateScalePanel();

    this.updateFromThreshold();
    if (this.onScaleChange) this.onScaleChange(minDb);
  }

  cycleScale(direction = 1) {
    const len = SCALE_PRESETS.length;
    this.currentPresetIndex = (this.currentPresetIndex + direction + len) % len;
    this.setScale(SCALE_PRESETS[this.currentPresetIndex].minDb);
  }

  setTimeScale(index) {
    this.currentTimePresetIndex = index;
    const preset = TIME_PRESETS[index];
    const pointsToShow = preset.seconds * WAVEFORM_CONFIG.pointsPerSecond;
    this.waveform.setPointsToShow(pointsToShow);
    this.updateScalePanel();
  }

  bindEvents() {
    const onMouseEnter = () => {
      this.hoverGlow = true;
      this.updateGlow();
    };
    const onMouseLeave = () => {
      this.hoverGlow = false;
      this.updateGlow();
    };

    const onMouseDown = (e) => {
      this.dragging = true;
      this.updateGlow();
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.dragging) return;

      const rect = this.container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const minYFrac = this.dbToYFrac(0);  // 0dB ceiling limit
      const yFrac = Math.max(minYFrac, Math.min(1, y / rect.height));

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
      this.updateGlow();
    };

    this.dragHandle.addEventListener('mousedown', onMouseDown);
    this.dragHandle.addEventListener('mouseenter', onMouseEnter);
    this.dragHandle.addEventListener('mouseleave', onMouseLeave);
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
      this.dragHandle.removeEventListener('mousedown', onMouseDown);
      this.dragHandle.removeEventListener('mouseenter', onMouseEnter);
      this.dragHandle.removeEventListener('mouseleave', onMouseLeave);
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
    const glowPadding = 14;  // Room for neon glow shadow blur
    const heightPx = MAX_JITTER * 2 + glowPadding;
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

  updateGlow() {
    setGlowSource('lineHover', this.hoverGlow);
    setGlowSource('lineDrag', this.dragging);
  }

  drawJitteryBlade() {
    if (!this.bladeCanvas || !this.bladeBasePattern.length) return;

    const ctx = this.bladeCanvas.getContext('2d');
    ctx.setTransform(this.bladeDpr, 0, 0, this.bladeDpr, 0, 0);
    ctx.clearRect(0, 0, this.bladeWidth, this.bladeHeight);

    const centerY = this.bladeHeight / 2;
    const jitterScale = (1 - this.sharpness) * MAX_JITTER;

    const glowing = isGlowing();

    // Apply neon glow when hovering, dragging, or in delta mode
    if (glowing) {
      const neon = getNeonColors();
      ctx.shadowColor = neon.redGlow;
      ctx.shadowBlur = neon.glowBlur;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.moveTo(0, centerY + this.bladeBasePattern[0] * jitterScale);

    for (let i = 1; i < this.bladeBasePattern.length; i++) {
      const x = i * 2;
      const y = centerY + this.bladeBasePattern[i] * jitterScale;
      ctx.lineTo(x, y);
    }

    // Use neon color when glowing, normal threshold color otherwise
    if (glowing) {
      const neon = getNeonColors();
      ctx.strokeStyle = neon.red;
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
    } else if (this.active) {
      ctx.strokeStyle = getThresholdColor(true);
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = getThresholdColor(false);
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
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
        const floatCount = (buffer.byteLength - 4) / 4;
        const floats = new Float32Array(buffer, 0, floatCount);
        const writePos = new DataView(buffer).getUint32(floatCount * 4, true);

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
    if (this.unsubGlow) this.unsubGlow();
    if (this.unsubSharpness) this.unsubSharpness();
    if (this.cleanup) this.cleanup();
    this.waveform.destroy();
    document.removeEventListener('click', this.onScalePanelClickOutside);
    this.thresholdLine.remove();
    this.waveformArea.remove();
    this.scaleTrigger.remove();
  }
}

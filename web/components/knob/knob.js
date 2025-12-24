// Rotary Knob Component
// Drag-based rotary control for audio parameters

import { loadStyles } from '../../lib/component-loader.js';
import { SpriteNumber } from '../sprite-number/sprite-number.js';

const DEFAULTS = {
  min: 0,
  max: 1,
  value: 0,
  step: 0.01,
  sensitivity: 0.005,
  label: '',
  unit: '',
  formatValue: null,
  size: 60,
  useSprites: false,
  spriteScale: 0.4
};

export class Knob {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.options = { ...DEFAULTS, ...options };
    this.value = this.options.value;
    this.onChange = null;
    this.dragging = false;
    this.startY = 0;
    this.startValue = 0;
    this.element = null;

    this.ready = this.init();
  }

  async init() {
    if (!Knob.stylesLoaded) {
      await loadStyles('components/knob/knob.css');
      Knob.stylesLoaded = true;
    }

    const { size, label } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'knob-wrapper';

    if (label) {
      const labelEl = document.createElement('label');
      labelEl.className = 'knob__label';
      labelEl.textContent = label;
      this.element.appendChild(labelEl);
    }

    this.knobEl = document.createElement('div');
    this.knobEl.className = 'knob__dial';
    this.knobEl.style.width = `${size}px`;
    this.knobEl.style.height = `${size}px`;

    this.indicatorEl = document.createElement('div');
    this.indicatorEl.className = 'knob__indicator';
    this.indicatorEl.style.height = `${size * 0.3}px`;
    this.knobEl.appendChild(this.indicatorEl);

    this.element.appendChild(this.knobEl);

    this.valueDisplayEl = document.createElement('div');
    this.valueDisplayEl.className = 'knob__value';
    this.element.appendChild(this.valueDisplayEl);

    if (this.options.useSprites) {
      this.spriteNumber = new SpriteNumber(this.valueDisplayEl, { scale: this.options.spriteScale });
    }

    this.container.appendChild(this.element);
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    const onMouseDown = (e) => {
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = this.value;
      this.knobEl.classList.add('knob__dial--grabbing');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.dragging) return;

      const { min, max, sensitivity, step } = this.options;
      const delta = (this.startY - e.clientY) * sensitivity;
      let newValue = this.startValue + delta * (max - min);

      newValue = Math.round(newValue / step) * step;
      newValue = Math.max(min, Math.min(max, newValue));

      if (newValue !== this.value) {
        this.value = newValue;
        this.render();
        if (this.onChange) this.onChange(this.value);
      }
    };

    const onMouseUp = () => {
      this.dragging = false;
      this.knobEl.classList.remove('knob__dial--grabbing');
    };

    this.knobEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.cleanup = () => {
      this.knobEl.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  render() {
    if (!this.indicatorEl) return;

    const { min, max, unit, formatValue } = this.options;
    const normalized = (this.value - min) / (max - min);

    const rotation = -135 + normalized * 270;
    this.indicatorEl.style.transform = `translateX(-50%) rotate(${rotation}deg)`;

    let displayText;
    if (formatValue) {
      displayText = formatValue(this.value);
    } else {
      displayText = this.value.toFixed(2) + (unit ? ' ' + unit : '');
    }

    if (this.spriteNumber) {
      const numericOnly = displayText.replace(/[^0-9.\-]/g, '');
      this.spriteNumber.setValue(numericOnly);
    } else if (this.valueDisplayEl) {
      this.valueDisplayEl.textContent = displayText;
    }
  }

  setValue(value) {
    const { min, max } = this.options;
    this.value = Math.max(min, Math.min(max, value));
    this.render();
  }

  setRange(min, max) {
    this.options.min = min;
    this.options.max = max;
    this.value = Math.max(min, Math.min(max, this.value));
    this.render();
  }

  getValue() {
    return this.value;
  }

  destroy() {
    if (this.cleanup) this.cleanup();
    if (this.spriteNumber) this.spriteNumber.destroy();
    if (this.element) this.element.remove();
  }
}

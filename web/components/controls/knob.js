// Rotary Knob Component
// Drag-based rotary control for audio parameters

import { loadStyles } from '../../lib/component-loader.js';
import { pxToEm, createImageText } from '../../lib/utils.js';
import { Digits } from '../display/digits.js';

const DEFAULTS = {
  min: 0,
  max: 1,
  value: 0,
  step: 0.01,
  sensitivity: 0.005,
  label: null,       // { text, src } object for label, or just string for text-only
  unit: '',
  formatValue: null,
  parseValue: null,  // Optional: parse typed input back to value (e.g., "50%" -> 0.5)
  snapValue: null,   // Optional: snap dragged values to nice increments (e.g., clean dB values)
  size: 60,         // Size in px at base 16px font-size (will be converted to em)
  useSprites: false,
  spriteScale: 0.4,
  suffix: null,      // { text, src } object for suffix, or just string for text-only
  values: null       // Array of { text, src } for discrete values (index = rounded value)
};

export class Knob {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.options = { ...DEFAULTS, ...options };
    this.value = this.options.value;
    this.defaultValue = this.options.value;  // Store default for reset
    this.onChange = null;
    this.onDragStart = null;
    this.onDragEnd = null;
    this.dragging = false;
    this.editing = false;
    this.startY = 0;
    this.startValue = 0;
    this.element = null;

    this.ready = this.init();
  }

  async init() {
    if (!Knob.stylesLoaded) {
      await loadStyles('components/controls/knob.css');
      Knob.stylesLoaded = true;
    }

    const { size, label } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'knob-wrapper';
    if (this.options.sizeVariant) {
      this.element.classList.add(`knob-wrapper--${this.options.sizeVariant}`);
    }
    if (this.options.wrapperClass) {
      this.element.classList.add(this.options.wrapperClass);
    }

    // Label: accepts { text, src } object or plain string
    if (label) {
      if (typeof label === 'object' && label.src) {
        const { container } = createImageText(label, 'knob__label');
        this.element.appendChild(container);
      } else {
        const labelEl = document.createElement('label');
        labelEl.className = 'knob__label knob__label--text-only';
        labelEl.textContent = typeof label === 'object' ? label.text : label;
        this.element.appendChild(labelEl);
      }
    }

    this.knobEl = document.createElement('div');
    this.knobEl.className = 'knob__dial';
    const sizeEm = pxToEm(size);
    this.knobEl.style.width = `${sizeEm}em`;
    this.knobEl.style.height = `${sizeEm}em`;

    this.indicatorEl = document.createElement('div');
    this.indicatorEl.className = 'knob__indicator';
    const indicatorHeightEm = sizeEm * 0.3;
    const indicatorTopEm = sizeEm * 0.15;
    const knobCenterEm = sizeEm * 0.5;
    // Transform-origin Y as percentage of indicator height, measured from indicator top
    const originY = ((knobCenterEm - indicatorTopEm) / indicatorHeightEm) * 100;
    this.indicatorEl.style.height = `${indicatorHeightEm}em`;
    this.indicatorEl.style.top = `${indicatorTopEm}em`;
    this.indicatorEl.style.transformOrigin = `center ${originY}%`;
    this.knobEl.appendChild(this.indicatorEl);

    this.element.appendChild(this.knobEl);

    this.valueDisplayEl = document.createElement('div');
    this.valueDisplayEl.className = 'knob__value';
    this.element.appendChild(this.valueDisplayEl);

    this.container.appendChild(this.element);

    // Add deltable class for DELTA mode transitions
    this.element.classList.add('deltable');

    if (this.options.useSprites) {
      this.digits = new Digits(this.valueDisplayEl, { scale: this.options.spriteScale });

      // Suffix: accepts { text, src } object or plain string
      const { suffix } = this.options;
      if (suffix) {
        if (typeof suffix === 'object' && suffix.src) {
          const { container } = createImageText(suffix, 'knob__suffix');
          if (this.options.suffixVariant) {
            container.classList.add(`knob__suffix--${this.options.suffixVariant}`);
          }
          this.suffixEl = container;
        } else {
          this.suffixEl = document.createElement('span');
          this.suffixEl.className = 'knob__suffix knob__suffix--text-only';
          if (this.options.suffixVariant) {
            this.suffixEl.classList.add(`knob__suffix--${this.options.suffixVariant}`);
          }
          this.suffixEl.textContent = typeof suffix === 'object' ? suffix.text : suffix;
        }

        this.digits.ready.then(() => {
          this.valueDisplayEl.appendChild(this.suffixEl);
        });
      }
    }

    // Value images for discrete choice knobs (e.g., blade type)
    // Uses { text, src } array - text element hidden, image overlays
    if (this.options.values) {
      this.valueTextEl = document.createElement('span');
      this.valueTextEl.className = 'knob__value__text';
      this.valueDisplayEl.appendChild(this.valueTextEl);

      this.valueImgEl = document.createElement('img');
      this.valueImgEl.className = 'knob__value__image';
      this.valueDisplayEl.appendChild(this.valueImgEl);
    }

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    const onMouseDown = (e) => {
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = this.value;
      this.knobEl.classList.add('knob__dial--grabbing');
      if (this.onDragStart) this.onDragStart();
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.dragging) return;

      const { min, max, sensitivity, step, snapValue } = this.options;
      // Hold shift for fine control (0.1 sensitivity)
      const fineMode = e.shiftKey;
      const effectiveSensitivity = fineMode ? sensitivity * 0.1 : sensitivity;
      const delta = (this.startY - e.clientY) * effectiveSensitivity;
      let newValue = this.startValue + delta * (max - min);

      // Snap to nice values if snapValue function provided, otherwise use step
      // Pass fineMode to allow finer snapping when shift is held
      if (snapValue) {
        newValue = snapValue(newValue, fineMode);
      } else {
        const effectiveStep = fineMode ? step * 0.1 : step;
        newValue = Math.round(newValue / effectiveStep) * effectiveStep;
      }
      newValue = Math.max(min, Math.min(max, newValue));

      if (newValue !== this.value) {
        this.value = newValue;
        this.render();
        if (this.onChange) this.onChange(this.value);
      }
    };

    const onMouseUp = () => {
      if (this.dragging && this.onDragEnd) this.onDragEnd();
      this.dragging = false;
      this.knobEl.classList.remove('knob__dial--grabbing');
    };

    const onDoubleClick = () => {
      this.value = this.defaultValue;
      this.render();
      if (this.onChange) this.onChange(this.value);
    };

    const onValueDoubleClick = (e) => {
      e.stopPropagation();
      this.startEditing();
    };

    this.knobEl.addEventListener('mousedown', onMouseDown);
    this.knobEl.addEventListener('dblclick', onDoubleClick);
    // Only enable text editing if explicitly allowed (default: true)
    const allowTextEdit = this.options.allowTextEdit !== false;
    if (allowTextEdit) {
      this.valueDisplayEl.addEventListener('dblclick', onValueDoubleClick);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.cleanup = () => {
      this.knobEl.removeEventListener('mousedown', onMouseDown);
      this.knobEl.removeEventListener('dblclick', onDoubleClick);
      if (allowTextEdit) {
        this.valueDisplayEl.removeEventListener('dblclick', onValueDoubleClick);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  startEditing() {
    if (this.editing) return;
    this.editing = true;

    // Get current display text for the input
    const { formatValue } = this.options;
    let displayText = formatValue ? formatValue(this.value) : this.value.toFixed(2);

    // Create input element
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'knob__input';
    this.inputEl.value = displayText;

    // Hide current display, show input
    if (this.digits) {
      this.digits.hide();
    }
    if (this.suffixEl) {
      this.suffixEl.style.display = 'none';
    }
    this.valueDisplayEl.insertBefore(this.inputEl, this.valueDisplayEl.firstChild);

    // Focus and select all
    this.inputEl.focus();
    this.inputEl.select();

    // Start drag for undo/redo
    if (this.onDragStart) this.onDragStart();

    // Handle input events
    const commitEdit = () => {
      if (!this.editing) return;
      const inputValue = this.inputEl.value.trim();
      this.finishEditing(inputValue);
    };

    const cancelEdit = () => {
      if (!this.editing) return;
      this.finishEditing(null);
    };

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });

    this.inputEl.addEventListener('blur', commitEdit);
  }

  finishEditing(inputValue) {
    if (!this.editing) return;
    this.editing = false;

    // Remove input
    if (this.inputEl) {
      this.inputEl.remove();
      this.inputEl = null;
    }

    // Show display again
    if (this.digits) {
      this.digits.show();
    }
    if (this.suffixEl) {
      this.suffixEl.style.display = '';
    }

    // Parse and apply value if not cancelled
    if (inputValue !== null) {
      const newValue = this.parseInputValue(inputValue);
      if (newValue !== null && newValue !== this.value) {
        this.value = newValue;
        this.render();
        if (this.onChange) this.onChange(this.value);
      }
    }

    // End drag for undo/redo (delayed to let JUCE callback fire first)
    setTimeout(() => {
      if (this.onDragEnd) this.onDragEnd();
    }, 50);
  }

  parseInputValue(input) {
    const { min, max, parseValue } = this.options;

    // Use custom parser if provided
    if (parseValue) {
      const parsed = parseValue(input);
      if (parsed !== null && !isNaN(parsed)) {
        return Math.max(min, Math.min(max, parsed));
      }
      return null;
    }

    // Default: extract number from input
    const match = input.match(/-?\d+\.?\d*/);
    if (!match) return null;

    const num = parseFloat(match[0]);
    if (isNaN(num)) return null;

    return Math.max(min, Math.min(max, num));
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

    if (this.digits) {
      const numericOnly = displayText.replace(/[^0-9.\-]/g, '');
      this.digits.setValue(numericOnly);
    } else if (this.options.values && this.valueImgEl) {
      // Discrete value with { text, src } pairs (e.g., blade type)
      const index = Math.round(this.value);
      const valueData = this.options.values[index];
      if (valueData) {
        const text = valueData.text || displayText;
        if (valueData.src && this.valueImgEl.src !== valueData.src) {
          this.valueImgEl.src = valueData.src;
          this.valueImgEl.alt = text;
        }
        if (this.valueTextEl) {
          this.valueTextEl.textContent = text;
        }
      }
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

  setDisabled(disabled) {
    if (!this.element) return;
    if (disabled) {
      this.element.classList.add('knob-wrapper--disabled');
    } else {
      this.element.classList.remove('knob-wrapper--disabled');
    }
  }

  destroy() {
    if (this.cleanup) this.cleanup();
    if (this.digits) this.digits.destroy();
    if (this.element) this.element.remove();
  }
}

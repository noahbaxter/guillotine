// Rotary Knob Component
// Drag-based rotary control for audio parameters

const DEFAULTS = {
  min: 0,
  max: 1,
  value: 0,
  step: 0.01,
  sensitivity: 0.005,
  label: '',
  size: 60
};

export class Knob {
  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.value = this.options.value;
    this.onChange = null;
    this.dragging = false;
    this.startY = 0;
    this.startValue = 0;

    this.element = this.createElement();
    container.appendChild(this.element);

    this.bindEvents();
    this.render();
  }

  createElement() {
    const { size, label } = this.options;

    const wrapper = document.createElement('div');
    wrapper.className = 'knob-wrapper';
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      user-select: none;
    `;

    if (label) {
      const labelEl = document.createElement('label');
      labelEl.className = 'knob-label';
      labelEl.textContent = label;
      labelEl.style.cssText = `
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #fff;
      `;
      wrapper.appendChild(labelEl);
    }

    const knob = document.createElement('div');
    knob.className = 'knob';
    knob.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: linear-gradient(145deg, #3a3a3a, #2a2a2a);
      box-shadow: 0 4px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
      cursor: grab;
      position: relative;
    `;

    const indicator = document.createElement('div');
    indicator.className = 'knob-indicator';
    indicator.style.cssText = `
      position: absolute;
      width: 4px;
      height: ${size * 0.3}px;
      background: #888;
      border-radius: 2px;
      top: 8px;
      left: 50%;
      transform-origin: bottom center;
      transform: translateX(-50%);
    `;

    knob.appendChild(indicator);
    wrapper.appendChild(knob);

    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'knob-value';
    valueDisplay.style.cssText = `
      font-size: 11px;
      color: #888;
      font-family: monospace;
    `;
    wrapper.appendChild(valueDisplay);

    this.knobEl = knob;
    this.indicatorEl = indicator;
    this.valueDisplayEl = valueDisplay;

    return wrapper;
  }

  bindEvents() {
    const onMouseDown = (e) => {
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = this.value;
      this.knobEl.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!this.dragging) return;

      const { min, max, sensitivity, step } = this.options;
      const delta = (this.startY - e.clientY) * sensitivity;
      let newValue = this.startValue + delta * (max - min);

      // Snap to step
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
      this.knobEl.style.cursor = 'grab';
    };

    this.knobEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Store for cleanup
    this.cleanup = () => {
      this.knobEl.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  render() {
    const { min, max } = this.options;
    const normalized = (this.value - min) / (max - min);

    // Rotate from -135deg to 135deg (270deg range)
    const rotation = -135 + normalized * 270;
    this.indicatorEl.style.transform = `translateX(-50%) rotate(${rotation}deg)`;

    // Update value display
    this.valueDisplayEl.textContent = this.value.toFixed(2);
  }

  setValue(value) {
    const { min, max } = this.options;
    this.value = Math.max(min, Math.min(max, value));
    this.render();
  }

  getValue() {
    return this.value;
  }

  destroy() {
    if (this.cleanup) this.cleanup();
    this.element.remove();
  }
}

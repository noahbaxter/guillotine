// Toggle switch component using CSS background-images

export class Toggle {
  constructor(container, options = {}) {
    this.container = container;
    this.label = options.label || '';
    this.tooltip = options.tooltip || '';
    this.value = options.value ?? true;
    this.onChange = options.onChange || null;
    this.threeWay = options.threeWay ?? false;

    this.ready = this.init();
  }

  async init() {
    this.element = document.createElement('div');
    this.element.className = 'toggle-wrapper';

    this.element.innerHTML = `
      <div class="toggle-switch">
        <div class="toggle-click-zone"></div>
        <div class="toggle-state toggle-state--up"></div>
        <div class="toggle-state toggle-state--mid"></div>
        <div class="toggle-state toggle-state--down"></div>
      </div>
      ${this.label ? `<span class="toggle-label">${this.label}</span>` : ''}
      ${this.tooltip ? `<span class="toggle-tooltip">${this.tooltip}</span>` : ''}
    `;

    this.container.appendChild(this.element);

    this.switchEl = this.element.querySelector('.toggle-switch');
    this.clickZone = this.element.querySelector('.toggle-click-zone');

    this.clickZone.addEventListener('click', () => {
      if (this.threeWay) {
        // Cycle: true (up) -> null (mid) -> false (down) -> true
        if (this.value === true) this.setValue(null);
        else if (this.value === null) this.setValue(false);
        else this.setValue(true);
      } else {
        this.setValue(!this.value);
      }
      if (this.onChange) this.onChange(this.value);
    });

    this.updateVisual();
  }

  setValue(value) {
    this.value = value;
    this.updateVisual();
  }

  updateVisual() {
    // Toggle class controls which pre-rendered image is visible
    this.switchEl.classList.remove('toggle-switch--on', 'toggle-switch--off', 'toggle-switch--mid');

    if (this.threeWay && this.value === null) {
      this.switchEl.classList.add('toggle-switch--mid');
    } else if (this.value) {
      this.switchEl.classList.add('toggle-switch--on');
    } else {
      this.switchEl.classList.add('toggle-switch--off');
    }
  }

  getValue() {
    return this.value;
  }

  setDisabled(disabled) {
    this.element.classList.toggle('toggle--disabled', disabled);
  }

  setTooltip(text) {
    this.tooltip = text;
    const tooltipEl = this.element.querySelector('.toggle-tooltip');
    if (tooltipEl) {
      tooltipEl.textContent = text;
    }
  }
}

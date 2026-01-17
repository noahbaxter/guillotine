// Toggle switch component using layered SVG assets

export class Toggle {
  constructor(container, options = {}) {
    this.container = container;
    this.label = options.label || '';
    this.tooltip = options.tooltip || '';
    this.value = options.value ?? true;
    this.onChange = options.onChange || null;
    this.threeWay = options.threeWay ?? false;  // Support 3-way toggle (up/mid/down)

    this.ready = this.init();
  }

  async init() {
    this.element = document.createElement('div');
    this.element.className = 'toggle-wrapper';

    this.element.innerHTML = `
      <div class="toggle-switch ${this.value ? 'toggle-switch--on' : ''}">
        <img class="toggle-base" src="assets/switch-base.svg" alt="" draggable="false">
        <img class="toggle-stem" src="assets/switch-stem-up.svg" alt="toggle" draggable="false">
      </div>
      ${this.label ? `<span class="toggle-label">${this.label}</span>` : ''}
      ${this.tooltip ? `<span class="toggle-tooltip">${this.tooltip}</span>` : ''}
    `;

    this.container.appendChild(this.element);

    this.switchEl = this.element.querySelector('.toggle-switch');
    this.stemEl = this.element.querySelector('.toggle-stem');

    this.switchEl.addEventListener('click', () => {
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

    // Set initial visual state
    this.updateVisual();
  }

  setValue(value) {
    this.value = value;
    this.updateVisual();
  }

  updateVisual() {
    if (this.threeWay && this.value === null) {
      // Middle position
      this.stemEl.src = 'assets/switch-stem-mid.svg';
      this.switchEl.classList.remove('toggle-switch--on', 'toggle-switch--off');
      this.switchEl.classList.add('toggle-switch--mid');
    } else if (this.value) {
      // On = up
      this.stemEl.src = 'assets/switch-stem-up.svg';
      this.switchEl.classList.remove('toggle-switch--off', 'toggle-switch--mid');
      this.switchEl.classList.add('toggle-switch--on');
    } else {
      // Off = down (flipped)
      this.stemEl.src = 'assets/switch-stem-up.svg';
      this.switchEl.classList.remove('toggle-switch--on', 'toggle-switch--mid');
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

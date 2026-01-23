// Toggle switch component using CSS background-images

export class Toggle {
  constructor(container, options = {}) {
    this.container = container;
    this.label = options.label || '';
    this.tooltip = options.tooltip || '';
    // State-specific tooltips: { on, off } for 2-way, { on, mid, off } for 3-way
    this.tooltips = options.tooltips || null;
    this.value = options.value ?? true;
    this.onChange = options.onChange || null;
    this.threeWay = options.threeWay ?? false;
    // Icons: { on, off } for 2-way, { up, mid, down } for 3-way
    this.icons = options.icons || null;
    this.led = options.led ?? false;
    this.compact = options.compact ?? false; // Smaller wrapper for single-icon toggles
    this.midSide = options.midSide || 'left'; // 'right' or 'left' for mid icon position

    this.ready = this.init();
  }

  async init() {
    this.element = document.createElement('div');
    this.element.className = 'toggle-wrapper' + (this.compact ? ' toggle-wrapper--compact' : '');

    // Build icon HTML if provided
    const iconOn = this.icons?.on || this.icons?.up || '';
    const iconMid = this.icons?.mid || this.icons?.side || '';
    const iconOff = this.icons?.off || this.icons?.down || '';
    const midSideClass = this.midSide === 'left' ? 'toggle-icon--mid-left' : 'toggle-icon--mid-right';
    const hasTooltip = this.tooltip || this.tooltips;

    this.element.innerHTML = `
      ${iconOn ? `<div class="text-mask toggle-icon toggle-icon--on" style="--mask-src: url(${iconOn})"></div>` : ''}
      <div class="toggle-row">
        ${iconMid ? `<div class="text-mask toggle-icon toggle-icon--mid ${midSideClass}" style="--mask-src: url(${iconMid})"></div>` : ''}
        <div class="toggle-switch">
          <div class="toggle-click-zone"></div>
          <div class="toggle-layer toggle-layer--base"></div>
          <div class="toggle-layer toggle-layer--middle"></div>
          <div class="toggle-layer toggle-layer--stem"></div>
          ${this.led ? '<div class="toggle-led"></div>' : ''}
        </div>
      </div>
      ${iconOff ? `<div class="text-mask toggle-icon toggle-icon--off" style="--mask-src: url(${iconOff})"></div>` : ''}
      ${this.label ? `<span class="toggle-label">${this.label}</span>` : ''}
      ${hasTooltip ? `<span class="toggle-tooltip">${this.tooltip}</span>` : ''}
    `;

    this.container.appendChild(this.element);

    this.switchEl = this.element.querySelector('.toggle-switch');
    this.clickZone = this.element.querySelector('.toggle-click-zone');
    this.tooltipEl = this.element.querySelector('.toggle-tooltip');

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

    // Update tooltip if state-specific tooltips are provided
    if (this.tooltips && this.tooltipEl) {
      if (this.threeWay && this.value === null) {
        this.tooltipEl.textContent = this.tooltips.mid || '';
      } else if (this.value) {
        this.tooltipEl.textContent = this.tooltips.on || '';
      } else {
        this.tooltipEl.textContent = this.tooltips.off || '';
      }
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

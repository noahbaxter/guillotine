// Toggle switch component using CSS background-images

export class Toggle {
  constructor(container, options = {}) {
    this.container = container;
    this.label = options.label || '';
    // Per-icon tooltips: { on, off } for 2-way, { on, mid, off } for 3-way
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
    const tooltipOn = this.tooltips?.on || '';
    const tooltipMid = this.tooltips?.mid || '';
    const tooltipOff = this.tooltips?.off || '';

    this.element.innerHTML = `
      ${iconOn ? `<div class="toggle-icon-wrap toggle-icon--on" ${tooltipOn ? `data-tooltip="${tooltipOn}"` : ''}><div class="text-mask toggle-icon" style="--mask-src: url(${iconOn})"></div></div>` : ''}
      <div class="toggle-row">
        ${iconMid ? `<div class="toggle-icon-wrap toggle-icon--mid ${midSideClass}" ${tooltipMid ? `data-tooltip="${tooltipMid}"` : ''}><div class="text-mask toggle-icon" style="--mask-src: url(${iconMid})"></div></div>` : ''}
        <div class="toggle-switch">
          <div class="toggle-click-zone"></div>
          <div class="toggle-layer toggle-layer--base"></div>
          <div class="toggle-layer toggle-layer--middle"></div>
          <div class="toggle-layer toggle-layer--stem"></div>
          ${this.led ? '<div class="toggle-led"></div>' : ''}
        </div>
      </div>
      ${iconOff ? `<div class="toggle-icon-wrap toggle-icon--off" ${tooltipOff ? `data-tooltip="${tooltipOff}"` : ''}><div class="text-mask toggle-icon" style="--mask-src: url(${iconOff})"></div></div>` : ''}
      ${this.label ? `<span class="toggle-label">${this.label}</span>` : ''}
    `;

    this.container.appendChild(this.element);

    this.switchEl = this.element.querySelector('.toggle-switch');
    this.clickZone = this.element.querySelector('.toggle-click-zone');

    // Main toggle click cycles through states
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

    // Icon clicks jump directly to that state
    const iconOnEl = this.element.querySelector('.toggle-icon--on');
    const iconOffEl = this.element.querySelector('.toggle-icon--off');
    const iconMidEl = this.element.querySelector('.toggle-icon--mid');

    if (iconOnEl) {
      iconOnEl.addEventListener('click', () => {
        this.setValue(true);
        if (this.onChange) this.onChange(this.value);
      });
    }
    if (iconOffEl) {
      iconOffEl.addEventListener('click', () => {
        this.setValue(false);
        if (this.onChange) this.onChange(this.value);
      });
    }
    if (iconMidEl) {
      iconMidEl.addEventListener('click', () => {
        this.setValue(null);
        if (this.onChange) this.onChange(this.value);
      });
    }

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
}

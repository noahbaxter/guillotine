// Toggle switch component using switch.png asset

export class Toggle {
  constructor(container, options = {}) {
    this.container = container;
    this.label = options.label || '';
    this.value = options.value ?? true;
    this.onChange = options.onChange || null;

    this.ready = this.init();
  }

  async init() {
    this.element = document.createElement('div');
    this.element.className = 'toggle-wrapper';

    this.element.innerHTML = `
      <div class="toggle-switch ${this.value ? 'toggle-switch--on' : ''}">
        <img src="assets/switch.png" alt="toggle" draggable="false">
      </div>
      ${this.label ? `<span class="toggle-label">${this.label}</span>` : ''}
    `;

    this.container.appendChild(this.element);

    this.switchEl = this.element.querySelector('.toggle-switch');

    this.switchEl.addEventListener('click', () => {
      this.setValue(!this.value);
      if (this.onChange) this.onChange(this.value);
    });
  }

  setValue(value) {
    this.value = value;
    this.switchEl.classList.toggle('toggle-switch--on', value);
  }

  getValue() {
    return this.value;
  }

  setDisabled(disabled) {
    this.element.classList.toggle('toggle--disabled', disabled);
  }
}

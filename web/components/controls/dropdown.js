// Dropdown Component - Custom styled dropdown menu

import { loadStyles } from '../../lib/component-loader.js';

export class Dropdown {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.options = options.options || [];
    this.value = options.value ?? 0;
    this.onChange = options.onChange || null;

    this.ready = this.init();
  }

  async init() {
    if (!Dropdown.stylesLoaded) {
      await loadStyles('components/controls/dropdown.css');
      Dropdown.stylesLoaded = true;
    }

    this.el = document.createElement('div');
    this.el.className = 'dropdown';

    this.trigger = document.createElement('button');
    this.trigger.className = 'dropdown__trigger';
    this.el.appendChild(this.trigger);

    this.menu = document.createElement('div');
    this.menu.className = 'dropdown__menu';
    this.options.forEach((opt, idx) => {
      const item = document.createElement('button');
      item.className = 'dropdown__option';
      item.dataset.index = idx;
      item.textContent = opt.label;
      this.menu.appendChild(item);
    });
    this.el.appendChild(this.menu);

    this.container.appendChild(this.el);
    this.updateDisplay();
    this.bindEvents();
  }

  updateDisplay() {
    const opt = this.options[this.value];
    this.trigger.textContent = opt ? opt.label : '';
    this.menu.querySelectorAll('.dropdown__option').forEach((el, idx) => {
      el.classList.toggle('dropdown__option--active', idx === this.value);
    });
  }

  setValue(value) {
    if (value !== this.value && value >= 0 && value < this.options.length) {
      this.value = value;
      this.updateDisplay();
    }
  }

  bindEvents() {
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.classList.toggle('dropdown--open');
    });

    this.menu.addEventListener('click', (e) => {
      const option = e.target.closest('.dropdown__option');
      if (option) {
        const idx = parseInt(option.dataset.index, 10);
        this.value = idx;
        this.updateDisplay();
        this.el.classList.remove('dropdown--open');
        if (this.onChange) this.onChange(idx, this.options[idx]);
      }
    });

    this.onClickOutside = (e) => {
      if (!this.el.contains(e.target)) {
        this.el.classList.remove('dropdown--open');
      }
    };
    document.addEventListener('click', this.onClickOutside);
  }

  destroy() {
    document.removeEventListener('click', this.onClickOutside);
    this.el.remove();
  }
}

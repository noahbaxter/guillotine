// Sprite-based Number Display
// Renders numbers using individual digit images at their natural aspect ratios

import { loadStyles } from '../../lib/component-loader.js';

const ASSET_PATH = 'assets/numeric/';

export class Digits {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.scale = options.scale || 0.5;
    this.color = options.color || null;  // 'red', 'white', or null
    this.glow = options.glow || false;
    this.value = '';
    this.element = null;
    this.ready = this.init();
  }

  async init() {
    if (!Digits.stylesLoaded) {
      await loadStyles('components/display/digits.css');
      Digits.stylesLoaded = true;
    }

    this.element = document.createElement('div');
    this.element.className = 'digits';

    if (this.color) this.element.classList.add(`digits--${this.color}`);
    if (this.glow) this.element.classList.add('digits--glow');

    this.container.appendChild(this.element);
  }

  async setValue(value) {
    await this.ready;
    const str = String(value);
    if (str === this.value) return;
    this.value = str;
    this.render();
  }

  render() {
    if (!this.element) return;
    this.element.innerHTML = '';
    const s = this.scale;

    for (const char of this.value) {
      if (char >= '0' && char <= '9') {
        const cell = document.createElement('div');
        cell.className = 'digits__cell';
        cell.style.minWidth = `${24 * s}px`;

        const img = document.createElement('img');
        img.className = 'digits__digit';
        img.src = `${ASSET_PATH}num-${char}.png`;
        img.style.height = `${48 * s}px`;

        cell.appendChild(img);
        this.element.appendChild(cell);
      } else if (char === '.') {
        const cell = document.createElement('div');
        cell.className = 'digits__cell';
        cell.style.minWidth = `${8 * s}px`;

        const img = document.createElement('img');
        img.className = 'digits__dot';
        img.src = `${ASSET_PATH}num-dot.png`;
        img.style.height = `${9 * s}px`;

        cell.appendChild(img);
        this.element.appendChild(cell);
      } else if (char === '-') {
        const dash = document.createElement('div');
        dash.className = 'digits__dash';
        dash.style.cssText = `
          width: ${12 * s}px;
          height: ${3 * s}px;
          margin: 0 2px;
          margin-bottom: ${20 * s}px;
        `;
        this.element.appendChild(dash);
      }
    }
  }

  destroy() {
    if (this.element) this.element.remove();
  }
}

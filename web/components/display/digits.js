// Sprite-based Number Display
// Renders numbers using individual digit images as CSS masks for direct color control

import { loadStyles } from '../../lib/component-loader.js';

const ASSET_PATH = 'assets/numeric/';

export class Digits {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.scale = options.scale || 0.5;
    this.color = options.color || null;  // 'red', 'white', or null (inherits)
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

        const digit = document.createElement('div');
        digit.className = 'digits__digit';
        digit.style.height = `${48 * s}px`;
        digit.style.width = `${24 * s}px`;
        digit.style.maskImage = `url('${ASSET_PATH}num-${char}.png')`;
        digit.style.webkitMaskImage = `url('${ASSET_PATH}num-${char}.png')`;

        cell.appendChild(digit);
        this.element.appendChild(cell);
      } else if (char === '.') {
        const cell = document.createElement('div');
        cell.className = 'digits__cell';
        cell.style.minWidth = `${8 * s}px`;

        const dot = document.createElement('div');
        dot.className = 'digits__dot';
        dot.style.height = `${9 * s}px`;
        dot.style.width = `${8 * s}px`;
        dot.style.maskImage = `url('${ASSET_PATH}num-dot.png')`;
        dot.style.webkitMaskImage = `url('${ASSET_PATH}num-dot.png')`;

        cell.appendChild(dot);
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

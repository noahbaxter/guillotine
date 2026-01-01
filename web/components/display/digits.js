// Sprite-based Number Display
// Renders numbers using individual digit images as CSS masks for direct color control

import { loadStyles } from '../../lib/component-loader.js';
import { pxToEm } from '../../lib/utils.js';

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

    // Sprite container for image-based digits
    this.spriteContainer = document.createElement('div');
    this.spriteContainer.className = 'digits__sprites';
    this.element.appendChild(this.spriteContainer);

    // Text fallback for readable mode
    this.textEl = document.createElement('span');
    this.textEl.className = 'digits__text';
    this.element.appendChild(this.textEl);

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
    if (!this.spriteContainer) return;
    this.spriteContainer.innerHTML = '';
    const s = this.scale;

    // Update text fallback
    if (this.textEl) {
      this.textEl.textContent = this.value;
    }

    for (const char of this.value) {
      if (char >= '0' && char <= '9') {
        const cell = document.createElement('div');
        cell.className = 'digits__cell';
        cell.style.minWidth = `${pxToEm(24 * s)}em`;

        const digit = document.createElement('div');
        digit.className = 'digits__digit';
        digit.style.height = `${pxToEm(48 * s)}em`;
        digit.style.width = `${pxToEm(24 * s)}em`;
        digit.style.maskImage = `url('${ASSET_PATH}num-${char}.png')`;
        digit.style.webkitMaskImage = `url('${ASSET_PATH}num-${char}.png')`;

        cell.appendChild(digit);
        this.spriteContainer.appendChild(cell);
      } else if (char === '.') {
        const cell = document.createElement('div');
        cell.className = 'digits__cell';
        cell.style.minWidth = `${pxToEm(8 * s)}em`;

        const dot = document.createElement('div');
        dot.className = 'digits__dot';
        dot.style.height = `${pxToEm(9 * s)}em`;
        dot.style.width = `${pxToEm(8 * s)}em`;
        dot.style.maskImage = `url('${ASSET_PATH}num-dot.png')`;
        dot.style.webkitMaskImage = `url('${ASSET_PATH}num-dot.png')`;

        cell.appendChild(dot);
        this.spriteContainer.appendChild(cell);
      } else if (char === '-') {
        const dash = document.createElement('div');
        dash.className = 'digits__dash';
        dash.style.cssText = `
          width: ${pxToEm(12 * s)}em;
          height: ${pxToEm(3 * s)}em;
          margin: 0 ${pxToEm(2)}em;
          margin-bottom: ${pxToEm(20 * s)}em;
        `;
        this.spriteContainer.appendChild(dash);
      }
    }
  }

  hide() {
    if (this.element) this.element.style.display = 'none';
  }

  show() {
    if (this.element) this.element.style.display = '';
  }

  destroy() {
    if (this.element) this.element.remove();
  }
}

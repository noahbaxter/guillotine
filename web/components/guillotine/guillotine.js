// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

import { loadStyles } from '../../lib/component-loader.js';

const DEFAULTS = {
  maxBladeTravel: 0.35,
  ropeClipOffset: 0.10,
  images: {
    rope: 'assets/rope.png',
    blade: 'assets/blade.png',
    base: 'assets/base.png'
  }
};

export class Guillotine {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.position = 0;
    this.elements = {};

    this.ready = this.init();
  }

  async init() {
    if (!Guillotine.stylesLoaded) {
      await loadStyles('components/guillotine/guillotine.css');
      Guillotine.stylesLoaded = true;
    }

    this.element = document.createElement('div');
    this.element.className = 'guillotine';

    const { images } = this.options;
    ['rope', 'blade', 'base'].forEach((name) => {
      const img = document.createElement('img');
      img.className = `guillotine__layer guillotine__layer--${name}`;
      img.src = images[name];
      img.alt = '';
      this.element.appendChild(img);
      this.elements[name] = img;
    });

    this.container.appendChild(this.element);
    this.updateVisuals();
  }

  setPosition(value) {
    this.position = Math.max(0, Math.min(1, value));
    this.updateVisuals();
  }

  getPosition() {
    return this.position;
  }

  updateVisuals() {
    const { maxBladeTravel, ropeClipOffset } = this.options;
    const containerHeight = this.container.clientHeight;
    const offset = this.position * maxBladeTravel * containerHeight;

    if (this.elements.blade) {
      this.elements.blade.style.transform = `translateY(${offset}px)`;
    }

    if (this.elements.rope) {
      const clipBottom = 100 - ((this.position * maxBladeTravel + ropeClipOffset) * 100);
      this.elements.rope.style.clipPath = `inset(0 0 ${Math.max(0, clipBottom)}% 0)`;
    }
  }

  getBaseImage() {
    return this.elements.base;
  }

  destroy() {
    if (this.element) this.element.remove();
    this.elements = {};
  }
}

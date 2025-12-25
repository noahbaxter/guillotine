// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

import { loadStyles } from '../../lib/component-loader.js';
import { GUILLOTINE_CONFIG, animateValue } from '../../lib/guillotine-utils.js';

const DEFAULTS = {
  maxBladeTravel: 0.35,
  ropeClipOffset: 0.25,
  ...GUILLOTINE_CONFIG,
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
    this.position = 0;        // Current animated position (0 = up, 1 = down)
    this.active = false;      // Binary state: false = bypass (up), true = active (down)
    this.cancelAnimation = null;
    this.elements = {};

    this.ready = this.init();
  }

  async init() {
    if (!Guillotine.stylesLoaded) {
      await loadStyles('components/views/guillotine.css');
      Guillotine.stylesLoaded = true;
    }

    const { images } = this.options;
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="guillotine">
        <img class="guillotine__layer guillotine__layer--rope" src="${images.rope}" alt="">
        <img class="guillotine__layer guillotine__layer--blade" src="${images.blade}" alt="">
        <img class="guillotine__layer guillotine__layer--base" src="${images.base}" alt="">
      </div>
    `;

    this.element = template.content.querySelector('.guillotine');
    this.elements = {
      rope: this.element.querySelector('.guillotine__layer--rope'),
      blade: this.element.querySelector('.guillotine__layer--blade'),
      base: this.element.querySelector('.guillotine__layer--base')
    };

    this.container.appendChild(this.element);
    this.updateVisuals();
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.animateTo(active ? 1 : 0);
  }

  isActive() {
    return this.active;
  }

  toggle() {
    this.setActive(!this.active);
  }

  animateTo(targetPosition) {
    if (this.cancelAnimation) {
      this.cancelAnimation();
    }

    this.cancelAnimation = animateValue(this.position, targetPosition, {
      dropDuration: this.options.dropDuration,
      raiseDuration: this.options.raiseDuration,
      onFrame: (value) => {
        this.position = value;
        this.updateVisuals();
      },
      onComplete: () => {
        this.cancelAnimation = null;
      }
    });
  }

  updateVisuals() {
    const { maxBladeTravel, ropeClipOffset } = this.options;
    const containerHeight = this.container.clientHeight;
    // Blade wasn't traveling far enough without this multiplier - object-fit: contain
    // constrains the rendered image size, so we scale up the travel distance to match
    const offset = this.position * maxBladeTravel * (containerHeight * 1.25);

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
    if (this.cancelAnimation) this.cancelAnimation();
    if (this.element) this.element.remove();
    this.elements = {};
  }
}

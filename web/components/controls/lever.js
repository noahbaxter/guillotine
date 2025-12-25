// Lever Component
// Rotary lever that triggers guillotine activation

import { loadStyles } from '../../lib/component-loader.js';
import { animateLever } from '../../lib/guillotine-utils.js';

const DEFAULTS = {
  upAngle: 0,
  downAngle: -35
};

export class Lever {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.active = false;
    this.currentAngle = this.options.upAngle;
    this.cancelAnimation = null;
    this.onChange = null;

    this.ready = this.init();
  }

  async init() {
    if (!Lever.stylesLoaded) {
      await loadStyles('components/controls/lever.css');
      Lever.stylesLoaded = true;
    }

    this.element = document.createElement('div');
    this.element.className = 'lever';

    // Semicircle base at pivot point
    this.base = document.createElement('div');
    this.base.className = 'lever__base';

    // Lever arm with pivot at bottom
    this.arm = document.createElement('div');
    this.arm.className = 'lever__arm';

    // Handle/grip at top of lever
    this.handle = document.createElement('div');
    this.handle.className = 'lever__handle';
    this.arm.appendChild(this.handle);

    this.element.appendChild(this.base);
    this.element.appendChild(this.arm);
    this.container.appendChild(this.element);

    this.updateVisuals();
  }

  setActive(active, animate = true) {
    if (this.active === active) return;
    this.active = active;

    if (animate) {
      this.animateTo(active ? this.options.downAngle : this.options.upAngle);
    } else {
      this.currentAngle = active ? this.options.downAngle : this.options.upAngle;
      this.updateVisuals();
    }
  }

  isActive() {
    return this.active;
  }

  toggle() {
    this.setActive(!this.active);
    if (this.onChange) this.onChange(this.active);
  }

  animateTo(targetAngle) {
    if (this.cancelAnimation) {
      this.cancelAnimation();
    }

    this.cancelAnimation = animateLever(this.currentAngle, targetAngle, {
      onFrame: (value) => {
        this.currentAngle = value;
        this.updateVisuals();
      },
      onComplete: () => {
        this.cancelAnimation = null;
      }
    });
  }

  updateVisuals() {
    if (this.arm) {
      this.arm.style.transform = `rotate(${this.currentAngle}deg)`;
    }
  }

  destroy() {
    if (this.cancelAnimation) this.cancelAnimation();
    if (this.element) this.element.remove();
  }
}

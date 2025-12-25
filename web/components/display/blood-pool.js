// Blood Pool Component
// Simple blood pool that appears when guillotine is active

import { loadStyles } from '../../lib/component-loader.js';

export class BloodPool {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.container = container;
    this.active = false;

    this.ready = this.init();
  }

  async init() {
    if (!BloodPool.stylesLoaded) {
      await loadStyles('components/display/blood-pool.css');
      BloodPool.stylesLoaded = true;
    }

    const template = document.createElement('template');
    template.innerHTML = `
      <div class="blood-pool">
        <div class="blood-pool__puddle"></div>
      </div>
    `;

    this.element = template.content.querySelector('.blood-pool');
    this.puddleElement = this.element.querySelector('.blood-pool__puddle');
    this.container.appendChild(this.element);

    this.updateVisuals();
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.updateVisuals();
  }

  updateVisuals() {
    if (this.puddleElement) {
      this.puddleElement.style.opacity = this.active ? '1' : '0';
    }
  }

  destroy() {
    if (this.element) this.element.remove();
  }
}

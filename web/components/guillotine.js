// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

const DEFAULTS = {
  maxBladeTravel: 0.35,
  ropeClipOffset: 0.10,
  images: {
    rope: 'assets/rope.png',
    blade: 'assets/blade.png',
    base: 'assets/base.png',
    side: 'assets/side.png'
  }
};

export class Guillotine {
  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.position = 0;
    this.elements = {};

    this.createElements();
  }

  createElements() {
    const { images } = this.options;

    // Create image layers in order (back to front)
    const layers = ['rope', 'blade', 'base', 'side'];
    layers.forEach((name, index) => {
      const img = document.createElement('img');
      img.id = name;
      img.src = images[name];
      img.alt = '';
      img.style.cssText = `
        position: absolute;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        pointer-events: none;
        z-index: ${index + 1};
      `;
      this.container.appendChild(img);
      this.elements[name] = img;
    });

    // Initial rope clip
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

    // Move blade
    if (this.elements.blade) {
      this.elements.blade.style.transform = `translateY(${offset}px)`;
    }

    // Clip rope
    if (this.elements.rope) {
      const clipBottom = 100 - ((this.position * maxBladeTravel + ropeClipOffset) * 100);
      this.elements.rope.style.clipPath = `inset(0 0 ${Math.max(0, clipBottom)}% 0)`;
    }
  }

  getBaseImage() {
    return this.elements.base;
  }

  destroy() {
    Object.values(this.elements).forEach(el => el.remove());
    this.elements = {};
  }
}

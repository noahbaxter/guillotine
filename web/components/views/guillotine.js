// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

import { loadStyles } from '../../lib/component-loader.js';
import { GUILLOTINE_CONFIG, animateValue } from '../../lib/guillotine-utils.js';
import { BloodLine } from '../display/blood-line.js';

const DEFAULTS = {
  maxBladeTravel: 0.35,
  ceilingBladeTravel: 0.04,  // Additional blade travel from ceiling (0dB→-60dB)
  bypassUpOffset: 0.04,      // Downward nudge when blade is up (bypassed)
  bypassDownOffset: -0.09,   // Upward nudge when blade is down (active)
  bladeOutlineVerticalOffset: -0.065,   // Vertical offset for blade outline to align with old asset
  bladeOutlineHorizontalOffset: -0.003, // Horizontal offset for blade outline
  ropeClipOffsetUp: 0.1,     // Rope clip offset when blade is up
  ropeClipOffsetDown: 0.17,  // Rope clip offset when blade is down
  ...GUILLOTINE_CONFIG,
  images: {
    rope: 'assets/guillotine/rope.png',
    blade: 'assets/guillotine/blade.png',
    bladeOutline: 'assets/guillotine/blade-outline.png',
    base: 'assets/guillotine/base.png',
    baseOutline: 'assets/guillotine/base-outline.png'
  }
};

export class Guillotine {
  static stylesLoaded = false;

  constructor(container, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;
    this.position = 0;        // Current animated position (0 = up, 1 = down)
    this.active = false;      // Binary state: false = bypass (up), true = active (down)
    this.initialized = false; // Skip animations until markInitialized() is called
    this.cancelAnimation = null;
    this.elements = {};
    this.bloodLine = null;
    this.ceilingOffset = 0;   // 0 = 0dB (up), 1 = -60dB (down) - subtle blade shift

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
        <img class="guillotine__layer guillotine__layer--blade-outline" src="${images.bladeOutline}" alt="">
        <img class="guillotine__layer guillotine__layer--base" src="${images.base}" alt="">
        <img class="guillotine__layer guillotine__layer--base-outline" src="${images.baseOutline}" alt="">
      </div>
    `;

    this.element = template.content.querySelector('.guillotine');
    this.elements = {
      rope: this.element.querySelector('.guillotine__layer--rope'),
      blade: this.element.querySelector('.guillotine__layer--blade'),
      bladeOutline: this.element.querySelector('.guillotine__layer--blade-outline'),
      base: this.element.querySelector('.guillotine__layer--base'),
      baseOutline: this.element.querySelector('.guillotine__layer--base-outline')
    };

    this.container.appendChild(this.element);

    // Add deltable class to container for DELTA mode transitions
    this.element.classList.add('deltable');

    // Create blood line - normal canvas inside guillotine, delta canvas in parent container
    this.bloodLine = new BloodLine(this.element, this.container);

    this.updateVisuals();

    // Re-setup on resize
    this.resizeObserver = new ResizeObserver(() => {
      this.bloodLine.resize();
      this.updateVisuals();
    });
    this.resizeObserver.observe(document.body);
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.animateTo(active ? 1 : 0);
  }

  markInitialized() {
    this.initialized = true;
  }

  isActive() {
    return this.active;
  }

  toggle() {
    this.setActive(!this.active);
  }

  animateTo(target) {
    // Skip animation before initialization
    if (!this.initialized) {
      this.position = target;
      this.updateVisuals();
      return;
    }

    if (this.cancelAnimation) {
      this.cancelAnimation();
    }

    this.cancelAnimation = animateValue(this.position, target, {
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

  getBladeOffset() {
    const { maxBladeTravel, ceilingBladeTravel, bypassUpOffset, bypassDownOffset } = this.options;
    const h = this.container.clientHeight;
    const bypassOffset = this.position * maxBladeTravel * h;
    // Ceiling offset: 0dB (ceilingOffset=0) = up, -60dB (ceilingOffset=1) = down
    // Centered around 0.5 so old baseline is at -30dB
    const ceilingShift = (this.ceilingOffset - 0.5) * 2 * ceilingBladeTravel * h;
    // Downward nudge when blade is up (bypassed) so it doesn't sit too high
    const upOffset = (1 - this.position) * bypassUpOffset * h;
    // Upward nudge when blade is down (active)
    const downOffset = -this.position * bypassDownOffset * h;
    return bypassOffset + ceilingShift + upOffset + downOffset;
  }

  updateVisuals() {
    const { bladeOutlineVerticalOffset, bladeOutlineHorizontalOffset, ropeClipOffsetUp, ropeClipOffsetDown } = this.options;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const offset = this.getBladeOffset();

    // Apply blade transform
    if (this.elements.blade) {
      this.elements.blade.style.transform = `translateY(${offset}px)`;
    }
    // Blade outline needs its own offset to align with old asset
    const outlineOffsetX = bladeOutlineHorizontalOffset * w;
    const outlineOffsetY = offset + (bladeOutlineVerticalOffset * h);
    if (this.elements.bladeOutline) {
      this.elements.bladeOutline.style.transform = `translate(${outlineOffsetX}px, ${outlineOffsetY}px)`;
    }

    // Update blood line position
    if (this.bloodLine) {
      this.bloodLine.update(offset);
    }

    // Rope clip - interpolate offset based on position
    const ropeClipOffset = ropeClipOffsetUp + (ropeClipOffsetDown - ropeClipOffsetUp) * this.position;
    const ropeMovement = offset / h;
    const clipBottom = 100 - ((ropeMovement + ropeClipOffset) * 100);

    if (this.elements.rope) {
      this.elements.rope.style.clipPath = `inset(0 0 ${Math.max(0, clipBottom)}% 0)`;
    }
  }

  getBaseImage() {
    return this.elements.base;
  }

  destroy() {
    if (this.cancelAnimation) this.cancelAnimation();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.bloodLine) this.bloodLine.destroy();
    if (this.element) this.element.remove();
    this.elements = {};
  }

  setCeilingOffset(value) {
    this.ceilingOffset = Math.max(0, Math.min(1, value));
    this.updateVisuals();
  }

  setDryWet(value) {
    const clamped = Math.max(0, Math.min(1, value));
    if (this.elements.blade) {
      this.elements.blade.style.opacity = clamped;
    }
    if (this.elements.base) {
      this.elements.base.style.opacity = clamped;
    }
  }
}

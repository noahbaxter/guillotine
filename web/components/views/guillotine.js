// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

import { loadStyles } from '../../lib/component-loader.js';
import { GUILLOTINE_CONFIG, animateValue } from '../../lib/guillotine-utils.js';

const DEFAULTS = {
  maxBladeTravel: 0.35,
  ropeClipOffset: 0.25,
  bloodLineMaxJitter: 8,
  // Blood line endpoints (x, y) - relative to guillotine container
  bloodLineP1: { x: 100, y: 70 },   // Left point (upper)
  bloodLineP2: { x: 180, y: 110 },  // Right point (lower)
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
    this.sharpness = 1.0;     // 0 = dull/jittery, 1 = sharp/flat
    this.bloodPattern = [];   // Random pattern for blood line jitter

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
        <canvas class="guillotine__layer guillotine__layer--blood-line"></canvas>
        <img class="guillotine__layer guillotine__layer--base" src="${images.base}" alt="">
      </div>
    `;

    this.element = template.content.querySelector('.guillotine');
    this.elements = {
      rope: this.element.querySelector('.guillotine__layer--rope'),
      blade: this.element.querySelector('.guillotine__layer--blade'),
      bloodLine: this.element.querySelector('.guillotine__layer--blood-line'),
      base: this.element.querySelector('.guillotine__layer--base')
    };

    this.container.appendChild(this.element);
    this.setupBloodLine();
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

  getBladeOffset() {
    const containerHeight = this.container.clientHeight;
    // Blade wasn't traveling far enough without this multiplier - object-fit: contain
    // constrains the rendered image size, so we scale up the travel distance to match
    return this.position * this.options.maxBladeTravel * (containerHeight * 1.25);
  }

  updateVisuals() {
    const { ropeClipOffset, maxBladeTravel } = this.options;
    const offset = this.getBladeOffset();

    if (this.elements.blade) {
      this.elements.blade.style.transform = `translateY(${offset}px)`;
    }

    this.drawBloodLine();

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

  setupBloodLine() {
    const canvas = this.elements.bloodLine;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';

    this.bloodDpr = dpr;
    this.generateBloodPattern();
    this.drawBloodLine();
  }

  generateBloodPattern() {
    const { bloodLineP1, bloodLineP2 } = this.options;
    const dx = bloodLineP2.x - bloodLineP1.x;
    const dy = bloodLineP2.y - bloodLineP1.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    this.bloodPattern = [];
    for (let i = 0; i <= lineLength; i += 2) {
      this.bloodPattern.push(Math.random() - 0.5);
    }
  }

  drawBloodLine() {
    const canvas = this.elements.bloodLine;
    if (!canvas || !this.bloodPattern.length) return;

    const ctx = canvas.getContext('2d');
    const { bloodLineP1, bloodLineP2, bloodLineMaxJitter } = this.options;
    const offset = this.getBladeOffset();

    // Apply blade offset to both points
    const p1 = { x: bloodLineP1.x, y: bloodLineP1.y + offset };
    const p2 = { x: bloodLineP2.x, y: bloodLineP2.y + offset };

    ctx.setTransform(this.bloodDpr, 0, 0, this.bloodDpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / this.bloodDpr, canvas.height / this.bloodDpr);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);

    // Perpendicular vector for jitter
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const jitterScale = (1 - this.sharpness) * bloodLineMaxJitter;

    ctx.beginPath();
    ctx.moveTo(p1.x + perpX * this.bloodPattern[0] * jitterScale, p1.y + perpY * this.bloodPattern[0] * jitterScale);

    for (let i = 1; i < this.bloodPattern.length; i++) {
      const progress = i / this.bloodPattern.length;
      const x = p1.x + dx * progress + perpX * this.bloodPattern[i] * jitterScale;
      const y = p1.y + dy * progress + perpY * this.bloodPattern[i] * jitterScale;
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = 'rgba(139, 0, 0, 0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  setSharpness(value) {
    this.sharpness = Math.max(0, Math.min(1, value));
    this.drawBloodLine();
  }
}

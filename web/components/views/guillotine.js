// Guillotine Visual Component
// Handles layered PNG rendering with animated blade

import { loadStyles } from '../../lib/component-loader.js';
import { GUILLOTINE_CONFIG, animateValue } from '../../lib/guillotine-utils.js';
import { getBloodColors, onDeltaModeChange } from '../../lib/theme.js';

// Blood line endpoints as percentages of the BLADE IMAGE (not container)
// Original px values: P1(100, 63), P2(180, 98) on the blade image
// Blade image natural size: 300x344
const BLADE_NATURAL = { width: 300, height: 344 };
const BLOOD_LINE_P1 = { x: 108, y: 63 };
const BLOOD_LINE_P2 = { x: 188, y: 98 };

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

// Calculate rendered image bounds for object-fit: contain
function getContainedImageBounds(containerWidth, containerHeight, imageWidth, imageHeight) {
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;

  let renderedWidth, renderedHeight, offsetX, offsetY;

  if (imageRatio > containerRatio) {
    // Image is wider - constrained by width
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / imageRatio;
    offsetX = 0;
    offsetY = (containerHeight - renderedHeight) / 2;
  } else {
    // Image is taller - constrained by height
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * imageRatio;
    offsetX = (containerWidth - renderedWidth) / 2;
    offsetY = 0;
  }

  return { renderedWidth, renderedHeight, offsetX, offsetY };
}

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

    // Add deltable class for DELTA mode transitions
    this.elements.rope.classList.add('deltable');
    this.elements.blade.classList.add('deltable');
    this.elements.base.classList.add('deltable');

    // Redraw blood line when delta mode changes
    onDeltaModeChange(() => this.drawBloodLine());

    this.setupBloodLine();
    this.updateVisuals();

    // Re-setup on resize to fix canvas size and positions
    this.resizeObserver = new ResizeObserver(() => {
      this.setupBloodLine();
      this.updateVisuals();
    });
    this.resizeObserver.observe(document.body);
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
    if (this.resizeObserver) this.resizeObserver.disconnect();
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
    // Generate a fixed number of random points for the jitter pattern
    // This will be interpolated along the line at any size
    const patternLength = 50;
    this.bloodPattern = [];
    for (let i = 0; i <= patternLength; i++) {
      this.bloodPattern.push(Math.random() - 0.5);
    }
  }

  drawBloodLine() {
    const canvas = this.elements.bloodLine;
    if (!canvas || !this.bloodPattern.length) return;

    const ctx = canvas.getContext('2d');
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const offset = this.getBladeOffset();

    // Scale jitter relative to window size (16px at 600px width)
    const baseJitter = 16;
    const baseWidth = 600;
    const bloodLineMaxJitter = (baseJitter / baseWidth) * containerWidth;

    // Calculate where the blade image actually renders (object-fit: contain)
    const bounds = getContainedImageBounds(
      containerWidth, containerHeight,
      BLADE_NATURAL.width, BLADE_NATURAL.height
    );
    const scale = bounds.renderedWidth / BLADE_NATURAL.width;

    // Transform blood line points from image coords to container coords
    const p1 = {
      x: bounds.offsetX + BLOOD_LINE_P1.x * scale,
      y: bounds.offsetY + BLOOD_LINE_P1.y * scale + offset
    };
    const p2 = {
      x: bounds.offsetX + BLOOD_LINE_P2.x * scale,
      y: bounds.offsetY + BLOOD_LINE_P2.y * scale + offset
    };

    ctx.setTransform(this.bloodDpr, 0, 0, this.bloodDpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / this.bloodDpr, canvas.height / this.bloodDpr);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);

    // Get current colors from theme
    const colors = getBloodColors();

    // Draw straight line first
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = colors.line1;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Perpendicular vector for jitter
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const jitterScale = (1 - this.sharpness) * bloodLineMaxJitter;

    // Draw jittery line on top
    ctx.beginPath();
    ctx.moveTo(p1.x + perpX * this.bloodPattern[0] * jitterScale, p1.y + perpY * this.bloodPattern[0] * jitterScale);

    for (let i = 1; i < this.bloodPattern.length; i++) {
      const progress = i / this.bloodPattern.length;
      const x = p1.x + dx * progress + perpX * this.bloodPattern[i] * jitterScale;
      const y = p1.y + dy * progress + perpY * this.bloodPattern[i] * jitterScale;
      ctx.lineTo(x, y);
    }

    ctx.strokeStyle = colors.line2;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  setSharpness(value) {
    this.sharpness = Math.max(0, Math.min(1, value));
    this.drawBloodLine();
  }
}

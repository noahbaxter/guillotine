// Blood Line Component
// Renders the blood cut line on the guillotine blade with jitter effect
// Uses two canvases: one inside guillotine (normal), one outside (delta glow)

import { getBloodColors, getNeonColors, isDeltaMode, onDeltaModeChange } from '../../lib/theme.js';

const BLADE_NATURAL = { width: 300, height: 344 };
const BLOOD_LINE_P1 = { x: 108, y: 63 };
const BLOOD_LINE_P2 = { x: 188, y: 98 };
const Y_OFFSET_RATIO = 0.04; // Vertical adjustment as ratio of container height
const MAX_JITTER = 30;
const PATTERN_LENGTH = 50;
const BASE_WIDTH = 600;

function getContainedImageBounds(containerW, containerH, imageW, imageH) {
  const containerRatio = containerW / containerH;
  const imageRatio = imageW / imageH;

  let renderedW, renderedH, offsetX, offsetY;
  if (imageRatio > containerRatio) {
    renderedW = containerW;
    renderedH = containerW / imageRatio;
    offsetX = 0;
    offsetY = (containerH - renderedH) / 2;
  } else {
    renderedH = containerH;
    renderedW = containerH * imageRatio;
    offsetX = (containerW - renderedW) / 2;
    offsetY = 0;
  }

  return { renderedW, renderedH, offsetX, offsetY };
}

export class BloodLine {
  constructor(innerContainer, outerContainer) {
    this.innerContainer = innerContainer;
    this.outerContainer = outerContainer;

    // Normal mode canvas - inside guillotine, gets dimmed with it
    this.normalCanvas = document.createElement('canvas');
    this.normalCanvas.className = 'blood-line blood-line--normal';
    this.innerContainer.appendChild(this.normalCanvas);

    // Delta mode canvas - outside guillotine, glows above everything
    this.deltaCanvas = document.createElement('canvas');
    this.deltaCanvas.className = 'blood-line blood-line--delta';
    this.outerContainer.appendChild(this.deltaCanvas);

    this.dpr = 1;
    this.pattern = this.generatePattern();
    this.sharpness = 1.0;
    this.bladeOffset = 0;

    this.unsubscribe = onDeltaModeChange(() => this.updateVisibility());
    this.updateVisibility();
    this.resize();
  }

  generatePattern() {
    return Array.from({ length: PATTERN_LENGTH + 1 }, () => Math.random() - 0.5);
  }

  updateVisibility() {
    const delta = isDeltaMode();
    this.normalCanvas.style.opacity = delta ? '0' : '1';
    this.deltaCanvas.style.opacity = delta ? '1' : '0';
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;

    // Size both canvases to inner container (guillotine element)
    const w = this.innerContainer.clientWidth;
    const h = this.innerContainer.clientHeight;
    if (!w || !h) return;

    for (const canvas of [this.normalCanvas, this.deltaCanvas]) {
      canvas.width = w * this.dpr;
      canvas.height = h * this.dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    this.draw();
  }

  setSharpness(value) {
    this.sharpness = Math.max(0, Math.min(1, value));
    this.draw();
  }

  update(bladeOffset) {
    this.bladeOffset = bladeOffset;
    this.draw();
  }

  getLineEndpoints(w, h) {
    const bounds = getContainedImageBounds(w, h, BLADE_NATURAL.width, BLADE_NATURAL.height);
    const scale = bounds.renderedW / BLADE_NATURAL.width;
    const yOffset = h * Y_OFFSET_RATIO;

    return {
      p1: {
        x: bounds.offsetX + BLOOD_LINE_P1.x * scale,
        y: bounds.offsetY + BLOOD_LINE_P1.y * scale + this.bladeOffset + yOffset
      },
      p2: {
        x: bounds.offsetX + BLOOD_LINE_P2.x * scale,
        y: bounds.offsetY + BLOOD_LINE_P2.y * scale + this.bladeOffset + yOffset
      }
    };
  }

  draw() {
    const w = this.innerContainer.clientWidth;
    const h = this.innerContainer.clientHeight;
    if (!w || !h) return;

    const { p1, p2 } = this.getLineEndpoints(w, h);
    const bloodColors = getBloodColors();
    const neon = getNeonColors();

    // Draw normal canvas (dark blood)
    this.drawToCanvas(this.normalCanvas, p1, p2, {
      line1: bloodColors.line1,
      line2: bloodColors.line2,
      lineWidth: 3,
      glow: null
    }, w);

    // Draw delta canvas (neon glow)
    this.drawToCanvas(this.deltaCanvas, p1, p2, {
      line1: neon.red,
      line2: neon.redBright,
      lineWidth: 4,
      glow: { color: neon.redGlow, blur: neon.glowBlur }
    }, w);
  }

  drawToCanvas(canvas, p1, p2, style, containerW) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width / this.dpr;
    const h = canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (style.glow) {
      ctx.shadowColor = style.glow.color;
      ctx.shadowBlur = style.glow.blur;
    }

    // Base line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = style.line1;
    ctx.lineWidth = style.lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Jittery line on top
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const maxJitter = (MAX_JITTER / BASE_WIDTH) * containerW;
    const jitterScale = (1 - this.sharpness) * maxJitter;

    ctx.beginPath();
    ctx.moveTo(
      p1.x + perpX * this.pattern[0] * jitterScale,
      p1.y + perpY * this.pattern[0] * jitterScale
    );

    for (let i = 1; i < this.pattern.length; i++) {
      const t = i / this.pattern.length;
      ctx.lineTo(
        p1.x + dx * t + perpX * this.pattern[i] * jitterScale,
        p1.y + dy * t + perpY * this.pattern[i] * jitterScale
      );
    }

    ctx.strokeStyle = style.line2;
    ctx.stroke();
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    this.normalCanvas.remove();
    this.deltaCanvas.remove();
  }
}

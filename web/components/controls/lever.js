// Lever Component
// Rotary lever that triggers guillotine activation

import { loadStyles } from '../../lib/component-loader.js';
import { animateLever } from '../../lib/guillotine-utils.js';
import { createBlurFilter, createJitteryLine, createRoundedRectOutline } from '../../lib/svg-utils.js';

const DEFAULTS = {
  upAngle: 0,
  downAngle: -35
};

const BASE_CONFIG = {
  frontWidth: 30,
  frontHeight: 10,
  topHeight: 4,   // depth going back
  rightWidth: 3   // depth going right
};

function applyIsometricBox(front, top, right, config) {
  const { frontWidth, frontHeight, topHeight, rightWidth } = config;

  // Front face - simple rectangle
  Object.assign(front.style, {
    position: 'absolute',
    width: `${frontWidth}px`,
    height: `${frontHeight}px`,
    bottom: '0',
    left: '0'
  });

  // Top face - parallelogram clipped to exact shape
  Object.assign(top.style, {
    position: 'absolute',
    width: `${frontWidth + rightWidth}px`,
    height: `${topHeight}px`,
    bottom: `${frontHeight}px`,
    left: '0',
    clipPath: `polygon(0 100%, ${frontWidth}px 100%, 100% 0, ${rightWidth}px 0)`
  });

  // Right face - parallelogram clipped to exact shape
  Object.assign(right.style, {
    position: 'absolute',
    width: `${rightWidth}px`,
    height: `${frontHeight + topHeight}px`,
    bottom: '0',
    left: `${frontWidth}px`,
    clipPath: `polygon(0 ${topHeight}px, 100% 0, 100% ${frontHeight}px, 0 100%)`
  });
}

function createBoxBorders(container, config) {
  const { frontWidth, frontHeight, topHeight, rightWidth } = config;
  const totalWidth = frontWidth + rightWidth;
  const totalHeight = frontHeight + topHeight;

  // 7 vertices of the 3D box (in SVG coords where Y=0 is top)
  const V0 = [0, totalHeight];                           // front bottom-left
  const V1 = [frontWidth, totalHeight];                  // front bottom-right
  const V2 = [frontWidth, topHeight];                    // front top-right
  const V3 = [0, topHeight];                             // front top-left
  const V4 = [rightWidth, 0];                            // back top-left
  const V5 = [totalWidth, 0];                            // back top-right
  const V6 = [totalWidth, frontHeight];                  // back bottom-right

  // 9 edges of the visible 3D box
  const edges = [
    [V0, V1],  // front bottom
    [V0, V3],  // front left
    [V1, V2],  // front right / right left (shared)
    [V2, V3],  // front top / top bottom (shared)
    [V3, V4],  // top left diagonal
    [V4, V5],  // top back
    [V2, V5],  // top right / right top diagonal (shared)
    [V1, V6],  // right bottom diagonal
    [V5, V6],  // right back
  ];

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', totalWidth);
  svg.setAttribute('height', totalHeight);
  svg.style.position = 'absolute';
  svg.style.bottom = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';

  // Add blur filter
  svg.appendChild(createBlurFilter('blur'));

  // Draw all edges as jittery lines
  edges.forEach(([p1, p2]) => {
    svg.appendChild(createJitteryLine(p1, p2, { filterId: 'blur' }));
  });

  container.appendChild(svg);
  return svg;
}

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

    // Lever base with 3D surfaces
    const baseFront = document.createElement('div');
    baseFront.className = 'lever__base__front';
    this.base.appendChild(baseFront);

    const baseTop = document.createElement('div');
    baseTop.className = 'lever__base__top';
    this.base.appendChild(baseTop);

    const baseRight = document.createElement('div');
    baseRight.className = 'lever__base__right';
    this.base.appendChild(baseRight);

    // Apply computed isometric positioning
    applyIsometricBox(baseFront, baseTop, baseRight, BASE_CONFIG);

    // Draw SVG borders for all 9 edges
    createBoxBorders(this.base, BASE_CONFIG);

    // Lever arm with pivot at bottom, centered on top face
    this.arm = document.createElement('div');
    this.arm.className = 'lever__arm';

    // Position arm at center of top face (on the surface)
    // Account for base being offset at bottom: -10px in CSS
    const { frontWidth, frontHeight, rightWidth } = BASE_CONFIG;
    const baseOffset = -10;
    const armX = (frontWidth + rightWidth) / 2;
    const armY = frontHeight + baseOffset;
    this.arm.style.position = 'absolute';
    this.arm.style.bottom = `${armY}px`;
    this.arm.style.left = `${armX}px`;
    this.arm.style.transform = 'translateX(-50%)';

    // Add jittery white outline to arm
    this.createArmOutline(this.arm);

    this.element.appendChild(this.base);
    this.element.appendChild(this.arm);
    this.container.appendChild(this.element);

    // Add deltable class for DELTA mode transitions
    this.base.classList.add('deltable');
    this.arm.classList.add('deltable');

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

  createArmOutline(armElement) {
    const armWidth = 7;
    const armHeight = 95;
    const cornerRadius = 4;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', armWidth);
    svg.setAttribute('height', armHeight);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';

    svg.appendChild(createBlurFilter('arm-blur'));
    svg.appendChild(createRoundedRectOutline(armWidth, armHeight, cornerRadius));

    armElement.appendChild(svg);
  }

  updateVisuals() {
    if (this.arm) {
      this.arm.style.transform = `translateX(-50%) rotate(${this.currentAngle}deg)`;
    }
  }

  destroy() {
    if (this.cancelAnimation) this.cancelAnimation();
    if (this.element) this.element.remove();
  }
}

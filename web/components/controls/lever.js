// Lever Component
// Rotary lever that triggers guillotine activation

import { loadStyles } from '../../lib/component-loader.js';
import { animateLever } from '../../lib/guillotine-utils.js';
import { createBlurFilter, createJitteryLine, createRoundedRectOutline } from '../../lib/svg-utils.js';
import { pxToEm } from '../../lib/utils.js';

const DEFAULTS = {
  upAngle: 0,
  downAngle: -35
};

// Base dimensions in px (at 16px root font-size)
const BASE_CONFIG_PX = {
  frontWidth: 30,
  frontHeight: 10,
  topHeight: 4,
  rightWidth: 3
};

function applyIsometricBox(front, top, right, configPx) {
  // Convert px values to em for scaling
  const frontWidth = pxToEm(configPx.frontWidth);
  const frontHeight = pxToEm(configPx.frontHeight);
  const topHeight = pxToEm(configPx.topHeight);
  const rightWidth = pxToEm(configPx.rightWidth);

  // Front face - simple rectangle
  Object.assign(front.style, {
    position: 'absolute',
    width: `${frontWidth}em`,
    height: `${frontHeight}em`,
    bottom: '0',
    left: '0'
  });

  // Top face - parallelogram clipped to exact shape
  Object.assign(top.style, {
    position: 'absolute',
    width: `${frontWidth + rightWidth}em`,
    height: `${topHeight}em`,
    bottom: `${frontHeight}em`,
    left: '0',
    clipPath: `polygon(0 100%, ${frontWidth}em 100%, 100% 0, ${rightWidth}em 0)`
  });

  // Right face - parallelogram clipped to exact shape
  Object.assign(right.style, {
    position: 'absolute',
    width: `${rightWidth}em`,
    height: `${frontHeight + topHeight}em`,
    bottom: '0',
    left: `${frontWidth}em`,
    clipPath: `polygon(0 ${topHeight}em, 100% 0, 100% ${frontHeight}em, 0 100%)`
  });
}

function createBoxBorders(container, configPx) {
  // Use original pixel values for SVG internal coordinates (stroke-width, jitter are calibrated for these)
  const { frontWidth, frontHeight, topHeight, rightWidth } = configPx;
  const totalWidth = frontWidth + rightWidth;
  const totalHeight = frontHeight + topHeight;

  // 7 vertices of the 3D box (in SVG coords where Y=0 is top) - in px
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
  // Display size in em (scales with root font-size)
  svg.style.width = `${pxToEm(totalWidth)}em`;
  svg.style.height = `${pxToEm(totalHeight)}em`;
  // ViewBox in original px values so stroke-width and jitter work correctly
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
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
    applyIsometricBox(baseFront, baseTop, baseRight, BASE_CONFIG_PX);

    // Draw SVG borders for all 9 edges
    createBoxBorders(this.base, BASE_CONFIG_PX);

    // Store references for resize handling
    this.baseFaces = { front: baseFront, top: baseTop, right: baseRight };

    // Re-apply styles on resize to fix texture rendering after font-size changes
    this.resizeObserver = new ResizeObserver(() => {
      applyIsometricBox(this.baseFaces.front, this.baseFaces.top, this.baseFaces.right, BASE_CONFIG_PX);
    });
    this.resizeObserver.observe(document.body);

    // Lever arm with pivot at bottom, centered on top face
    this.arm = document.createElement('div');
    this.arm.className = 'lever__arm';

    // Position arm at center of top face (on the surface)
    // Account for base being offset at bottom: -10px (0.625em) in CSS
    const frontWidth = pxToEm(BASE_CONFIG_PX.frontWidth);
    const frontHeight = pxToEm(BASE_CONFIG_PX.frontHeight);
    const rightWidth = pxToEm(BASE_CONFIG_PX.rightWidth);
    const baseOffset = pxToEm(-10);
    const armX = (frontWidth + rightWidth) / 2;
    const armY = frontHeight + baseOffset;
    this.arm.style.position = 'absolute';
    this.arm.style.bottom = `${armY}em`;
    this.arm.style.left = `${armX}em`;
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
    const armWidthPx = 7;
    const armHeightPx = 95;
    const cornerRadius = 4;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.width = `${pxToEm(armWidthPx)}em`;
    svg.style.height = `${pxToEm(armHeightPx)}em`;
    svg.setAttribute('viewBox', `0 0 ${armWidthPx} ${armHeightPx}`);
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';

    svg.appendChild(createBlurFilter('arm-blur'));
    svg.appendChild(createRoundedRectOutline(armWidthPx, armHeightPx, cornerRadius));

    armElement.appendChild(svg);
  }

  updateVisuals() {
    if (this.arm) {
      this.arm.style.transform = `translateX(-50%) rotate(${this.currentAngle}deg)`;
    }
  }

  destroy() {
    if (this.cancelAnimation) this.cancelAnimation();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.element) this.element.remove();
  }
}

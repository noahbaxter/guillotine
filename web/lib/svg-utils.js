// SVG utilities for hand-drawn effects (jitter, blur)
import { COLORS } from './theme.js';

const SVG_CONFIG = {
  jitterAmount: 0.5,      // perpendicular jitter distance
  jitterArmAmount: 0.6,   // larger jitter for arm outline
  strokeWidth: 2.5,
  opacity: 0.5,           // white outline opacity
  blurStdDev: 0.4,        // Gaussian blur amount
};

function createBlurFilter(filterId) {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');

  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', SVG_CONFIG.blurStdDev);
  filter.appendChild(blur);
  defs.appendChild(filter);

  return defs;
}

function createJitteryLine(p1, p2, options = {}) {
  const jitterAmount = options.jitterAmount ?? SVG_CONFIG.jitterAmount;
  const filterId = options.filterId ?? 'blur';
  const strokeWidth = options.strokeWidth ?? SVG_CONFIG.strokeWidth;
  const opacity = options.opacity ?? SVG_CONFIG.opacity;

  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const segments = Math.max(3, Math.floor(length / 3));

  // Perpendicular direction for jitter
  const perpX = length > 0 ? -dy / length : 0;
  const perpY = length > 0 ? dx / length : 0;

  let points = `${p1[0]},${p1[1]}`;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const baseX = p1[0] + dx * t;
    const baseY = p1[1] + dy * t;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
    const x = baseX + perpX * jitter;
    const y = baseY + perpY * jitter;
    points += ` ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  points += ` ${p2[0]},${p2[1]}`;

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  // Use white50 from theme (opacity 0.5 matches SVG_CONFIG default)
  polyline.setAttribute('stroke', COLORS.white50);
  polyline.setAttribute('stroke-width', strokeWidth);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('filter', `url(#${filterId})`);
  return polyline;
}

function createRoundedRectOutline(width, height, radius, filterId = 'arm-blur') {
  // Build path as connected jittery line segments
  const jitterAmount = SVG_CONFIG.jitterArmAmount;

  // Define the corner/waypoints of the rounded rectangle
  const waypoints = [];

  // Bottom edge: left to right
  waypoints.push([0, height]);
  waypoints.push([width, height]);

  // Right edge: bottom to top (stop before curve)
  waypoints.push([width, radius]);

  // Top-right curve (3 points)
  for (let i = 0; i <= 2; i++) {
    const t = i / 2;
    const angle = Math.PI / 2 - (Math.PI / 2) * t;
    const cx = width / 2;
    const cy = radius;
    waypoints.push([cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)]);
  }

  // Top-left curve (3 points, reverse direction)
  for (let i = 2; i >= 0; i--) {
    const t = i / 2;
    const angle = (Math.PI / 2) * t;
    const cx = width / 2;
    const cy = radius;
    waypoints.push([cx - radius * Math.cos(angle), cy - radius * Math.sin(angle)]);
  }

  // Left edge: top to bottom
  waypoints.push([0, radius]);
  waypoints.push([0, height]); // close back to start

  // Build jittery path by adding intermediate points along each segment
  let points = '';
  const firstJitter = (Math.random() - 0.5) * 2 * jitterAmount;
  points += `${waypoints[0][0] + firstJitter},${waypoints[0][1]}`;

  for (let i = 1; i < waypoints.length - 1; i++) {
    const [x, y] = waypoints[i];
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
    points += ` ${x + jitter},${y}`;
  }

  // Close path using same jitter as first point
  points += ` ${waypoints[0][0] + firstJitter},${waypoints[0][1]}`;

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  // Use white50 from theme
  polyline.setAttribute('stroke', COLORS.white50);
  polyline.setAttribute('stroke-width', SVG_CONFIG.strokeWidth);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('filter', `url(#${filterId})`);
  return polyline;
}

export { SVG_CONFIG, createBlurFilter, createJitteryLine, createRoundedRectOutline };

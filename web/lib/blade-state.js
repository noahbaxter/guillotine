// Blade State Module - Centralized glow and sharpness state for blade lines
// Multiple sources (knob hover, knob drag, line hover, line drag, delta mode)
// can independently activate glow. Glow stays on until all sources release.

import { isDeltaMode, onDeltaModeChange } from './theme.js';

const glowSources = new Map();  // source name -> boolean
const glowListeners = [];
const sharpnessListeners = [];
let sharpness = 1.0;
let lastGlowing = false;

// Fold delta mode into glow composite
onDeltaModeChange(() => notifyGlow());

function notifyGlow() {
  const glowing = isGlowing();
  if (glowing === lastGlowing) return;
  lastGlowing = glowing;
  glowListeners.forEach(fn => fn(glowing));
}

export function setGlowSource(source, active) {
  glowSources.set(source, active);
  notifyGlow();
}

export function isGlowing() {
  for (const active of glowSources.values()) {
    if (active) return true;
  }
  return isDeltaMode();
}

export function onGlowChange(callback) {
  glowListeners.push(callback);
  return () => {
    const idx = glowListeners.indexOf(callback);
    if (idx !== -1) glowListeners.splice(idx, 1);
  };
}

export function setSharpness(value) {
  sharpness = Math.max(0, Math.min(1, value));
  sharpnessListeners.forEach(fn => fn(sharpness));
}

export function getSharpness() {
  return sharpness;
}

export function onSharpnessChange(callback) {
  sharpnessListeners.push(callback);
  return () => {
    const idx = sharpnessListeners.indexOf(callback);
    if (idx !== -1) sharpnessListeners.splice(idx, 1);
  };
}

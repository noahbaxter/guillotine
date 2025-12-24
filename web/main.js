// Guillotine Plugin - Main Entry Point
// Phase 2: Microscope view with waveform and draggable threshold

import { Guillotine } from './components/views/guillotine.js';
import { Microscope } from './components/views/microscope.js';
import { Knob } from './components/controls/knob.js';
import { sendParameter, registerCallback } from './lib/juce-bridge.js';

// Load locally embedded fonts
const fontStyles = document.createElement('style');
fontStyles.textContent = `
  @font-face { font-family: 'Zeyada'; src: url('assets/fonts/zeyada.ttf') format('truetype'); }
  @font-face { font-family: 'Cedarville Cursive'; src: url('assets/fonts/cedarville.ttf') format('truetype'); }
  @font-face { font-family: 'Dawning of a New Day'; src: url('assets/fonts/dawning.ttf') format('truetype'); }
`;
document.head.appendChild(fontStyles);

class GuillotineApp {
  constructor() {
    // Container references
    this.guillotineContainer = document.getElementById('guillotine-container');
    this.bucketContainer = document.getElementById('bucket-container');
    this.microscopeContainer = document.getElementById('microscope-container');
    this.mainKnobsContainer = document.getElementById('main-knobs');
    this.gainKnobsContainer = document.getElementById('gain-knobs');

    // State
    this.bypass = false;
    this.threshold = 0.5;       // Display threshold (0-1 in current scale)
    this.currentMinDb = -60;    // Current microscope scale

    this.init();
  }

  async init() {
    // Create components
    this.guillotine = new Guillotine(this.guillotineContainer);
    this.microscope = new Microscope(this.microscopeContainer);

    // Threshold knob (0-1 maps to 0dB to currentMinDb dynamically)
    this.thresholdKnob = new Knob(this.mainKnobsContainer, {
      label: 'Threshold',
      value: this.threshold,
      size: 50,
      useSprites: true,
      spriteScale: 0.35,
      formatValue: (v) => this.thresholdToDb(v).toFixed(1) + 'dB'
    });

    // Wait for all components to initialize
    await Promise.all([
      this.guillotine.ready,
      this.microscope.ready,
      this.thresholdKnob.ready
    ]);

    // Wire up threshold changes from knob
    this.thresholdKnob.onChange = (value) => {
      this.setThreshold(value, 'knob');
    };

    // Wire up threshold changes from microscope drag
    this.microscope.onThresholdChange = (value) => {
      this.setThreshold(value, 'microscope');
    };

    // Wire up scale changes from microscope
    this.microscope.onScaleChange = (minDb) => {
      this.onScaleChange(minDb);
    };

    // Start microscope visualization
    this.microscope.start();

    // Bypass toggle on guillotine click
    this.guillotineContainer.addEventListener('click', () => this.toggleBypass());

    // Register JUCE callbacks
    registerCallback('setThreshold', (value) => {
      this.setThreshold(value, 'juce');
    });

    registerCallback('setBypass', (value) => {
      this.bypass = value;
      this.updateBypassVisual();
    });

    // Register envelope data callback (from C++ timer)
    registerCallback('updateEnvelope', (data) => {
      this.microscope.updateData(data);
    });

    // Initial state
    this.updateBypassVisual();
    this.setThreshold(this.threshold, 'init');
  }

  // Convert threshold (0-1) to dB (always uses full -60dB range internally)
  thresholdToDb(threshold) {
    return -threshold * 60;
  }

  // Convert dB to threshold (0-1)
  dbToThreshold(db) {
    return Math.max(0, Math.min(1, -db / 60));
  }

  // Clamp threshold to current visible range
  clampToVisibleRange(threshold) {
    const minThreshold = this.dbToThreshold(this.currentMinDb);
    return Math.min(threshold, minThreshold);
  }

  // Handle scale change from microscope
  onScaleChange(minDb) {
    this.currentMinDb = minDb;

    // Update knob range to match visible scale
    const minThreshold = this.dbToThreshold(minDb);
    this.thresholdKnob.setRange(0, minThreshold);

    // Recalculate active threshold: use target if visible, else clamp to visible min
    const newThreshold = Math.min(this.targetThreshold, minThreshold);

    if (newThreshold !== this.threshold) {
      this.threshold = newThreshold;
      this.thresholdKnob.setValue(this.threshold);
      this.microscope.setThreshold(this.threshold);
      this.guillotine.setPosition(this.threshold);
      sendParameter('threshold', this.threshold);
    }
  }

  // Centralized threshold control - syncs all components
  setThreshold(value, source) {
    // Clamp to visible range
    const clampedValue = this.clampToVisibleRange(value);

    // Update target (remember user's intent)
    // Store unclamped value as target for all user-initiated changes
    if (source === 'knob' || source === 'microscope' || source === 'juce' || source === 'init') {
      this.targetThreshold = value;
    }

    this.threshold = clampedValue;

    // Update all components except the source to avoid feedback loops
    if (source !== 'knob') this.thresholdKnob.setValue(clampedValue);
    if (source !== 'microscope') this.microscope.setThreshold(clampedValue);
    this.guillotine.setPosition(clampedValue);

    // Notify JUCE (except when change came from JUCE)
    if (source !== 'juce' && source !== 'init') {
      sendParameter('threshold', clampedValue);
    }
  }

  toggleBypass() {
    this.bypass = !this.bypass;
    this.updateBypassVisual();
    sendParameter('bypass', this.bypass);
  }

  updateBypassVisual() {
    // Visual feedback for bypass state
    // When bypassed, guillotine area dims slightly
    this.guillotineContainer.style.opacity = this.bypass ? '0.5' : '1';
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GuillotineApp());
} else {
  new GuillotineApp();
}

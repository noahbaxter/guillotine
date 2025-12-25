// Guillotine Plugin - Main Entry Point
// Phase 2: Microscope view with waveform and draggable threshold

import { Guillotine } from './components/views/guillotine.js';
import { Microscope } from './components/views/microscope.js';
import { Knob } from './components/controls/knob.js';
import {
  setParameterNormalized,
  getParameterNormalized,
  onParameterChange,
  parameterDragStarted,
  parameterDragEnded,
  registerCallback
} from './lib/juce-bridge.js';

// Load locally embedded fonts
const fontStyles = document.createElement('style');
fontStyles.textContent = `
  @font-face { font-family: 'Zeyada'; src: url('assets/fonts/zeyada.ttf') format('truetype'); }
  @font-face { font-family: 'Cedarville Cursive'; src: url('assets/fonts/cedarville.ttf') format('truetype'); }
  @font-face { font-family: 'Dawning of a New Day'; src: url('assets/fonts/dawning.ttf') format('truetype'); }
`;
document.head.appendChild(fontStyles);

// Utility for creating sprite-based knobs
function createSpriteKnob(config) {
  const { label, suffix, formatter, spriteScale = 0.4, suffixVariant, sizeVariant, ...rest } = config;
  return {
    label,
    useSprites: true,
    spriteScale,
    spriteSuffix: suffix,
    formatValue: (v) => String(formatter(v)),
    suffixVariant,
    sizeVariant,
    ...rest
  };
}

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
    this.threshold = 0;         // Display threshold (0-1 in current scale, 0 = 0dB)
    this.currentMinDb = -60;    // Current microscope scale
    this.fonts = ['Zeyada', 'Cedarville Cursive', 'Dawning of a New Day'];
    this.fontIndex = 0;

    // Track if we're currently dragging to avoid feedback loops
    this.draggingParam = null;

    this.init();
  }

  // Normalize dB value to 0-1 for inputGain/outputGain (-24 to 24 dB)
  dbToNormalized(db) {
    return (db + 24) / 48;  // -24..24 -> 0..1
  }

  // Convert normalized 0-1 back to dB for inputGain/outputGain
  normalizedToDb(normalized) {
    return normalized * 48 - 24;  // 0..1 -> -24..24
  }

  async init() {
    // Create components
    this.guillotine = new Guillotine(this.guillotineContainer);
    this.microscope = new Microscope(this.microscopeContainer);

    // Sharpness knob (0-1, continuous) - LEFT
    this.sharpnessKnob = new Knob(this.mainKnobsContainer, createSpriteKnob({
      label: 'Sharpness',
      min: 0, max: 1, value: 1.0,
      size: 50,
      spriteScale: 0.35,
      suffix: '%',
      formatter: (v) => Math.round(v * 100)
    }));

    // Threshold knob (0-1 maps to 0dB to currentMinDb dynamically) - CENTER, larger
    this.thresholdKnob = new Knob(this.mainKnobsContainer, createSpriteKnob({
      label: 'Threshold',
      value: this.threshold,
      size: 60,
      spriteScale: 0.4,
      suffix: 'dB',
      formatter: (v) => this.thresholdToDb(v).toFixed(1),
      suffixVariant: 'large',
      sizeVariant: 'large',
      wrapperClass: 'knob-wrapper--threshold'
    }));

    // Oversampling knob (stepped: 1x, 2x, 4x, 8x) - RIGHT
    this.oversamplingKnob = new Knob(this.mainKnobsContainer, createSpriteKnob({
      label: 'Oversample',
      min: 0, max: 3, value: 0, step: 1,
      size: 50,
      spriteScale: 0.35,
      suffix: 'x',
      formatter: (v) => [1, 2, 4, 8][Math.round(v)]
    }));

    // Input Gain knob
    this.inputGainKnob = new Knob(this.gainKnobsContainer, createSpriteKnob({
      label: 'Input',
      min: -24, max: 24, value: 0, step: 0.1,
      size: 32,
      spriteScale: 0.25,
      suffix: 'dB',
      formatter: (v) => v.toFixed(1),
      wrapperClass: 'knob-wrapper--side'
    }));

    // Output Gain knob
    this.outputGainKnob = new Knob(this.gainKnobsContainer, createSpriteKnob({
      label: 'Output',
      min: -24, max: 24, value: 0, step: 0.1,
      size: 32,
      spriteScale: 0.25,
      suffix: 'dB',
      formatter: (v) => v.toFixed(1),
      wrapperClass: 'knob-wrapper--side'
    }));

    // Wait for all components to initialize
    await Promise.all([
      this.guillotine.ready,
      this.microscope.ready,
      this.thresholdKnob.ready,
      this.sharpnessKnob.ready,
      this.oversamplingKnob.ready,
      this.inputGainKnob.ready,
      this.outputGainKnob.ready
    ]);

    // Wire up threshold changes from knob
    this.thresholdKnob.onChange = (value) => {
      this.setThreshold(value, 'knob');
    };
    this.thresholdKnob.onDragStart = () => {
      this.draggingParam = 'threshold';
      parameterDragStarted('threshold');
      this.microscope.showThresholdLabel();
    };
    this.thresholdKnob.onDragEnd = () => {
      parameterDragEnded('threshold');
      this.draggingParam = null;
      this.microscope.hideThresholdLabel();
    };

    // Wire up other knob changes
    this.sharpnessKnob.onChange = (v) => {
      this.setSharpness(v);
    };
    this.oversamplingKnob.onChange = (v) => this.setOversampling(v);

    // Input gain knob with drag tracking
    this.inputGainKnob.onChange = (v) => this.setInputGain(v);
    this.inputGainKnob.onDragStart = () => {
      this.draggingParam = 'inputGain';
      parameterDragStarted('inputGain');
    };
    this.inputGainKnob.onDragEnd = () => {
      parameterDragEnded('inputGain');
      this.draggingParam = null;
    };

    // Output gain knob with drag tracking
    this.outputGainKnob.onChange = (v) => this.setOutputGain(v);
    this.outputGainKnob.onDragStart = () => {
      this.draggingParam = 'outputGain';
      parameterDragStarted('outputGain');
    };
    this.outputGainKnob.onDragEnd = () => {
      parameterDragEnded('outputGain');
      this.draggingParam = null;
    };

    // Set initial sharpness on microscope (use knob's default value)
    this.microscope.setSharpness(this.sharpnessKnob.getValue());

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

    // Listen for parameter changes from C++ (DAW automation, presets, etc.)
    onParameterChange('threshold', () => {
      if (this.draggingParam !== 'threshold') {
        const normalized = getParameterNormalized('threshold');
        this.setThreshold(normalized, 'juce');
      }
    });

    onParameterChange('inputGain', () => {
      if (this.draggingParam !== 'inputGain') {
        const normalized = getParameterNormalized('inputGain');
        const db = this.normalizedToDb(normalized);
        this.inputGainKnob.setValue(db);
      }
    });

    onParameterChange('outputGain', () => {
      if (this.draggingParam !== 'outputGain') {
        const normalized = getParameterNormalized('outputGain');
        const db = this.normalizedToDb(normalized);
        this.outputGainKnob.setValue(db);
      }
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

    // Font cycling with F key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        this.cycleFont();
      }
    });
  }

  cycleFont() {
    this.fontIndex = (this.fontIndex + 1) % this.fonts.length;
    const font = this.fonts[this.fontIndex];
    document.documentElement.style.setProperty('--cursive-font', `'${font}', cursive`);
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
      setParameterNormalized('threshold', this.threshold);
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
      setParameterNormalized('threshold', clampedValue);
    }
  }

  setSharpness(value) {
    this.microscope.setSharpness(value);
  }

  setOversampling(value) {
    // TODO: Add oversampling relay when needed
  }

  setInputGain(dbValue) {
    const normalized = this.dbToNormalized(dbValue);
    setParameterNormalized('inputGain', normalized);
  }

  setOutputGain(dbValue) {
    const normalized = this.dbToNormalized(dbValue);
    setParameterNormalized('outputGain', normalized);
  }

  toggleBypass() {
    this.bypass = !this.bypass;
    this.updateBypassVisual();
    // TODO: Add bypass relay when needed
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

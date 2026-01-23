// Guillotine Plugin - Main Entry Point
// Phase 2: Microscope view with waveform and draggable threshold

import { DISPLAY_DB_RANGE, DEFAULT_MIN_DB } from './lib/config.js';
import { TEXT } from './lib/utils.js';
import { Guillotine } from './components/views/guillotine.js';
import { Microscope } from './components/views/microscope.js';
import { BloodPool } from './components/display/blood-pool.js';
import { Knob } from './components/controls/knob.js';
import { Lever } from './components/controls/lever.js';
import { Toggle } from './components/controls/toggle.js';
import {
  setParameterNormalized,
  getParameterNormalized,
  onParameterChange,
  parameterDragStarted,
  parameterDragEnded,
  setDeltaMonitor,
  getDeltaMonitor,
  onDeltaMonitorChange,
  setBypassClipper,
  getBypassClipper,
  onBypassClipperChange,
  setEnforceCeiling,
  getEnforceCeiling,
  onEnforceCeilingChange,
  setFilterType,
  getFilterType,
  onFilterTypeChange,
  setStereoMode,
  getStereoMode,
  onStereoModeChange
} from './lib/juce-bridge.js';
import { setDeltaMode, toggleReadableMode } from './lib/theme.js';
import './lib/crt-effect.js';  // Initialize CRT effects (scanlines, jitter, vignette)

// Load locally embedded fonts
const fontStyles = document.createElement('style');
fontStyles.textContent = `
  @font-face { font-family: 'Zeyada'; src: url('assets/fonts/zeyada.ttf') format('truetype'); }
  @font-face { font-family: 'Cedarville Cursive'; src: url('assets/fonts/cedarville.ttf') format('truetype'); }
  @font-face { font-family: 'Dawning of a New Day'; src: url('assets/fonts/dawning.ttf') format('truetype'); }
`;
document.head.appendChild(fontStyles);

// Knob sizes (px) - edit these to resize knobs globally
const KNOB_SIZE = {
  LARGE: 60,   // ceiling
  MEDIUM: 50,  // blade, oversample
  SMALL: 32,   // input, output
  TINY: 24     // curve exponent
};

// Dynamic root font-size for proportional scaling
const BASE_WIDTH = 600;
const BASE_FONT_SIZE = 16;
const resizeObserver = new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  document.documentElement.style.fontSize = (width / BASE_WIDTH) * BASE_FONT_SIZE + 'px';
});
resizeObserver.observe(document.body);

// Utility for binding drag tracking to knobs (avoids repetition)
function bindDragTracking(knob, paramName, app, extraStart, extraEnd) {
  knob.onDragStart = () => {
    app.draggingParam = paramName;
    parameterDragStarted(paramName);
    if (extraStart) extraStart();
  };
  knob.onDragEnd = () => {
    parameterDragEnded(paramName);
    app.draggingParam = null;
    if (extraEnd) extraEnd();
  };
}

// Utility for creating sprite-based knobs
// label and suffix can be { text, src } objects or plain strings
function createSpriteKnob(config) {
  const { label, suffix, formatter, parser, snap, spriteScale = 0.4, suffixVariant, sizeVariant, ...rest } = config;
  return {
    label,
    suffix,
    useSprites: true,
    spriteScale,
    formatValue: (v) => String(formatter(v)),
    parseValue: parser || null,
    snapValue: snap || null,
    suffixVariant,
    sizeVariant,
    ...rest
  };
}

class GuillotineApp {
  constructor() {
    // Container references
    this.guillotineContainer = document.getElementById('guillotine-container');
    this.microscopeContainer = document.getElementById('microscope-container');
    this.togglesColumnContainer = document.getElementById('toggles-column');
    this.mainKnobsContainer = document.getElementById('main-knobs');
    this.inputKnobContainer = document.getElementById('input-knob-container');
    this.outputKnobContainer = document.getElementById('output-knob-container');
    this.ceilingContainer = document.getElementById('ceiling-container');
    this.drywetContainer = document.getElementById('drywet-container');

    // State
    this.bypass = true;         // Start bypassed (blade up) - click to activate
    this.deltaMode = false;     // DELTA mode - intensifies red, dulls everything else
    this.deltaModeStored = false;  // Remembers delta preference across bypass cycles
    this.threshold = 0;         // Display threshold (0-1 in current scale, 0 = 0dB)
    this.currentMinDb = DEFAULT_MIN_DB;  // Current microscope scale (matches default preset)
    this.currentCurve = 0;      // Current curve type (0=Hard, 1=Quintic, etc.)
    this.currentExponent = 2.0; // Curve exponent (for Knee and T2)
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
    this.lever = new Lever(this.guillotineContainer);
    this.bloodPool = new BloodPool(this.guillotineContainer);
    this.microscope = new Microscope(this.microscopeContainer);

    // Blade knob + exponent wrapper (exponent is positioned relative to blade)
    this.curveKnobWrapper = document.createElement('div');
    this.curveKnobWrapper.id = 'curve-knob-wrapper';
    this.mainKnobsContainer.appendChild(this.curveKnobWrapper);

    // Blade knob (stepped: Hard, Quintic, Cubic, Tanh, Arctan, Knee, T2)
    this.curveKnob = new Knob(this.curveKnobWrapper, {
      label: TEXT.labels.blade,
      min: 0, max: 6, value: 0, step: 1,
      size: KNOB_SIZE.MEDIUM,
      allowTextEdit: false,
      formatValue: (v) => TEXT.blades[Math.round(v)]?.text || '',
      values: TEXT.blades,
      parseValue: (input) => {
        const mapping = { 'hard': 0, 'quint': 1, 'quintic': 1, 'cubic': 2, 'tanh': 3, 'atan': 4, 'arctan': 4, 'knee': 5, 't2': 6, 't^2': 6, 'tsquared': 6 };
        return mapping[input.toLowerCase()] ?? null;
      }
    });

    // Curve exponent knob (tiny, positioned relative to blade knob)
    this.curveExponentKnob = new Knob(this.curveKnobWrapper, createSpriteKnob({
      label: '',
      min: 1, max: 4, value: 4,
      size: KNOB_SIZE.TINY,
      spriteScale: 0.2,
      suffix: '',
      formatter: (v) => v.toFixed(1),
      snap: (v) => Math.round(v * 10) / 10,  // 0.1 steps
      wrapperClass: 'knob-wrapper--exponent'
    }));

    // Ceiling knob (0-1 maps to 0dB to currentMinDb dynamically) - large, on left
    // Initial max must match default scale (-24dB -> threshold 0.4) to avoid showing full -60dB range
    const initialMaxThreshold = -DEFAULT_MIN_DB / DISPLAY_DB_RANGE;
    this.thresholdKnob = new Knob(this.ceilingContainer, createSpriteKnob({
      label: TEXT.labels.ceiling,
      min: 0,
      max: initialMaxThreshold,
      value: this.threshold,
      size: KNOB_SIZE.LARGE,
      spriteScale: 0.4,
      suffix: TEXT.suffixes.dB,
      formatter: (v) => this.thresholdToDb(v).toFixed(1),
      parser: (input) => {
        const match = input.match(/-?\d+\.?\d*/);
        if (!match) return null;
        const db = parseFloat(match[0]);
        return this.dbToThreshold(db);  // Convert dB to 0-1 threshold
      },
      snap: (v, fineMode) => {
        // Snap to 0.5dB steps normally, 0.1dB when shift held
        const db = this.thresholdToDb(v);
        const mult = fineMode ? 10 : 2;  // 0.1dB or 0.5dB
        const snappedDb = Math.round(db * mult) / mult;
        return this.dbToThreshold(snappedDb);
      },
      suffixVariant: 'large',
      sizeVariant: 'large',
      wrapperClass: 'knob-wrapper--threshold'
    }));

    // Dry/Wet mix knob (0% = dry, 100% = wet)
    this.drywetKnob = new Knob(this.drywetContainer, createSpriteKnob({
      label: TEXT.labels.mix,
      min: 0, max: 100, value: 100,
      size: KNOB_SIZE.SMALL,
      spriteScale: 0.25,
      suffix: TEXT.suffixes.percent,
      formatter: (v) => Math.round(v),
      snap: (v) => Math.round(v),
      wrapperClass: 'knob-wrapper--side'
    }));

    // Oversampling knob (stepped: 1x, 2x, 4x, 8x, 16x, 32x)
    this.oversamplingKnob = new Knob(this.mainKnobsContainer, createSpriteKnob({
      label: TEXT.labels.oversample,
      min: 0, max: 5, value: 0, step: 1,
      size: KNOB_SIZE.MEDIUM,
      spriteScale: 0.35,
      suffix: TEXT.suffixes.x,
      allowTextEdit: false,
      formatter: (v) => [1, 2, 4, 8, 16, 32][Math.round(v)],
      parser: (input) => {
        const match = input.match(/\d+/);
        if (!match) return null;
        const displayVal = parseInt(match[0]);
        const mapping = { 1: 0, 2: 1, 4: 2, 8: 3, 16: 4, 32: 5 };
        return mapping[displayVal] ?? null;
      }
    }));

    // Input Gain knob
    this.inputGainKnob = new Knob(this.inputKnobContainer, createSpriteKnob({
      label: TEXT.labels.input,
      min: -24, max: 24, value: 0,
      size: KNOB_SIZE.SMALL,
      spriteScale: 0.25,
      suffix: TEXT.suffixes.dB,
      formatter: (v) => v.toFixed(1),
      snap: (v) => Math.round(v * 10) / 10,  // 0.1dB steps
      wrapperClass: 'knob-wrapper--side'
    }));

    // Settings toggles (hidden params) - displayed in column
    this.trueclipToggle = new Toggle(this.togglesColumnContainer, {
      value: true,  // Default enforced
      tooltip: 'True Clip (enforce ceiling)',
      led: true,
      compact: true,  // Only has icon on top
      icons: {
        on: 'assets/icon-true-peak.svg'
      }
    });

    this.filterTypeToggle = new Toggle(this.togglesColumnContainer, {
      value: false,  // 0 = Min Phase (off), 1 = Linear Phase (on)
      tooltip: 'Filter: Min Phase / Linear Phase',
      icons: {
        on: 'assets/icon-linear-phase.svg',
        off: 'assets/icon-min-phase.svg'
      }
    });

    // Stereo mode: 3-way toggle (Stereo Link / L/R / M/S)
    // true = Stereo Link (0), null = L/R (1), false = M/S (2)
    this.stereoModeToggle = new Toggle(this.togglesColumnContainer, {
      value: true,  // Default to Stereo Link
      threeWay: true,
      tooltip: 'Stereo Link / L/R / M/S',
      icons: {
        up: 'assets/icon-stereo-link.svg',
        mid: 'assets/icon-lr.svg',
        down: 'assets/icon-ms.svg'
      }
    });

    // Output Gain knob
    this.outputGainKnob = new Knob(this.outputKnobContainer, createSpriteKnob({
      label: TEXT.labels.output,
      min: -24, max: 24, value: 0,
      size: KNOB_SIZE.SMALL,
      spriteScale: 0.25,
      suffix: TEXT.suffixes.dB,
      formatter: (v) => v.toFixed(1),
      snap: (v) => Math.round(v * 10) / 10,  // 0.1dB steps
      wrapperClass: 'knob-wrapper--side'
    }));

    // Wait for all components to initialize
    await Promise.all([
      this.guillotine.ready,
      this.lever.ready,
      this.bloodPool.ready,
      this.microscope.ready,
      this.thresholdKnob.ready,
      this.curveKnob.ready,
      this.curveExponentKnob.ready,
      this.oversamplingKnob.ready,
      this.inputGainKnob.ready,
      this.outputGainKnob.ready,
      this.filterTypeToggle.ready,
      this.stereoModeToggle.ready,
      this.trueclipToggle.ready
    ]);

    // Start with exponent knob disabled (only enable for T²)
    this.curveExponentKnob.setDisabled(true);

    // Wire up threshold changes from knob
    this.thresholdKnob.onChange = (value) => {
      this.setThreshold(value, 'knob');
    };
    bindDragTracking(this.thresholdKnob, 'ceiling', this,
      () => this.microscope.showThresholdLabel(),
      () => this.microscope.hideThresholdLabel()
    );

    // Wire up other knob changes
    this.curveKnob.onChange = (v) => this.setCurve(v);
    bindDragTracking(this.curveKnob, 'curve', this);

    this.curveExponentKnob.onChange = (v) => this.setCurveExponent(v);
    bindDragTracking(this.curveExponentKnob, 'curveExponent', this);

    this.oversamplingKnob.onChange = (v) => this.setOversampling(v);
    bindDragTracking(this.oversamplingKnob, 'oversampling', this);

    // Gain knobs
    this.inputGainKnob.onChange = (v) => this.setInputGain(v);
    bindDragTracking(this.inputGainKnob, 'inputGain', this);

    this.outputGainKnob.onChange = (v) => this.setOutputGain(v);
    bindDragTracking(this.outputGainKnob, 'outputGain', this);

    // Dry/Wet mix (visual only for now - fades guillotine texture)
    this.drywetKnob.onChange = (v) => {
      const normalized = v / 100;
      this.guillotine.setDryWet(normalized);
      this.lever.setDryWet(normalized);
      // Also fade the side art main layer
      const sideMain = document.querySelector('.guillotine-side__img--main');
      if (sideMain) {
        sideMain.style.opacity = normalized;
      }
    };

    // Settings toggles
    this.filterTypeToggle.onChange = (v) => setFilterType(v ? 1 : 0);
    // Stereo mode: true = Stereo Link (0), null = L/R (1), false = M/S (2)
    this.stereoModeToggle.onChange = (v) => {
      const mode = v === true ? 0 : v === null ? 1 : 2;
      setStereoMode(mode);
    };
    this.trueclipToggle.onChange = (v) => setEnforceCeiling(v);

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

    // Bypass toggle via click zones (guillotine body and lever)
    document.getElementById('click-zone-guillotine').addEventListener('click', () => this.toggleBypass());
    document.getElementById('click-zone-lever').addEventListener('click', () => this.toggleBypass());

    // Setup DELTA mode click handlers
    this.setupDeltaModeHandlers();

    // Listen for parameter changes from C++ (DAW automation, presets, etc.)
    // ceiling param: -60dB (normalized=0) to 0dB (normalized=1)
    // UI threshold: 0 (no clipping) to 1 (max clipping)
    onParameterChange('ceiling', () => {
      if (this.draggingParam !== 'ceiling') {
        const ceilingNorm = getParameterNormalized('ceiling');
        this.setThreshold(1 - ceilingNorm, 'juce');  // Invert: ceiling 0dB→thresh 0, ceiling -60dB→thresh 1
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

    onParameterChange('curve', () => {
      if (this.draggingParam !== 'curve') {
        const normalized = getParameterNormalized('curve');
        const curveIndex = Math.round(normalized * 6);  // 7 curves: 0-6
        this.currentCurve = curveIndex;
        this.curveKnob.setValue(curveIndex);
        this.microscope.setCurveMode(curveIndex);
        // Enable exponent knob for Knee (5) and T2 (6)
        this.curveExponentKnob.setDisabled(curveIndex < 5);
        this.updateSharpnessFromCurve();
      }
    });

    onParameterChange('curveExponent', () => {
      if (this.draggingParam !== 'curveExponent') {
        const normalized = getParameterNormalized('curveExponent');
        const exponent = 1.0 + normalized * 3.0;  // 1.0-4.0 range
        this.currentExponent = exponent;
        this.curveExponentKnob.setValue(exponent);
        this.microscope.setCurveExponent(exponent);
        this.updateSharpnessFromCurve();
      }
    });

    onParameterChange('oversampling', () => {
      if (this.draggingParam !== 'oversampling') {
        const normalized = getParameterNormalized('oversampling');
        const index = Math.round(normalized * 5);  // 0-5
        this.oversamplingKnob.setValue(index);
      }
    });

    // Listen for hidden param changes from C++ (DAW automation)
    onFilterTypeChange((index) => {
      this.filterTypeToggle.setValue(index === 1);
    });

    // Stereo mode: 0 = Stereo Link (true), 1 = L/R (null), 2 = M/S (false)
    onStereoModeChange((mode) => {
      const toggleValue = mode === 0 ? true : mode === 1 ? null : false;
      this.stereoModeToggle.setValue(toggleValue);
    });

    onEnforceCeilingChange((enabled) => {
      this.trueclipToggle.setValue(enabled);
    });

    // Listen for bypass changes from C++ (DAW automation)
    onBypassClipperChange((bypassed) => {
      this.setBypass(bypassed);
    });


    // Initialize all UI state from C++ parameter values
    this.initializeFromParams();

    // Mark animated components as initialized (enables animations for subsequent changes)
    this.guillotine.markInitialized();
    this.lever.markInitialized();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Font cycling with F key
      if (e.key === 'f' || e.key === 'F') {
        this.cycleFont();
      }
      // Toggle readable mode with R key
      if (e.key === 'r' || e.key === 'R') {
        toggleReadableMode();
      }
    });

    // Disable browser context menu (commented out for dev tools access)
    // document.addEventListener('contextmenu', e => e.preventDefault());

    // Remove loading class (re-enables transitions) and fade in
    // Use double RAF to ensure DOM has settled with correct initial values
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('loading');
        document.body.classList.add('ready');
      });
    });
  }

  cycleFont() {
    this.fontIndex = (this.fontIndex + 1) % this.fonts.length;
    const font = this.fonts[this.fontIndex];
    document.documentElement.style.setProperty('--cursive-font', `'${font}', cursive`);
  }

  initializeFromParams() {
    // Read all parameter values from C++ and update UI
    // Bypass
    this.bypass = getBypassClipper();
    this.updateBypassVisual();

    // Ceiling -> threshold (inverted: 0dB = 0 threshold, -60dB = 1 threshold)
    const ceilingNorm = getParameterNormalized('ceiling');
    this.setThreshold(1 - ceilingNorm, 'init');

    // Curve (0-6 choice)
    const curveNorm = getParameterNormalized('curve');
    const curveIndex = Math.round(curveNorm * 6);  // 7 curves: 0-6
    this.currentCurve = curveIndex;
    this.curveKnob.setValue(curveIndex);
    this.microscope.setCurveMode(curveIndex);
    // Enable exponent knob for Knee (5) and T2 (6)
    this.curveExponentKnob.setDisabled(curveIndex < 5);

    // Curve exponent (1.0-4.0, knob display is inverted)
    const expNorm = getParameterNormalized('curveExponent');
    const exponent = 1.0 + expNorm * 3.0;
    this.currentExponent = exponent;
    this.curveExponentKnob.setValue(exponent);
    this.microscope.setCurveExponent(exponent);

    // Update blade sharpness based on curve
    this.updateSharpnessFromCurve();

    // Oversampling (0-5 choice)
    const oversamplingNorm = getParameterNormalized('oversampling');
    const oversamplingIndex = Math.round(oversamplingNorm * 5);
    this.oversamplingKnob.setValue(oversamplingIndex);

    // Input/Output gains (-24 to 24 dB)
    const inputGainNorm = getParameterNormalized('inputGain');
    this.inputGainKnob.setValue(this.normalizedToDb(inputGainNorm));

    const outputGainNorm = getParameterNormalized('outputGain');
    this.outputGainKnob.setValue(this.normalizedToDb(outputGainNorm));

    // Delta mode (only if blade is down)
    const deltaEnabled = getDeltaMonitor();
    if (deltaEnabled && !this.bypass) {
      this.deltaMode = true;
      setDeltaMode(true);
    }

    // Hidden params (settings toggles)
    this.filterTypeToggle.setValue(getFilterType() === 1);
    // Stereo mode: 0 = Stereo Link (true), 1 = L/R (null), 2 = M/S (false)
    const stereoMode = getStereoMode();
    this.stereoModeToggle.setValue(stereoMode === 0 ? true : stereoMode === 1 ? null : false);
    this.trueclipToggle.setValue(getEnforceCeiling());
  }

  setupDeltaModeHandlers() {
    const bucketText = document.getElementById('delta-text');
    const bloodPoolEl = this.bloodPool.getElement();

    const toggleDelta = (e) => {
      // Only toggle when blade is down
      if (!this.guillotine.isActive()) return;

      // Prevent bypass toggle from firing
      e.stopPropagation();

      this.deltaMode = !this.deltaMode;
      this.deltaModeStored = false;  // Clear stored preference on manual toggle
      setDeltaMode(this.deltaMode);
      setDeltaMonitor(this.deltaMode);  // Sync to C++ param
    };

    // Listen for C++ param changes (DAW automation, etc.)
    onDeltaMonitorChange((enabled) => {
      if (this.deltaMode !== enabled) {
        this.deltaMode = enabled;
        setDeltaMode(enabled);
      }
    });

    // Click handlers for delta mode toggle
    bucketText.addEventListener('click', toggleDelta);
    bloodPoolEl.addEventListener('click', toggleDelta);

    // Hover effects - blood pool lights up when bucket text is hovered
    bucketText.addEventListener('mouseenter', () => {
      bloodPoolEl.classList.add('blood-pool--hover-glow');
    });
    bucketText.addEventListener('mouseleave', () => {
      bloodPoolEl.classList.remove('blood-pool--hover-glow');
    });
  }

  updateDeltaClickable() {
    const bucketText = document.getElementById('delta-text');
    const bloodPoolEl = this.bloodPool.getElement();
    const active = !this.bypass;

    // Add/remove delta-clickable class based on blade state
    bucketText.classList.toggle('delta-clickable', active);
    bloodPoolEl.classList.toggle('delta-clickable', active);
  }

  // Convert threshold (0-1) to dB (always uses full range internally)
  thresholdToDb(threshold) {
    return -threshold * DISPLAY_DB_RANGE;
  }

  // Convert dB to threshold (0-1)
  dbToThreshold(db) {
    return Math.max(0, Math.min(1, -db / DISPLAY_DB_RANGE));
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
      setParameterNormalized('ceiling', 1 - this.threshold);
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
    this.guillotine.setCeilingOffset(clampedValue);  // Subtle blade shift with ceiling

    // Update waveform's ceiling for soft clipping simulation
    // threshold 0→1 maps to ceiling 0dB→-60dB → linear 1.0→0.001
    const ceilingDb = -clampedValue * DISPLAY_DB_RANGE;
    const ceilingLinear = Math.pow(10, ceilingDb / 20);
    this.microscope.setCeilingLinear(ceilingLinear);

    // Notify JUCE (except when change came from JUCE)
    // UI threshold 0→1 maps to ceiling 0dB→-60dB (normalized 1→0)
    if (source !== 'juce' && source !== 'init') {
      setParameterNormalized('ceiling', 1 - clampedValue);
    }
  }

  setCurve(value) {
    // Curve is a choice param (0-6), value comes in as 0-6 from knob
    const index = Math.round(value);
    this.currentCurve = index;
    setParameterNormalized('curve', index / 6);  // 7 curves: 0-6
    // Update waveform display to simulate the same curve
    this.microscope.setCurveMode(index);
    // Enable exponent knob for Knee (5) and T2 (6)
    this.curveExponentKnob.setDisabled(index < 5);
    this.updateSharpnessFromCurve();
  }

  setCurveExponent(value) {
    // Knob shows 4-1 inverted, but value is the actual exponent (1-4)
    this.currentExponent = value;
    const normalized = (value - 1.0) / 3.0;  // 1.0-4.0 -> 0-1
    setParameterNormalized('curveExponent', normalized);
    this.microscope.setCurveExponent(value);
    this.updateSharpnessFromCurve();
  }

  updateSharpnessFromCurve() {
    // Map curve type to blade sharpness (1.0 = sharp/flat, 0 = jittery/dull)
    // Hard clips = sharp blade, soft saturation = dull blade
    const curveSharpness = [1.0, 0.85, 0.7, 0.35, 0.15, null, null];
    let sharpness = curveSharpness[this.currentCurve];

    // Knee (5) and T2 (6): exponent controls sharpness (inverted)
    // Exponent 1 = sharp (0.9), exponent 4 = very soft (0.05)
    if (sharpness === null) {
      sharpness = 0.05 + (4.0 - this.currentExponent) / 3 * 0.85;
    }

    this.microscope.setSharpness(sharpness);
    this.guillotine.setSharpness(sharpness);
  }

  setOversampling(value) {
    // Oversampling is a choice param (0-5), value comes in as 0-5 from knob
    // Map to 0-5 range: 0=1x, 1=2x, 2=4x, 3=8x, 4=16x, 5=32x
    const index = Math.round(value);
    setParameterNormalized('oversampling', index / 5);
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
    setBypassClipper(this.bypass);
  }

  setBypass(value) {
    if (this.bypass === value) return;
    this.bypass = value;
    this.updateBypassVisual();
  }

  updateBypassVisual() {
    // Lever DOWN + Blade DOWN = active (not bypassed, processing audio)
    // Lever UP + Blade UP = bypass (no processing)
    const active = !this.bypass;

    if (!active && this.deltaMode) {
      // Blade going up: store delta preference and disable visually
      this.deltaModeStored = true;
      this.deltaMode = false;
      setDeltaMode(false);
      setDeltaMonitor(false);
    } else if (active && this.deltaModeStored) {
      // Blade coming down: restore delta mode if it was on before
      this.deltaMode = true;
      this.deltaModeStored = false;
      setDeltaMode(true);
      setDeltaMonitor(true);
    }

    this.guillotine.setActive(active);
    this.lever.setActive(active);
    this.bloodPool.setActive(active);

    // Grey out output gain when bypassed (still functional)
    this.outputGainKnob.setDisabled(this.bypass);
    this.microscope.setActive(active);

    // Update hover affordance for delta mode triggers
    this.updateDeltaClickable();
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GuillotineApp());
} else {
  new GuillotineApp();
}

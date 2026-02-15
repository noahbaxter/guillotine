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
  onStereoModeChange,
  setGainMode,
  getGainMode,
  onGainModeChange,
  getNativeFunction
} from './lib/juce-bridge.js';
import { applyWithCeiling } from './lib/saturation-curves.js';
import { setDeltaMode, toggleReadableMode } from './lib/theme.js';
import { setGlowSource, setSharpness } from './lib/blade-state.js';
import { initUpdateChecker } from './lib/update-checker.js';
import './lib/crt-effect.js';  // Initialize CRT effects (scanlines, jitter, vignette)

// Load locally embedded fonts
const fontStyles = document.createElement('style');
fontStyles.textContent = `
  @font-face { font-family: 'Zeyada'; src: url('assets/fonts/zeyada.ttf') format('truetype'); }
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
// Derived from HEIGHT (not width) so mode toggles never cause font recalculation.
// WebView width = height * 1.2, so: fontSize = height * 1.2 / 600 * 16 = height / 500 * 16
const BASE_HEIGHT = 500;
const BASE_FONT_SIZE = 16;
const resizeObserver = new ResizeObserver(entries => {
  const height = entries[0].contentRect.height;
  document.documentElement.style.fontSize = (height / BASE_HEIGHT) * BASE_FONT_SIZE + 'px';
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
    this.gainMode = 0;          // 0=Manual, 1=Match, 2=Maximize

    // Track if we're currently dragging to avoid feedback loops
    this.draggingParam = null;

    // View mode
    this.viewMode = 'advanced';
    this.nativeSetViewMode = getNativeFunction('setViewMode');

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

    // Gain mode toggle (Manual / Gain Match / Maximize) - 3-way toggle
    // true = Manual (0), null = Gain Match (1), false = Maximize (2)
    this.gainModeToggle = new Toggle(document.getElementById('gain-mode-container'), {
      value: true,
      threeWay: true,
      icons: {
        up: 'assets/icons/gain-manual.svg',
        mid: 'assets/icons/gain-match.svg',
        down: 'assets/icons/gain-maximize.svg'
      },
      tooltips: {
        on: 'Manual',
        mid: 'Gain Match',
        off: 'Maximize'
      }
    });

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
      led: true,
      compact: true,  // Only has icon on top
      icons: {
        on: 'assets/icons/true-peak.svg'
      },
      tooltips: {
        on: 'True Peak',
        off: ''
      }
    });

    this.filterTypeToggle = new Toggle(this.togglesColumnContainer, {
      value: false,  // 0 = Min Phase (off), 1 = Linear Phase (on)
      icons: {
        on: 'assets/icons/linear-phase.svg',
        off: 'assets/icons/min-phase.svg'
      },
      tooltips: {
        on: 'Linear Phase',
        off: 'Min Phase'
      }
    });

    // Stereo mode: 3-way toggle (Stereo Link / L/R / M/S)
    // true = Stereo Link (0), null = L/R (1), false = M/S (2)
    this.stereoModeToggle = new Toggle(this.togglesColumnContainer, {
      value: true,  // Default to Stereo Link
      threeWay: true,
      icons: {
        up: 'assets/icons/stereo-link.svg',
        mid: 'assets/icons/lr.svg',
        down: 'assets/icons/ms.svg'
      },
      tooltips: {
        on: 'Stereo Link',
        mid: 'Dual Mono',
        off: 'M/S'
      }
    });

    // Output Gain knob (manual mode)
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

    // Auto Output Gain knob (match/maximize modes — read-only display)
    this.autoOutputGainKnob = new Knob(this.outputKnobContainer, createSpriteKnob({
      label: TEXT.labels.output,
      min: -60, max: 60, value: 0,
      size: KNOB_SIZE.SMALL,
      spriteScale: 0.25,
      suffix: TEXT.suffixes.dB,
      formatter: (v) => v.toFixed(1),
      snap: (v) => Math.round(v * 10) / 10,
      wrapperClass: 'knob-wrapper--side'
    }));
    this.autoOutputGainKnob.setVisible(false);

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
      this.autoOutputGainKnob.ready,
      this.filterTypeToggle.ready,
      this.stereoModeToggle.ready,
      this.trueclipToggle.ready,
      this.gainModeToggle.ready
    ]);

    // View toggle — chevron + label, positioned at top-right of app
    this.viewToggle = document.createElement('button');
    this.viewToggle.className = 'view-toggle';
    this.viewToggle.innerHTML = '<span class="view-toggle__chevron"></span>';
    this.viewToggle.addEventListener('click', () => this.toggleViewMode());
    document.getElementById('left-panel').appendChild(this.viewToggle);

    // Start with exponent knob disabled (only enable for T²)
    this.curveExponentKnob.setDisabled(true);

    // Wire up threshold changes from knob
    this.thresholdKnob.onChange = (value) => {
      this.setThreshold(value, 'knob');
    };
    bindDragTracking(this.thresholdKnob, 'ceiling', this,
      () => setGlowSource('knobDrag', true),
      () => setGlowSource('knobDrag', false)
    );

    // Hover on ceiling knob triggers blade glow
    this.thresholdKnob.element.addEventListener('mouseenter', () => {
      setGlowSource('knobHover', true);
    });
    this.thresholdKnob.element.addEventListener('mouseleave', () => {
      setGlowSource('knobHover', false);
    });

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

    // Dry/Wet mix - fades guillotine texture and syncs to DSP parameter
    this.drywetKnob.onChange = (v) => {
      const normalized = v / 100;
      this.guillotine.setDryWet(normalized);
      this.lever.setDryWet(normalized);
      // Also fade the side art main layer
      const sideMain = document.querySelector('.guillotine-side__img--main');
      if (sideMain) {
        sideMain.style.opacity = normalized;
      }
      // Sync to DSP parameter
      setParameterNormalized('dryWet', normalized);
    };
    bindDragTracking(this.drywetKnob, 'dryWet', this);

    // Settings toggles
    this.filterTypeToggle.onChange = (v) => setFilterType(v ? 1 : 0);
    // Stereo mode: true = Stereo Link (0), null = L/R (1), false = M/S (2)
    this.stereoModeToggle.onChange = (v) => {
      const mode = v === true ? 0 : v === null ? 1 : 2;
      setStereoMode(mode);
    };
    this.trueclipToggle.onChange = (v) => setEnforceCeiling(v);
    // Gain mode: true = Manual (0), null = Gain Match (1), false = Maximize (2)
    this.gainModeToggle.onChange = (v) => {
      const mode = v === true ? 0 : v === null ? 1 : 2;
      setGainMode(mode);
      this.setGainMode(mode);
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
        this.updateAutoGain();
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
        this.updateAutoGain();
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
        this.updateAutoGain();
      }
    });

    onParameterChange('oversampling', () => {
      if (this.draggingParam !== 'oversampling') {
        const normalized = getParameterNormalized('oversampling');
        const index = Math.round(normalized * 5);  // 0-5
        this.oversamplingKnob.setValue(index);
      }
    });

    onParameterChange('dryWet', () => {
      if (this.draggingParam !== 'dryWet') {
        const normalized = getParameterNormalized('dryWet');
        this.drywetKnob.setValue(normalized * 100);
        this.guillotine.setDryWet(normalized);
        this.lever.setDryWet(normalized);
        const sideMain = document.querySelector('.guillotine-side__img--main');
        if (sideMain) {
          sideMain.style.opacity = normalized;
        }
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

    onGainModeChange((mode) => {
      const toggleValue = mode === 0 ? true : mode === 1 ? null : false;
      this.gainModeToggle.setValue(toggleValue);
      this.setGainMode(mode);
    });

    // Listen for bypass changes from C++ (DAW automation)
    onBypassClipperChange((bypassed) => {
      this.setBypass(bypassed);
    });


    // Initialize all UI state from C++ parameter values
    this.initializeFromParams();

    // Restore view mode preference
    if (localStorage.getItem('guillotine-view-mode') === 'basic') {
      this.toggleViewMode();
    }

    // Mark animated components as initialized (enables animations for subsequent changes)
    this.guillotine.markInitialized();
    this.lever.markInitialized();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Toggle readable mode with R key
      if (e.key === 'r' || e.key === 'R') {
        toggleReadableMode();
      }
    });

    // Update checker (C++ pushes window.onUpdateAvailable if newer version exists)
    initUpdateChecker(getNativeFunction('openURL'));

    // Disable browser context menu
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Remove loading class (re-enables transitions) and fade in
    // Use double RAF to ensure DOM has settled with correct initial values
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove('loading');
        document.body.classList.add('ready');
      });
    });
  }

  initializeFromParams() {
    // Demo/embed defaults (window.GUILLOTINE_DEFAULTS) override C++ parameter values
    // Values use user-friendly units: dB for ceiling/gains, % for dryWet, indices for choices
    const d = window.GUILLOTINE_DEFAULTS;

    // Helpers: get value from defaults or juce-bridge, optionally set on a control
    const get = (key, fromJuce) => d?.[key] ?? fromJuce();
    const init = (control, key, fromJuce) => control.setValue(get(key, fromJuce));

    // Bypass
    this.bypass = get('bypass', getBypassClipper);
    this.updateBypassVisual();

    // Ceiling: dB → threshold (inverted: 0dB = 0, -60dB = 1)
    this.setThreshold(this.dbToThreshold(get('ceiling', () => this.thresholdToDb(1 - getParameterNormalized('ceiling')))), 'init');

    // Curve (0-6: Hard, Quint, Cubic, Tanh, Atan, Knee, T2)
    const curveIndex = get('curve', () => Math.round(getParameterNormalized('curve') * 6));
    this.currentCurve = curveIndex;
    this.curveKnob.setValue(curveIndex);
    this.microscope.setCurveMode(curveIndex);
    this.curveExponentKnob.setDisabled(curveIndex < 5);

    // Curve exponent (1.0-4.0, for Knee/T2)
    this.currentExponent = get('curveExponent', () => 1.0 + getParameterNormalized('curveExponent') * 3.0);
    this.curveExponentKnob.setValue(this.currentExponent);
    this.microscope.setCurveExponent(this.currentExponent);
    this.updateSharpnessFromCurve();

    // Simple knobs
    init(this.oversamplingKnob, 'oversampling', () => Math.round(getParameterNormalized('oversampling') * 5));
    init(this.inputGainKnob, 'inputGain', () => this.normalizedToDb(getParameterNormalized('inputGain')));
    init(this.outputGainKnob, 'outputGain', () => this.normalizedToDb(getParameterNormalized('outputGain')));

    // Delta mode (only active when blade is down)
    if (get('deltaMode', getDeltaMonitor) && !this.bypass) {
      this.deltaMode = true;
      setDeltaMode(true);
    }

    // Dry/Wet mix (0-100%) - needs to update multiple components
    const dryWet = get('dryWet', () => getParameterNormalized('dryWet') * 100) / 100;
    this.drywetKnob.setValue(dryWet * 100);
    this.guillotine.setDryWet(dryWet);
    this.lever.setDryWet(dryWet);
    document.querySelector('.guillotine-side__img--main')?.style.setProperty('opacity', dryWet);

    // Settings toggles
    this.filterTypeToggle.setValue(get('filterType', getFilterType) === 1);
    const stereoMode = get('stereoMode', getStereoMode);
    this.stereoModeToggle.setValue(stereoMode === 0 ? true : stereoMode === 1 ? null : false);
    this.trueclipToggle.setValue(get('truePeak', getEnforceCeiling));
    const gainMode = get('gainMode', getGainMode);
    this.gainModeToggle.setValue(gainMode === 0 ? true : gainMode === 1 ? null : false);
    this.setGainMode(gainMode);

    // Microscope zoom
    if (d?.zoom !== undefined) this.microscope.setScale(d.zoom);
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

    this.updateAutoGain();
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
    this.updateAutoGain();
  }

  setCurveExponent(value) {
    // Knob shows 4-1 inverted, but value is the actual exponent (1-4)
    this.currentExponent = value;
    const normalized = (value - 1.0) / 3.0;  // 1.0-4.0 -> 0-1
    setParameterNormalized('curveExponent', normalized);
    this.microscope.setCurveExponent(value);
    this.updateSharpnessFromCurve();
    this.updateAutoGain();
  }

  updateSharpnessFromCurve() {
    // Map curve type to blade sharpness (1.0 = sharp/flat, 0 = jittery/dull)
    // Hard clips = sharp blade, soft saturation = dull blade
    const curveSharpness = [1.0, 0.85, 0.7, 0.35, 0.15, null, null];
    let value = curveSharpness[this.currentCurve];

    // Knee (5) and T2 (6): exponent controls sharpness (inverted)
    // Exponent 1 = sharp (0.9), exponent 4 = very soft (0.05)
    if (value === null) {
      value = 0.05 + (4.0 - this.currentExponent) / 3 * 0.85;
    }

    setSharpness(value);
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
    this.updateAutoGain();
  }

  setOutputGain(dbValue) {
    const normalized = this.dbToNormalized(dbValue);
    setParameterNormalized('outputGain', normalized);
  }

  setGainMode(mode) {
    this.gainMode = mode;
    const isAuto = mode !== 0;

    // Swap knob visibility
    this.outputGainKnob.setVisible(!isAuto);
    this.autoOutputGainKnob.setVisible(isAuto);

    this.updateOutputKnobState();

    if (isAuto)
      this.updateAutoGain();
  }

  updateOutputKnobState() {
    if (this.bypass) {
      // Blade up: everything disabled
      this.outputGainKnob.setDisabled(true);
      this.autoOutputGainKnob.setDisabled(true);
    } else if (this.gainMode === 0) {
      // Blade down + manual: fully interactive
      this.outputGainKnob.setDisabled(false);
      this.autoOutputGainKnob.setDisabled(true);
    } else {
      // Blade down + match/maximize: faded, no interaction
      this.outputGainKnob.setDisabled(true);
      this.autoOutputGainKnob.setDisabled(true);
    }
  }

  computeAutoGain() {
    const ceilingDb = this.thresholdToDb(this.threshold);

    // Maximize: bring ceiling back to 0dBFS
    if (this.gainMode === 2)
      return -ceilingDb;

    // Match: run two reference signals, blend based on ceiling depth.
    // Transient ref (exp decay, CF~12dB) for drum-like content.
    // Tonal ref (Gaussian, CF~6dB) for sustained content.
    // Shallow ceiling → transient-weighted, deep ceiling → tonal-weighted.
    const N = 32;
    const decayRate = 8.0;   // exp(-8t), CF ≈ 12dB
    const gaussAlpha = 25.5; // exp(-25.5*(t-0.5)²), CF ≈ 6dB

    const inputLin = Math.pow(10, this.inputGainKnob.getValue() / 20);
    const ceilLin = Math.pow(10, ceilingDb / 20);

    let transSumSqOrig = 0, transSumSqClip = 0;
    let tonalSumSqOrig = 0, tonalSumSqClip = 0;

    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;

      // Transient: exponential decay
      const transient = Math.exp(-decayRate * t);
      const transDriven = transient * inputLin;
      const transClipped = applyWithCeiling(this.currentCurve, transDriven, ceilLin, this.currentExponent);
      transSumSqOrig += transient * transient;
      transSumSqClip += transClipped * transClipped;

      // Tonal: Gaussian bell curve
      const dt = t - 0.5;
      const tonal = Math.exp(-gaussAlpha * dt * dt);
      const tonalDriven = tonal * inputLin;
      const tonalClipped = applyWithCeiling(this.currentCurve, tonalDriven, ceilLin, this.currentExponent);
      tonalSumSqOrig += tonal * tonal;
      tonalSumSqClip += tonalClipped * tonalClipped;
    }

    const computeComp = (sumSqOrig, sumSqClip) => {
      const rmsOrig = Math.sqrt(sumSqOrig / N);
      const rmsClip = Math.sqrt(sumSqClip / N);
      if (rmsClip <= 0 || rmsOrig <= 0) return 0;
      return 20 * Math.log10(rmsOrig / rmsClip);
    };

    const transientComp = computeComp(transSumSqOrig, transSumSqClip);
    const tonalComp = computeComp(tonalSumSqOrig, tonalSumSqClip);

    // Blend: 0.0 = pure transient, 1.0 = pure tonal
    // Linear map from -6dB ceiling (transient) to -18dB ceiling (tonal), clamped
    const blend = Math.max(0, Math.min(1, (ceilingDb - (-6)) / (-18 - (-6))));

    let compensation = transientComp + blend * (tonalComp - transientComp);

    // Progressive reduction: pull back slightly at deep ceilings where match still feels hot.
    // Linear ramp: 0dB extra at 0dB ceiling, -matchReductionDb at -60dB ceiling.
    const matchReductionDb = 2.0;
    const reductionBlend = Math.max(0, Math.min(1, ceilingDb / -60));
    compensation -= matchReductionDb * reductionBlend;

    // Clamp: match should never exceed maximize (handles Arctan/Tanh at shallow ceilings)
    return Math.min(Math.max(compensation, 0), -ceilingDb);
  }

  updateAutoGain() {
    if (this.gainMode === 0) return;
    const autoDb = this.computeAutoGain();
    this.autoOutputGainKnob.setValue(autoDb);
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

  toggleViewMode() {
    const goingBasic = this.viewMode === 'advanced';
    this.viewMode = goingBasic ? 'basic' : 'advanced';

    // Toggle right panel visibility (layout unchanged — WebView stays at advanced width)
    document.getElementById('app').classList.toggle('basic-mode', goingBasic);

    if (goingBasic) {
      this.microscope.pause();
    } else {
      this.microscope.resume();
    }

    // Force pointer cursor during resize — native setSize() shifts the button
    // out from under the cursor, causing it to revert to default
    document.body.style.cursor = 'pointer';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { document.body.style.cursor = ''; });
    });

    // Resize editor window (right panel clips off-screen or becomes visible)
    this.nativeSetViewMode(String(!goingBasic));
    localStorage.setItem('guillotine-view-mode', this.viewMode);
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

    // Output knob state depends on bypass + gain mode
    this.updateOutputKnobState();
    this.microscope.setActive(active);

    // Update hover affordance for delta mode triggers
    this.updateDeltaClickable();
  }
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.guillotineApp = new GuillotineApp());
} else {
  window.guillotineApp = new GuillotineApp();
}

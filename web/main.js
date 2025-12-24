// Guillotine Plugin - Main Entry Point
// Phase 1: Basic layout with guillotine on left, microscope placeholder on right

import { Guillotine } from './components/guillotine.js';
import { Knob } from './components/knob.js';
import { sendParameter, registerCallback } from './lib/juce-bridge.js';

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
    this.threshold = 0.5;

    // Create components
    this.guillotine = new Guillotine(this.guillotineContainer);

    // Temporary: single threshold knob for Phase 1 testing
    this.thresholdKnob = new Knob(this.mainKnobsContainer, {
      label: 'Threshold',
      value: this.threshold,
      size: 50
    });

    // Wire up events
    this.thresholdKnob.onChange = (value) => {
      this.threshold = value;
      this.guillotine.setPosition(value);
      sendParameter('threshold', value);
    };

    // Bypass toggle on guillotine click
    this.guillotineContainer.addEventListener('click', () => this.toggleBypass());

    // Register JUCE callbacks
    registerCallback('setThreshold', (value) => {
      this.threshold = value;
      this.thresholdKnob.setValue(value);
      this.guillotine.setPosition(value);
    });

    registerCallback('setBypass', (value) => {
      this.bypass = value;
      this.updateBypassVisual();
    });

    // Initial state
    this.updateBypassVisual();
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

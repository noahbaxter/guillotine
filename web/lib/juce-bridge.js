// JUCE WebView Bridge - uses official JUCE frontend library
import * as Juce from './juce/index.js';

// Get slider states for each parameter (auto-synced with C++)
const sliderStates = {
    inputGain: Juce.getSliderState("inputGain"),
    outputGain: Juce.getSliderState("outputGain"),
    threshold: Juce.getSliderState("threshold")
};

// Set a parameter value (normalized 0-1)
export function setParameterNormalized(id, normalizedValue) {
    const state = sliderStates[id];
    if (state) {
        state.setNormalisedValue(normalizedValue);
    } else {
        console.warn(`Unknown parameter: ${id}`);
    }
}

// Get current parameter value (normalized 0-1)
export function getParameterNormalized(id) {
    const state = sliderStates[id];
    return state?.getNormalisedValue() ?? 0;
}

// Get slider state properties (range, steps, etc.)
export function getParameterProperties(id) {
    const state = sliderStates[id];
    return state?.properties ?? null;
}

// Listen for parameter changes from C++ (DAW automation, presets, etc.)
export function onParameterChange(id, callback) {
    const state = sliderStates[id];
    if (state) {
        state.valueChangedEvent.addListener(callback);
    } else {
        console.warn(`Unknown parameter for listener: ${id}`);
    }
}

// Notify slider drag started (for proper undo/redo in DAW)
export function parameterDragStarted(id) {
    const state = sliderStates[id];
    if (state) {
        state.sliderDragStarted();
    }
}

// Notify slider drag ended
export function parameterDragEnded(id) {
    const state = sliderStates[id];
    if (state) {
        state.sliderDragEnded();
    }
}

// Register a global callback function (for C++ to call via evaluateJavascript)
export function registerCallback(name, callback) {
    window[name] = callback;
}

// Export JUCE library for direct access if needed
export { Juce };

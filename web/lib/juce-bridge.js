// JUCE WebView Bridge - uses official JUCE frontend library
import * as Juce from './juce/index.js';

// Get slider states for each parameter (auto-synced with C++)
const sliderStates = {
    inputGain: Juce.getSliderState("inputGain"),
    outputGain: Juce.getSliderState("outputGain"),
    ceiling: Juce.getSliderState("ceiling"),
    curve: Juce.getSliderState("curve"),
    oversampling: Juce.getSliderState("oversampling"),
    filterType: Juce.getSliderState("filterType"),
    channelMode: Juce.getSliderState("channelMode"),
    stereoLink: Juce.getSliderState("stereoLink"),
    deltaMonitor: Juce.getSliderState("deltaMonitor"),
    bypassClipper: Juce.getSliderState("bypassClipper")
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

// Delta monitor helpers - syncs UI delta mode with C++ param
export function setDeltaMonitor(enabled) {
    const state = sliderStates.deltaMonitor;
    if (state) {
        state.setNormalisedValue(enabled ? 1.0 : 0.0);
    }
}

export function getDeltaMonitor() {
    const state = sliderStates.deltaMonitor;
    return state ? state.getNormalisedValue() > 0.5 : false;
}

export function onDeltaMonitorChange(callback) {
    const state = sliderStates.deltaMonitor;
    if (state) {
        state.valueChangedEvent.addListener(() => {
            callback(state.getNormalisedValue() > 0.5);
        });
    }
}

// Bypass clipper helpers - syncs UI bypass state with C++ param
export function setBypassClipper(enabled) {
    const state = sliderStates.bypassClipper;
    if (state) {
        state.setNormalisedValue(enabled ? 1.0 : 0.0);
    }
}

export function getBypassClipper() {
    const state = sliderStates.bypassClipper;
    return state ? state.getNormalisedValue() > 0.5 : true;
}

export function onBypassClipperChange(callback) {
    const state = sliderStates.bypassClipper;
    if (state) {
        state.valueChangedEvent.addListener(() => {
            callback(state.getNormalisedValue() > 0.5);
        });
    }
}

// Export JUCE library for direct access if needed
export { Juce };

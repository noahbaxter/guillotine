// JUCE WebView Bridge utilities

export function sendParameter(id, value) {
  if (window.__JUCE__?.backend) {
    window.__JUCE__.backend.setParameter(id, value);
  }
}

export function registerCallback(name, callback) {
  window[name] = callback;
}

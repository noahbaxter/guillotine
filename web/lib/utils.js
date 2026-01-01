// Shared utility functions

// Convert px to em (base 16px font-size)
export const pxToEm = (px) => px / 16;

// Centralized text + image pairs for stylized text
// Each entry has { text, src } so readable mode text is always defined alongside the image
export const TEXT = {
  labels: {
    blade: { text: 'Blade', src: 'assets/text/controls/blade.png' },
    ceiling: { text: 'Ceiling', src: 'assets/text/controls/ceiling.png' },
    oversample: { text: 'Oversample', src: 'assets/text/controls/oversample.png' },
    input: { text: 'Input', src: 'assets/text/controls/input.png' },
    output: { text: 'Output', src: 'assets/text/controls/output.png' }
  },
  suffixes: {
    dB: { text: ' dB', src: 'assets/text/controls/dB.png' },
    x: { text: 'x', src: 'assets/text/controls/x.png' }
  },
  blades: [
    { text: 'Hard', src: 'assets/text/controls/blades/hard.png' },
    { text: 'Quint', src: 'assets/text/controls/blades/quint.png' },
    { text: 'Cubic', src: 'assets/text/controls/blades/cubic.png' },
    { text: 'Tanh', src: 'assets/text/controls/blades/tanh.png' },
    { text: 'Atan', src: 'assets/text/controls/blades/atan.png' },
    { text: 'Knee', src: 'assets/text/controls/blades/knee.png' },
    { text: 'T2', src: 'assets/text/controls/blades/t2.png' }
  ]
};

// Create an image/text toggle element
// Accepts either { text, src } object or separate (text, src) arguments
// Text is hidden but takes up space; image overlays absolutely
// In readable mode, text shows and image hides (via CSS)
export function createImageText(textOrObj, srcOrClassName, maybeClassName) {
  let text, src, className;

  if (typeof textOrObj === 'object' && textOrObj.text && textOrObj.src) {
    // Called with { text, src } object
    text = textOrObj.text;
    src = textOrObj.src;
    className = srcOrClassName || 'image-text';
  } else {
    // Called with (text, src, className) arguments
    text = textOrObj;
    src = srcOrClassName;
    className = maybeClassName || 'image-text';
  }

  const container = document.createElement('span');
  container.className = `${className}`;

  const textEl = document.createElement('span');
  textEl.className = `${className}__text`;
  textEl.textContent = text;
  container.appendChild(textEl);

  const imgEl = document.createElement('img');
  imgEl.className = `${className}__image`;
  imgEl.src = src;
  imgEl.alt = text;
  container.appendChild(imgEl);

  return { container, textEl, imgEl };
}

// Shorthand for creating a dB suffix (most common case)
export function createDbSuffix(className = 'image-text') {
  return createImageText(TEXT.suffixes.dB, className);
}

// Shared utility functions

// Convert px to em (base 16px font-size)
export const pxToEm = (px) => px / 16;

// Centralized text + image pairs for stylized text
// Each entry has { text, src } so readable mode text is always defined alongside the image
export const TEXT = {
  labels: {
    blade: { text: 'Blade', src: 'assets/labels/blade.png' },
    ceiling: { text: 'Ceiling', src: 'assets/labels/ceiling.png' },
    oversample: { text: 'Oversample', src: 'assets/labels/oversample.png' },
    input: { text: 'Input', src: 'assets/labels/input.png' },
    output: { text: 'Output', src: 'assets/labels/output.png' },
    mix: { text: '', src: null }
  },
  suffixes: {
    dB: { text: ' dB', src: 'assets/labels/dB.png' },
    x: { text: 'x', src: 'assets/labels/x.png' },
    percent: { text: '%', src: null }
  },
  blades: [
    { text: 'Hard', src: 'assets/curves/hard.png' },
    { text: 'Quint', src: 'assets/curves/quint.png' },
    { text: 'Cubic', src: 'assets/curves/cubic.png' },
    { text: 'Tanh', src: 'assets/curves/tanh.png' },
    { text: 'Atan', src: 'assets/curves/atan.png' },
    { text: 'Knee', src: 'assets/curves/knee.png' },
    { text: 'T2', src: 'assets/curves/t2.png' }
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

  const imgEl = document.createElement('div');
  imgEl.className = `${className}__image text-mask`;
  imgEl.style.setProperty('--mask-src', `url(${src})`);
  container.appendChild(imgEl);

  return { container, textEl, imgEl };
}

// Shorthand for creating a dB suffix (most common case)
export function createDbSuffix(className = 'image-text') {
  return createImageText(TEXT.suffixes.dB, className);
}

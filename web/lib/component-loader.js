// Component Loader Utility
// Handles loading and caching of component CSS

const styleCache = new Map();

export async function loadStyles(path) {
  if (styleCache.has(path)) return;

  const response = await fetch(path);
  if (!response.ok) {
    console.error(`Failed to load styles: ${path} (${response.status})`);
    return;
  }
  const css = await response.text();

  const style = document.createElement('style');
  style.setAttribute('data-component', path);
  style.textContent = css;
  document.head.appendChild(style);

  styleCache.set(path, true);
}

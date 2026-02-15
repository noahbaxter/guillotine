const RELEASES_URL = 'https://github.com/noahbaxter/guillotine/releases/latest';
const STORAGE_LAST_PROMPT = 'guillotine-update-last-prompt';
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let openURLNative = null;

export function initUpdateChecker(openURLFn) {
  openURLNative = openURLFn;

  window.onUpdateAvailable = (version) => {
    showUpdateIndicator(version);
    maybeShowPrompt(version);
  };
}

function showUpdateIndicator(version) {
  const indicator = document.getElementById('update-indicator');
  if (!indicator) return;

  indicator.style.display = 'inline-flex';
  indicator.title = `v${version} available`;
  indicator.addEventListener('click', () => showUpdatePrompt(version));
}

function maybeShowPrompt(version) {
  const lastPrompt = parseInt(localStorage.getItem(STORAGE_LAST_PROMPT) || '0', 10);
  if (Date.now() - lastPrompt < PROMPT_COOLDOWN_MS) return;

  showUpdatePrompt(version);
}

function showUpdatePrompt(version) {
  const overlay = document.getElementById('update-prompt-overlay');
  if (!overlay) return;

  overlay.querySelector('.update-prompt__version').textContent = `v${version}`;
  overlay.style.display = 'flex';

  const yesBtn = overlay.querySelector('.update-prompt__yes');
  const noBtn = overlay.querySelector('.update-prompt__no');

  const cleanup = () => {
    overlay.style.display = 'none';
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
  };

  const onYes = () => {
    cleanup();
    localStorage.setItem(STORAGE_LAST_PROMPT, String(Date.now()));
    openReleasesPage();
  };

  const onNo = () => {
    cleanup();
    localStorage.setItem(STORAGE_LAST_PROMPT, String(Date.now()));
  };

  yesBtn.addEventListener('click', onYes);
  noBtn.addEventListener('click', onNo);
}

function openReleasesPage() {
  if (openURLNative) {
    openURLNative(RELEASES_URL);
  }
}

/**
 * Compact-window sizing for the installed app.
 *
 * There is no web-manifest field for a PWA's window size, and browsers block
 * `resizeTo()` for ordinary tabs. But for an *installed* PWA the window is a
 * standalone app window, where `resizeTo()`/`moveTo()` are allowed — so on
 * launch we shrink it to a small, single-purpose size (and centre it), close
 * to a little native tool window.
 *
 * In a normal browser tab this is a no-op (the standalone check fails), so it
 * never affects the dev server or the website. If a browser refuses the
 * resize, the try/catch leaves the window exactly as the OS placed it.
 */

// Target size of the installed window, in CSS pixels.
const TARGET_WIDTH = 600;
const TARGET_HEIGHT = 760;

function isInstalledApp(): boolean {
  const mm = window.matchMedia?.bind(window);
  if (mm) {
    if (
      mm('(display-mode: standalone)').matches ||
      mm('(display-mode: minimal-ui)').matches ||
      mm('(display-mode: window-controls-overlay)').matches
    ) {
      return true;
    }
  }
  // iOS home-screen apps.
  return (navigator as { standalone?: boolean }).standalone === true;
}

function applyCompactSize(): void {
  try {
    const w = Math.min(TARGET_WIDTH, window.screen.availWidth);
    const h = Math.min(TARGET_HEIGHT, window.screen.availHeight);

    window.resizeTo(w, h);

    const left = Math.max(0, Math.floor((window.screen.availWidth - w) / 2));
    const top = Math.max(0, Math.floor((window.screen.availHeight - h) / 2));
    window.moveTo(left, top);
  } catch {
    // Resizing/moving isn't permitted in this context — leave the window as is.
  }
}

export function fitInstalledWindow(): void {
  if (!isInstalledApp()) return;

  applyCompactSize();

  // Some browsers only honour resizeTo() after a user gesture, so retry once on
  // the first interaction. Harmless if the load-time call already worked.
  const retry = () => {
    applyCompactSize();
    window.removeEventListener('pointerdown', retry);
  };
  window.addEventListener('pointerdown', retry, { once: true });
}

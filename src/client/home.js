/**
 * Home-Bildschirm (A6 UI-Rest).
 *
 * Die Startseite vor dem Menü. Sie wird beim ersten Laden eingeblendet und
 * beim ersten Klick auf "Match starten" oder "Überrasch mich" ausgeblendet.
 * Danach kommt das normale Menü (menu-overlay).
 *
 * @module home
 */

const HOME_KEY = 'pa.home.v1';

/** Prüft, ob der Home-Bildschirm schon einmal gesehen wurde. */
function homeGesehen() {
  try {
    return sessionStorage.getItem(HOME_KEY) === '1';
  } catch {
    return false;
  }
}

/** Markiert den Home-Bildschirm als gesehen. */
function markiereHomeGesehen() {
  try {
    sessionStorage.setItem(HOME_KEY, '1');
  } catch { /* ignorieren */ }
}

/** Blendet den Home-Bildschirm aus und zeigt das Menü. */
function verlasseHome() {
  const home = document.getElementById('home-screen');
  const menu = document.getElementById('menu-overlay');
  if (!home || !home.hasAttribute('hidden')) return;
  home.setAttribute('hidden', '');
  markiereHomeGesehen();
  if (menu) menu.removeAttribute('hidden');
}

/** Initialisiert den Home-Bildschirm. */
export function starteHome() {
  const home = document.getElementById('home-screen');
  const menu = document.getElementById('menu-overlay');
  if (!home) return false;

  // Schon gesehen? Dann direkt Menü zeigen.
  if (homeGesehen()) {
    home.setAttribute('hidden', '');
    if (menu) menu.removeAttribute('hidden');
    return false;
  }

  // Menü initial verstecken, Home zeigen
  if (menu) menu.setAttribute('hidden', '');
  home.removeAttribute('hidden');

  // Klick auf "Match starten" oder "Überrasch mich" -> Home verlassen
  const startBtn = document.getElementById('home-start');
  const ueberraschBtn = document.getElementById('home-ueberrasch');

  const handler = () => {
    verlasseHome();
  };

  // Knöpfe verbinden
  if (startBtn) startBtn.addEventListener('click', handler, { once: true });
  if (ueberraschBtn) ueberraschBtn.addEventListener('click', handler, { once: true });

  // Jede Taste oder Klick irgendwo verlässt den Home-Bildschirm (nur wenn nicht bereits passiert)
  const tasteHandler = (e) => {
    // Nur verlassen, wenn das Ereignis nicht von einem Form-Input stammt (z. B. Taste in Seed-Feld)
    if (!e.target.closest('input, select, textarea, button, details, summary')) {
      handler();
    }
  };
  const klickHandler = () => handler();

  document.addEventListener('keydown', tasteHandler, { once: true });
  document.addEventListener('click', klickHandler, { once: true });

  return true;
}

/** Für Tests: Setzt den Zustand zurück. */
export function _resetHomeFuerTest() {
  try {
    sessionStorage.removeItem(HOME_KEY);
  } catch { /* ignorieren */ }
}
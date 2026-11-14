/**
 * Intro-Splash (A6 UI-Rest).
 *
 * Der allererste Bildschirm beim Laden der Seite. Zeigt Logo und Ladebalken,
 * blendet nach kurzer Zeit zum Home-Bildschirm über.
 *
 * @module introSplash
 */

const SPLASH_DAUER_MS = 1800;

/**
 * Startet den Intro-Splash.
 * Zeigt ihn für 1,8 Sekunden und blendet dann automatisch um zum Home-Bildschirm.
 */
export function starteIntroSplash() {
  const splash = document.getElementById('intro-splash');
  if (!splash) return false;

  // Splash ausblenden (falls vorhanden vom vorherigen Load)
  splash.setAttribute('hidden', '');

  // Kurz einblenden für den visuellen Effekt
  splash.removeAttribute('hidden');

  // Nach Ablauf der Zeit das Home-Bildschirm einblenden
  setTimeout(() => {
    splash.setAttribute('hidden', '');
    // Home-Bildschirm wird durch home.js selbst initialisiert
    const home = document.getElementById('home-screen');
    if (home && home.hasAttribute('hidden')) {
      home.removeAttribute('hidden');
    }
  }, SPLASH_DAUER_MS);

  return true;
}
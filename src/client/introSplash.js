/**
 * Intro-Splash (A6 UI-Rest).
 *
 * Der allererste Bildschirm beim Laden der Seite. Zeigt Logo und Ladebalken,
 * blendet sich nach kurzer Zeit aus; darunter liegt der Home-Bildschirm (home.js).
 *
 * @module introSplash
 */

const SPLASH_DAUER_MS = 1800;

/**
 * Startet den Intro-Splash.
 * Zeigt ihn für 1,8 Sekunden und blendet sich dann selbst aus (der Home-Bildschirm liegt schon darunter).
 */
export function starteIntroSplash() {
  const splash = document.getElementById('intro-splash');
  if (!splash) return false;

  // Splash ausblenden (falls vorhanden vom vorherigen Load)
  splash.setAttribute('hidden', '');

  // Kurz einblenden für den visuellen Effekt
  splash.removeAttribute('hidden');

  // Nach Ablauf der Zeit blendet sich der Splash nur selbst aus. Ob der Home-Bildschirm
  // zu sehen ist, entscheidet allein home.js (`starteHome`, `verlasseHome`): Der Splash
  // hat ihn früher nach 1,8 s bedingungslos wieder eingeblendet, auch über Menü und Match.
  setTimeout(() => {
    splash.setAttribute('hidden', '');
  }, SPLASH_DAUER_MS);

  return true;
}
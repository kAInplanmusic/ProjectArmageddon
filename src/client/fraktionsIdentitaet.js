/** Visuelle Fraktionsidentität. Keine Spielwerte; Spieler-Teamfarbe bleibt unabhängig. */
import { FRAKTIONS_FARBEN } from '../shared/config/fraktions-farben.js';

export { FRAKTIONS_FARBEN };

/*
 * A5/ENG-12: Der Glob wird erst beim ersten Zugriff ausgewertet, nicht beim
 * Modulimport. `node --test` kennt `import.meta.glob` nicht; der try/catch
 * liefert dort eine leere Tabelle, statt die ganze Importkette des Renderers
 * unladbar zu machen. Im Vite-Build bleibt der Glob derselbe (Vite ersetzt den
 * Aufruf statisch durch die URL-Tabelle).
 */
let zeichen = null;
function zeichenUrls() {
  if (zeichen === null) {
    try {
      zeichen = import.meta.glob('./assets/fraktionszeichen/*.svg', { eager: true, query: '?url', import: 'default' });
    } catch {
      zeichen = {};
    }
  }
  return zeichen;
}

/** Liefert lokale URLs und Gestaltungswerte für eine bekannte Fraktion. */
export function fraktionsIdentitaet(id) {
  const eintrag = FRAKTIONS_FARBEN[id];
  const zeichenTabelle = zeichenUrls();
  return eintrag ? { ...eintrag,
    emblem: zeichenTabelle[`./assets/fraktionszeichen/${id}.svg`],
    banner: zeichenTabelle[`./assets/fraktionszeichen/${id}-banner.svg`],
  } : null;
}

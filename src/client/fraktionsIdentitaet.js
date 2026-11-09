/** Visuelle Fraktionsidentität. Keine Spielwerte; Spieler-Teamfarbe bleibt unabhängig. */
import { FRAKTIONS_FARBEN } from '../shared/config/fraktions-farben.js';

export { FRAKTIONS_FARBEN };

const ZEICHEN = import.meta.glob('./assets/fraktionszeichen/*.svg', { eager: true, query: '?url', import: 'default' });

/** Liefert lokale URLs und Gestaltungswerte für eine bekannte Fraktion. */
export function fraktionsIdentitaet(id) {
  const eintrag = FRAKTIONS_FARBEN[id];
  return eintrag ? { ...eintrag,
    emblem: ZEICHEN[`./assets/fraktionszeichen/${id}.svg`],
    banner: ZEICHEN[`./assets/fraktionszeichen/${id}-banner.svg`],
  } : null;
}

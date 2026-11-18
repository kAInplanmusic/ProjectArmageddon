/**
 * Sichtbarkeit der Biomregeln (QV-6): eine Hinweiszeile beim Start der Partie.
 *
 * Die Regel selbst rechnet die Engine; der Client zeigt sie nur an. Die Windanzeige im HUD (`windSegmente`) folgt der
 * Strömung von allein, weil sie den wirksamen Wind (`state.wind`) liest. Die Zeile sagt dazu, WARUM der Wind in diesem
 * Biom einseitig weht, und nennt die Richtung — ohne sie wirkt ein dauernder Wind in eine Richtung wie ein Fehler.
 *
 * Lokal und online dieselbe Berechnung: `stroemungFuer` aus der gemeinsamen Konfiguration (Biom, Fassung, Basis-Seed).
 *
 * @module biomregelAnzeige
 */
import { stroemungFuer } from '../shared/config/biomregeln.js';
import { MAX_WIND } from '../shared/config/wind.js';

/**
 * Text der Hinweiszeile oder `null`, wenn das Biom keine Regel hat.
 * @param {{biom:string|null, biomregeln:number|undefined, seed:number|null|undefined}} partie
 * @returns {string|null}
 */
export function biomregelText({ biom, biomregeln, seed } = {}) {
  const s = stroemungFuer(biom ?? null, biomregeln ?? 1, seed ?? 0, MAX_WIND);
  if (!s) return null;
  return `${s.name}: ${s.text} Wind meist nach ${s.richtung > 0 ? 'rechts →' : '← links'}.`;
}

/** Schreibt die Zeile ins Protokoll des HUD (`hud.log(text, art)`). */
export function meldeBiomregel(hud, partie) {
  const text = biomregelText(partie);
  if (text) hud.log(text, 'accent');
}

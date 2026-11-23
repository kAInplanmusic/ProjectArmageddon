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
import { stroemungFuer, schwerkraftFuer, wasserWirkungFuer, WASSERLAUF, wasserlaufAktiv, TREIBEN, treibenAktiv } from '../shared/config/biomregeln.js';
import { MAX_WIND } from '../shared/config/wind.js';

/** Die Partie, deren Hinweis zuletzt gemeldet wurde (eine Partie je Seite): Quelle für die Vorhersage. */
let aktuellePartie = null;

/**
 * Text der Hinweiszeile oder `null`, wenn das Biom keine Regel hat.
 * @param {{biom:string|null, biomregeln:number|undefined, seed:number|null|undefined}} partie
 * @returns {string|null}
 */
export function biomregelText({ biom, biomregeln, seed } = {}) {
  const teile = [];
  const s = stroemungFuer(biom ?? null, biomregeln ?? 1, seed ?? 0, MAX_WIND);
  if (s) teile.push(`${s.name}: ${s.text} Wind meist nach ${s.richtung > 0 ? 'rechts →' : '← links'}.`);
  const g = schwerkraftFuer(biom ?? null, biomregeln ?? 1, seed ?? 0, 1);
  if (g) {
    teile.push(g.jeRunde ? `${g.name}: ${g.text}` : `${g.name}: ${g.text} (Faktor ${String(g.faktor).replace('.', ',')})`);
  }
  return teile.length ? teile.join(' ') : null;
}

/**
 * Schwerkraftfaktor der Runde für die Flugbahn-Vorhersage; 1 ohne Regel. Rechnet mit derselben Funktion wie der Motor.
 * @param {number} runde
 */
export function schwerkraftFaktor(runde) {
  if (!aktuellePartie) return 1;
  const { biom, biomregeln, seed } = aktuellePartie;
  return schwerkraftFuer(biom ?? null, biomregeln ?? 1, seed ?? 0, runde ?? 1)?.faktor ?? 1;
}

/** Schreibt die Zeile ins Protokoll des HUD (`hud.log(text, art)`) und merkt sich die Partie für die Vorhersage. */
export function meldeBiomregel(hud, partie) {
  aktuellePartie = partie;
  const text = biomregelText(partie);
  if (text) hud.log(text, 'accent');
}

/**
 * Hinweiszeile zum Gefahrenwasser der Szene oder `null` (normales Wasser, Fassung unter 4).
 * @param {string|null|undefined} wasserId - `scenery.waterId`
 * @param {number|undefined} biomregeln
 */
export function wasserregelText(wasserId, biomregeln) {
  const w = wasserWirkungFuer(wasserId ?? null, biomregeln ?? 1);
  if (!w) return null;
  return w.schaden > 0 ? `${w.name}: ${w.text} (${w.schaden} Leben je Sekunde)` : `${w.name}: ${w.text}`; // Treibsand: kein Schaden
}

/** Meldet das Gefahrenwasser der Szene; nimmt die Fassung der zuletzt gemeldeten Partie. */
export function meldeWasserregel(hud, wasserId) {
  const text = wasserregelText(wasserId, aktuellePartie?.biomregeln);
  if (text) hud.log(text, 'accent');
  if (wasserlaufAktiv(aktuellePartie?.biomregeln ?? 1)) hud.log(`${WASSERLAUF.name}: ${WASSERLAUF.text}`, 'accent');
  if (treibenAktiv(aktuellePartie?.biomregeln ?? 1)) hud.log(`${TREIBEN.name}: ${TREIBEN.text}`, 'accent');
}

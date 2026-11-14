/**
 * Kurztext zu einem Klassen- oder Archetyp-Wert (z. B. „Leben 0,96 · Schaden 0,70").
 *
 * Auszugsort: lag bis 2026-11-09 in `kaderansicht.js`. Das Menü braucht den Text
 * aber schon beim Füllen der Loadout-Auswahl in `main.js` — also VOR dem Kader,
 * der inzwischen als eigener, lazy geladener Chunk kommt. Eigenes Modul statt
 * einer zweiten Rechnung: die Zahlen kommen aus `combatProfile()`, derselben
 * Quelle, die der Motor liest.
 *
 * @module wertBeschreibung
 */
import { CLASS_IDS, ARCHETYPE_IDS } from '../shared/config/match-konstanten.js';
import { KLASSEN_STANDARD } from '../shared/config/klassen-fassung.js';
import { combatProfile } from '../shared/config/classes.js';

/**
 * Nennt die WIRKSAMEN Werte einer Klasse bzw. das Tempo eines Archetyps.
 *
 * - **Klasse:** das wirksame Leben und den wirksamen Schaden. Beides sind
 *   Multiplikatoren auf den Grundwert.
 * - **Archetyp:** das wirksame TEMPO (Absprung- und Fluggeschwindigkeit). Der
 *   Archetyp wirkt nicht auf den Schaden — das Feld hieß früher irreführend
 *   `damage` und wurde in `launch` umbenannt.
 *
 * @param {'Klasse'|'Archetyp'} art
 * @param {string} wert - Kennung, z. B. 'scout'
 * @returns {string} Kurztext wie „Leben 0,96 · Schaden 0,70" oder „Tempo 0,64"
 */
export function beschreibeWert(art, wert) {
  // Der jeweils andere Teil bleibt auf dem Rückfallwert — die Zahlen sind
  // Eigenschaften des EINZELNEN Parameters, nicht der Kombination.
  const profil = art === 'Klasse'
    ? combatProfile(wert, ARCHETYPE_IDS[0], null, KLASSEN_STANDARD)
    : combatProfile(CLASS_IDS[0], wert, null, KLASSEN_STANDARD);

  const zahl = n => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : '—');

  if (art === 'Klasse') {
    return `Leben ${zahl(profil.healthMultiplier)} · Schaden ${zahl(profil.damageMultiplier)}`;
  }
  return `Tempo ${zahl(profil.launchSpeedMultiplier)}`;
}

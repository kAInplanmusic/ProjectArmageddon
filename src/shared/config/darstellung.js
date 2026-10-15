/**
 * Darstellung: welche Fraktionsfigur eine Spielfigur zeigt.
 *
 * REINE ANZEIGE. Die Wahl ändert weder Spielwerte noch Seed-Ströme noch den
 * Replay-Kopf: Klasse und Archetyp (die Werte) bleiben, wie sie sind; die Figur
 * eines Teams wird allein aus Fraktion + Klasse + Archetyp hergeleitet.
 *
 * Zuordnung (dieselbe Zeilen-/Platzlogik wie `factions.js`):
 *   Archetyp brawler     -> Zeile Nahkampf (melee)
 *   Archetyp artillerist -> Zeile Fernkampf (ranged)
 *   Archetyp occultist   -> Zeile Magie (magic)
 *   Klasse heavy -> Platz 0, scout -> Platz 1, artillery -> Platz 2
 *
 * Ohne Fraktion (`null`) bleibt die prozedurale Standardfigur.
 *
 * @module darstellung
 */
import { FACTIONS, CHARACTERS, COMBAT_ROLES, SLOT_CLASSES } from './factions.js';
import { CLASS_IDS, ARCHETYPE_IDS } from './classes.js';

const FRAKTIONS_IDS = new Set(FACTIONS.map(f => f.id));
const ROLLE_JE_ARCHETYP = Object.freeze(Object.fromEntries(
  Object.values(COMBAT_ROLES).map(r => [r.archetype, r.id]),
));

/** Ist `id` eine bekannte Fraktion? */
export function istFraktion(id) {
  return typeof id === 'string' && FRAKTIONS_IDS.has(id);
}

/**
 * Prüft eine Liste „Fraktion je Team" tolerant: Unbekanntes wird `null`.
 * @param {unknown} liste
 * @param {number} teams
 * @returns {(string|null)[]|null} `null`, wenn nichts gewählt wurde
 */
export function bereinigeFraktionen(liste, teams) {
  if (!Array.isArray(liste)) return null;
  const sauber = liste.slice(0, Math.max(0, teams)).map(id => (istFraktion(id) ? id : null));
  return sauber.some(id => id !== null) ? sauber : null;
}

function alsKennung(wert, ids) {
  return typeof wert === 'number' ? ids[wert] : wert;
}

// Verschachtelt, damit der Nachschlag je Bild ohne Allokation läuft: fraktion -> rolle -> slot.
const INDEX = {};
for (const c of CHARACTERS) {
  ((INDEX[c.faction] ??= {})[c.role] ??= [])[c.slot] = c;
}

/**
 * Der Charakter, den eine Figur der Fraktion zeigt.
 *
 * @param {string|null} fraktionId
 * @param {string|number} classId - Kennung oder Index in `CLASS_IDS`
 * @param {string|number} archetypeId - Kennung oder Index in `ARCHETYPE_IDS`
 * @returns {object|null} Eintrag aus CHARACTERS oder null
 */
export function charakterFuer(fraktionId, classId, archetypeId) {
  if (!istFraktion(fraktionId)) return null;
  const rolle = ROLLE_JE_ARCHETYP[alsKennung(archetypeId, ARCHETYPE_IDS)] ?? 'melee';
  const slot = Math.max(0, SLOT_CLASSES.indexOf(alsKennung(classId, CLASS_IDS)));
  return INDEX[fraktionId]?.[rolle]?.[slot] ?? null;
}

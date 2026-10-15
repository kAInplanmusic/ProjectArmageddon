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

/** Wahl „Klassisch": die alte, prozedurale Figur ohne Fraktions-Sprite. */
export const KLASSISCH = 'klassisch';

/** Ist `id` eine bekannte Fraktion? */
export function istFraktion(id) {
  return typeof id === 'string' && FRAKTIONS_IDS.has(id);
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Kleiner Zufallsstrom nur für die Anzeige (nicht der Motor-RNG, nicht `Math.random`). */
function strom(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Löst „Fraktion je Team" zur Anzeige auf. Leer/fehlend = automatisch: Aus dem
 * Schlüssel (Match-Seed bzw. Lobby-ID) wird deterministisch eine Reihenfolge der
 * Fraktionen gemischt; jedes automatische Team nimmt die nächste noch nicht
 * belegte, solange Fraktionen übrig sind (verschiedene Teams, verschiedene
 * Fraktionen). `KLASSISCH` ergibt `null` (alte Darstellung). Reine Anzeige.
 *
 * @param {unknown} liste - Wahl je Team (Fraktions-ID, `'klassisch'` oder leer)
 * @param {number} teams
 * @param {string|number} schluessel - Match-Seed oder Lobby-ID
 * @returns {(string|null)[]} genau `teams` Einträge
 */
export function loeseFraktionen(liste, teams, schluessel) {
  const wahl = Array.isArray(liste) ? liste : [];
  const rnd = strom(hash32(`fraktion:${schluessel}`));
  const ids = FACTIONS.map(f => f.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const belegt = new Set();
  for (let t = 0; t < teams; t += 1) if (istFraktion(wahl[t])) belegt.add(wahl[t]);
  let naechste = 0;
  const aus = [];
  for (let t = 0; t < teams; t += 1) {
    const w = wahl[t];
    if (istFraktion(w)) { aus.push(w); continue; }
    if (w === KLASSISCH) { aus.push(null); continue; }
    while (naechste < ids.length && belegt.has(ids[naechste])) naechste += 1;
    const id = naechste < ids.length ? ids[naechste] : ids[t % ids.length];
    naechste += 1;
    aus.push(id);
  }
  return aus;
}

/**
 * Prüft eine Liste „Fraktion je Team" tolerant: Unbekanntes wird `null`.
 * @param {unknown} liste
 * @param {number} teams
 * @returns {(string|null)[]|null} `null`, wenn nichts gewählt wurde
 */
export function bereinigeFraktionen(liste, teams) {
  if (!Array.isArray(liste)) return null;
  const sauber = liste.slice(0, Math.max(0, teams)).map(id => (istFraktion(id) || id === KLASSISCH ? id : null));
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

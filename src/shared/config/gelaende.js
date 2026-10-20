/**
 * Geländefassung: Sonderbiome und Stoffkarte (`config.gelaende` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Ein Sonderbiom lenkt die Achsen des Kartencharakters (`terrainGen3.formeCharakter`) und
 * verändert damit das Gelände; die Stoffkarte (`shared/stoffkarte.js`) kommt dazu. Eine
 * alte Aufzeichnung muss aber dieselbe Karte bauen wie damals:
 *
 *   - `GELAENDE_ALT` (1): Das Biom folgt der Karte (`biomwahl.js`), es gibt keine Stoffkarte.
 *     Das Feld FEHLT in jeder Datei aus der Zeit davor — `ReplayRecorder.fromJSON` setzt dann
 *     diesen Wert.
 *   - `GELAENDE_BIOME` (2): Der Seed (oder die Wahl `config.biom`) zieht mit einem eigenen
 *     Zweig zuerst ein Sonderbiom (`SONDER_ANTEIL` der Seeds) und formt den Charakter danach.
 *     Zieht er keines, bleibt die Karte Bit für Bit die der Fassung 1. Dazu entsteht die
 *     Stoffkarte; wirken lässt sie erst die Zerstörungsfassung 5.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/gelaende
 */
import { SeededRandom } from '../prng.js';
import { SONDERBIOM_IDS } from './biome-neu.js';

export const GELAENDE_ALT = 1;
export const GELAENDE_BIOME = 2;
export const GELAENDE_STANDARD = GELAENDE_BIOME;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereZerstoerung`). */
export function normalisiereGelaende(fassung) {
  return fassung === GELAENDE_ALT || fassung === GELAENDE_BIOME ? fassung : GELAENDE_STANDARD;
}

/** Anteil der Seeds, die ohne ausdrückliche Wahl ein Sonderbiom ziehen. */
export const SONDER_ANTEIL = 0.4;
/** Wahl „kein Sonderbiom": das Biom folgt der Karte wie in Fassung 1. */
export const BIOM_KLASSISCH = 'klassisch';
/** Seed-Zweig der Biomziehung („BIO"). */
const BIOM_FORK = 0x42494F;

/**
 * Die gültigen Werte der Wahl: `null`/`auto` (der Seed entscheidet), `klassisch` oder ein Sonderbiom.
 * Alles andere wird `null` (automatisch).
 */
export function normalisiereBiomWahl(wahl) {
  if (wahl === BIOM_KLASSISCH || SONDERBIOM_IDS.includes(wahl)) return wahl;
  return null;
}

/**
 * Löst die Geländeoptionen eines Matches auf (ein Aufruf im Konstruktor).
 *
 * @returns {{gelaende:number, biomWahl:string|null, sonderbiom:string|null}} `sonderbiom` ist nur ab Fassung 2 gesetzt
 */
export function loeseGelaende(gelaende, biom, seed) {
  const fassung = normalisiereGelaende(gelaende);
  const biomWahl = normalisiereBiomWahl(biom);
  return { gelaende: fassung, biomWahl, sonderbiom: fassung >= GELAENDE_BIOME ? waehleSonderbiom(seed, biomWahl) : null };
}

/**
 * Welches Sonderbiom gilt für diesen Seed und diese Wahl?
 *
 * Eigener Zweig des Seeds (nicht der Kartenzufall): die Ziehung verschiebt keine Zahl des Geländes.
 *
 * @param {number} seed
 * @param {string|null} wahl - siehe `normalisiereBiomWahl`
 * @returns {string|null} Kennung aus `NEUE_BIOME` oder `null` (klassisch)
 */
export function waehleSonderbiom(seed, wahl = null) {
  const w = normalisiereBiomWahl(wahl);
  if (w === BIOM_KLASSISCH) return null;
  if (w) return w;
  const rng = new SeededRandom(((Math.abs(Math.floor(Number(seed) || 0)) >>> 0) + BIOM_FORK) >>> 0);
  if (rng.next() >= SONDER_ANTEIL) return null;
  return SONDERBIOM_IDS[Math.floor(rng.next() * SONDERBIOM_IDS.length)];
}

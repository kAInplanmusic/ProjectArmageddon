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
 *   - `GELAENDE_THEMEN` (3): Zusätzlich ziehen die vier Themenbiome `kosmos`, `surreal`, `fabrik`,
 *     `burg` (`config/biome-themen.js`); die Ziehung läuft über alle dreizehn Kennungen. Fassung 2
 *     zieht weiter nur aus den neun und kennt die Themenbiome nicht (auch nicht als Wahl).
 *
 *   - `GELAENDE_PLANET` (4): Zusätzlich zieht (und wählt) das Biom `planet`: eine Scheibenwelt im All
 *     (`config/biome-planet.js`, `terrainPlanet.js`); der Seed bestimmt die Art (Eis, Lava, Sand, Dschungel,
 *     Rost, Stein). Die Ziehung läuft über vierzehn Kennungen; die Fassungen 1 bis 3 kennen `planet` nicht und
 *     bleiben Bit für Bit gleich.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/gelaende
 */
import { SeededRandom } from '../prng.js';
import { SONDERBIOM_IDS, SONDERBIOM_IDS_FASSUNG_3, SONDERBIOM_IDS_FASSUNG_4 } from './biome-neu.js';
import { PLANET_WAHL, PLANET_BIOM_IDS, planetArtAusZug } from './biome-planet.js';

export const GELAENDE_ALT = 1;
export const GELAENDE_BIOME = 2;
export const GELAENDE_THEMEN = 3;
export const GELAENDE_PLANET = 4;
/** Fassung 5: die Biome nutzen die Biom-Materialien (`config/stoff-rezepte-material.js`); Form und Zufall bleiben wie in 4. */
export const GELAENDE_MATERIAL = 5;
export const GELAENDE_STANDARD = GELAENDE_PLANET;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereZerstoerung`). */
export function normalisiereGelaende(fassung) {
  return fassung === GELAENDE_ALT || fassung === GELAENDE_BIOME || fassung === GELAENDE_THEMEN || fassung === GELAENDE_PLANET || fassung === GELAENDE_MATERIAL ? fassung : GELAENDE_STANDARD;
}

/** Anteil der Seeds, die ohne ausdrückliche Wahl ein Sonderbiom ziehen. */
const SONDER_ANTEIL = 0.4;
/** Wahl „kein Sonderbiom": das Biom folgt der Karte wie in Fassung 1. */
const BIOM_KLASSISCH = 'klassisch';
/** Seed-Zweig der Biomziehung („BIO"). */
const BIOM_FORK = 0x42494F;

/** Die Kennungen, die eine Fassung ziehen und wählen kann. */
function idsFuer(fassung) {
  if (fassung >= GELAENDE_PLANET) return SONDERBIOM_IDS_FASSUNG_4;
  return fassung >= GELAENDE_THEMEN ? SONDERBIOM_IDS_FASSUNG_3 : SONDERBIOM_IDS;
}

/**
 * Die gültigen Werte der Wahl: `null`/`auto` (der Seed entscheidet), `klassisch` oder ein Sonderbiom.
 * Alles andere wird `null` (automatisch).
 */
export function normalisiereBiomWahl(wahl, fassung = GELAENDE_STANDARD) {
  const ids = idsFuer(fassung);
  // Die Planetenarten sind einzeln wählbar (ab Fassung 4), die Wahl `planet` lässt den Seed die Art ziehen.
  if (wahl === BIOM_KLASSISCH || ids.includes(wahl) || (fassung >= GELAENDE_PLANET && PLANET_BIOM_IDS.includes(wahl))) return wahl;
  return null;
}

/**
 * Löst die Geländeoptionen eines Matches auf (ein Aufruf im Konstruktor).
 *
 * @returns {{gelaende:number, biomWahl:string|null, sonderbiom:string|null}} `sonderbiom` ist nur ab Fassung 2 gesetzt
 */
export function loeseGelaende(gelaende, biom, seed) {
  const fassung = normalisiereGelaende(gelaende);
  const biomWahl = normalisiereBiomWahl(biom, fassung);
  return { gelaende: fassung, biomWahl, sonderbiom: fassung >= GELAENDE_BIOME ? waehleSonderbiom(seed, biomWahl, fassung) : null };
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
export function waehleSonderbiom(seed, wahl = null, fassung = GELAENDE_STANDARD) {
  const w = normalisiereBiomWahl(wahl, fassung);
  if (w === BIOM_KLASSISCH) return null;
  const rng = new SeededRandom(((Math.abs(Math.floor(Number(seed) || 0)) >>> 0) + BIOM_FORK) >>> 0);
  if (w && w !== PLANET_WAHL) return w;
  if (!w && rng.next() >= SONDER_ANTEIL) return null;
  const ids = idsFuer(fassung);
  const gezogen = w ?? ids[Math.floor(rng.next() * ids.length)];
  // `planet`: die Art zieht ein weiterer Wert desselben Zweigs (Fassungen vor 4 erreichen das nie).
  return gezogen === PLANET_WAHL ? planetArtAusZug(rng.next()) : gezogen;
}

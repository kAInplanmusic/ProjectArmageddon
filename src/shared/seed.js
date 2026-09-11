/**
 * Seed-Verwaltung für ProjectArmageddon.
 *
 * Verantwortlich für:
 * - Erzeugung eines Match-Seeds durch den autoritativen Server
 * - Verteilung an Clients
 * - Injektion in die PRNG-Instanz
 * - Forked-Seeds für teilsystem-spezifische Unabhängigkeit
 *
 * @module seed
 */

import { createRng, generateSeed, hashToSeed } from './prng.js';

/**
 * Feste Offsets für Teilbereiche des Match-Seeds.
 * Dadurch bleibt die Reihenfolge der Aufrufe unabhängig von der Implementierung
 * und Änderungen an einem System beeinflussen das andere nicht.
 */
export const SEED_OFFSETS = Object.freeze({
  MATCH_BASE: 0,
  LOOT: 1_000_000,
  TERRAIN: 2_000_000,
  WEAPONS: 3_000_000,
  EFFECTS: 4_000_000,
  /**
   * Günther — eigener Zweig, damit seine Würfe (Auftritte, Pinkeln, Kacken,
   * Glücksrad) die übrigen Zufallsströme nicht verschieben.
   */
  GUENTHER: 5_000_000,
});

/**
 * MatchSeedManager-Klasse — zentraler Ansprechpartner für Seed-Verwaltung.
 */
export class MatchSeedManager {
  #baseSeed;
  #children;

  constructor(baseSeed) {
    if (typeof baseSeed !== 'number' || !Number.isFinite(baseSeed) || !Number.isInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xFFFFFFFF) {
      throw new TypeError('baseSeed muss eine gültige 32-Bit-Ganzzahl sein');
    }
    this.#baseSeed = baseSeed >>> 0;
    this.#children = new Map();
  }

  /**
   * Erzeugt einen deterministischen Teil-PRNG für einen Teilbereich.
   * @param {string} offsetKey - Schlüssel aus SEED_OFFSETS
   * @returns {SeededRandom}
   */
  getSubRng(offsetKey) {
    // Support both string keys (e.g. 'LOOT') and numeric offset values (e.g. 1000000)
    let offset;
    if (typeof offsetKey === 'string') {
      if (!SEED_OFFSETS.hasOwnProperty(offsetKey)) {
        throw new Error(`Unbekannter Seed-Offset-Schlüssel: ${offsetKey}`);
      }
      offset = SEED_OFFSETS[offsetKey];
    } else if (typeof offsetKey === 'number') {
      offset = offsetKey;
    } else {
      throw new TypeError('offsetKey muss ein string-Schlüssel oder numerischer Offset sein');
    }

    const childSeed = (this.#baseSeed + offset) >>> 0;

    // Memoisiere Instanzen, damit derselbe Teilbereich immer die gleiche
    // PRNG-Instanz zurückgibt (und somit dieselbe Zustandssequenz)
    const cacheKey = String(offsetKey);
    if (!this.#children.has(cacheKey)) {
      this.#children.set(cacheKey, createRng(childSeed));
    }

    return this.#children.get(cacheKey);
  }

  get baseSeed() {
    return this.#baseSeed;
  }

  serialize() {
    return btoa(String(this.#baseSeed));
  }

  static deserialize(serialized) {
    const seed = parseInt(atob(serialized), 10);
    return new MatchSeedManager(seed);
  }

  static createRandom() {
    return new MatchSeedManager(generateSeed());
  }

  static fromString(stringSeed) {
    return new MatchSeedManager(hashToSeed(stringSeed));
  }
}

/**
 * Shortcut-Funktion: Erzeugt einen PRNG aus einem Match-Seed + Offset-Schlüssel.
 * @param {number} matchSeed - Der Match-Seed
 * @param {string} offsetKey - Schlüssel aus SEED_OFFSETS (standard: MATCH_BASE)
 * @returns {SeededRandom}
 */
export function createMatchRng(matchSeed, offsetKey = 'MATCH_BASE') {
  const manager = new MatchSeedManager(matchSeed);
  return manager.getSubRng(offsetKey);
}

export default { MatchSeedManager, SEED_OFFSETS, createMatchRng };

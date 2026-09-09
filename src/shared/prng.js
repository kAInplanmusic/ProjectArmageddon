/**
 * Deterministischer PRNG (Pseudo-Random Number Generator) für ProjectArmageddon.
 *
 * Implementiert den mulberry32-Algorithmus — einen schnellen, seedbaren 32-Bit-Generator.
 *
 * Eigenschaften:
 * - Gleicher Seed → identische Zahlenfolge (deterministisch)
 * - Verschiedene Seeds → unterschiedliche Folgen
 * - Keine Math.random()-Abhängigkeit im Simulationspfad
 * - Funktioniert in Node.js und Browser (ES Module)
 * - 32-Bit-Integer-Operationen für plattformübergreifende Determinismus
 *
 * @module prng
 */

const UINT32_MASK = 0xFFFFFFFF;

/**
 * Mulberry32-Algorithmus — schneller, seedbarer PRNG.
 * Erzeugt Gleitkommazahlen im Bereich [0, 1) mit 32-Bit-Präzision.
 *
 * @param {number} seed - 32-Bit-Seed-Wert
 * @returns {function(): number} - Funktion die eine Zufallszahl [0,1) zurückgibt
 */
function mulberry32(seed) {
  let state = seed >>> 0;

  return function () {
    state = (state + 0x6d1b7f7d) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t >>> 7;
    t ^= t >>> 15;
    // Final hash to improve bit mixing and distribute values across full [0, 1) range
    t = Math.imul(t ^ (t >>> 19), 0x8529CE83) >>> 0;
    return t / 4294967296;
  };
}

/**
 * Klasse: SeededRandom
 * Wrapper um mulberry32 mit zusätzlicher API für Spiel-Use-Cases.
 */
export class SeededRandom {
  #generator;
  #seed;

  constructor(seed) {
    if (typeof seed !== 'number' || !Number.isFinite(seed)) {
      throw new TypeError('Seed muss eine endliche Zahl sein');
    }
    this.#seed = seed >>> 0;
    this.#generator = mulberry32(this.#seed);
  }

  next() {
    return this.#generator();
  }

  nextFloat(min, max) {
    if (min === undefined) {
      return this.next();
    }
    if (max === undefined) {
      return this.next() * min;
    }
    return min + this.next() * (max - min);
  }

  nextInt(min, max) {
    if (max === undefined) {
      return Math.floor(this.next() * min);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextIntBelow(max) {
    return Math.floor(this.next() * max);
  }

  nextBoolean(probability = 0.5) {
    return this.next() < probability;
  }

  pick(array) {
    if (!Array.isArray(array) || array.length === 0) {
      throw new Error('pick() erfordert ein nicht-leeres Array');
    }
    return array[this.nextIntBelow(array.length)];
  }

  weightedIndex(weights) {
    if (!Array.isArray(weights) || weights.length === 0) {
      throw new Error('weightedIndex() erfordert ein nicht-leeres Gewichts-Array');
    }

    let totalWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] < 0) {
        throw new Error(`Gewicht darf nicht negativ sein (Index ${i})`);
      }
      totalWeight += weights[i];
    }

    if (totalWeight <= 0) {
      return this.nextIntBelow(weights.length);
    }

    const threshold = this.next() * totalWeight;
    let cumulative = 0;

    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (threshold < cumulative) {
        return i;
      }
    }

    return weights.length - 1;
  }

  fork(offset) {
    const newSeed = (this.#seed + offset) >>> 0;
    return new SeededRandom(newSeed);
  }

  get seed() {
    return this.#seed;
  }

  reset(seed = this.#seed) {
    this.#seed = seed >>> 0;
    this.#generator = mulberry32(this.#seed);
  }
}

/**
 * Utility-Funktion: Erzeugt einen kryptographisch starken 32-Bit-Seed.
 * Nur für die Erzeugung des Match-Seeds verwenden — nicht im Simulationspfad!
 *
 * @returns {number} - 32-Bit-Seed-Wert
 */
export function generateSeed() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0];
  }

  const timeSeed = Date.now() & UINT32_MASK;
  const randSeed = Math.floor(Math.random() * UINT32_MASK);
  return (timeSeed ^ randSeed) >>> 0;
}

/**
 * Utility-Funktion: Hash-Funktion für Zeichenketten in 32-Bit-Seeds.
 *
 * @param {string} str - Eingabe-String
 * @returns {number} - 32-Bit-Seed
 */
export function hashToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash >>> 0;
}

/**
 * Factory-Funktion: Erzeugt eine SeededRandom-Instanz.
 *
 * @param {number|string} seed - Numerischer Seed oder String (wird gehasht)
 * @returns {SeededRandom}
 */
/**
 * Utility-Funktion: Prüft, ob ein String ein gültiger Seed-Bezeichner ist.
 * Gültige Strings bestehen nur aus alphanumerischen Zeichen, Bindestrichen und Unterstrichen.
 * @param {string} str - Eingabe-String
 * @returns {boolean}
 */
function isValidSeedString(str) {
  return /^[a-zA-Z0-9_-]+$/.test(str);
}

/**
 * Factory-Funktion: Erzeugt eine SeededRandom-Instanz.
 *
 * @param {number|string} seed - Numerischer Seed oder String (wird gehasht)
 * @returns {SeededRandom}
 */
export function createRng(seed) {
  if (typeof seed === 'string') {
    if (!isValidSeedString(seed)) {
      throw new TypeError('Seed-String darf nur alphanumerische Zeichen, Bindestrichen und Unterstriche enthalten');
    }
    return new SeededRandom(hashToSeed(seed));
  }
  if (typeof seed !== 'number' || !Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new TypeError('Seed muss eine ganze Zahl oder ein gültiger Zeichenketten-Seed sein');
  }
  return new SeededRandom(seed);
}

export { SeededRandom as PRNG };

/**
 * CollisionMask: Bitmask-basierte Kollision für Terrain.
 *
 * Unterstützt Bitmaps bis zu 32×N-Pixeln mit word-weiser Speicherung.
 * Schützt vor shift >= 32-Edge-Cases.
 *
 * @module CollisionMask
 */

/**
 * Ruft `fn(px, py)` für jede Zelle eines Kraters auf.
 *
 * EINE Rechenvorschrift für Server-Maske und Client-Karte: Wer die Zellen an
 * zwei Stellen getrennt herleitet, bekommt irgendwann zwei verschiedene Löcher.
 */
export function eachCraterCell(width, height, x, y, radius, fn) {
  for (let dy = -radius; dy <= radius; dy++) {
    const dx = Math.sqrt(radius * radius - dy * dy);
    for (let ix = -Math.floor(dx); ix <= Math.floor(dx); ix++) {
      const px = Math.round(x + ix);
      const py = Math.round(y + dy);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        if (ix * ix + dy * dy <= radius * radius) fn(px, py);
      }
    }
  }
}

/**
 * Ruft `fn(px, py)` für jede Zelle des Mahlstrom-Einschnitts auf: die ersten
 * `inset` Spalten links und rechts, über die ganze Höhe.
 *
 * EINE Rechenvorschrift für Server (`MaelstromSystem.contract`) und Client
 * (`applyInsetToTerrain`), wie bei `eachCraterCell`. Berührt der Einschnitt die
 * Mitte (`inset * 2 >= width`), wird nichts abgetragen — so verhielt sich der
 * Server schon immer.
 */
export function eachInsetCell(width, height, inset, fn) {
  if (!(inset > 0) || inset * 2 >= width) return;
  const spalten = Math.min(Math.floor(inset), width);
  for (let x = 0; x < spalten; x++) {
    for (let y = 0; y < height; y++) {
      fn(x, y);
      fn(width - 1 - x, y);
    }
  }
}

const FNV_BASIS = 0x811c9dc5;
const FNV_PRIMZAHL = 0x01000193;

export class CollisionMask {
  #width;
  #height;
  #words; // Uint32Array
  #dirty = false;
  #craters = [];

  constructor(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error('Breite und Höhe müssen positiv sein');
    }

    this.#width = width;
    this.#height = height;
    // Wort-basierte Speicherung: 32 Pixel pro Wort
    const wordsPerRow = Math.ceil(width / 32);
    this.#words = new Uint32Array(wordsPerRow * height);
    this.#dirty = true;
  }

  /**
   * Erzeugt eine CollisionMask aus einem Bitmap (Array von 0/1-Werten).
   * @param {number[]} bitmap - 1D-Array der Pixelwerte
   * @param {number} width
   * @param {number} height
   * @returns {CollisionMask}
   */
  static fromBitmap(bitmap, width, height) {
    if (bitmap.length !== width * height) {
      throw new Error(`Bitmap-Größe (${bitmap.length}) stimmt nicht mit Breite×Höhe (${width}x${height}) überein`);
    }

    const mask = new CollisionMask(width, height);
    const wordsPerRow = Math.ceil(width / 32);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitIndex = (y * width + x);
        if (bitmap[bitIndex]) {
          const wordIndex = y * wordsPerRow + Math.floor(x / 32);
          const bitOffset = x % 32;
          mask.#words[wordIndex] |= (1 << bitOffset);
        }
      }
    }

    mask.#dirty = false;
    return mask;
  }

  /**
   * Setzt einen Pixel.
   * @param {number} x
   * @param {number} y
   * @param {boolean} solid
   */
  setPixel(x, y, solid) {
    const wordsPerRow = Math.ceil(this.#width / 32);
    const wordIndex = y * wordsPerRow + Math.floor(x / 32);
    const bitOffset = x % 32;

    if (solid) {
      this.#words[wordIndex] |= (1 << bitOffset);
    } else {
      this.#words[wordIndex] &= ~(1 << bitOffset);
    }

    this.#dirty = true;
  }

  /**
   * Prüft, ob ein Pixel fest ist (kollidiert).
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isSolid(x, y) {
    if (x < 0 || x >= this.#width || y < 0 || y >= this.#height) {
      return true; // Rand ist fest
    }

    const wordsPerRow = Math.ceil(this.#width / 32);
    const wordIndex = y * wordsPerRow + Math.floor(x / 32);
    const bitOffset = x % 32;

    return (this.#words[wordIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Erzeugt eine Krater-Destruktion an (x, y) mit gegebenem Radius.
   * @param {number} x - Zentrum X
   * @param {number} y - Zentrum Y
   * @param {number} radius - Krater-Radius
   */
  punchCrater(x, y, radius) {
    eachCraterCell(this.#width, this.#height, x, y, radius, (px, py) => this.setPixel(px, py, false));
    this.#craters.push([x, y, radius]);
    this.#dirty = true;
  }

  /**
   * Alle bisherigen Krater in der Reihenfolge ihrer Entstehung als `[x, y, radius]`.
   *
   * Warum es das gibt (Audit 2026-10-09): Ein Client, der später beitritt oder
   * die Verbindung wieder aufnimmt, baut das Gelände aus dem Seed und sieht
   * damit die UNZERSTÖRTE Karte, während der Server längst Löcher hat (nach nur
   * 9 Kratern wichen 3 082 Zellen ab). Das Protokoll liefert sie jetzt nach.
   */
  get craterLog() { return this.#craters.map(eintrag => [...eintrag]); }

  /**
   * Kompakter Hash der Maske (FNV-1a, wortweise über die 32-Bit-Maskenwörter,
   * Breite und Höhe fliessen ein). Deterministisch und plattformunabhängig
   * (`Math.imul`); dient dem Abgleich Server <-> Client (Terrain-Hash).
   * Kosten gemessen in `tests/terrain-hash.test.js` (2560x1440, 115 200 Wörter).
   * @returns {number} vorzeichenlose 32-Bit-Zahl
   */
  hash() {
    let h = FNV_BASIS;
    h = Math.imul(h ^ this.#width, FNV_PRIMZAHL);
    h = Math.imul(h ^ this.#height, FNV_PRIMZAHL);
    const w = this.#words;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w[i], FNV_PRIMZAHL);
    return h >>> 0;
  }

  /** Anzahl bisheriger Krater (billig; `craterLog` kopiert die Liste). */
  get craterCount() { return this.#craters.length; }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get isDirty() { return this.#dirty; }

  markClean() {
    this.#dirty = false;
  }
}

export default CollisionMask;

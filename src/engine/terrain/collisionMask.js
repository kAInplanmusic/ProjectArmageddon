/**
 * CollisionMask: Bitmask-basierte Kollision für Terrain.
 *
 * Unterstützt Bitmaps bis zu 32×N-Pixeln mit word-weiser Speicherung.
 * Schützt vor shift >= 32-Edge-Cases.
 *
 * @module CollisionMask
 */

export class CollisionMask {
  #width;
  #height;
  #words; // Uint32Array
  #dirty = false;

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
    for (let dy = -radius; dy <= radius; dy++) {
      const dx = Math.sqrt(radius * radius - dy * dy);
      for (let ix = -Math.floor(dx); ix <= Math.floor(dx); ix++) {
        const px = Math.round(x + ix);
        const py = Math.round(y + dy);
        if (px >= 0 && px < this.#width && py >= 0 && py < this.#height) {
          const distSq = ix * ix + dy * dy;
          if (distSq <= radius * radius) {
            this.setPixel(px, py, false);
          }
        }
      }
    }
    this.#dirty = true;
  }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get isDirty() { return this.#dirty; }

  markClean() {
    this.#dirty = false;
  }
}

export default CollisionMask;

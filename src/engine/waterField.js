/**
 * Deterministisches Wasser-Feld (Cellular-Automata-artiger Spread).
 *
 * Arbeitet auf einem Float32-Grid mit vertikalem Vorrang (Fallbewegung) und
 * anschliessendem seitlichem Druckausgleich. Terrain wird ueber einen
 * Solid-Lookup beruecksichtigt, damit Krater Wasser aufnehmen koennen.
 *
 * @module WaterField
 */
export class WaterField {
  #width;
  #height;
  #levels;
  #next;
  #isSolid;
  #flowRate;

  /**
   * @param {object} options
   * @param {number} options.width
   * @param {number} options.height
   * @param {function(number,number):boolean} options.isSolid
   * @param {number} [options.flowRate=0.85]
   */
  constructor({ width, height, isSolid, flowRate = 0.85 } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new TypeError('width und height muessen positive Ganzzahlen sein');
    }
    this.#width = width;
    this.#height = height;
    this.#flowRate = flowRate;
    this.#isSolid = typeof isSolid === 'function' ? isSolid : () => false;
    this.#levels = new Float32Array(width * height);
    this.#next = new Float32Array(width * height);
  }

  get width() { return this.#width; }
  get height() { return this.#height; }
  get levels() { return this.#levels; }

  setLevel(x, y, level) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.#width || iy < 0 || iy >= this.#height) return;
    this.#levels[iy * this.#width + ix] = Math.max(0, Math.min(1, level));
  }

  getLevel(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.#width || iy < 0 || iy >= this.#height) return 0;
    return this.#levels[iy * this.#width + ix];
  }

  /** Fuellt einen Bereich bis zum Wasserspiegel auf. */
  fillRectangle(x0, y0, x1, y1, level = 1) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.setLevel(x, y, level);
      }
    }
  }

  /** Ein Simulationsschritt: erst vertikaler Fluss, dann seitlicher Ausgleich. */
  step() {
    const { width, height } = this;
    const levels = this.#levels;
    const next = this.#next;
    next.fill(0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const level = levels[index];
        if (level <= 0.001) continue;
        if (this.#isSolid(x, y)) continue;

        let remaining = level;

        // 1. Vertikal: maximaler Fall nach unten.
        const belowY = y + 1;
        if (belowY < height && !this.#isSolid(x, belowY)) {
          const belowIndex = belowY * width + x;
          const capacity = 1 - next[belowIndex];
          if (capacity > 0) {
            const flow = Math.min(remaining, capacity);
            next[belowIndex] += flow;
            remaining -= flow;
          }
        }

        // 2. Seitlich: Druckausgleich mit den beiden Nachbarn.
        if (remaining > 0.001) {
          for (const dx of [-1, 1]) {
            if (remaining <= 0.001) break;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (this.#isSolid(nx, y)) continue;
            const neighbourIndex = y * width + nx;
            const neighbourLevel = levels[neighbourIndex];
            if (neighbourLevel >= remaining) continue;
            const transfer = Math.min(remaining, (remaining - neighbourLevel) * 0.5 * this.#flowRate);
            if (transfer <= 0) continue;
            next[neighbourIndex] += transfer;
            remaining -= transfer;
          }
        }

        next[index] += remaining;
      }
    }

    this.#levels.set(next);
    return this;
  }

  /** Gesamtwassermenge — dient als Determinismus-Check. */
  totalVolume() {
    let total = 0;
    for (let i = 0; i < this.#levels.length; i++) total += this.#levels[i];
    return total;
  }

  serialize() {
    return Array.from(this.#levels, value => Math.round(value * 100) / 100);
  }
}

export default WaterField;

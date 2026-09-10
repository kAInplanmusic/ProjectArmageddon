/**
 * Wasser-Simulation für ProjectArmageddon.
 * Float32-Grid-basierte einfache Spread-Simulation.
 *
 * @module waterSimulation
 */

export class WaterSimulation {
  #grid;
  #width;
  #height;
  #spreadFactor;
  #settledRatio;

  constructor(width, height, spreadFactor = 0.98, settledRatio = 0.95) {
    this.#width = width;
    this.#height = height;
    this.#spreadFactor = spreadFactor;
    this.#settledRatio = settledRatio;
    this.#grid = new Float32Array(width * height);
  }

  /**
   * Führt einen Spread-Step aus.
   * @param {number} dt - Delta-Zeit
   */
  step(_dt = 1) {
    const newGrid = new Float32Array(this.#width * this.#height);

    for (let y = 0; y < this.#height; y++) {
      for (let x = 0; x < this.#width; x++) {
        const idx = y * this.#width + x;
        let neighbors = 0;
        let sum = this.#grid[idx];

        // 4-Nachbarn
        if (x > 0) { sum += this.#grid[idx - 1]; neighbors++; }
        if (x < this.#width - 1) { sum += this.#grid[idx + 1]; neighbors++; }
        if (y > 0) { sum += this.#grid[idx - this.#width]; neighbors++; }
        if (y < this.#height - 1) { sum += this.#grid[idx + this.#width]; neighbors++; }

        // Druckausbau
        newGrid[idx] = (sum / (neighbors + 1)) * this.#spreadFactor;
      }
    }

    this.#grid = newGrid;
  }

  /**
   * Setzt den Wasserstand an einer Position.
   * @param {number} x
   * @param {number} y
   * @param {number} level - Wasserstand (0-1)
   */
  setWaterLevel(x, y, level) {
    const idx = Math.floor(y) * this.#width + Math.floor(x);
    if (idx >= 0 && idx < this.#grid.length) {
      this.#grid[idx] = Math.max(0, Math.min(1, level));
    }
  }

  /**
   * Holt den Wasserstand an einer Position.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  getWaterLevel(x, y) {
    const idx = Math.floor(y) * this.#width + Math.floor(x);
    if (idx >= 0 && idx < this.#grid.length) {
      return this.#grid[idx];
    }
    return 0;
  }

  get width() { return this.#width; }
  get height() { return this.#height; }
}

export default WaterSimulation;

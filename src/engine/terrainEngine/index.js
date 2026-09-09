/**
 * Wrapper für Terrain-Engine (externes Paket).
 * Re-exportiert aus dist/.
 *
 * @module terrainEngine
 */

// Wrapper für externe Terrain-Engine
export class TerrainEngine {
  constructor() {
    this.initialized = false;
  }

  async initialize(width, height) {
    this.initialized = true;
    this.width = width;
    this.height = height;
    this.terrain = new Array(width * height).fill(1);
    return true;
  }

  getHeight(x, y) {
    if (!this.initialized) return 0;
    const idx = Math.floor(y) * this.width + Math.floor(x);
    return this.terrain[idx] || 0;
  }

  modifyTerrain(x, y, radius, type) {
    if (!this.initialized) return false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const px = Math.floor(x + dx);
          const py = Math.floor(y + dy);
          if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
            const idx = py * this.width + px;
            this.terrain[idx] = type === 'remove' ? 0 : 1;
          }
        }
      }
    }
    return true;
  }
}

export default TerrainEngine;

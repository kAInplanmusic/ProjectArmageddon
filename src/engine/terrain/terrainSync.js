/**
 * Terrain-Synchronisation zwischen Rendering und CollisionMask.
 *
 * @module terrainSync
 */

import CollisionMask from './collisionMask.js';

export class TerrainSync {
  #collisionMask;
  #lastDirtyTick = -1;

  constructor(collisionMask) {
    this.#collisionMask = collisionMask;
  }

  /**
   * Synchronisiert das Canvas-Rendering mit der CollisionMask.
   * Wird aufgerufen, wenn sich die CollisionMask geändert hat.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {number} tick - Aktueller Tick
   */
  syncToCanvas(ctx, canvas, tick) {
    if (this.#collisionMask.isDirty && tick !== this.#lastDirtyTick) {
      this.#lastDirtyTick = tick;
      this.#collisionMask.markClean();
      return true;
    }
    return false;
  }

  /**
   * Wendet Krater-Effekte auf Canvas und CollisionMask an.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {string} color - Farbe für den Krater
   */
  punchCrater(ctx, x, y, radius) {
    this.#collisionMask.punchCrater(x, y, radius);

    if (ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  get collisionMask() {
    return this.#collisionMask;
  }

  static createDefault(width, height) {
    const mask = new CollisionMask(width, height);
    return new TerrainSync(mask);
  }
}

export default TerrainSync;

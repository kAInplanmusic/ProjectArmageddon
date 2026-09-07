// Simple Turn System – manages turn order and timer
// Each turn lasts a configurable number of seconds. When time expires,
// the turn index is advanced and the next player becomes active.

import { COMPONENT_FLAGS } from '../ecs/componentStore.js';

export class TurnSystem {
  /**
   * @param {number} turnDurationSeconds – length of a turn
   * @param {Array<number>} playerEntityIds – entity IDs representing players
   */
  constructor(turnDurationSeconds = 5, playerEntityIds = []) {
    this.turnDuration = turnDurationSeconds;
    this.players = playerEntityIds;
    this.currentIndex = 0;
    this.elapsed = 0;
  }

  /**
   * Called each fixed‑step to advance the timer.
   * @param {object} world – the World instance (has components)
   * @param {number} deltaSeconds – time step
   */
  update(world, deltaSeconds) {
    if (this.players.length === 0) return;
    this.elapsed += deltaSeconds;
    if (this.elapsed >= this.turnDuration) {
      // End current turn – deactivate current player
      const currentEntity = this.players[this.currentIndex];
      world.components.deactivate(currentEntity);

      // Advance to next player
      this.currentIndex = (this.currentIndex + 1) % this.players.length;
      const nextEntity = this.players[this.currentIndex];
      world.components.activate(nextEntity);

      this.elapsed = 0;
    }
  }
}

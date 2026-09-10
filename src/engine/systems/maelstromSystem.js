/**
 * ECS-System: MaelstromSystem
 *
 * Endgame-Druck ab der konfigurierten Runde: die sichere Zone zieht sich pro
 * Runde von aussen nach innen zusammen, Terrain ausserhalb wird entfernt und
 * Figuren ausserhalb der Zone erleiden toxischen Regenschaden.
 *
 * @module MaelstromSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import { MATCH_RULES } from '../../shared/config/match.js';

export const MAELSTROM_PRIORITY = 75;

export class MaelstromSystem {
  #inset = 0;
  #active = false;
  #rng;

  constructor({ rng } = {}) {
    this.#rng = rng ?? null;
  }

  get inset() { return this.#inset; }
  get isActive() { return this.#active; }

  /** Aktiviert den Mahlstrom (ab Runde 15). */
  activate() {
    this.#active = true;
  }

  /**
   * Fuehrt die Kontraktion fuer eine neue Runde aus.
   * @param {object} world
   * @returns {{inset:number, removedColumns:number}}
   */
  contract(world) {
    const terrain = world.services?.terrain ?? null;
    const pixels = MATCH_RULES.suddenDeath.terrainContractionPixelsPerRound;
    this.#inset += pixels;

    if (!terrain) return { inset: this.#inset, removedColumns: 0 };

    const width = terrain.width;
    const height = terrain.height;
    if (this.#inset * 2 >= width) {
      return { inset: this.#inset, removedColumns: 0 };
    }

    let removed = 0;
    for (let x = 0; x < this.#inset; x++) {
      for (let y = 0; y < height; y++) {
        terrain.setPixel(x, y, false);
        terrain.setPixel(width - 1 - x, y, false);
        removed += 2;
      }
    }

    world.services?.events?.emit('maelstrom_contract', { inset: this.#inset, removed });
    return { inset: this.#inset, removedColumns: removed };
  }

  /** Toxischer Regen: Schaden fuer alles ausserhalb der sicheren Zone. */
  applyToxicRain(world) {
    if (!this.#active) return [];
    const terrain = world.services?.terrain ?? null;
    const damageSystem = world.getSystem('damage');
    if (!damageSystem) return [];

    const width = terrain?.width ?? 1280;
    const path = MATCH_RULES.suddenDeath.toxicRainMaxHpPercentPerTurn / 100;
    const affected = [];

    const ids = world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH);
    for (const entityId of ids) {
      if (!world.isActive(entityId)) continue;
      const x = world.getComponent(entityId, 'Position', 'x') || 0;
      if (x >= this.#inset && x <= width - this.#inset) continue;

      const maxHp = world.getComponent(entityId, 'Health', 'max') || 0;
      const damage = maxHp * path;
      damageSystem.applyDamage(world, entityId, damage, null);
      affected.push(entityId);
    }

    world.services?.events?.emit('toxic_rain', { round: world.services?.match?.round, affected });
    return affected;
  }

  /**
   * Tick-Update: zieht die sichtbare Warnzone deterministisch nach.
   * Die eigentliche Kontraktion passiert einmal pro Runde in contract().
   */
  update(world, entities, dt) {
    if (!this.#active) return;
    world.services?.match && (world.services.match.safeInset = this.#inset);
  }

  get signature() { return 0; }
}

export default MaelstromSystem;

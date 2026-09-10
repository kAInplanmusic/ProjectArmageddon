/**
 * Bot-KI für nicht besetzte Lobby-Plätze.
 *
 * Der Bot nutzt exakt denselben Abschussweg wie ein Mensch: Er wählt Winkel und
 * Kraft und ruft MatchController.fire(). Dadurch bleibt er deterministisch und
 * kann nicht mehr als ein Client.
 *
 * Verhalten: ballistische Näherung auf das nächste lebende Ziel, mit
 * deterministischem Streufehler aus dem Match-PRNG, der mit jedem Fehlschuss
 * kleiner wird (Zielübung).
 *
 * @module BotController
 */

const MIN_ANGLE = 0.12;
const MAX_ANGLE = Math.PI - 0.12;

export class BotController {
  constructor({ rng, skill = 0.55 } = {}) {
    this.rng = rng ?? null;
    this.skill = skill;
    this.attempts = new Map();
  }

  /**
   * Wählt einen Schuss gegen das nächste gegnerische Ziel.
   * @returns {{angle:number, power:number}|null}
   */
  chooseShot(match, botEntityId) {
    if (!this.rng) return null;
    const state = match.getState();
    const bot = state.entities.find(entity => entity.entityId === botEntityId);
    if (!bot || !bot.alive) return null;

    const targets = state.entities.filter(entity => entity.alive && entity.teamId !== bot.teamId);
    if (targets.length === 0) return null;

    const target = targets.reduce((best, candidate) => {
      const distance = Math.hypot(candidate.x - bot.x, candidate.y - bot.y);
      return distance < best.distance ? { entity: candidate, distance } : best;
    }, { entity: targets[0], distance: Number.POSITIVE_INFINITY }).entity;

    const attempts = this.attempts.get(botEntityId) ?? 0;
    this.attempts.set(botEntityId, attempts + 1);

    // Streufehler sinkt mit wachsender Erfahrung und Skill.
    const spread = Math.max(0.01, 0.22 * (1 - this.skill) / (1 + attempts * 0.35));
    const angleJitter = this.rng.nextFloat(-spread, spread);
    const powerJitter = this.rng.nextFloat(-spread * 220, spread * 220);

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    // Höhere der beiden Lösungen ist für Artillerie üblich.
    let angle = Math.atan2(Math.abs(dy) + 60, Math.abs(dx) * 0.55);
    if (dx < 0) angle = Math.PI - angle;

    angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, angle + angleJitter));

    const distance = Math.hypot(dx, dy);
    const power = Math.min(100, Math.max(20, 26 + distance * 0.062 + powerJitter));

    return { angle, power };
  }

  reset() {
    this.attempts.clear();
  }
}

export default BotController;

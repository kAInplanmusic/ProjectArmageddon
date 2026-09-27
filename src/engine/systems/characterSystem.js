/**
 * ECS-System: CharacterSystem
 *
 * Physik fuer Spielfiguren: Gravitation, Reibung, Terrain-Kollision,
 * Landeschaden und Wasserinteraktion (Auftrieb + Strömungswiderstand).
 * Uebernimmt die Bewegung von Entities mit Gesundheitskomponente; generische
 * Projektile werden vom ProjectileSystem behandelt.
 *
 * @module CharacterSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
// Schwellen für „nass" und „ertrinkt" kommen aus der gemeinsamen Wasser-Config,
// damit die Anzeige dieselben Werte benutzt wie die Simulation.
import { WET_LEVEL, DROWN_LEVEL } from '../../shared/config/water.js';
/*
 * Körpermaße und Fallschadens-Regel kommen aus `src/shared/config/`.
 *
 * FUND (belegt, behoben): Hier standen `const HALF_WIDTH = 7; const
 * HALF_HEIGHT = 10;` — die ZWEITE Definition der Körpermaße neben
 * `config/player.js`. Wertgleich, deshalb unauffällig; sie sind jetzt dieselbe
 * Zahl wie die Trefferprüfung (`projectileSystem.js`) und `isGrounded`
 * (`match.js`). Beim Fallschaden ist das keine Formsache: Die Landung rastet bei
 * `Oberfläche − PLAYER_HALF_HEIGHT` ein, und `isGrounded` prüft dieselbe Grenze.
 */
import { PLAYER_HALF_WIDTH, PLAYER_HALF_HEIGHT } from '../../shared/config/player.js';
import { FALLSCHADEN } from '../../shared/config/fallschaden.js';

/*
 * Die Ausführungsreihenfolge steht in `engine/init.js` (`SYSTEM_PRIORITIES`).
 *
 * FUND (belegt, Code-Audit): Hier stand `export const CHARACTER_PRIORITY = ...`
 * — eine zweite Liste derselben Reihenfolge mit NULL Lesern. Wer sie änderte,
 * änderte nichts: Der Motor liest `SYSTEM_PRIORITIES.CHARACTER`. Genau das
 * war die Falle („eine Regel, eine Stelle").
 *
 * Die Konstante ist entfernt; die Reihenfolge wird nur noch an EINER Stelle
 * gepflegt. Ein Test hält das fest (`tests/system-priority.test.js`).
 */

export class CharacterSystem {
  #gravity;
  #groundFriction;
  #fallDamageThreshold;
  #fallDamageScale;
  #luftsprungZuschlag;
  #maxHorizontalSpeed;
  #drownDamagePerSecond;
  #submergedLevel;
  /**
   * Angenommene Sprünge IN DER LUFT seit der letzten Bodenberührung, je Figur.
   *
   * Ein Luft-Sprung schenkt Höhe (`match.js#jump` SETZT `vy = −Impuls`; er
   * addiert nicht) und ist damit kein freier Aufstieg. Diese Schuld wird beim
   * Aufprall abgerechnet und beim Aufsetzen gestrichen.
   */
  #luftsprunge = new Map();

  constructor({
    gravity = 0.42,
    groundFriction = 0.86,
    fallDamageThreshold = FALLSCHADEN.schwelle,
    fallDamageScale = FALLSCHADEN.skala,
    luftsprungZuschlag = FALLSCHADEN.luftsprungZuschlag,
    maxHorizontalSpeed = 6,
    drownDamagePerSecond = 9,
    submergedLevel = DROWN_LEVEL,
  } = {}) {
    this.#gravity = gravity;
    this.#groundFriction = groundFriction;
    this.#fallDamageThreshold = fallDamageThreshold;
    this.#fallDamageScale = fallDamageScale;
    this.#luftsprungZuschlag = luftsprungZuschlag;
    this.#maxHorizontalSpeed = maxHorizontalSpeed;
    this.#drownDamagePerSecond = drownDamagePerSecond;
    this.#submergedLevel = submergedLevel;
  }

  /**
   * Meldet einen angenommenen Sprung IN DER LUFT (nicht vom Boden).
   *
   * Der Motor ruft das aus `MatchController.jump()` — dort entsteht der Sprung,
   * hier wird er abgerechnet. `playerId` ist die Entity-Id des Spielers.
   *
   * @param {number} entityId
   */
  meldeLuftsprung(entityId) {
    this.#luftsprunge.set(entityId, (this.#luftsprunge.get(entityId) ?? 0) + 1);
  }

  /**
   * Wie viele Sprünge in der Luft seit der letzten Bodenberührung angesetzt wurden.
   *
   * @param {number} entityId
   * @returns {number}
   */
  luftsprungeSeitBoden(entityId) {
    return this.#luftsprunge.get(entityId) ?? 0;
  }

  update(world, entities, dt) {
    const services = world.services ?? {};
    const terrain = services.terrain ?? null;
    const events = services.events ?? null;
    const water = services.water ?? null;
    const damageSystem = world.getSystem('damage');

    for (const entityId of entities) {
      if (!world.isActive(entityId)) continue;

      const x = world.getComponent(entityId, 'Position', 'x') || 0;
      const y = world.getComponent(entityId, 'Position', 'y') || 0;
      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;

      // Wasserabfrage in Weltkoordinaten: das Feld rechnet intern in Zellen.
      const waterLevel = water
        ? (typeof water.levelAtWorld === 'function' ? water.levelAtWorld(x, y) : water.getLevel(Math.floor(x), Math.floor(y)))
        : 0;
      const inWater = waterLevel > WET_LEVEL;

      vy += this.#gravity * (inWater ? 0.25 : 1);
      if (inWater) {
        vy *= 0.72;
        vx *= 0.8;
        vx += (services.match?.currentStrength ?? 0) * 0.02;
      } else {
        vx *= 0.995;
      }

      vx = Math.max(-this.#maxHorizontalSpeed, Math.min(this.#maxHorizontalSpeed, vx));

      const nextX = x + vx;
      const nextY = y + vy;

      let resolvedX = nextX;
      let resolvedY = nextY;
      let landed = false;

      if (terrain) {
        /*
         * AUFSETZEN: den Fallweg ABTASTEN, nicht nur seinen Endpunkt.
         *
         * FUND (belegt, 2026-09-27): Hier stand eine PUNKTPROBE auf `(nextX,
         * nextY)`. Sie entscheidet richtig, solange die Figur je Takt weniger
         * weit fällt als die Geländekruste dick ist. Ein schneller Sturz springt
         * über die Kruste: Der Punkt liegt dann TIEF im Festkörper, und
         * `isSolid(nextY − PLAYER_HALF_HEIGHT − 1)` ist ebenfalls fest — der
         * Motor las das als „nicht gelandet" und ließ `resolvedY = y` stehen.
         *
         * Gemessen (Seed 606, Preset `hills`, 10 Luft-Sprünge + Dauerfeuer):
         * Die Figur blieb bei `y = 650,42` STEHEN, `vy` wuchs in 400 Takten von
         * 22,98 auf **159,90 px/Takt**, und es gab **0 Fallschaden** — genau der
         * Sturz, der bremsen soll. Dass die Projektil-Physik dieses Problem
         * nicht hat, steht in `src/shared/ballistics.js#simulateFlight`
         * ausdrücklich als Warnung: „`exact: false` prüft nur das Schrittende —
         * billiger, aber es kann eine dünne Wand übersehen."
         *
         * Deshalb jetzt dieselbe Bauart wie beim Projektil: Die erste FESTE
         * Zeile auf dem Weg zählt. Die Landung ist damit unabhängig von der
         * Schrittweite, und das Aufpralltempo ist wieder das, was es physikalisch
         * ist: `√(2·g·h)` — gemessen 4,20 px/Takt bei 20 px Höhe, 5,88 bei 40,
         * 15,96 bei 300, 24,36 bei 700 (Sonde: `docs/fallschaden-bremse.md` §2).
         */
        const aufsetzZeile = vy > 0 ? this.#ersteSolideZeile(terrain, nextX, y, nextY) : null;

        if (aufsetzZeile !== null) {
          resolvedY = aufsetzZeile - PLAYER_HALF_HEIGHT;
          landed = true;
        } else if (vy < 0 && this.#isSolid(terrain, nextX, nextY)) {
          /*
           * Aufwärts gegen eine Decke: Position halten.
           *
           * Nur der Aufstieg braucht diese Prüfung — der Abstieg ist von der
           * Abtastung vollständig abgedeckt (die Zielzeile selbst wird
           * mitgeprüft, also findet `#ersteSolideZeile` jede feste Zeile, die der
           * Punkt `nextY` treffen würde).
           */
          resolvedY = y;
        }

        if (this.#isSolid(terrain, resolvedX, resolvedY)) {
          // Seitliche Blockade: Richtungsumkehr daempfen.
          resolvedX = x;
          vx *= -0.2;
        }
      }

      if (landed) {
        /*
         * Der Aufprall setzt sich zusammen aus dem physikalischen Sturz UND der
         * Schuld aus den Luft-Sprüngen (siehe `#luftsprunge`). Beides ist
         * deterministisch: keine Zufallszahl, keine Reihenfolgeänderung.
         */
        const luftsprunge = this.#luftsprunge.get(entityId) ?? 0;
        const aufprall = vy + luftsprunge * this.#luftsprungZuschlag;

        if (!inWater && aufprall > this.#fallDamageThreshold && damageSystem) {
          const damage = (aufprall - this.#fallDamageThreshold) * this.#fallDamageScale;
          damageSystem.applyDamage(world, entityId, damage, null);
          events?.emit('fall_damage', {
            entityId,
            damage,
            velocity: aufprall,
            luftsprunge,
            zuschlag: luftsprunge * this.#luftsprungZuschlag,
          });
        }

        // Boden berührt: die Schuld ist beglichen oder verfallen.
        this.#luftsprunge.delete(entityId);

        vy = 0;
        if (Math.abs(vx) < 0.05) vx = 0;
        vx *= this.#groundFriction;
      }

      resolvedX = Math.max(PLAYER_HALF_WIDTH, Math.min((terrain?.width ?? 4096) - PLAYER_HALF_WIDTH, resolvedX));
      resolvedY = Math.max(PLAYER_HALF_HEIGHT, Math.min((terrain?.height ?? 4096) - PLAYER_HALF_HEIGHT, resolvedY));

      world.setComponent(entityId, 'Position', 'x', resolvedX);
      world.setComponent(entityId, 'Position', 'y', resolvedY);
      world.setComponent(entityId, 'Velocity', 'x', vx);
      world.setComponent(entityId, 'Velocity', 'y', vy);

      if (inWater && events) {
        events.emit('entity_in_water', { entityId, level: waterLevel });
      }

      // Ertrinken: tief untergetauchte Figuren verlieren kontinuierlich Leben.
      if (waterLevel >= this.#submergedLevel && damageSystem) {
        const damage = (this.#drownDamagePerSecond / 60) * (dt / (1000 / 60));
        damageSystem.applyDamage(world, entityId, damage, null);
        events?.emit('drowning', { entityId, level: waterLevel });
      }
    }
  }

  #isSolid(terrain, x, y) {
    return terrain.isSolid(Math.floor(x), Math.floor(y));
  }

  /**
   * Die erste feste Zeile auf dem Weg nach unten — der Aufsetzpunkt.
   *
   * Abgetastet wird die SPALTE von der Fusszeile (EINSCHLIESSLICH) bis zur
   * Zielhoehe, Zeile fuer Zeile. Die erste feste Zeile ist die Oberflaeche, auf
   * der die Figur stehen bleibt; ein Sturz kann damit nicht mehr durch eine
   * duenne Kruste hindurch (siehe die Messung in `update`).
   *
   * Dass die FUSSZEILE SELBST mitgeprueft wird, ist kein Detail: Eine Figur kann
   * mit dem Fuss IM Festkoerper stehen — nach einem Ziehen/Schub (der die Figur
   * auf die Gelaendeoberflaeche der neuen Stelle setzt), nach einem Krater unter
   * ihr oder nach Gelaendewachstum. Sie wird dann auf die Oberflaeche dieser
   * Zeile gehoben (`Zeile − PLAYER_HALF_HEIGHT`) — genau das tat vorher die
   * Punktprobe ueber `#surfaceY`, und es ist der Unterschied, den eine
   * Aufzeichnung messbar sieht (Altreplay `replay-20260910.json`, Takt 289).
   *
   * Der Boden der Karte ist bei `CollisionMask.isSolid` fest („Rand ist fest"),
   * deshalb endet die Abtastung spaetestens dort: Auch ein Sturz ueber die
   * Kartenkante landet — auf der untersten Zeile.
   *
   * @param {object} terrain
   * @param {number} x - Zielspalte (aus der Schrittbewegung)
   * @param {number} fromY - Fussposition VOR dem Schritt
   * @param {number} toY - Fussposition NACH dem Schritt
   * @returns {number|null} Zeile des Aufsetzpunktes oder `null`, wenn frei
   */
  #ersteSolideZeile(terrain, x, fromY, toY) {
    const spalte = Math.floor(x);
    const bis = Math.min(Math.floor(toY), terrain.height);
    for (let y = Math.floor(fromY); y <= bis; y += 1) {
      if (terrain.isSolid(spalte, y)) return y;
    }
    return null;
  }

  get drownDamagePerSecond() { return this.#drownDamagePerSecond; }
  get submergedLevel() { return this.#submergedLevel; }
  get luftsprungZuschlag() { return this.#luftsprungZuschlag; }

  get gravity() { return this.#gravity; }

  get signature() {
    return COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.HEALTH;
  }
}

export default CharacterSystem;

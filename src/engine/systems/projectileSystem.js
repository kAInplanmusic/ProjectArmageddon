/**
 * ECS-System: ProjectileSystem
 *
 * Bewegt Projektile mit Gravitation, Drag und Wind und prüft Kollisionen per
 * Continuous Collision Detection gegen Terrain-Bitmaske und Spieler-AABBs.
 * Bei einem Treffer wird die Explosion aufgeloest: Krater im Terrain,
 * Schaden mit Distanzabfall und Knockback.
 *
 * Benoetigte Services am World-Objekt:
 *   world.services.terrain  — CollisionMask
 *   world.services.events   — EventBus
 *   world.services.match    — { wind, knockbackMultiplier }
 *
 * @module ProjectileSystem
 */
import { COMPONENT_SIGNATURES } from '../ecs/world.js';
import {
  PROJECTILE_DRAG,
  PROJECTILE_GRAVITY,
  integrateStep,
  raycastSegment,
} from '../../shared/ballistics.js';

/*
 * Die Ausführungsreihenfolge steht in `engine/init.js` (`SYSTEM_PRIORITIES`).
 *
 * FUND (belegt, Code-Audit): Hier stand `export const PROJECTILE_PRIORITY = ...`
 * — eine zweite Liste derselben Reihenfolge mit NULL Lesern. Wer sie änderte,
 * änderte nichts: Der Motor liest `SYSTEM_PRIORITIES.PROJECTILE`. Genau das
 * war die Falle („eine Regel, eine Stelle").
 *
 * Die Konstante ist entfernt; die Reihenfolge wird nur noch an EINER Stelle
 * gepflegt. Ein Test hält das fest (`tests/system-priority.test.js`).
 */
export const PLAYER_HALF_WIDTH = 7;
export const PLAYER_HALF_HEIGHT = 10;

/**
 * Von Projektilen und Zielvorschau gemeinsam genutzte Physik-Konstanten.
 *
 * Die ZAHL steht in `src/shared/ballistics.js` — dieselbe Quelle, aus der die
 * clientseitige Vorhersage, die Zielvorschau des MatchControllers und die
 * Bot-KI lesen. Diese Namen bleiben exportiert, weil Tests und die
 * Reichweitenrechnung sie führen.
 */
export const DEFAULT_PROJECTILE_GRAVITY = PROJECTILE_GRAVITY;
export const DEFAULT_PROJECTILE_DRAG = PROJECTILE_DRAG;

/**
 * Wendigkeit je Tick und je Punkt Zielsuche (Bogenmaß).
 *
 * `homing` steht in den Daten von 0 bis 100. Mit 0,0003 sind das bei 70 Punkten
 * 0,021 rad je Tick — bei 60 Ticks je Sekunde rund 72°/s. Über einen Flug von 60
 * Ticks sind das bis zu 72° Korrektur: genug, um einen Schuss auf ein bewegtes
 * Ziel zu BIEgen, zu wenig, um kehrtzumachen. Der Wert ist bewusst eine benannte
 * Konstante statt einer Zahl im Code — die Zielsuche ist eine
 * Balance-Entscheidung und muss als solche auffindbar sein.
 */
export const HOMING_TURN_PER_TICK = 0.0003;

/** Wie lange ein durchschlagenes Ziel nicht wieder getroffen wird (Ticks). */
export const PIERCE_SCHUTZ_TICKS = 4;

export class ProjectileSystem {
  #gravity;
  #baseDrag;

  constructor({ gravity = DEFAULT_PROJECTILE_GRAVITY, baseDrag = DEFAULT_PROJECTILE_DRAG } = {}) {
    this.#gravity = gravity;
    this.#baseDrag = baseDrag;
  }

  update(world, entities, _dt) {
    const services = world.services ?? {};
    const terrain = services.terrain ?? null;
    const events = services.events ?? null;
    const match = services.match ?? { wind: 0, knockbackMultiplier: 1 };

    const allTargets = this.#collectTargets(world);

    for (const entityId of entities) {
      if (!world.isActive(entityId)) continue;

      const alive = world.getComponent(entityId, 'Projectile', 'alive');
      if (alive === 0) continue;

      // Der Absender darf sein eigenes Projektil nicht blockieren. Ohne diesen
      // Ausschluss kollidiert das Geschoss im ersten Schritt mit dem Schützen
      // selbst (das Projektil startet in dessen Trefferfeld) und verschwindet,
      // bevor es das Ziel erreichen kann.
      const owner = world.getComponent(entityId, 'Projectile', 'owner');
      let targets = allTargets.filter(target => target.id !== owner);

      let vx = world.getComponent(entityId, 'Velocity', 'x') || 0;
      let vy = world.getComponent(entityId, 'Velocity', 'y') || 0;
      const startX = world.getComponent(entityId, 'Position', 'x') || 0;
      const startY = world.getComponent(entityId, 'Position', 'y') || 0;

      /*
       * DURCHSCHLAG-SCHUTZ.
       *
       * Ein durchschlagenes Ziel wird für ein paar Ticks aus den Trefferzielen
       * genommen. Ohne das träfe dasselbe Geschoss dieselbe Figur in jedem
       * weiteren Tick erneut: Der Strahl des nächsten Schritts beginnt genau auf
       * dem Trefferfeld, das es gerade verlassen hat.
       */
      const schutz = world.getComponent(entityId, 'Projectile', 'pierceSchutz') || 0;
      if (schutz > 0) {
        const zuletzt = world.getComponent(entityId, 'Projectile', 'letztesZiel');
        targets = targets.filter(target => target.id !== zuletzt);
        world.setComponent(entityId, 'Projectile', 'pierceSchutz', schutz - 1);
      }

      /*
       * ZIELSUCHE (`homing`).
       *
       * Die Bahn wird je Tick um HÖCHSTENS `homing × HOMING_TURN_PER_TICK`
       * gedreht — das Tempo bleibt, nur die Richtung ändert sich. Gesucht wird
       * das NÄCHSTE lebende Ziel; der Schütze selbst ist bereits ausgeschlossen.
       *
       * Bewusst NUR die Richtung: Eine Zielsuche, die auch beschleunigt, würde
       * die Reichweitenrechnung unterlaufen, mit der die Zielvorschau arbeitet.
       */
      const homing = world.getComponent(entityId, 'Projectile', 'homing') || 0;
      if (homing > 0 && targets.length > 0) {
        let bester = null;
        let besteDistanz = Infinity;
        for (const ziel of targets) {
          const distanz = Math.hypot(ziel.x - startX, ziel.y - startY);
          if (distanz < besteDistanz) {
            besteDistanz = distanz;
            bester = ziel;
          }
        }
        if (bester) {
          const wunsch = Math.atan2(bester.y - startY, bester.x - startX);
          const jetzt = Math.atan2(vy, vx);
          let differenz = wunsch - jetzt;
          // Auf [-π, π] normieren, sonst dreht das Geschoss den weiten Weg.
          while (differenz > Math.PI) differenz -= 2 * Math.PI;
          while (differenz < -Math.PI) differenz += 2 * Math.PI;
          const grenze = homing * HOMING_TURN_PER_TICK;
          const schritt = Math.max(-grenze, Math.min(grenze, differenz));
          const tempo = Math.hypot(vx, vy);
          if (tempo > 0) {
            const neuerWinkel = jetzt + schritt;
            vx = Math.cos(neuerWinkel) * tempo;
            vy = Math.sin(neuerWinkel) * tempo;
            world.setComponent(entityId, 'Velocity', 'x', vx);
            world.setComponent(entityId, 'Velocity', 'y', vy);
          }
        }
      }

      const drag = world.getComponent(entityId, 'Projectile', 'drag') || this.#baseDrag;
      const gravityScale = world.getComponent(entityId, 'Projectile', 'gravityScale');
      const windFactor = world.getComponent(entityId, 'Projectile', 'windFactor');
      let lifetime = world.getComponent(entityId, 'Projectile', 'lifetime');

      /*
       * Kräfte — der EINE Integrationsschritt aus `src/shared/ballistics.js`.
       *
       * Reihenfolge und Vorzeichen stehen dort, nicht hier. Wer den Motor
       * schneller machen oder „nur kurz" anpassen will: Jede Änderung hier
       * verschiebt auch die Bahn, die die Zielvorschau und die Bot-KI
       * vorhersagen — die beiden lesen dieselbe Funktion.
       */
      const naechsteGeschwindigkeit = integrateStep({
        vx,
        vy,
        gravity: this.#gravity,
        gravityScale,
        wind: match.wind || 0,
        windFactor,
        drag,
      });
      vx = naechsteGeschwindigkeit.vx;
      vy = naechsteGeschwindigkeit.vy;

      const nextX = startX + vx;
      const nextY = startY + vy;

      // Zünder: Eine Granate wirkt nicht beim Aufprall, sondern nach Ablauf.
      // Sie prallt ab bzw. bleibt liegen und zündet dann.
      let fuseTicks = world.getComponent(entityId, 'Projectile', 'fuseTicks') || 0;
      if (fuseTicks > 0) {
        fuseTicks -= 1;
        world.setComponent(entityId, 'Projectile', 'fuseTicks', fuseTicks);

        if (fuseTicks <= 0) {
          // Zünder abgelaufen: jetzt wirkt die Ladung — an der aktuellen Stelle.
          const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
          const owner = world.getComponent(entityId, 'Projectile', 'owner');
          this.#explode(world, entityId, nextX, nextY, 0, null);
          if (events) {
            events.emit('fuse_expired', { entityId, x: nextX, y: nextY, owner });
          }
          services.onProjectileImpact?.({
            projectileId: entityId, owner, x: nextX, y: nextY,
            target: null, blastRadius,
          });
          continue;
        }
      }

      const hit = this.#raycast(terrain, targets, startX, startY, nextX, nextY);

      if (hit && fuseTicks > 0) {
        // Zünderwaffe: Der Aufprall stoppt sie, zündet sie aber nicht. Sie
        // bleibt an der Auftreffstelle liegen und läuft dort ab — so wirkt eine
        // Granate wie eine Granate und nicht wie eine Patrone.
        world.setComponent(entityId, 'Position', 'x', hit.x);
        world.setComponent(entityId, 'Position', 'y', hit.y);
        world.setComponent(entityId, 'Velocity', 'x', 0);
        world.setComponent(entityId, 'Velocity', 'y', 0);
        if (events) {
          events.emit('fuse_armed', { entityId, x: hit.x, y: hit.y });
        }
        continue;
      }

      if (hit) {
        const owner = world.getComponent(entityId, 'Projectile', 'owner');

        /*
         * DURCHSCHLAG (`piercing`).
         *
         * Trifft das Geschoss eine FIGUR und hat es noch Durchschläge frei, wirkt
         * der VOLLE Schaden an dieser Figur — und der Flug geht weiter (kein
         * Krater, keine Flächenwirkung, kein Verschwinden). Trifft es TERRAIN,
         * gilt der Durchschlag nicht: Eine Wand hält auch ein Gewehr auf, sonst
         * schösse es durch Berge.
         */
        const pierceFrei = world.getComponent(entityId, 'Projectile', 'pierce') || 0;
        if (pierceFrei > 0 && hit.target !== null && world.isActive(hit.target)) {
          const trefferSchaden = world.getComponent(entityId, 'Projectile', 'damage') || 0;
          if (trefferSchaden > 0) {
            world.getSystem('damage')?.applyDamage(world, hit.target, trefferSchaden, owner, {
              damageType: world.getComponent(entityId, 'Projectile', 'damageType'),
            });
          }
          world.setComponent(entityId, 'Projectile', 'pierce', pierceFrei - 1);
          world.setComponent(entityId, 'Projectile', 'letztesZiel', hit.target);
          world.setComponent(entityId, 'Projectile', 'pierceSchutz', PIERCE_SCHUTZ_TICKS);
          /*
           * Und das Geschoss setzt seinen Weg HINTER der Figur fort.
           *
           * FUND (belegt, 2026-09-20, im Test aufgefallen): Ohne diesen Satz blieb
           * es IM Trefferfeld stehen — ein langsames Geschoss macht 5–6 px je
           * Tick, das Feld ist 14×20 px. Nach Ablauf des Schutzes traf es
           * dieselbe Figur erneut, und der Test maß den DOPPELTEN Schaden (58,8
           * statt 29,4). „Durchgeschlagen" heißt: auf der anderen Seite weiter.
           */
          const tempo = Math.hypot(vx, vy) || 1;
          const durch = PLAYER_HALF_WIDTH + PLAYER_HALF_HEIGHT + 2;
          world.setComponent(entityId, 'Position', 'x', hit.x + (vx / tempo) * durch);
          world.setComponent(entityId, 'Position', 'y', hit.y + (vy / tempo) * durch);
          if (events) {
            events.emit('projectile_pierced', {
              entityId, x: hit.x, y: hit.y, target: hit.target, verbleibend: pierceFrei - 1,
            });
          }
          continue;
        }

        const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
        this.#explode(world, entityId, hit.x, hit.y, world.getComponent(entityId, 'Projectile', 'bounces'), hit.target);
        if (events) {
          events.emit('projectile_impact', { entityId, x: hit.x, y: hit.y, target: hit.target ?? null });
        }
        // Hook für Wirkungen, die über Schaden hinausgehen (Einfrieren,
        // Schaden über Zeit). Der Match kennt die Waffe zum Projektil; das
        // Projektil selbst trägt nur deren Index.
        services.onProjectileImpact?.({
          projectileId: entityId,
          owner,
          x: hit.x,
          y: hit.y,
          target: hit.target ?? null,
          blastRadius,
        });
        continue;
      }

      world.setComponent(entityId, 'Velocity', 'x', vx);
      world.setComponent(entityId, 'Velocity', 'y', vy);
      world.setComponent(entityId, 'Position', 'x', nextX);
      world.setComponent(entityId, 'Position', 'y', nextY);

      lifetime -= 1;
      world.setComponent(entityId, 'Projectile', 'lifetime', lifetime);

      const outOfBounds = nextX < -64 || nextX > (terrain?.width ?? 4096) + 64 || nextY > (terrain?.height ?? 4096) + 64;
      /*
       * Der Lebensdauer-Deckel (`projectileLifetime`, `maxRange × 1,5` je Karte)
       * ist eine DESIGN-Obergrenze. Er darf aber nicht als LAUTLOSES
       * VERSCHWINDEN wirken.
       *
       * FUND (belegt, MASTERDOTO „Die Lebensdauer beschneidet kurze Waffen"):
       * Für 465 von 1425 Kombinationen (Waffe × Klasse × Kartengröße) liegt der
       * Deckel UNTER der tatsächlichen Wurfweite — das Geschoss verfällt dann
       * mitten im Flug. Vorher geschah das ohne jede Wirkung; gemessen an Seed
       * 1000, Zug 3, verschwand ein Schuss nach 72 Ticks, obwohl er 83 gebraucht
       * hätte, und die Rechnung sah trotzdem „Treffer".
       *
       * Deshalb detoniert das Geschoss am Deckel: Krater, Flächenschaden,
       * Wasserverdrängung und Explosionsereignis — dieselbe Wirkung wie beim
       * Einschlag. Die Obergrenze bleibt damit bestehen, wird aber SICHTBAR.
       *
       * Verlässt das Geschoss dagegen die Karte, wird es weiterhin still
       * entfernt: Dort gibt es nichts mehr zu treffen, und eine Explosion am
       * Rand wäre eine Wirkung ohne Ort.
       */
      if (lifetime <= 0 && !outOfBounds) {
        const eigentuemer = world.getComponent(entityId, 'Projectile', 'owner');
        const radius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
        this.#explode(world, entityId, nextX, nextY, 0, null);
        if (events) events.emit('projectile_expired', { entityId, x: nextX, y: nextY });
        services.onProjectileImpact?.({
          projectileId: entityId, owner: eigentuemer, x: nextX, y: nextY,
          target: null, blastRadius: radius,
        });
        continue;
      }

      if (outOfBounds) {
        world.setComponent(entityId, 'Projectile', 'alive', 0);
        world.removeEntity(entityId);
        if (events) events.emit('projectile_expired', { entityId, x: nextX, y: nextY });
      }
    }
  }

  #collectTargets(world) {
    const ids = world.getEntitiesBySignature(COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH);
    return ids.filter(id => world.isActive(id)).map(id => ({
      id,
      x: world.getComponent(id, 'Position', 'x') || 0,
      y: world.getComponent(id, 'Position', 'y') || 0,
    }));
  }

  /**
   * Prueft die Strecke in Teilschritten gegen Terrain und Spieler-AABBs.
   *
   * Die Abtastung selbst steht in `raycastSegment` (`src/shared/ballistics.js`)
   * und wird von der Vorhersage (Client), der Zielvorschau und der Bot-KI
   * mitbenutzt: Ein Geschoss, das „durch eine Wand tunnelt", tut das sonst in
   * der Vorhersage anders als im Motor.
   *
   * @returns {{x:number,y:number,target:number|null}|null}
   */
  #raycast(terrain, targets, startX, startY, endX, endY) {
    const treffer = raycastSegment(startX, startY, endX, endY, {
      isSolid: terrain ? (x, y) => terrain.isSolid(x, y) : null,
      hitTest: (x, y) => {
        for (const target of targets) {
          if (Math.abs(x - target.x) <= PLAYER_HALF_WIDTH && Math.abs(y - target.y) <= PLAYER_HALF_HEIGHT) {
            return target.id;
          }
        }
        return null;
      },
    });

    if (!treffer) return null;
    return { x: treffer.x, y: treffer.y, target: treffer.hit ?? null };
  }

  #explode(world, entityId, x, y, bounces, hitTarget = null) {
    const services = world.services ?? {};
    const events = services.events ?? null;
    const match = services.match ?? { knockbackMultiplier: 1 };
    const terrain = services.terrain ?? null;

    const damage = world.getComponent(entityId, 'Projectile', 'damage') || 0;
    const blastRadius = world.getComponent(entityId, 'Projectile', 'blastRadius') || 0;
    const knockback = world.getComponent(entityId, 'Projectile', 'knockback') || 0;
    const terrainDamage = world.getComponent(entityId, 'Projectile', 'terrainDamage') || 0;
    const owner = world.getComponent(entityId, 'Projectile', 'owner');
    // Die Schadensart reist mit dem Geschoss (siehe `src/engine/damageTypes.js`).
    // Flächenschaden trägt sie genauso wie ein Direkttreffer — ein Feuerball
    // wirkt auch im Radius als Feuer.
    const damageType = world.getComponent(entityId, 'Projectile', 'damageType');

    // Krater: expliziter Terrain-Schaden hat Vorrang, sonst leitet sich der
    // Radius aus der Flaechenwirkung ab. Reine Direktschusswaffen graben nur
    // ein minimales Loch, damit Einschlaege sichtbar bleiben.
    const craterRadius = terrainDamage > 0
      ? terrainDamage
      : blastRadius > 0 ? blastRadius * 0.6 : 4;

    if (terrain && craterRadius > 0) {
      const radius = Math.max(2, Math.round(craterRadius));
      terrain.punchCrater(x, y, radius);
      if (events) events.emit('terrain_destroyed', { x, y, radius });
    }

    // Wasser verdrängen: Explosionen drücken das Wasser im Radius nach außen.
    const water = services.water ?? null;
    if (water && typeof water.displace === 'function' && craterRadius > 0) {
      water.displace(x, y, craterRadius, 0.65);
    }

    if (damage > 0 && blastRadius <= 0 && hitTarget !== null && world.isActive(hitTarget)) {
      // Waffe ohne Flaechenwirkung: voller Schaden nur auf das getroffene Ziel.
      world.getSystem('damage')?.applyDamage(world, hitTarget, damage, owner, { damageType });
    }

    if (blastRadius > 0 && damage > 0) {
      const victimIds = world.getEntitiesBySignature(
        COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.HEALTH
      );
      for (const victimId of victimIds) {
        if (!world.isActive(victimId)) continue;
        const vx = world.getComponent(victimId, 'Position', 'x') || 0;
        const vy = world.getComponent(victimId, 'Position', 'y') || 0;
        const dx = vx - x;
        const dy = vy - y;
        const dist = Math.hypot(dx, dy);
        if (dist > blastRadius) continue;

        const falloff = Math.max(0.25, 1 - dist / blastRadius);
        const applied = damage * falloff;
        const damageSystem = world.getSystem('damage');
        if (damageSystem) {
          damageSystem.applyDamage(world, victimId, applied, owner, { damageType });
        }

        if (knockback > 0 && dist > 0.0001) {
          const impulse = knockback * falloff * (match.knockbackMultiplier || 1) * 0.02;
          const currentVx = world.getComponent(victimId, 'Velocity', 'x') || 0;
          const currentVy = world.getComponent(victimId, 'Velocity', 'y') || 0;
          world.setComponent(victimId, 'Velocity', 'x', currentVx + (dx / dist) * impulse);
          world.setComponent(victimId, 'Velocity', 'y', currentVy + (dy / dist) * impulse);
        }
      }
    }

    if (events) {
      events.emit('explosion', {
        x, y, radius: blastRadius, damage, owner, projectile: entityId, damageType,
      });
    }

    world.setComponent(entityId, 'Projectile', 'alive', 0);
    world.setComponent(entityId, 'Projectile', 'bounces', (bounces || 0) + 1);
    world.removeEntity(entityId);
  }

  get gravity() { return this.#gravity; }
  get baseDrag() { return this.#baseDrag; }

  get signature() {
    return COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY | COMPONENT_SIGNATURES.PROJECTILE;
  }
}

export default ProjectileSystem;

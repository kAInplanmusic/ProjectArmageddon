/**
 * MatchController — verbindet Terrain, Wasser, ECS-Systeme, Runden- und
 * Zuglogik zu einem vollstaendigen, deterministischen Match.
 *
 * Wird identisch vom Browser-Client und vom Headless-Server genutzt; der
 * Unterschied besteht nur darin, wer `step()` aufruft und ob gerendert wird.
 *
 * @module MatchController
 */
import { createGameWorld, SYSTEM_PRIORITIES } from './init.js';
import { COMPONENT_SIGNATURES } from './ecs/componentStore.js';
import { CollisionMask } from './terrain/collisionMask.js';
import { generateTerrain, surfaceY as findSurfaceY } from '../shared/terrainGen.js';
import { MatchSeedManager } from '../shared/seed.js';
import { EventBus } from './events.js';
import { WaterField } from './waterField.js';
import { ProjectileSystem } from './systems/projectileSystem.js';
import { DEFAULT_PROJECTILE_GRAVITY, DEFAULT_PROJECTILE_DRAG } from './systems/projectileSystem.js';
import { CharacterSystem } from './systems/characterSystem.js';
import { MaelstromSystem } from './systems/maelstromSystem.js';
import { LootSystem } from './systems/lootSystem.js';
import { PlayerInventory } from './inventory.js';
import {
  StatusStore,
  buildEffect,
  SELF_TARGET_KINDS,
  EFFECT_KIND,
  RANDOM_EFFECT_POOL,
} from './specials.js';
import { validateCommand } from '../shared/validation.js';
import { MATCH_RULES } from '../shared/config/match.js';
import { CLASS_DEFINITIONS, CLASS_ARCHETYPES } from '../shared/config/classes.js';
import { getWeapon, getDefaultLoadout } from '../shared/config/weapons.js';
import { CRATE_TYPES, RARITY_IDS } from './systems/lootSystem.js';
import { ccdRaycast } from './physics/ballistics.js';

export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 720;
export const WATER_SCALE = 4;

export const CLASS_IDS = Object.freeze(['scout', 'heavy', 'artillery']);
export const ARCHETYPE_IDS = Object.freeze(['brawler', 'artillerist', 'occultist']);
export const TEAM_COLORS = Object.freeze(['#4cc9f0', '#f4a261', '#90be6d', '#e07a5f']);

const BASE_HEALTH = 100;
const POWER_TO_SPEED = 0.14;
const MAX_WIND = 0.05;
const PLAYER_HALF_WIDTH = 7;
const PLAYER_HALF_HEIGHT = 10;
/** Wie weit entlang der Schussrichtung nach freiem Feld gesucht wird. */
const MUZZLE_SEARCH_DISTANCE = 48;
/** Mindestwerte für Zufallswaffen, damit auch schwache Waffen spürbar wirken. */
const SPECIAL_HEAL_MIN = 35;
const SPECIAL_SHIELD_MIN = 40;
const RANDOM_MOVE_DISTANCE = 60;

export class MatchController {
  #world;
  #seedManager;
  #events = new EventBus();
  #terrain;
  #bitmap;
  #water;
  #inventory = new PlayerInventory();
  /**
   * Laufende Zustände (Schild, Einfrieren, Schaden über Zeit, Buffs).
   * Liegt bewusst außerhalb des ECS — konsistent zum Inventar.
   */
  #statuses = new StatusStore();
  /**
   * Waffe je abgefeuertem Projektil, damit beim Einschlag die Wirkung der
   * richtigen Waffe angewendet werden kann. Das Projektil selbst kennt nur den
   * Index der Waffe, nicht ihre ID.
   */
  #shotsInFlight = new Map();
  /**
   * Nachladezeiten je Spieler und Waffe, in ZÜGEN.
   * Schlüssel `${playerId}:${weaponId}` → verbleibende Züge.
   *
   * Warum in Zügen: Der Zug ist die Zeiteinheit des Spiels. Eine Pause in
   * Sekunden hinge an der konfigurierten Zugdauer; „eine Runde aussetzen" ist
   * für den Spieler nachvollziehbar und in Replays stabil.
   */
  #cooldowns = new Map();
  #maelstrom;
  #loot;
  #players = [];
  #turnOrder = [];
  #turnIndex = 0;
  #turnElapsed = 0;
  #turnDurationMs;
  #round = 1;
  #wind = 0;
  #currentStrength = 0;
  #status = 'lobby';
  #winnerTeamId = null;
  #hasFired = false;
  #appliedDamage = new Map();
  #rng;
  #waterBaseY = 0;
  #lastShotBy = null;

  constructor({
    seed,
    teams = 2,
    playersPerTeam = 1,
    preset = 'hills',
    maxRounds = 30,
    turnDurationMs = null,
  } = {}) {
    this.#seedManager = seed === undefined
      ? MatchSeedManager.createRandom()
      : new MatchSeedManager(seed);
    this.#rng = this.#seedManager.getSubRng('MATCH_BASE');
    this.#turnDurationMs = turnDurationMs
      ?? MATCH_RULES.turnTimers.duelSeconds.minimum * 1000;
    this.maxRounds = maxRounds;
    this.preset = preset;

    this.#world = createGameWorld({ playerCount: Math.max(2, teams * playersPerTeam) });
    this.teams = teams;
    this.playersPerTeam = playersPerTeam;

    this.#world.services = {
      events: this.#events,
      inventory: this.#inventory,
      match: {
        round: this.#round,
        wind: this.#wind,
        currentStrength: this.#currentStrength,
        knockbackMultiplier: 1,
        safeInset: 0,
      },
    };
  }

  // ---------------------------------------------------------------- Aufbau

  /** Erzeugt Terrain, Wasser und Spieler und startet das Match. */
  start() {
    this.#buildTerrain();
    this.#buildWater();
    this.#registerSystems();
    this.#spawnPlayers();
    this.#world.services.match.wind = this.#rollWind();
    this.#wind = this.#world.services.match.wind;
    this.#spawnRoundLoot();
    this.#status = 'playing';
    this.#beginTurn(0);
    return this;
  }

  #buildTerrain() {
    const terrainRng = this.#seedManager.getSubRng('TERRAIN');
    const { bitmap, waterLevel } = generateTerrain({
      rng: terrainRng,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      preset: this.preset,
    });
    this.#bitmap = bitmap;
    this.#terrain = CollisionMask.fromBitmap(bitmap, MAP_WIDTH, MAP_HEIGHT);
    // Schild und Rüstung greifen im DamageSystem, damit sie auch bei
    // Flächenschaden wirken — dort verteilt der Radius den Schaden, nicht die
    // Waffe. Der Modifikator ist die einzige Brücke dorthin.
    this.#world.services.damageModifier = (entityId, amount) => {
      const armor = this.#statuses.armorOf(entityId);
      const afterArmor = amount * (1 - armor);
      const { absorbed, rest } = this.#statuses.absorbWithShield(entityId, afterArmor);
      if (absorbed > 0) {
        this.#events.emit('shield_absorbed', { playerId: entityId, absorbed });
      }
      return { amount: rest };
    };

    // Wirkungen beim Einschlag eines Projektils.
    this.#world.services.onProjectileImpact = payload => this.#handleProjectileImpact(payload);

    this.#world.services.terrain = this.#terrain;
    this.#world.services.terrainScale = 1;
    this.#waterBaseY = waterLevel;
  }

  #buildWater() {
    const waterLevel = this.#waterBaseY ?? Math.floor(MAP_HEIGHT * 0.84);
    this.#water = new WaterField({
      width: Math.floor(MAP_WIDTH / WATER_SCALE),
      height: Math.floor(MAP_HEIGHT / WATER_SCALE),
      isSolid: (x, y) => this.#terrain.isSolid(x * WATER_SCALE, y * WATER_SCALE),
      // Brücke zwischen Rasterzellen und Weltpixeln, damit Physik und
      // Charaktere den Wasserstand an einer Weltkoordinate abfragen können.
      worldScale: WATER_SCALE,
    });
    // Becken bis zum Wasserspiegel fluten.
    const levelInGrid = Math.floor(waterLevel / WATER_SCALE);
    const widthInGrid = this.#water.width;
    const heightInGrid = this.#water.height;
    for (let y = levelInGrid; y < heightInGrid; y++) {
      for (let x = 0; x < widthInGrid; x++) {
        if (!this.#terrain.isSolid(x * WATER_SCALE, y * WATER_SCALE)) {
          this.#water.setLevel(x, y, 1);
        }
      }
    }
    this.#world.services.water = this.#water;
  }

  #registerSystems() {
    this.#maelstrom = new MaelstromSystem({ rng: this.#seedManager.getSubRng('EFFECTS') });
    this.#loot = new LootSystem({ rng: this.#seedManager.getSubRng('LOOT') });
    this.#world.registerSystem('projectile', new ProjectileSystem(), SYSTEM_PRIORITIES.PROJECTILE);
    this.#world.registerSystem('character', new CharacterSystem(), SYSTEM_PRIORITIES.CHARACTER);
    this.#world.registerSystem('maelstrom', this.#maelstrom, SYSTEM_PRIORITIES.MAELSTROM);
    this.#world.registerSystem('loot', this.#loot, SYSTEM_PRIORITIES.LOOT);
    this.#world.services.maelstrom = this.#maelstrom;
  }

  #spawnPlayers() {
    const total = this.teams * this.playersPerTeam;
    const spacing = MAP_WIDTH / (total + 1);
    const loadout = getDefaultLoadout(4);

    for (let index = 0; index < total; index++) {
      const teamId = index % this.teams;
      const classId = index % CLASS_IDS.length;
      const archetypeId = index % ARCHETYPE_IDS.length;

      const x = Math.round(spacing * (index + 1));
      const groundY = this.surfaceYAt(x);
      const y = (groundY > 0 ? groundY : MAP_HEIGHT * 0.4) - PLAYER_HALF_HEIGHT - 2;

      const entityId = this.#world.createEntity();
      const classDef = CLASS_DEFINITIONS[CLASS_IDS[classId]];
      const archetype = CLASS_ARCHETYPES[ARCHETYPE_IDS[archetypeId]];
      const maxHealth = Math.round(BASE_HEALTH * classDef.health * archetype.health);

      this.#world.addComponent(entityId, 'Position', { x, y });
      this.#world.addComponent(entityId, 'Velocity', { x: 0, y: 0 });
      this.#world.addComponent(entityId, 'Health', { current: maxHealth, max: maxHealth });
      this.#world.addComponent(entityId, 'Class', { classId, archetypeId });
      this.#world.addComponent(entityId, 'Team', { teamId });
      this.#world.addComponent(entityId, 'Weapon', { angle: teamId === 0 ? Math.PI / 4 : (Math.PI * 3) / 4, power: 55 });
      this.#world.addComponent(entityId, 'Input', { angle: 0, power: 0 });
      this.#world.addComponent(entityId, 'Rotation', { angle: 0 });

      this.#inventory.register(entityId, loadout);

      this.#players.push({
        entityId,
        teamId,
        classId,
        archetypeId,
        label: `P${index + 1}`,
      });
      this.#turnOrder.push(entityId);
    }
  }

  #spawnRoundLoot() {
    try {
      this.#loot.spawnRoundCrates(this.#world, {
        rng: this.#seedManager.getSubRng('LOOT'),
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        surfaceYFor: x => this.surfaceYAt(x),
      });
    } catch (error) {
      this.#events.emit('loot_error', { message: error.message });
    }
  }

  // ------------------------------------------------------------- Simulation

  /** Ein Simulationsschritt mit fester Zeitschrittweite. */
  step(dt = 1000 / 60) {
    if (this.#status !== 'playing') return this.getState();

    this.#turnElapsed += dt;
    this.#world.step();
    // KEIN `drain()` hier: das würde die Warteschlange leeren und die
    // Ereignisse an die Push-Handler verteilen, bevor der Konsument sie lesen
    // kann. Der Client und der Server holen sie über `consumeEvents()`; die
    // Push-API wird im Projekt nicht verwendet. Mit `drain()` gingen alle
    // Ereignisse aus der Simulation verloren — Explosionen wurden nicht
    // gezeichnet, Treffer nicht protokolliert und die Spezialeffekte nie
    // gemeldet.
    this.#checkVictory();

    const projectilesActive = this.activeProjectileCount > 0;
    if (this.#turnElapsed >= this.#turnDurationMs || (this.#hasFired && !projectilesActive)) {
      this.endTurn();
    }
    return this.getState();
  }

  /**
   * Feuert mit der aktiven Waffe. Wird sowohl lokal als auch serverseitig
   * aufgerufen und durchlaeuft immer die vollstaendige Validierung.
   *
   * @returns {{ok:boolean, errors?:string[], projectileId?:number, hit?:object|null}}
   */
  fire(playerId, angle, power, weaponId = null) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match laeuft nicht');

    const command = validateCommand(
      { playerId, angle, power, weaponId, tick: this.#world.tickCount, type: 'fire' },
      {
        currentTick: this.#world.tickCount,
        activePlayerId: this.activePlayerId,
        knownPlayerIds: this.#turnOrder,
      }
    );
    if (!command.valid) return { ok: false, errors: command.errors };
    if (errors.length > 0) return { ok: false, errors };

    if (!this.#world.isActive(playerId)) {
      return { ok: false, errors: ['Spieler ist nicht mehr aktiv'] };
    }

    const resolvedWeaponId = weaponId ?? this.#inventory.getActiveWeaponId(playerId);
    const weapon = resolvedWeaponId ? getWeapon(resolvedWeaponId) : null;
    if (!weapon) return { ok: false, errors: ['Keine Waffe ausgewaehlt'] };
    // Nachladezeit prüfen, BEVOR Munition verbraucht wird — sonst kostet ein
    // abgelehnter Schuss eine Ladung.
    const restCooldown = this.cooldownFor(playerId, weapon.id);
    if (restCooldown > 0) {
      return {
        ok: false,
        errors: [`${weapon.displayName} lädt nach — noch ${restCooldown} ${restCooldown === 1 ? 'Zug' : 'Züge'}`],
        cooldown: restCooldown,
      };
    }

    if (!this.#inventory.consume(playerId, weapon.id, 1)) {
      return { ok: false, errors: ['Keine Munition'] };
    }

    const player = this.#players.find(entry => entry.entityId === playerId);
    const classDef = CLASS_DEFINITIONS[CLASS_IDS[player?.classId ?? 0]];
    const { x, y, vx, vy } = this.#launchVector(playerId, angle, power, weapon);

    this.#world.setComponent(playerId, 'Weapon', 'angle', angle);
    this.#world.setComponent(playerId, 'Weapon', 'power', power);
    this.#hasFired = true;
    this.#lastShotBy = playerId;

    // Wirkungen, die auf den Schützen selbst gehen (Heilung, Schild, Sprung,
    // Munition, Aufklärung), werden sofort ausgelöst. Es wird bewusst KEIN
    // Geschoss erzeugt: ein Projektil, das nur dazu dient, den eigenen Effekt
    // auszulösen, wäre im Spiel irreführend.
    const special = buildEffect(weapon);
    if (special && SELF_TARGET_KINDS.has(special.kind)) {
      const outcome = this.#applySelfEffect(special, playerId, weapon);
      this.#events.emit('special_effect', {
        playerId, weaponId: weapon.id, kind: special.kind, ...outcome,
      });
      this.#applyCooldown(playerId, weapon);
      this.endTurn();
      return { ok: true, projectileId: null, hit: null, special: { kind: special.kind, ...outcome } };
    }

    if (weapon.delivery === 'hitscan') {
      const hit = this.#resolveHitscan(x, y, angle, power, weapon, playerId);
      this.#events.emit('hitscan', { playerId, weaponId: weapon.id, ...hit });
      this.#applyCooldown(playerId, weapon);
      return { ok: true, projectileId: null, hit };
    }

    const projectileId = this.#world.createEntity();

    // Abschusspunkt aus dem Körper des Schützen herausschieben.
    //
    // `x, y` ist die Fußposition auf dem Boden und liegt damit IM festen
    // Terrain. Ein Projektil, das dort entsteht, kollidiert im ersten
    // Simulationsschritt mit dem Boden und verschwindet, ohne das Ziel je zu
    // erreichen — Direktschaden war so unmöglich.
    const spawn = this.#findMuzzle(x, y, Math.cos(angle), -Math.sin(angle), playerId) ?? { x, y };
    this.#world.addComponent(projectileId, 'Position', { x: spawn.x, y: spawn.y });
    this.#world.addComponent(projectileId, 'Velocity', { x: vx, y: vy });
    this.#world.addComponent(projectileId, 'Projectile', {
      owner: playerId,
      weaponId: weapon.index,
      // Der Schadensbonus aus Buffs wirkt auf den tatsaechlichen Schaden.
      damage: weapon.damage * classDef.power * this.#statuses.damageMultiplier(playerId),
      blastRadius: weapon.blastRadius || 24,
      knockback: weapon.knockback,
      drag: 0.995,
      gravityScale: weapon.gravityScale || 1,
      windFactor: 1,
      terrainDamage: weapon.terrainDamage,
      bounces: weapon.bounces,
      // Lebensdauer aus der eigenen Reichweite und der TATSÄCHLICHEN
      // Anfangsgeschwindigkeit: sonst verfällt ein schnelles Geschoss mitten im
      // Flug oder ein langsames bleibt unnötig lange bestehen.
      lifetime: Math.max(30, Math.round(
        weapon.maxRange / Math.max(1, Math.hypot(vx, vy)),
      ) * 1.5),
      alive: 1,
    });

    this.#shotsInFlight.set(projectileId, weapon.id);

    this.#events.emit('projectile_spawn', { playerId, projectileId, weaponId: weapon.id, x, y, vx, vy });
    this.#applyCooldown(playerId, weapon);
    return { ok: true, projectileId, hit: null };
  }

  #resolveHitscan(originX, originY, angle, power, weapon, shooterId = null) {
    const speed = power * POWER_TO_SPEED;
    const maxSteps = Math.max(2, Math.round(weapon.maxRange / Math.max(1, speed)));
    const dirX = Math.cos(angle);
    // Der Winkel wird gegen die Bildschirmachse gemessen: 0 = rechts, π/2 = oben.
    const dirY = -Math.sin(angle);

    // Mündung bestimmen. Ein Start direkt auf der Schützenposition ist falsch:
    // Der Schütze steht auf dem Boden, und sein eigenes Trefferfeld reicht
    // ±PLAYER_HALF_HEIGHT um die Fußposition. Der Strahl würde deshalb sofort
    // im eigenen Körper bzw. im Boden darunter enden und das eigentliche Ziel
    // nie erreichen. Deshalb wird der Startpunkt entlang der Schussrichtung aus
    // dem Körper herausgeschoben, bis freies Feld erreicht ist.
    const start = this.#findMuzzle(originX, originY, dirX, dirY, shooterId);
    if (start === null) {
      // Kein freies Feld in Schussrichtung: die Waffe kann nicht abgefeuert werden.
      return { hitX: originX, hitY: originY, hit: false, target: null, blocked: true };
    }

    const result = ccdRaycast(
      {
        startX: start.x,
        startY: start.y,
        velocityX: dirX * speed,
        velocityY: dirY * speed,
        drag: 1,
        gravity: 0,
        maxSteps,
      },
      // Der Schütze selbst darf den Strahl nicht blockieren.
      (x, y) => {
        if (this.#terrain.isSolid(Math.floor(x), Math.floor(y))) return true;
        const hitPlayer = this.#playerAt(x, y, shooterId);
        return hitPlayer !== null;
      }
    );

    const target = this.#playerAt(result.hitX, result.hitY, shooterId);
    if (target !== null) {
      const damage = weapon.damage * this.#statuses.damageMultiplier(shooterId);
      this.#world.getSystem('damage')?.applyDamage(this.#world, target, damage, shooterId);

      // Wirkung über den Schaden hinaus (Einfrieren, Schaden über Zeit).
      const effect = buildEffect(weapon);
      if (effect && !SELF_TARGET_KINDS.has(effect.kind)) {
        this.#applyTargetEffect(effect, target, shooterId);
      }
    }

    return { hitX: result.hitX, hitY: result.hitY, hit: result.hit, target };
  }

  /**
   * Wirft eine Waffe ab und legt sie als aufhebbare Kiste in der Nähe ab.
   *
   * Die Mechanik unterstützt den Spielablauf an der Stelle, an der er sonst
   * stockt: Ist der Waffenvorrat voll, muss man sich von etwas trennen, um etwas
   * Neues zu nehmen.
   *
   * Entscheidungen:
   *  - Die Landestelle wird ZUFÄLLIG gewählt, aber geprüft: innerhalb der Karte,
   *    auf festem Boden und AUSSERHALB des Aufhebe-Radius. Sonst würde der
   *    Werfer seine eigene Waffe im nächsten Schritt wieder einsammeln und die
   *    Handlung wäre wirkungslos.
   *  - Der Zufall kommt aus dem Match-Generator, ist also reproduzierbar.
   *  - Die verbleibende Munition reist mit: Abwerfen und Aufheben darf kein
   *    Munitionstrick sein.
   *  - Die Reservewaffe ist geschützt (siehe Inventar).
   *
   * @param {number} playerId
   * @param {string} weaponId
   * @returns {{ok:boolean, crateId?:number, x?:number, y?:number, ammo?:number, errors?:string[]}}
   */
  dropWeapon(playerId, weaponId) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match läuft nicht');
    if (!this.#world.isActive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
    if (errors.length > 0) return { ok: false, errors };

    const weapon = getWeapon(weaponId);
    if (!weapon) return { ok: false, errors: ['Unbekannte Waffe'] };

    const entfernt = this.#inventory.removeWeapon(playerId, weaponId);
    if (!entfernt.ok) return { ok: false, errors: [entfernt.reason] };

    // Landestelle suchen. Begrenzte Versuche: bei zu engem Gelände wird die
    // Waffe an der eigenen Position abgelegt, statt das Abwerfen zu verweigern —
    // sonst ließe sich eine Waffe in einer Grube nie loswerden.
    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const startY = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;
    const platz = this.#findDropSpot(startX, startY) ?? { x: startX, y: startY };

    const crateId = this.#world.createEntity();
    this.#world.addComponent(crateId, 'Position', { x: platz.x, y: platz.y });
    this.#world.addComponent(crateId, 'Velocity', { x: 0, y: 0 });
    this.#world.addComponent(crateId, 'Crate', {
      crateType: CRATE_TYPES.weapon,
      crateX: platz.x,
      crateY: platz.y,
      rarity: Math.max(0, RARITY_IDS.indexOf(weapon.rarity)),
      weaponId: weapon.index,
      picked: 0,
      ammo: entfernt.ammo,
    });

    // Eine abgeworfene Waffe ist keine Nachladezeit mehr wert: die Pause gehört
    // zur Waffe, und die liegt jetzt am Boden.
    this.#cooldowns.delete(`${playerId}:${weaponId}`);

    this.#events.emit('weapon_dropped', {
      playerId, weaponId, crateId, x: platz.x, y: platz.y, ammo: entfernt.ammo,
    });

    return { ok: true, crateId, x: platz.x, y: platz.y, ammo: entfernt.ammo };
  }

  /**
   * Sucht eine zufällige, gültige Landestelle für eine abgeworfene Waffe.
   *
   * Bedingungen: innerhalb der Karte, mindestens `DROP_MIN_DISTANCE` und
   * höchstens `DROP_MAX_DISTANCE` entfernt, und der Punkt muss über festem
   * Boden liegen. Gibt `null` zurück, wenn kein Platz gefunden wurde.
   *
   * @returns {{x:number, y:number}|null}
   */
  #findDropSpot(originX, originY) {
    const MIN = 26;   // weiter als der Aufhebe-Radius (18), sonst sofort wieder auf
    const MAX = 96;

    for (let versuch = 0; versuch < 24; versuch++) {
      const winkel = this.#rng.nextFloat(0, Math.PI * 2);
      const abstand = this.#rng.nextFloat(MIN, MAX);
      const x = originX + Math.cos(winkel) * abstand;

      if (x < PLAYER_HALF_WIDTH + 4 || x > MAP_WIDTH - PLAYER_HALF_WIDTH - 4) continue;

      const boden = this.surfaceYAt(Math.round(x));
      if (boden < 0) continue;

      // Über dem Boden muss LUFT sein, damit die Kiste sichtbar und aufhebbar
      // liegen bleibt. Die Bedingung ist bewusst positiv formuliert: „Platz für
      // eine stehende Figur“ — also darf der Punkt über der Oberfläche NICHT
      // fest sein. (Die invertierte Fassung verlangte festes Gelände in der Luft
      // und lehnte damit jede Stelle ab.)
      if (this.#terrain.isSolid(Math.floor(x), Math.floor(boden - PLAYER_HALF_HEIGHT))) continue;
      if (Math.abs(boden - originY) > 260) continue;

      // Nicht auf einem anderen Spieler ablegen.
      const besetzt = this.#players.some(entry => {
        if (!this.#world.isActive(entry.entityId)) return false;
        const px = this.#world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
        return Math.abs(px - x) < 14;
      });
      if (besetzt) continue;

      return { x, y: boden };
    }
    return null;
  }

  /**
   * Räumt alle Nachladezeiten eines Spielers.
   * Nötig beim Ausscheiden: sonst blieben Einträge für einen Spieler stehen,
   * der nicht mehr am Match teilnimmt.
   */
  clearCooldowns(playerId) {
    const prefix = `${playerId}:`;
    for (const key of [...this.#cooldowns.keys()]) {
      if (key.startsWith(prefix)) this.#cooldowns.delete(key);
    }
  }

  /** Verbleibende Nachladezeit einer Waffe in Zügen (0 = einsatzbereit). */
  cooldownFor(playerId, weaponId) {
    return this.#cooldowns.get(`${playerId}:${weaponId}`) ?? 0;
  }

  /**
   * Setzt die Nachladezeit einer Waffe.
   * Wird nach jedem erfolgreichen Schuss aufgerufen, auch bei Selbstwirkungen —
   * sonst ließe sich eine Heilwaffe durchgehend benutzen.
   */
  #applyCooldown(playerId, weapon) {
    const turns = Math.max(0, Math.floor(weapon?.cooldown ?? 0));
    if (turns <= 0) return 0;
    this.#cooldowns.set(`${playerId}:${weapon.id}`, turns);
    this.#events.emit('weapon_cooldown', {
      playerId, weaponId: weapon.id, turns,
    });
    return turns;
  }

  /**
   * Zählt die Nachladezeiten eines Spielers um einen Zug herunter.
   * Gehört an den ZUGbeginn: der Spieler überspringt seine Pause, wenn er
   * wieder an der Reihe ist.
   */
  #tickCooldowns(playerId) {
    const prefix = `${playerId}:`;
    for (const [key, rest] of this.#cooldowns.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (rest <= 1) this.#cooldowns.delete(key);
      else this.#cooldowns.set(key, rest - 1);
    }
  }

  /**
   * Wendet eine Wirkung auf den Schützen an.
   *
   * @param {object} effect - aus buildEffect()
   * @param {number} playerId
   * @param {object} weapon
   * @returns {object} Beschreibung des tatsächlichen Ergebnisses
   */
  #applySelfEffect(effect, playerId, weapon) {
    switch (effect.kind) {
      case EFFECT_KIND.HEAL: {
        const health = this.#world.getComponent(playerId, 'Health', 'current') ?? 0;
        const max = this.#world.getComponent(playerId, 'Health', 'max') ?? 0;
        // Heilung wird begrenzt: das Schild zählt mit, sonst wäre Heilung bei
        // vollem Schild wirkungslos verpufft.
        const headroom = Math.max(0, max - health);
        const healed = Math.min(effect.amount, headroom);
        if (healed > 0) this.#world.setComponent(playerId, 'Health', 'current', health + healed);
        return { healed, amount: effect.amount };
      }

      case EFFECT_KIND.SHIELD: {
        const shield = this.#statuses.addShield(playerId, effect.amount);
        return { shield, amount: effect.amount };
      }

      case EFFECT_KIND.DAMAGE_BOOST: {
        const multiplier = this.#statuses.addBoost(playerId, effect.multiplier, 2);
        return { multiplier };
      }

      case EFFECT_KIND.ARMOR: {
        const reduction = this.#statuses.addArmor(playerId, effect.reduction);
        return { reduction };
      }

      case EFFECT_KIND.AMMO: {
        const restored = this.#restoreAmmo(playerId, effect.amount);
        return { restored };
      }

      case EFFECT_KIND.MOVE: {
        const moved = this.#shiftPlayer(playerId, effect.distance);
        return { moved };
      }

      case EFFECT_KIND.REVEAL: {
        const turns = this.#statuses.reveal(playerId, effect.turns);
        return { revealedTurns: turns };
      }

      case EFFECT_KIND.RANDOM: {
        // Auswahl über den Match-Zufallsgenerator: bei gleichem Seed dieselbe
        // Wirkung. Bewusst NICHT Math.random — sonst wäre ein Replay nicht mehr
        // reproduzierbar.
        const pool = effect.pool?.length ? effect.pool : RANDOM_EFFECT_POOL;
        const gewaehlt = pool[this.#rng.nextIntBelow(pool.length)];
        const unterEffekt = this.#buildSubEffect(gewaehlt, weapon);
        const outcome = this.#applySelfEffect(unterEffekt, playerId, weapon);
        return { randomKind: gewaehlt, ...outcome };
      }

      default:
        return { ignored: effect.kind, weaponId: weapon?.id ?? null };
    }
  }

  /**
   * Baut den konkreten Effekt für eine gewählte Wirkungsart.
   * Nötig für Zufallswaffen, deren Ziel erst beim Auslösen feststeht.
   */
  #buildSubEffect(kind, weapon) {
    const schaden = weapon?.damage ?? 0;
    switch (kind) {
      case EFFECT_KIND.HEAL:
        return { kind, amount: Math.max(SPECIAL_HEAL_MIN, Math.round(schaden * 1.2)) };
      case EFFECT_KIND.SHIELD:
        return { kind, amount: Math.max(SPECIAL_SHIELD_MIN, Math.round(schaden * 1.1)) };
      case EFFECT_KIND.DAMAGE_BOOST:
        return { kind, multiplier: 1.5 };
      case EFFECT_KIND.ARMOR:
        return { kind, reduction: 0.3 };
      case EFFECT_KIND.AMMO:
        return { kind, amount: 3 };
      case EFFECT_KIND.MOVE:
        return { kind, distance: RANDOM_MOVE_DISTANCE };
      default:
        return { kind: EFFECT_KIND.HEAL, amount: SPECIAL_HEAL_MIN };
    }
  }

  /**
   * Füllt Munition der Waffen eines Spielers auf.
   *
   * Es wird von der ERSTEN Waffe an aufgefüllt, deren Vorrat nicht unbegrenzt
   * ist. Dadurch ist das Ergebnis deterministisch und unabhängig von der
   * Reihenfolge im Inventar.
   *
   * @returns {number} tatsächlich aufgefüllte Ladungen
   */
  #restoreAmmo(playerId, amount) {
    const weapons = this.#inventory.getWeapons(playerId);
    let remaining = Math.max(0, Math.floor(amount));
    let restored = 0;

    for (const weaponId of weapons) {
      if (remaining <= 0) break;
      const weapon = getWeapon(weaponId);
      if (!weapon) continue;
      const current = this.#inventory.getAmmo(playerId, weaponId);
      if (!Number.isFinite(current)) continue; // unbegrenzt: nichts aufzufüllen

      const capacity = Math.max(1, weapon.maxAmmo || 1);
      const fehlt = Math.max(0, capacity - current);
      const give = Math.min(remaining, fehlt);
      if (give <= 0) continue;

      this.#inventory.grantAmmo(playerId, weaponId, give);
      remaining -= give;
      restored += give;
    }
    return restored;
  }

  /**
   * Versetzt einen Spieler entlang der Geländeoberfläche.
   *
   * Für Sprung- und Teleportwaffen. Die Bewegung ist bewusst auf einen
   * Geländepunkt begrenzt: ein Teleport in festes Terrain oder aus der Karte
   * heraus wäre ein Fehler, kein Feature.
   *
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #shiftPlayer(playerId, distance) {
    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const startY = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;

    // In der aktuellen Blickrichtung nach vorne, sofern das Ziel frei ist;
    // sonst ein Stück zurück. Beides wird auf dem Gelände verankert.
    const candidates = [startX + distance, startX - distance];
    for (const targetX of candidates) {
      if (targetX < PLAYER_HALF_WIDTH || targetX > MAP_WIDTH - PLAYER_HALF_WIDTH) continue;
      const surface = this.surfaceYAt(Math.round(targetX));
      if (surface < 0) continue;
      // Kein Platz für eine stehende Figur (z. B. Wand): nächster Kandidat.
      if (this.#terrain.isSolid(Math.floor(targetX), Math.floor(surface - PLAYER_HALF_HEIGHT))) continue;

      this.#world.setComponent(playerId, 'Position', 'x', targetX);
      this.#world.setComponent(playerId, 'Position', 'y', surface);
      this.#world.setComponent(playerId, 'Velocity', 'x', 0);
      this.#world.setComponent(playerId, 'Velocity', 'y', 0);
      return { dx: targetX - startX, dy: surface - startY };
    }
    return { dx: 0, dy: 0 };
  }

  /**
   * Wendet eine Wirkung auf ein getroffenes Ziel an (Einfrieren, Schaden über Zeit).
   * Wirkt nur auf Gegner — eigene Einheiten bleiben verschont.
   */
  #applyTargetEffect(effect, targetId, attackerId) {
    const ziel = this.#players.find(entry => entry.entityId === targetId);
    const schuetze = this.#players.find(entry => entry.entityId === attackerId);
    if (!ziel || !this.#world.isActive(targetId)) return null;
    if (schuetze && ziel.teamId === schuetze.teamId) return null;

    switch (effect.kind) {
      case EFFECT_KIND.FREEZE: {
        const turns = this.#statuses.freeze(targetId, effect.turns);
        this.#events.emit('frozen', { playerId: targetId, turns, by: attackerId });
        return { kind: effect.kind, turns };
      }

      case EFFECT_KIND.PULL: {
        // Das Ziel wird in Richtung des Schützen versetzt, auf festem Gelände
        // verankert. Wirkt nur, wenn es sich tatsächlich bewegt hat — sonst
        // wäre die Wirkung bei einer Wand dazwischen eine stille Nullnummer.
        const versetzt = this.#pullToward(targetId, attackerId, effect.distance);
        if (versetzt.dx === 0 && versetzt.dy === 0) return null;
        this.#events.emit('pulled', { playerId: targetId, by: attackerId, ...versetzt });
        return { kind: effect.kind, ...versetzt };
      }

      case EFFECT_KIND.DAMAGE_OVER_TIME: {
        this.#statuses.addDot(targetId, effect);
        this.#events.emit('dot_applied', {
          playerId: targetId,
          element: effect.element,
          damagePerTurn: effect.damagePerTurn,
          turns: effect.turns,
          by: attackerId,
        });
        return { kind: effect.kind, ...effect };
      }

      default:
        return null;
    }
  }

  /**
   * Versetzt ein Ziel in Richtung eines Angreifers.
   *
   * Die Bewegung ist auf ein Stück pro Anwendung begrenzt und wird auf der
   * Geländeoberfläche verankert: ein Ziehen durch massives Terrain wäre ein
   * Fehler, kein Effekt. Der Schütze selbst bewegt sich nicht.
   *
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #pullToward(targetId, attackerId, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const zielY = this.#world.getComponent(targetId, 'Position', 'y') ?? 0;
    const schuetzeX = this.#world.getComponent(attackerId, 'Position', 'x') ?? 0;

    const richtung = Math.sign(schuetzeX - zielX);
    if (richtung === 0) return { dx: 0, dy: 0 };

    // In kleinen Schritten prüfen, damit das Ziel nicht durch eine Wand springt.
    const schritt = 10;
    let erreicht = 0;
    for (let d = schritt; d <= distance; d += schritt) {
      const kandidatX = zielX + richtung * d;
      if (kandidatX < PLAYER_HALF_WIDTH || kandidatX > MAP_WIDTH - PLAYER_HALF_WIDTH) break;
      const surface = this.surfaceYAt(Math.round(kandidatX));
      if (surface < 0) break;
      if (this.#terrain.isSolid(Math.floor(kandidatX), Math.floor(surface - PLAYER_HALF_HEIGHT))) break;
      erreicht = d;
    }

    if (erreicht === 0) return { dx: 0, dy: 0 };

    const neueX = zielX + richtung * erreicht;
    const neueY = this.surfaceYAt(Math.round(neueX));
    this.#world.setComponent(targetId, 'Position', 'x', neueX);
    this.#world.setComponent(targetId, 'Position', 'y', neueY);
    this.#world.setComponent(targetId, 'Velocity', 'x', 0);
    this.#world.setComponent(targetId, 'Velocity', 'y', 0);
    return { dx: neueX - zielX, dy: neueY - zielY };
  }

  /**
   * Wendet Wirkungen auf alle Gegner in einem Radius an.
   * Für Waffen mit Flächenwirkung: Giftwolken und Feuerflächen treffen jeden
   * im Umkreis, nicht nur das direkt getroffene Ziel.
   */
  #applyAreaEffect(effect, x, y, radius, attackerId) {
    const angewendet = [];
    for (const entry of this.#players) {
      if (!this.#world.isActive(entry.entityId)) continue;
      if (entry.entityId === attackerId) continue;
      const px = this.#world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
      const py = this.#world.getComponent(entry.entityId, 'Position', 'y') ?? 0;
      const distSq = (px - x) ** 2 + (py - y) ** 2;
      if (distSq > radius * radius) continue;
      const outcome = this.#applyTargetEffect(effect, entry.entityId, attackerId);
      if (outcome) angewendet.push({ playerId: entry.entityId, ...outcome });
    }
    return angewendet;
  }

  /**
   * Wirkung eines eingeschlagenen Projektils.
   *
   * Die Zuordnung Projektil → Waffe wird hier verbraucht und wieder entfernt,
   * damit die Map nicht über die Matchdauer wächst.
   */
  #handleProjectileImpact({ projectileId, owner, x, y, target, blastRadius }) {
    const weaponId = this.#shotsInFlight.get(projectileId);
    this.#shotsInFlight.delete(projectileId);
    if (!weaponId) return;

    const weapon = getWeapon(weaponId);
    const effect = buildEffect(weapon);
    if (!effect || SELF_TARGET_KINDS.has(effect.kind)) return;

    if (target !== null && target !== undefined) {
      this.#applyTargetEffect(effect, target, owner);
    }
    // Bei Flächenwirkung zusätzlich alle Gegner im Radius treffen — eine
    // Giftwolke wirkt nicht nur auf den direkt getroffenen Gegner.
    if (blastRadius > 0) {
      this.#applyAreaEffect(effect, x, y, blastRadius, owner);
    }
  }

  /**
   * Sucht den Mündungspunkt: den ersten Punkt entlang der Schussrichtung, der
   * weder in festem Terrain noch im Körper eines Spielers liegt.
   *
   * @returns {{x:number,y:number}|null}
   */
  #findMuzzle(originX, originY, dirX, dirY, shooterId = null) {
    // Die Schützenposition ist die Fußposition auf dem Boden. Ein Strahl, der
    // dort beginnt, liegt im festen Terrain und endet sofort. Deshalb startet
    // die Suche auf halber Körperhöhe — dort ist die Figur tatsächlich "frei".
    const bodyY = originY - PLAYER_HALF_HEIGHT / 2;
    for (let distance = 0; distance <= MUZZLE_SEARCH_DISTANCE; distance += 2) {
      const x = originX + dirX * distance;
      const y = bodyY + dirY * distance;
      if (this.#terrain.isSolid(Math.floor(x), Math.floor(y))) continue;
      if (this.#playerAt(x, y, shooterId) !== null) continue;
      return { x, y };
    }
    return null;
  }

  /**
   * Spieler an einer Position.
   * @param {number|null} [excludeId] - wird übersprungen (meist der Schütze)
   */
  #playerAt(x, y, excludeId = null) {
    for (const entry of this.#players) {
      if (excludeId !== null && entry.entityId === excludeId) continue;
      if (!this.#world.isActive(entry.entityId)) continue;
      const px = this.#world.getComponent(entry.entityId, 'Position', 'x') || 0;
      const py = this.#world.getComponent(entry.entityId, 'Position', 'y') || 0;
      if (Math.abs(x - px) <= PLAYER_HALF_WIDTH && Math.abs(y - py) <= PLAYER_HALF_HEIGHT) {
        return entry.entityId;
      }
    }
    return null;
  }

  /**
   * Abschussvektor inklusive Klassen- und Archetypenmodifikatoren.
   * Wird von fire() und aimPreview() gemeinsam genutzt, damit Vorschau und
   * tatsaechlicher Schuss identisch rechnen.
   */
  #launchVector(playerId, angle, power, weapon = null) {
    const player = this.#players.find(entry => entry.entityId === playerId);
    const classDef = CLASS_DEFINITIONS[CLASS_IDS[player?.classId ?? 0]];
    const archetype = CLASS_ARCHETYPES[ARCHETYPE_IDS[player?.archetypeId ?? 0]];

    const x = this.#world.getComponent(playerId, 'Position', 'x') || 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') || 0;
    // Der Geschwindigkeitsfaktor der Waffe wirkt jetzt tatsächlich. Vorher flog
    // jedes Geschoss gleich schnell, obwohl die Quelldaten 14 verschiedene
    // Geschwindigkeiten (48-100) nennen — eine Minigun war im Flug nicht von
    // einem Mörser zu unterscheiden.
    const weaponFactor = weapon?.speedFactor ?? 1;
    const speed = power * POWER_TO_SPEED * classDef.power * (archetype.damage / 1.2) * weaponFactor;

    return { x, y, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed };
  }

  /**
   * Zielvorschau: simuliert die Flugbahn mit exakt derselben Physik wie das
   * ProjectileSystem (Gravitation, Wind, Drag) und bricht beim ersten
   * Terraintreffer ab.
   *
   * @returns {{x:number,y:number}[]}
   */
  aimPreview(playerId, angle, power, steps = 180, weapon = null) {
    if (!this.#world.isActive(playerId)) return [];
    // Die Vorschau muss dieselbe Geschwindigkeit nutzen wie der echte Schuss,
    // sonst zeigt sie eine Bahn, die die Waffe nicht fliegt.
    const waffe = weapon ?? getWeapon(this.#inventory.getActiveWeaponId(playerId));
    const launch = this.#launchVector(playerId, angle, power, waffe);
    const wind = this.#world.services.match.wind ?? 0;

    let x = launch.x;
    let y = launch.y;
    let vx = launch.vx;
    let vy = launch.vy;
    const points = [];

    for (let step = 0; step < steps; step++) {
      vy += DEFAULT_PROJECTILE_GRAVITY;
      vx += wind;
      vx *= DEFAULT_PROJECTILE_DRAG;
      vy *= DEFAULT_PROJECTILE_DRAG;
      x += vx;
      y += vy;

      if (step % 3 === 0) points.push({ x, y });
      if (x < 0 || x > MAP_WIDTH || y > MAP_HEIGHT || y < 0) break;
      if (this.#terrain.isSolid(Math.floor(x), Math.floor(y))) {
        points.push({ x, y });
        break;
      }
    }
    return points;
  }

  endTurn() {
    if (this.#status !== 'playing') return;
    const previous = this.activePlayerId;
    this.#turnElapsed = 0;
    this.#hasFired = false;

    let nextIndex = this.#turnIndex;
    for (let attempt = 0; attempt < this.#turnOrder.length; attempt++) {
      nextIndex = (nextIndex + 1) % this.#turnOrder.length;
      if (this.#world.isActive(this.#turnOrder[nextIndex])) break;
    }

    const wrapped = nextIndex <= this.#turnIndex;
    this.#turnIndex = nextIndex;

    this.#events.emit('turn_end', { playerId: previous, next: this.activePlayerId });

    if (wrapped) {
      this.#round += 1;
      this.#world.services.match.round = this.#round;
      this.#onRoundStart();
      // #onRoundStart kann das Match beendet haben (Rundengrenze). Dann darf
      // kein weiterer Zug mehr eröffnet werden.
      if (this.#status !== 'playing') return;
    }

    this.#beginTurn(nextIndex);
  }

  #onRoundStart() {
    // Harte Rundengrenze: ohne sie kann ein Match mit vielen Fehlschüssen
    // unbegrenzt laufen. Bei Überschreitung gewinnt das Team mit der meisten
    // verbleibenden Gesundheit — deterministisch, kein Unentschieden-Fallback.
    if (this.#round > this.maxRounds) {
      this.#finishByAttrition();
      return;
    }

    if (this.#round >= MATCH_RULES.suddenDeath.roundBreakpoint) {
      if (!this.#maelstrom.isActive) this.#maelstrom.activate();
      this.#maelstrom.contract(this.#world);
      this.#world.services.match.knockbackMultiplier =
        1 + MATCH_RULES.suddenDeath.knockbackPercentBonus / 100;
    }
    const wind = this.#rollWind();
    this.#wind = wind;
    this.#currentStrength = wind * 10;
    this.#world.services.match.wind = wind;
    this.#world.services.match.currentStrength = this.#currentStrength;
    this.#spawnRoundLoot();
    this.#events.emit('round_start', { round: this.#round, wind });
  }

  /**
   * Ends the match because the round limit is reached. Der Sieger ist das Team
   * mit der höchsten Summe verbleibender Gesundheit; bei Gleichstand gewinnt
   * das niedrigere Team-ID (stabil und damit deterministisch).
   */
  #finishByAttrition() {
    const healthByTeam = new Map();
    for (const entry of this.#players) {
      const health = this.#world.isActive(entry.entityId)
        ? (this.#world.getComponent(entry.entityId, 'Health', 'current') || 0)
        : 0;
      healthByTeam.set(entry.teamId, (healthByTeam.get(entry.teamId) ?? 0) + health);
    }

    let winner = null;
    let best = -1;
    for (const [teamId, health] of [...healthByTeam.entries()].sort((a, b) => a[0] - b[0])) {
      if (health > best) {
        best = health;
        winner = teamId;
      }
    }

    this.#status = 'gameover';
    this.#winnerTeamId = winner;
    this.#events.emit('match_over', {
      winnerTeamId: winner,
      rounds: this.#round,
      ticks: this.#world.tickCount,
      reason: 'round_limit',
      healthByTeam: Object.fromEntries(healthByTeam),
    });
  }

  #beginTurn(index) {
    const entityId = this.#turnOrder[index];
    if (!this.#world.isActive(entityId)) return;

    // Zustände dieses Zuges abrechnen: Schaden über Zeit wirkt, Dauern klingen ab.
    // Die Abrechnung gehört an den ZUGbeginn, nicht in step(): sonst hinge der
    // Schaden an der Tickrate statt an den Zügen und wäre bei anderer Zugzeit
    // ein anderer.
    const turnState = this.#statuses.advanceTurn(entityId);

    // Nachladezeiten dieses Spielers um einen Zug herunterzählen. Bewusst VOR
    // der Einfrier-Prüfung: eine Pause soll auch dann ablaufen, wenn der Spieler
    // seinen Zug aussetzt.
    this.#tickCooldowns(entityId);

    if (turnState.damage > 0 && this.#world.isActive(entityId)) {
      this.#world.getSystem('damage')?.applyDamage(this.#world, entityId, turnState.damage, null);
      this.#events.emit('dot_tick', {
        playerId: entityId,
        damage: turnState.damage,
        elements: turnState.elements,
      });
    }

    // Eingefroren: der Spieler setzt diesen Zug aus. `advanceTurn` hat die
    // Dauer bereits heruntergezählt, deshalb endet die Wirkung von selbst.
    if (turnState.frozeThisTurn && this.#world.isActive(entityId) && this.#status === 'playing') {
      this.#events.emit('turn_skipped', { playerId: entityId, reason: 'frozen' });
      this.endTurn();
      return;
    }

    this.#world.getSystem('turn')?.startTurn();
    if (this.#maelstrom.isActive) this.#maelstrom.applyToxicRain(this.#world);
    this.#events.emit('turn_start', { playerId: entityId, round: this.#round, wind: this.#wind });
  }

  #rollWind() {
    return Math.round(this.#rng.nextFloat(-MAX_WIND, MAX_WIND) * 10000) / 10000;
  }

  #checkVictory() {
    const aliveTeams = new Set();
    for (const entry of this.#players) {
      if (this.#world.isActive(entry.entityId)) aliveTeams.add(entry.teamId);
    }
    if (aliveTeams.size <= 1) {
      this.#status = 'gameover';
      this.#winnerTeamId = aliveTeams.size === 1 ? [...aliveTeams][0] : null;
      this.#events.emit('match_over', {
        winnerTeamId: this.#winnerTeamId,
        rounds: this.#round,
        ticks: this.#world.tickCount,
        reason: 'elimination',
      });
    }
  }

  // -------------------------------------------------------------- Zugriff

  surfaceYAt(x) {
    const groundY = findSurfaceY(this.#bitmap, MAP_WIDTH, MAP_HEIGHT, x);
    return groundY < 0 ? -1 : groundY;
  }

  /** Setzt die Zugzeit neu (Spielvarianten, Tests, Turniermodus). */
  setTurnDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
      throw new TypeError('Zugzeit muss eine positive Zahl in Millisekunden sein');
    }
    this.#turnDurationMs = ms;
    this.#world.getSystem('turn')?.resetTimer(ms);
    return this;
  }

  /** Setzt die Zugzeit auf die Konfiguration der Spielerzahl zurück. */
  resetTurnDuration() {
    this.#turnDurationMs = this.#world.getSystem('turn')?.turnDuration ?? this.#turnDurationMs;
    return this;
  }

  consumeEvents() {
    return this.#events.flush();
  }

  getState() {
    const entities = this.#players.map(entry => {
      const alive = this.#world.isActive(entry.entityId);
      return {
        entityId: entry.entityId,
        teamId: entry.teamId,
        classId: entry.classId,
        archetypeId: entry.archetypeId,
        label: entry.label,
        alive,
        x: alive ? this.#world.getComponent(entry.entityId, 'Position', 'x') : 0,
        y: alive ? this.#world.getComponent(entry.entityId, 'Position', 'y') : 0,
        health: alive ? this.#world.getComponent(entry.entityId, 'Health', 'current') : 0,
        maxHealth: alive ? this.#world.getComponent(entry.entityId, 'Health', 'max') : 0,
        angle: alive ? this.#world.getComponent(entry.entityId, 'Weapon', 'angle') : 0,
        power: alive ? this.#world.getComponent(entry.entityId, 'Weapon', 'power') : 0,
        activeWeaponId: this.#inventory.getActiveWeaponId(entry.entityId),
        inventory: this.#inventory.getWeapons(entry.entityId),
        /** Verbleibende Nachladezeit je Waffe in Zügen (nur belegte Waffen). */
        cooldowns: Object.fromEntries(
          this.#inventory.getWeapons(entry.entityId)
            .map(weaponId => [weaponId, this.cooldownFor(entry.entityId, weaponId)])
            .filter(([, rest]) => rest > 0),
        ),
        ammo: Object.fromEntries(
          this.#inventory.getWeapons(entry.entityId).map(weaponId => {
            const amount = this.#inventory.getAmmo(entry.entityId, weaponId);
            return [weaponId, Number.isFinite(amount) ? amount : 'unbegrenzt'];
          })
        ),
      };
    });

    const projectiles = [];
    for (const id of this.#world.getEntitiesBySignature(
      COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.PROJECTILE
    )) {
      if (!this.#world.isActive(id)) continue;
      projectiles.push({
        entityId: id,
        x: this.#world.getComponent(id, 'Position', 'x'),
        y: this.#world.getComponent(id, 'Position', 'y'),
        owner: this.#world.getComponent(id, 'Projectile', 'owner'),
      });
    }

    const crates = [];
    for (const id of this.#world.getEntitiesBySignature(
      COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.POSITION
    )) {
      if (!this.#world.isActive(id)) continue;
      crates.push({
        entityId: id,
        x: this.#world.getComponent(id, 'Position', 'x'),
        y: this.#world.getComponent(id, 'Position', 'y'),
        crateType: this.#world.getComponent(id, 'Crate', 'crateType'),
        rarity: this.#world.getComponent(id, 'Crate', 'rarity'),
      });
    }

    return {
      status: this.#status,
      round: this.#round,
      maxRounds: this.maxRounds,
      wind: this.#wind,
      tick: this.#world.tickCount,
      turnElapsedMs: this.#turnElapsed,
      turnDurationMs: this.#turnDurationMs,
      activePlayerId: this.activePlayerId,
      winnerTeamId: this.#winnerTeamId,
      /**
       * Laufende Zustände je Spieler-ID (Schild, Einfrieren, Schaden über Zeit,
       * Schadensbonus). Für die Anzeige und für Tests.
       */
      statuses: this.#statuses.snapshot(),
      maelstrom: {
        active: this.#maelstrom?.isActive ?? false,
        inset: this.#maelstrom?.inset ?? 0,
      },
      entities,
      projectiles,
      crates,
      terrainWidth: MAP_WIDTH,
      terrainHeight: MAP_HEIGHT,
    };
  }

  serialize() {
    return {
      seed: this.#seedManager.serialize(),
      round: this.#round,
      turnIndex: this.#turnIndex,
      turnElapsed: this.#turnElapsed,
      wind: this.#wind,
      status: this.#status,
      winnerTeamId: this.#winnerTeamId,
      world: this.#world.serialize(),
      inventory: this.#inventory.serialize(),
      players: this.#players.map(entry => ({ ...entry })),
      turnOrder: [...this.#turnOrder],
      maelstrom: { active: this.#maelstrom?.isActive ?? false, inset: this.#maelstrom?.inset ?? 0 },
      water: this.#water.serialize(),
    };
  }

  /** Deterministischer Vergleichshash fuer Replay-Checks. */
  stateHash() {
    const state = this.getState();
    const payload = JSON.stringify({
      round: state.round,
      tick: state.tick,
      wind: state.wind,
      activePlayerId: state.activePlayerId,
      entities: state.entities.map(e => [e.entityId, e.alive, Math.round(e.x), Math.round(e.y), Math.round(e.health)]),
      projectiles: state.projectiles.map(p => [p.entityId, Math.round(p.x), Math.round(p.y)]),
    });
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  get world() { return this.#world; }
  get terrain() { return this.#terrain; }
  get bitmap() { return this.#bitmap; }
  get water() { return this.#water; }
  get events() { return this.#events; }
  get inventory() { return this.#inventory; }
  /** Laufende Zustände der Spieler (Schild, Einfrieren, Schaden über Zeit). */
  get statuses() { return this.#statuses; }
  get players() { return [...this.#players]; }
  get status() { return this.#status; }
  get round() { return this.#round; }
  get wind() { return this.#wind; }
  get winnerTeamId() { return this.#winnerTeamId; }
  get seedManager() { return this.#seedManager; }
  get maelstrom() { return this.#maelstrom; }
  /** Aktuelle Zugzeit in Millisekunden (für Persistenz und Replay). */
  get turnDurationMs() { return this.#turnDurationMs; }

  get activePlayerId() {
    const id = this.#turnOrder[this.#turnIndex];
    return this.#world?.isActive(id) ? id : null;
  }

  get activeProjectileCount() {
    return this.#world
      .getEntitiesBySignature(COMPONENT_SIGNATURES.PROJECTILE)
      .filter(id => this.#world.isActive(id)).length;
  }
}

export default MatchController;

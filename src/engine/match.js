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
import { validateCommand } from '../shared/validation.js';
import { MATCH_RULES } from '../shared/config/match.js';
import { CLASS_DEFINITIONS, CLASS_ARCHETYPES } from '../shared/config/classes.js';
import { getWeapon, getDefaultLoadout } from '../shared/config/weapons.js';
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

export class MatchController {
  #world;
  #seedManager;
  #events = new EventBus();
  #terrain;
  #bitmap;
  #water;
  #inventory = new PlayerInventory();
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
    this.#events.drain();
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
    if (!this.#inventory.consume(playerId, weapon.id, 1)) {
      return { ok: false, errors: ['Keine Munition'] };
    }

    const player = this.#players.find(entry => entry.entityId === playerId);
    const classDef = CLASS_DEFINITIONS[CLASS_IDS[player?.classId ?? 0]];
    const { x, y, vx, vy } = this.#launchVector(playerId, angle, power);

    this.#world.setComponent(playerId, 'Weapon', 'angle', angle);
    this.#world.setComponent(playerId, 'Weapon', 'power', power);
    this.#hasFired = true;
    this.#lastShotBy = playerId;

    if (weapon.delivery === 'hitscan') {
      const hit = this.#resolveHitscan(x, y, angle, power, weapon, playerId);
      this.#events.emit('hitscan', { playerId, weaponId: weapon.id, ...hit });
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
      damage: weapon.damage * classDef.power,
      blastRadius: weapon.blastRadius || 24,
      knockback: weapon.knockback,
      drag: 0.995,
      gravityScale: weapon.gravityScale || 1,
      windFactor: 1,
      terrainDamage: weapon.terrainDamage,
      bounces: weapon.bounces,
      lifetime: Math.max(60, Math.round(weapon.maxRange / 8)),
      alive: 1,
    });

    this.#events.emit('projectile_spawn', { playerId, projectileId, weaponId: weapon.id, x, y, vx, vy });
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
      this.#world.getSystem('damage')?.applyDamage(this.#world, target, weapon.damage, shooterId);
    }

    return { hitX: result.hitX, hitY: result.hitY, hit: result.hit, target };
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
  #launchVector(playerId, angle, power) {
    const player = this.#players.find(entry => entry.entityId === playerId);
    const classDef = CLASS_DEFINITIONS[CLASS_IDS[player?.classId ?? 0]];
    const archetype = CLASS_ARCHETYPES[ARCHETYPE_IDS[player?.archetypeId ?? 0]];

    const x = this.#world.getComponent(playerId, 'Position', 'x') || 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') || 0;
    const speed = power * POWER_TO_SPEED * classDef.power * (archetype.damage / 1.2);

    return { x, y, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed };
  }

  /**
   * Zielvorschau: simuliert die Flugbahn mit exakt derselben Physik wie das
   * ProjectileSystem (Gravitation, Wind, Drag) und bricht beim ersten
   * Terraintreffer ab.
   *
   * @returns {{x:number,y:number}[]}
   */
  aimPreview(playerId, angle, power, steps = 180) {
    if (!this.#world.isActive(playerId)) return [];
    const launch = this.#launchVector(playerId, angle, power);
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

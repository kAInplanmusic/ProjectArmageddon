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
/** Fallbeschleunigung abgeworfener Kisten (px pro Tick²). */
const CRATE_GRAVITY = 0.30;
/**
 * Mindest-Flugzeit eines Wurfs in Ticks (0,75 s bei 60 Hz).
 * Die Kiste landet erst danach — auch wenn sie vorher aufsetzen würde.
 */
const CRATE_FLIGHT_TICKS = 45;

/** Absprunggeschwindigkeit (px pro Tick), negativ = nach oben. */
const JUMP_IMPULSE = 9.2;
/**
 * Der zweite Sprung ist schwächer als der erste: sonst wäre er kein Zusatz,
 * sondern ein Ersatz mit doppelter Höhe.
 */
const DOUBLE_JUMP_FACTOR = 0.8;
/** Seitliche Zugabe beim Sprung, damit man auch über Kanten kommt. */
const JUMP_SIDE_IMPULSE = 2.4;
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
  /**
   * Verbrauchte Sprünge je Spieler.
   * Wird beim Landen zurückgesetzt: Ein Doppelsprung steht nur EINMAL je
   * Flugphase zur Verfügung — sonst könnte man sich beliebig hochschaukeln.
   */
  #jumpsUsed = new Map();
  /** 1 = die Figur war im letzten Schritt in der Luft (für das Lande-Ereignis). */
  #airborne = new Map();
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
    // Fliegende Kisten bewegen sich VOR dem Physikschritt: sie sollen im selben
    // Tick landen, in dem sie den Boden berühren.
    this.#stepFlyingCrates();
    this.#world.step();
    // Nach dem Physikschritt prüfen, wer gelandet ist — davon hängt ab, ob ein
    // Doppelsprung wieder zur Verfügung steht.
    this.#updateGroundedState();
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
   * Steht die Figur auf festem Grund?
   *
   * Geprüft wird ein Punkt knapp UNTER den Füßen. Ohne diese Aussage gäbe es
   * keinen Unterschied zwischen „steht" und „fällt", und ein Sprung aus der Luft
   * wäre ein zweiter Absprung mitten im Flug.
   */
  isGrounded(playerId) {
    if (!this.#world.isActive(playerId)) return false;
    const x = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;
    const vy = this.#world.getComponent(playerId, 'Velocity', 'y') ?? 0;
    // Aufwärtsbewegung heißt: nicht am Boden, egal was darunter liegt.
    if (vy < -0.5) return false;
    // `y` ist die FUSSPOSITION. Der tiefste Punkt des Körpers liegt
    // PLAYER_HALF_HEIGHT darunter, und genau dort entscheidet die Landung. Ein
    // Prüfpunkt knapp unter den Füßen (y+2) liegt noch in der Luft: das Terrain
    // beginnt erst eine halbe Körperhöhe unter der Fußlinie, weil die Figur auf
    // seiner Oberkante steht.
    const tiefster = Math.floor(y + PLAYER_HALF_HEIGHT - 1);
    return this.#terrain.isSolid(Math.floor(x), tiefster);
  }

  /** Verbleibende Sprünge in dieser Flugphase (0, 1 oder 2). */
  jumpsLeft(playerId) {
    return Math.max(0, 2 - (this.#jumpsUsed.get(playerId) ?? 0));
  }

  /**
   * Springt — als Aktion des Zuges.
   *
   * Der Sprung ist eine echte Physik: er setzt einen senkrechten Impuls, die
   * Figur fliegt danach unter Schwerkraft und landet. Fallschaden greift wie bei
   * jedem Sturz, ein zu hoher Sprung kann also schaden.
   *
   * Der Sprung beendet den Zug NICHT, aber je Zug sind nur zwei möglich (einer
   * vom Boden, einer in der Luft). Die Begrenzung ist nötig, weil ein Sprung die
   * Position ändert — in einem Artillerie-Spiel die kostbarste Größe — und
   * unbegrenztes Springen jede Deckung entwerten würde.
   *
   * Der zweite Sprung (Doppelsprung) geht nur EINMAL je Flugphase und ist
   * schwächer. Beim Landen wird zurückgesetzt.
   *
   * @param {number} playerId
   * @param {number} [horizontal] - seitliche Richtung: -1, 0 oder 1
   * @returns {{ok:boolean, jumpsLeft?:number, impulse?:number, errors?:string[]}}
   */
  jump(playerId, horizontal = 0) {
    const errors = [];
    if (this.#status !== 'playing') errors.push('Match läuft nicht');
    if (playerId !== this.activePlayerId) errors.push('Nur der aktive Spieler kann springen');
    if (!this.#world.isActive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
    if (errors.length > 0) return { ok: false, errors };

    const grounded = this.isGrounded(playerId);
    const verbraucht = this.#jumpsUsed.get(playerId) ?? 0;

    // Der erste Sprung geht nur vom Boden, der zweite nur in der Luft.
    // Der Zähler wird ausschließlich beim Zugbeginn zurückgesetzt — ein Reset
    // beim Landen würde erlauben, innerhalb eines Zuges beliebig oft zu
    // springen, zu landen und wieder zu springen.
    if (!grounded && verbraucht === 0) {
      return { ok: false, errors: ['In der Luft ist kein erster Sprung möglich'] };
    }
    if (verbraucht >= 2) {
      return { ok: false, errors: ['Keine Sprünge mehr in diesem Zug'] };
    }

    const istDoppel = !grounded;
    const impuls = JUMP_IMPULSE * (istDoppel ? DOUBLE_JUMP_FACTOR : 1);
    const richtung = Math.max(-1, Math.min(1, Number(horizontal) || 0));

    this.#world.setComponent(playerId, 'Velocity', 'y', -impuls);
    if (richtung !== 0) {
      const vxAlt = this.#world.getComponent(playerId, 'Velocity', 'x') ?? 0;
      this.#world.setComponent(playerId, 'Velocity', 'x', vxAlt + richtung * JUMP_SIDE_IMPULSE);
    }

    this.#jumpsUsed.set(playerId, verbraucht + 1);
    const rest = 2 - (verbraucht + 1);

    this.#events.emit('jumped', {
      playerId, double: istDoppel, impulse: impuls, jumpsLeft: rest,
    });

    // Der Sprung beendet den Zug NICHT.
    //
    // Grund: Ein Doppelsprung setzt voraus, dass der Spieler während seines
    // eigenen Flugs noch am Zug ist. Beendete der erste Sprung den Zug, wäre der
    // zweite nie auslösbar — die Mechanik hätte sich selbst ausgeschlossen.
    // Begrenzt wird stattdessen über die Zahl der Sprünge je Zug.
    return { ok: true, jumpsLeft: rest, impulse: impuls, double: istDoppel };
  }

  /**
   * Meldet, wenn eine Figur den Boden berührt.
   *
   * Setzt die Sprünge NICHT zurück — das geschieht beim Zugbeginn. Hier geht es
   * nur um das Ereignis, damit die Anzeige „gelandet" melden kann.
   */
  #updateGroundedState() {
    for (const entry of this.#players) {
      if (!this.#world.isActive(entry.entityId)) continue;
      const warInDerLuft = this.#airborne.get(entry.entityId) === 1;
      const stehtJetzt = this.isGrounded(entry.entityId);
      if (warInDerLuft && stehtJetzt) {
        this.#events.emit('landed', { playerId: entry.entityId });
      }
      this.#airborne.set(entry.entityId, stehtJetzt ? 0 : 1);
    }
  }

  /**
   * Startpunkt und Geschwindigkeit für eine Anflugart.
   *
   * Für `self` gibt die Methode `null` zurück — dann gilt der normale Weg.
   *
   * `sky`: Das Geschoss entsteht oberhalb des Zielpunkts und fällt herab. Der
   *   Zielpunkt wird aus der normalen Zielung bestimmt (Winkel und Kraft), nicht
   *   aus der Schützenposition: ein Luftangriff soll dort einschlagen, wohin der
   *   Schütze zielt.
   * `flank`: Das Geschoss kommt von der Seite, entgegen der Schussrichtung, und
   *   fliegt waagerecht auf den Zielpunkt zu.
   *
   * In beiden Fällen liegt der Startpunkt AUSSERHALB der Sehweite, damit der
   * Angriff sichtbar „hereinfliegt" statt vor dem Spieler zu erscheinen.
   *
   * @returns {{spawn:{x:number,y:number}, vx:number, vy:number}|null}
   */
  #resolveStrike(weapon, x, y, angle, power) {
    const style = weapon?.strikeStyle ?? 'self';
    if (style === 'self') return null;

    // Zielpunkt über die normale Bahn bestimmen.
    const bahn = this.#resolveHitscan(x, y, angle, power, weapon, null);
    const zielX = Number.isFinite(bahn.hitX) ? bahn.hitX : x;
    const zielY = Number.isFinite(bahn.hitY) ? bahn.hitY : y;

    if (style === 'sky') {
      const hoehe = 320;
      const fall = 14;
      return { spawn: { x: zielX, y: Math.max(0, zielY - hoehe) }, vx: 0, vy: fall };
    }

    // `flank`: von der Seite, aus der Richtung, aus der „geschossen" wird.
    const richtung = Math.cos(angle) >= 0 ? -1 : 1;
    const weite = 420;
    const tempo = 12;
    return {
      spawn: { x: zielX + richtung * weite, y: Math.max(0, zielY - 60) },
      vx: -richtung * tempo,
      vy: 2,
    };
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

    // Anflugart: Ein Luftangriff kommt von oben auf den Zielpunkt, schwere
    // Artillerie von der Seite. Beides wird hier in Startpunkt und
    // Geschwindigkeit übersetzt — der Zielpunkt bleibt der der normalen Zielung.
    const strike = this.#resolveStrike(weapon, x, y, angle, power);

    const projectileId = this.#world.createEntity();

    // Abschusspunkt aus dem Körper des Schützen herausschieben.
    //
    // `x, y` ist die Fußposition auf dem Boden und liegt damit IM festen
    // Terrain. Ein Projektil, das dort entsteht, kollidiert im ersten
    // Simulationsschritt mit dem Boden und verschwindet, ohne das Ziel je zu
    // erreichen — Direktschaden war so unmöglich.
    const spawn = strike
      ? strike.spawn
      : (this.#findMuzzle(x, y, Math.cos(angle), -Math.sin(angle), playerId) ?? { x, y });
    this.#world.addComponent(projectileId, 'Position', { x: spawn.x, y: spawn.y });
    this.#world.addComponent(projectileId, 'Velocity', {
      x: strike ? strike.vx : vx,
      y: strike ? strike.vy : vy,
    });
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
      ) * 1.5, this.#fuseTicksFor(weapon) + 30),
      /**
       * Zünder in Ticks (0 = Aufprallwaffe). Eine Granate explodiert nicht beim
       * Aufprall, sondern nach Ablauf — sie bleibt liegen und zündet.
       */
      fuseTicks: this.#fuseTicksFor(weapon),
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

    // Die Kiste wird GESCHLEUDERT, nicht abgelegt: sie fliegt mit zufälliger
    // Anfangsgeschwindigkeit heraus, unterliegt Schwerkraft und Wind und landet
    // nach einer Flugzeit. Landung im Wasser ist ausgeschlossen (siehe
    // #stepCrate) — das ist die einzige harte Regel.
    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    const startY = this.#world.getComponent(playerId, 'Position', 'y') ?? 0;
    const wurf = this.#rollDropThrow();

    const crateId = this.#world.createEntity();
    this.#world.addComponent(crateId, 'Position', { x: startX, y: startY - 14 });
    this.#world.addComponent(crateId, 'Velocity', { x: wurf.vx, y: wurf.vy });
    this.#world.addComponent(crateId, 'Crate', {
      crateType: CRATE_TYPES.weapon,
      crateX: startX,
      crateY: startY - 14,
      rarity: Math.max(0, RARITY_IDS.indexOf(weapon.rarity)),
      weaponId: weapon.index,
      picked: 0,
      ammo: entfernt.ammo,
      inFlight: 1,
      flightTicks: CRATE_FLIGHT_TICKS,
    });

    // Eine abgeworfene Waffe ist keine Nachladezeit mehr wert: die Pause gehört
    // zur Waffe, und die liegt jetzt am Boden.
    this.#cooldowns.delete(`${playerId}:${weaponId}`);

    this.#events.emit('weapon_dropped', {
      playerId, weaponId, crateId,
      x: startX, y: startY - 14,
      vx: wurf.vx, vy: wurf.vy,
      ammo: entfernt.ammo,
    });

    // x/y sind hier der ABWURFPUNKT. Die Landestelle steht erst nach dem Flug
    // fest und ist danach über die Kiste im Zustand abfragbar.
    return {
      ok: true, crateId, x: startX, y: startY - 14,
      vx: wurf.vx, vy: wurf.vy, ammo: entfernt.ammo,
    };
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
  /**
   * Schleudert eine abgeworfene Waffe fort.
   *
   * Bewusst physikalisch statt „geprüft danebenlegen": Die Waffe fliegt mit
   * einer zufälligen Anfangsgeschwindigkeit heraus, unterliegt der Schwerkraft,
   * wird vom Wind getrieben und landet erst nach einer Flugzeit. Das wirkt wie
   * ein Wurf und nicht wie ein Ablegen.
   *
   * Die EINZIGE harte Regel: Die Kiste darf nicht im Wasser landen. Wasser
   * würde sie unerreichbar machen bzw. die Waffe versinken lassen — das wäre
   * ein Verlust ohne Gegenwert. Trifft sie auf Wasser, fliegt sie weiter, bis
   * sie festen Boden erreicht.
   *
   * @returns {{vx:number, vy:number}} Anfangsgeschwindigkeit für die Kiste
   */
  #rollDropThrow() {
    const richtung = this.#rng.nextBoolean() ? -1 : 1;
    return {
      // Kräftig nach oben und zur Seite. Die Werte zielen auf eine Flugzeit von
      // etwa einer halben bis anderthalb Sekunden: kurz genug, um den Zug nicht
      // aufzuhalten, lang genug, um den Wurf als Wurf zu erkennen.
      vx: richtung * this.#rng.nextFloat(1.2, 2.8),
      vy: -this.#rng.nextFloat(9, 14),
    };
  }

  /**
   * Bewegt eine fliegende Kiste einen Schritt weiter.
   *
   * Läuft im Simulationsschritt (siehe #stepFlyingCrates) und nutzt dieselben
   * Kräfte wie ein Geschoss: Schwerkraft, Luftwiderstand, Wind. Der Unterschied
   * ist der Aufprall: Eine Kiste bleibt liegen statt zu explodieren, und sie
   * darf nicht ins Wasser geraten.
   *
   * @returns {boolean} true, wenn die Kiste gelandet ist
   */
  #stepCrate(crateId) {
    const world = this.#world;
    if (!world.isActive(crateId)) return false;
    // Nur fliegende Kisten bewegen sich (fliegend = Flag gesetzt).
    if (world.getComponent(crateId, 'Crate', 'inFlight') !== 1) return false;

    const x = world.getComponent(crateId, 'Position', 'x') ?? 0;
    const y = world.getComponent(crateId, 'Position', 'y') ?? 0;
    let vx = world.getComponent(crateId, 'Velocity', 'x') ?? 0;
    let vy = world.getComponent(crateId, 'Velocity', 'y') ?? 0;

    const wind = this.#world.services.match?.wind ?? 0;
    // Restliche Flugzeit. Die Kiste landet erst, wenn sie abgelaufen ist —
    // eine abgeworfene Waffe soll sichtbar fliegen und nicht im nächsten Hügel
    // hängen bleiben.
    let restFlug = world.getComponent(crateId, 'Crate', 'flightTicks') ?? 0;
    if (restFlug > 0) restFlug -= 1;
    world.setComponent(crateId, 'Crate', 'flightTicks', restFlug);
    const flugVorbei = restFlug <= 0;

    // Eigene Fallbeschleunigung für Kisten: schwächer als bei Geschossen, damit
    // der Wurf sichtbar dauert. Ein Geschoss soll schnell ans Ziel, eine
    // abgeworfene Waffe soll fliegen.
    vy += CRATE_GRAVITY;
    vx += wind * 0.8;
    vx *= DEFAULT_PROJECTILE_DRAG;
    vy *= DEFAULT_PROJECTILE_DRAG;

    const nextX = x + vx;
    const nextY = y + vy;

    // Aus der Karte geflogen: zurück an den Rand holen.
    const begrenztX = Math.min(MAP_WIDTH - 12, Math.max(12, nextX));

    const boden = this.surfaceYAt(Math.round(begrenztX));

    // Wasser an der Landestelle? Dann NICHT landen, sondern weiterfliegen.
    // Das ist die einzige harte Regel des Abwurfs.
    const wasser = this.#water
      ? (typeof this.#water.levelAtWorld === 'function'
        ? this.#water.levelAtWorld(begrenztX, Math.max(0, boden))
        : this.#water.getLevel(Math.floor(begrenztX), Math.floor(boden)))
      : 0;
    const ueberWasser = wasser > 0.35;

    // Gelände getroffen und trockener Boden: landen — aber erst nach Ablauf der
    // Mindestflugzeit.
    if (flugVorbei && boden > 0 && nextY >= boden && !ueberWasser) {
      world.setComponent(crateId, 'Position', 'x', begrenztX);
      world.setComponent(crateId, 'Position', 'y', boden);
      world.setComponent(crateId, 'Velocity', 'x', 0);
      world.setComponent(crateId, 'Velocity', 'y', 0);
      world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
      world.setComponent(crateId, 'Crate', 'crateY', boden);
      world.setComponent(crateId, 'Crate', 'inFlight', 0);
      this.#events.emit('crate_landed', {
        crateId, x: begrenztX, y: boden, flightTicks: CRATE_FLIGHT_TICKS,
      });
      return true;
    }

    // Sonst weiterfliegen. Über Wasser wird die Sinkgeschwindigkeit gedämpft,
    // damit die Kiste nicht untergeht, sondern weitergetragen wird.
    if (ueberWasser && nextY >= boden) vy = Math.min(vy, 0.4);

    world.setComponent(crateId, 'Position', 'x', begrenztX);
    world.setComponent(crateId, 'Position', 'y', Math.max(0, nextY));
    world.setComponent(crateId, 'Velocity', 'x', vx);
    world.setComponent(crateId, 'Velocity', 'y', vy);
    world.setComponent(crateId, 'Crate', 'crateX', begrenztX);
    world.setComponent(crateId, 'Crate', 'crateY', Math.max(0, nextY));
    return false;
  }

  /** Bewegt alle fliegenden Kisten. Läuft vor dem Physikschritt. */
  #stepFlyingCrates() {
    for (const crateId of this.#world.getEntitiesBySignature(
      COMPONENT_SIGNATURES.CRATE | COMPONENT_SIGNATURES.VELOCITY,
    )) {
      this.#stepCrate(crateId);
    }
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

  /**
   * Zünderdauer einer Waffe in Simulationsschritten.
   * Die Waffe nennt Sekunden; die Simulation rechnet in Ticks zu 60 Hz.
   */
  #fuseTicksFor(weapon) {
    const sekunden = weapon?.fuseTime ?? 0;
    if (!(sekunden > 0)) return 0;
    return Math.max(1, Math.round(sekunden * 60));
  }

  /** Verbleibender Zünder eines Projektils in Sekunden (0 = kein Zünder). */
  fuseSecondsLeft(projectileId) {
    if (!this.#world.isActive(projectileId)) return 0;
    const ticks = this.#world.getComponent(projectileId, 'Projectile', 'fuseTicks') ?? 0;
    return ticks > 0 ? Math.round((ticks / 60) * 10) / 10 : 0;
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

    // Sprünge zu Beginn des Zuges zurücksetzen. Damit stehen je Zug höchstens
    // zwei zur Verfügung — ein Bodensprung und ein Doppelsprung. Ein Reset beim
    // LANDEN wäre nicht ausreichend: man könnte innerhalb eines Zuges beliebig
    // oft springen, landen und wieder springen.
    this.#jumpsUsed.set(entityId, 0);

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
      const fuseTicks = this.#world.getComponent(id, 'Projectile', 'fuseTicks') || 0;
      projectiles.push({
        entityId: id,
        x: this.#world.getComponent(id, 'Position', 'x'),
        y: this.#world.getComponent(id, 'Position', 'y'),
        owner: this.#world.getComponent(id, 'Projectile', 'owner'),
        // Zünder in Sekunden, damit die Anzeige den Countdown zeigen kann.
        // Bewusst in Sekunden und nicht in Ticks: die Anzeige soll die Zeit
        // zeigen, die der Spieler auch wahrnimmt.
        fuseSeconds: fuseTicks > 0 ? Math.round((fuseTicks / 60) * 10) / 10 : 0,
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

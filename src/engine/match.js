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
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../shared/config/classes.js';
import { getWeapon } from '../shared/config/weapons.js';
import { getClassLoadout } from '../shared/config/loadouts.js';
import { pickScenery } from '../shared/config/scenery.js';
import { WET_LEVEL, clampWaterLevel } from '../shared/config/water.js';
import { GuentherSystem } from './systems/guentherSystem.js';
import { GUENTHER_POOP, LOW_RARITY_WEIGHTS, LEGENDARY_WEIGHTS } from '../shared/config/guenther.js';
import { CRATE_TYPES, RARITY_IDS } from './systems/lootSystem.js';
import { ccdRaycast } from './physics/ballistics.js';

/**
 * Kartenmaße je Ausrichtung.
 *
 * Querformat (16:9) und Hochformat (9:16) haben dieselbe Fläche, nur getauscht.
 * Gleiche Fläche ist Absicht: Die Reichweiten, Sprunghöhen und Wurfweiten der
 * Waffen sind in Kartenpixeln angegeben. Eine deutlich kleinere Hochkantkarte
 * hätte alle Waffen zu weit reichen lassen, eine größere zu kurz.
 */
export const MAP_SIZES = Object.freeze({
  landscape: Object.freeze({ width: 1280, height: 720 }),
  portrait: Object.freeze({ width: 720, height: 1280 }),
});

/** Ausrichtungen der Karte. */
export const ORIENTATIONS = Object.freeze(['landscape', 'portrait']);

/** Querformat als Vorgabe — die Konstanten bleiben für Altcode erhalten. */
export const MAP_WIDTH = MAP_SIZES.landscape.width;
export const MAP_HEIGHT = MAP_SIZES.landscape.height;

/** Maße einer Ausrichtung (mit Rückfall auf Querformat). */
export function mapSizeFor(orientation) {
  return MAP_SIZES[orientation] ?? MAP_SIZES.landscape;
}
export const WATER_SCALE = 4;

// Die Namenslisten stammen aus der Klassen-Konfiguration und werden hier nur
// weitergegeben — sonst gäbe es neben der Verrechnung auch noch zwei Quellen
// für die Reihenfolge der Klassen.
export { CLASS_IDS, ARCHETYPE_IDS };
export const TEAM_COLORS = Object.freeze(['#4cc9f0', '#f4a261', '#90be6d', '#e07a5f']);

const BASE_HEALTH = 100;
const POWER_TO_SPEED = 0.14;
/*
 * Geschütze.
 *
 * Das Geschütz ist keine eigene Waffe im Katalog, sondern ein Geschoss mit
 * eigenen Werten. Dafür braucht es einen Platzhalter, der die Flugeigenschaften
 * liefert: Das Geschoss fliegt wie ein kleines, schnelles Wurfgeschoss.
 *
 * `TURRET_POWERS`/`TURRET_ELEVATIONS` sind die Winkelsuche (siehe
 * `#turretShot`). Beide Listen sind FEST — kein Zufall, damit ein Replay
 * dieselben Schüsse ergibt.
 */
const TURRET_WEAPON_ID = '__geschuetz';
const TURRET_WEAPON = Object.freeze({
  index: -1,
  displayName: 'Geschütz',
  damage: 0,          // Der Schaden kommt aus dem Geschütz-Eintrag.
  blastRadius: 18,
  knockback: 0,
  gravityScale: 1,
  speedFactor: 1,
  terrainDamage: 6,
  maxRange: 800,
});
/** Antriebskräfte, die die Suche durchprobiert. */
const TURRET_POWERS = Object.freeze([40, 55, 70, 85, 100]);
/** Erhöhungswinkel (0 = flach, 1 = 45°), feste Reihenfolge. */
const TURRET_ELEVATIONS = Object.freeze([0.05, 0.15, 0.3, 0.5, 0.785, 1.0]);
/** Schritte je Bahnberechnung. Reicht für die halbe Kartenbreite. */
const TURRET_PATH_STEPS = 900;
/** Größter Abstand, bei dem noch geschossen wird (halbe Figurenbreite). */
const TURRET_MAX_MISS = 22;
/** Schwerkraft der Geschosse — derselbe Wert wie im ProjectileSystem. */
const GRAVITY = 0.32;
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
/**
 * Größter Höhenunterschied, den eine Verschiebung (Ziehen oder Schub)
 * überwinden darf.
 *
 * Ohne Grenze setzte die Verankerung auf der Geländeoberfläche das Ziel auf den
 * nächsten Hügel — ein Ziehen oder Schub wurde dadurch zum Teleport auf eine
 * Klippe. 16 px entsprechen etwa eineinhalb Figurenhöhen: ein Absatz, den man
 * hinaufgestoßen werden kann, aber keine Wand.
 */
const MAX_SHIFT_SLOPE = 16;
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
  /** Günther — der frei laufende NPC. */
  #guenther = null;
  /** 1 = die Figur war im letzten Schritt in der Luft (für das Lande-Ereignis). */
  #airborne = new Map();
  #maelstrom;
  #loot;
  /**
   * Aufgestellte Geschütze.
   *
   * Bewusst KEINE ECS-Entities: Ein Geschütz bewegt sich nicht, hat keine
   * Gesundheit und wird nicht von Explosionen getroffen — es braucht von einem
   * ECS-Objekt nur eine Position. Als schlichter Eintrag bleibt es außerdem
   * außerhalb der Entity-ID-Wiederverwendung, die in diesem Projekt schon
   * mehrfach Fehler verursacht hat (siehe `#registerSystems`).
   *
   * entityId → { ownerId, teamId, x, y, damage, range, roundsLeft }
   */
  #turrets = new Map();
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
    orientation = 'landscape',
  } = {}) {
    this.#seedManager = seed === undefined
      ? MatchSeedManager.createRandom()
      : new MatchSeedManager(seed);
    this.#rng = this.#seedManager.getSubRng('MATCH_BASE');
    this.#turnDurationMs = turnDurationMs
      ?? MATCH_RULES.turnTimers.duelSeconds.minimum * 1000;
    this.maxRounds = maxRounds;
    this.preset = preset;

    // Kartenmaße als Instanzwerte: Quer- und Hochformat unterscheiden sich nur
    // hier. Alles andere im Motor rechnet mit `this.width`/`this.height`.
    const masse = mapSizeFor(orientation);
    this.orientation = MAP_SIZES[orientation] ? orientation : 'landscape';
    this.width = masse.width;
    this.height = masse.height;

    /**
     * Generative Kulisse (Himmel, Wasser, Ambiente, Landmarken).
     *
     * Aus demselben Seed abgeleitet wie das Gelände, also reproduzierbar: ein
     * Replay zeigt dieselbe Landschaft. Der Server muss die Kulisse deshalb NICHT
     * mitsenden — jeder Client baut sie aus dem Seed selbst.
     */
    this.scenery = pickScenery(this.#seedManager.baseSeed, preset);

    /**
     * Günther: eigener Teilgenerator, damit seine Würfe unabhängig von anderen
     * Systemen sind. Ein zusätzlicher Zug an derselben Quelle würde sonst alle
     * nachfolgenden Zufallswerte verschieben.
     */
    this.#guenther = new GuentherSystem({
      rng: this.#seedManager.getSubRng('GUENTHER'),
      maxRounds: this.maxRounds,
      width: this.width,
      height: this.height,
    });

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
      width: this.width,
      height: this.height,
      preset: this.preset,
    });
    this.#bitmap = bitmap;
    this.#terrain = CollisionMask.fromBitmap(bitmap, this.width, this.height);
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
    const waterLevel = this.#waterBaseY ?? Math.floor(this.height * 0.84);
    this.#water = new WaterField({
      width: Math.floor(this.width / WATER_SCALE),
      height: Math.floor(this.height / WATER_SCALE),
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
    /*
     * Todesmeldung mitschreiben — statt `isActive` zu befragen.
     *
     * Fund (belegt): Das ECS vergibt die IDs entfernter Entities neu. Eine
     * gefallene Spielfigur bekam deshalb wieder eine „aktive" ID, sobald eine
     * Kiste oder ein Geschoss den Platz erbte. `world.isActive(spielerId)` war
     * danach wahr — obwohl dort längst eine Kiste lag. Folgen:
     *   - `#checkVictory` hielt ein ausgelöschtes Team für lebendig und das
     *     Match endete nie durch Ausschaltung (es lief bis zur Rundengrenze),
     *   - die Anzeige meldete eine gefallene Figur als lebendig mit 0 Leben,
     *   - Zugfolge und Kommandoprüfung konnten einen Toten für aktiv halten.
     *
     * Der Lebensstatus gehört deshalb an den Spieler, nicht an einen
     * wiederverwendbaren Platz im ECS.
     */
    this.#world.getSystem('damage')?.onDeath?.((world, entityId) => {
      const eintrag = this.#players.find(p => p.entityId === entityId);
      if (eintrag) eintrag.alive = false;
    });
    this.#world.registerSystem('projectile', new ProjectileSystem(), SYSTEM_PRIORITIES.PROJECTILE);
    this.#world.registerSystem('character', new CharacterSystem(), SYSTEM_PRIORITIES.CHARACTER);
    this.#world.registerSystem('maelstrom', this.#maelstrom, SYSTEM_PRIORITIES.MAELSTROM);
    this.#world.registerSystem('loot', this.#loot, SYSTEM_PRIORITIES.LOOT);
    this.#world.services.maelstrom = this.#maelstrom;
  }

  /**
   * Sucht eine Startposition auf festem, nicht überflutetem Grund.
   *
   * Gesucht wird abwechselnd nach rechts und links vom Wunschpunkt, in festen
   * Schritten. Die Reihenfolge ist festgelegt (rechts vor links, kleine vor
   * großen Abständen), damit die Platzierung bei gleichem Seed dieselbe bleibt —
   * der Determinismus des Matches hängt daran.
   *
   * Maßstab ist `WET_LEVEL`: Eine Figur, die nur „nass" startet, ist spielbar;
   * eine untergetauchte ertrinkt, bevor der erste Zug beginnt.
   *
   * Wird nichts gefunden, bleibt es beim Wunschpunkt. Ein schlechter Platz ist
   * besser als gar keiner — und ein Fehlen wird im Test auffallen.
   *
   * @param {number} idealX
   * @returns {number} x-Position mit festem, trockenem Boden
   */
  #drySpawnX(idealX) {
    const trocken = x => {
      if (x < PLAYER_HALF_WIDTH + 2 || x > this.width - PLAYER_HALF_WIDTH - 2) return false;
      const boden = this.surfaceYAt(x);
      if (boden <= 0) return false;
      return this.waterLevelAt(x, boden) < WET_LEVEL;
    };

    if (trocken(idealX)) return idealX;
    /*
     * Über die ganze Kartenbreite suchen, nicht nur bis zur Mitte.
     *
     * Auf einer Karte mit viel Wasser (Form `flooded`: rund 45 % Wasser) liegt
     * die nächste trockene Stelle unter Umständen weit entfernt. Mit einer
     * Begrenzung auf die halbe Breite blieb gemessen 1 von 480 Figuren
     * (40 Seeds × 12 Figuren) im Wasser — mit der vollen Breite keine.
     *
     * Die Suche läuft nur, wenn der Wunschplatz nass ist, und die Prüfung ist
     * ein Höhenprofil-Zugriff. Beim Matchstart fällt das nicht ins Gewicht.
     */
    const grenze = this.width - PLAYER_HALF_WIDTH - 2;
    for (let abstand = 8; abstand < grenze; abstand += 8) {
      if (trocken(idealX + abstand)) return idealX + abstand;
      if (trocken(idealX - abstand)) return idealX - abstand;
    }
    return idealX;
  }

  #spawnPlayers() {
    const total = this.teams * this.playersPerTeam;
    const spacing = this.width / (total + 1);
    // Ein Startloadout je Klasse, nicht je Spieler: Die Auswahl hängt allein an
    // der Klasse. Vorher startete jede Klasse mit demselben neutralen Loadout —
    // die Klasse veränderte nur Werte, nicht die Mittel.
    const loadouts = new Map(CLASS_IDS.map(id => [id, getClassLoadout(id)]));

    for (let index = 0; index < total; index++) {
      const teamId = index % this.teams;
      const classId = index % CLASS_IDS.length;
      const archetypeId = index % ARCHETYPE_IDS.length;

      const x = Math.round(spacing * (index + 1));
      /*
       * Trockener Startplatz.
       *
       * Fund (belegt): Die Startposition war schlicht `spacing × (index + 1)`.
       * Auf einer wasserreichen Karte liegt diese Stelle aber unter dem
       * Wasserspiegel — gemessen bei der Geländeform `flooded`: **51 % der
       * Figuren (81 von 160 über 40 Seeds) starteten untergetaucht** und
       * ertranken im ersten Zug. Bei den vier ursprünglichen Formen fiel es nicht
       * auf, weil dort der Wasserspiegel tief genug liegt; die Startposition war
       * also nur zufällig sicher, nicht geprüft.
       */
      const startX = this.#drySpawnX(x);
      const groundY = this.surfaceYAt(startX);
      const y = (groundY > 0 ? groundY : this.height * 0.4) - PLAYER_HALF_HEIGHT - 2;

      const entityId = this.#world.createEntity();
      // Leben kommt aus dem gemeinsamen Kampfprofil (classes.js) — nicht aus
      // einer zweiten, hier nachgebauten Multiplikation.
      const profile = combatProfile(CLASS_IDS[classId], ARCHETYPE_IDS[archetypeId]);
      const maxHealth = Math.round(BASE_HEALTH * profile.healthMultiplier);

      this.#world.addComponent(entityId, 'Position', { x, y });
      this.#world.addComponent(entityId, 'Velocity', { x: 0, y: 0 });
      this.#world.addComponent(entityId, 'Health', { current: maxHealth, max: maxHealth });
      this.#world.addComponent(entityId, 'Class', { classId, archetypeId });
      this.#world.addComponent(entityId, 'Team', { teamId });
      this.#world.addComponent(entityId, 'Weapon', { angle: teamId === 0 ? Math.PI / 4 : (Math.PI * 3) / 4, power: 55 });
      this.#world.addComponent(entityId, 'Input', { angle: 0, power: 0 });
      this.#world.addComponent(entityId, 'Rotation', { angle: 0 });

      this.#inventory.register(entityId, loadouts.get(CLASS_IDS[classId]) ?? loadouts.get(CLASS_IDS[0]));

      this.#players.push({
        entityId,
        teamId,
        classId,
        archetypeId,
        label: `P${index + 1}`,
        /**
         * Lebensstatus des SPIELERS.
         *
         * Bewusst hier geführt und nicht über `world.isActive(entityId)`
         * ermittelt: Das ECS vergibt IDs gefallener Entities neu (siehe
         * `#registerSystems`), und dann liegt unter derselben ID eine Kiste.
         */
        alive: true,
      });
      this.#turnOrder.push(entityId);
    }
  }

  #spawnRoundLoot() {
    try {
      this.#loot.spawnRoundCrates(this.#world, {
        rng: this.#seedManager.getSubRng('LOOT'),
        width: this.width,
        height: this.height,
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

    // Günther bewegt sich nach der Physik: Er läuft auf der Oberfläche, die
    // sich in diesem Schritt geändert haben kann.
    this.#stepGuenther();
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
    if (!this.isPlayerAlive(playerId)) return false;
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
    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
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
    // Verlangsamung wirkt auf den Absprung: Wer in einen Kackhaufen getreten ist,
    // kommt schlechter vom Boden weg.
    const langsam = this.#statuses.slowOf(playerId);
    const impuls = JUMP_IMPULSE * (istDoppel ? DOUBLE_JUMP_FACTOR : 1) * langsam;
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
   * Bewegt Günther einen Schritt und wendet seine Wirkungen an.
   *
   * Läuft NACH dem Physikschritt: Er folgt der Geländeoberfläche, und die kann
   * sich in diesem Schritt geändert haben (Einschlag, Mahlstrom).
   */
  #stepGuenther() {
    if (!this.#guenther) return;
    this.#guenther.setRunde(this.#round);

    const spielerIds = this.#players
      .filter(p => p.alive)
      .map(p => p.entityId);

    this.#guenther.update(this.#world, {
      aktiverSpieler: this.#turnOrder?.length ? this.activePlayerId : null,
      spielerIds,
      surfaceYAt: x => this.surfaceYAt(x),
      schaden: (spielerId, betrag) => {
        this.#world.getSystem('damage')?.applyDamage(this.#world, spielerId, betrag, null);
      },
      haufenGetroffen: (spielerId) => {
        // Drei Runden Schaden und langsamere Fortbewegung.
        this.#statuses.addDot(spielerId, {
          damagePerTurn: GUENTHER_POOP.damagePerTurn,
          turns: GUENTHER_POOP.turns,
          element: 'poop',
        });
        this.#statuses.addSlow(spielerId, GUENTHER_POOP.slowFactor, GUENTHER_POOP.turns);
      },
      radAufloesen: spielerId => this.#resolveGuentherWheel(spielerId),
      melde: (typ, daten) => this.#events.emit(typ, daten),
    });
  }

  /**
   * Meldet, wenn eine Figur den Boden berührt.
   *
   * Setzt die Sprünge NICHT zurück — das geschieht beim Zugbeginn. Hier geht es
   * nur um das Ereignis, damit die Anzeige „gelandet" melden kann.
   */
  #updateGroundedState() {
    for (const entry of this.#players) {
      if (!entry.alive) continue;
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
  /**
   * Löst einen Ausgang des Glücksrads aus.
   *
   * Ausgewürfelt wird im GuentherSystem, angewendet hier: Das Rad braucht Zugriff
   * auf Inventar, Zustände und Schaden — alles Dinge, die der NPC nicht kennt.
   *
   * @returns {{outcome:string, label:string, detail:string, effect:string}}
   */
  #resolveGuentherWheel(playerId) {
    const ausgang = this.#guenther.wuerfleAusgang();
    const wirkung = ausgang.effect;
    const ergebnis = {
      outcome: ausgang.id,
      label: ausgang.label,
      detail: ausgang.detail,
      effect: wirkung.kind,
      amount: 0,
      weaponId: null,
      weaponName: null,
    };

    switch (wirkung.kind) {
      case 'skip':
        // Aussetzen: eine Runde nicht handeln können.
        this.#statuses.freeze(playerId, wirkung.turns);
        break;

      case 'skipAndWeapon': {
        this.#statuses.freeze(playerId, wirkung.turns);
        const waffe = this.#guenther.waehleWaffe(LOW_RARITY_WEIGHTS);
        if (waffe) {
          if (!this.#inventory.has(playerId, waffe.id)) {
            this.#inventory.grantWeapon(playerId, waffe.id);
          } else {
            // Schon im Besitz: Munition nachfüllen statt einer wirkungslosen Gabe.
            this.#inventory.refill(playerId, waffe.id, 3);
          }
          ergebnis.weaponId = waffe.id;
          ergebnis.weaponName = waffe.displayName;
        }
        break;
      }

      case 'skipAndHeal': {
        this.#statuses.freeze(playerId, wirkung.turns);
        const betrag = Math.round(this.#guenther.zieheBereich(wirkung.heal));
        const system = this.#world.getSystem('damage');
        const geheilt = system?.heal?.(this.#world, playerId, betrag);
        ergebnis.amount = typeof geheilt === 'number' ? geheilt : betrag;
        break;
      }

      case 'damage': {
        const betrag = Math.round(this.#guenther.zieheBereich(wirkung.range));
        // Als Schaden OHNE Verursacher: Günther gehört keinem Team, ein Abschuss
        // durch ihn darf nicht als Treffer eines Spielers zählen.
        this.#world.getSystem('damage')?.applyDamage(this.#world, playerId, betrag, null);
        ergebnis.amount = betrag;
        break;
      }

      case 'legendaryWeapon': {
        const waffe = this.#guenther.waehleWaffe(LEGENDARY_WEIGHTS);
        if (waffe) {
          if (!this.#inventory.has(playerId, waffe.id)) {
            this.#inventory.grantWeapon(playerId, waffe.id);
          } else {
            this.#inventory.refill(playerId, waffe.id, 99);
          }
          ergebnis.weaponId = waffe.id;
          ergebnis.weaponName = waffe.displayName;
        }
        break;
      }

      default:
        break;
    }

    return ergebnis;
  }

  /**
   * Startpunkt und Geschwindigkeit für eine Anflugart.
   *
   * Für `self` gibt die Methode `null` zurück — dann gilt der normale Weg.
   * `sky`: von oben auf den Zielpunkt. `flank`: von der Seite in Zielrichtung.
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

    if (!this.isPlayerAlive(playerId)) {
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

    /*
     * EIN Schuss je Zug.
     *
     * Fund (belegt): Diese Prüfung fehlte. Der Zug endet erst, wenn das Geschoss
     * verflogen ist (`#hasFired && !projectilesActive` in `step()`). Solange ein
     * Schuss noch flog, konnte derselbe Spieler ERNEUT feuern — und mit dem
     * nächsten Takt noch einmal.
     *
     * Gemessen im Aufzeichnungslauf (Seed 4242): Spieler 3 feuerte bei Takt 452
     * und 453, ohne dass dazwischen ein `turn_end` lag. Zwei Schüsse in einem
     * Zug, jeder mit voller Munition abgezogen.
     *
     * Im Mehrspieler wäre das ein Cheat: Ein Client muss nur schnell genug
     * nachlegen, bevor sein erster Schuss landet. Die bestehende Prüfung
     * („Spieler ist nicht am Zug") greift erst NACH dem Zugwechsel und deckt
     * dieses Zeitfenster nicht ab.
     *
     * REIHENFOLGE: Diese Prüfung steht NACH Nachladezeit und Munition, nicht
     * davor. Fund (belegt): Zuerst stand sie ganz oben, und damit verdeckte sie
     * die genauere Begründung — der Test „Nachladezeit erscheint in der
     * Waffenliste und blockiert den Schuss" (Seed 4711) feuert zweimal im selben
     * Zug und erwartete „lädt nach", bekam aber „In diesem Zug wurde bereits
     * geschossen". Beide Aussagen sind wahr; die Waffe ist die nützlichere
     * Auskunft, weil sie dem Spieler sagt, WAS ihn hindert.
     *
     * Blockiert wird in beiden Fällen — es geht nur um die Begründung.
     */
    if (this.#hasFired) {
      return { ok: false, errors: ['In diesem Zug wurde bereits geschossen'] };
    }

    if (!this.#inventory.consume(playerId, weapon.id, 1)) {
      return { ok: false, errors: ['Keine Munition'] };
    }

    const player = this.#players.find(entry => entry.entityId === playerId);
    const profile = combatProfile(
      CLASS_IDS[player?.classId ?? 0], ARCHETYPE_IDS[player?.archetypeId ?? 0],
    );
    const { x, y, vx, vy } = this.#launchVector(playerId, angle, power, weapon);

    this.#world.setComponent(playerId, 'Weapon', 'angle', angle);
    this.#world.setComponent(playerId, 'Weapon', 'power', power);
    this.#hasFired = true;
    this.#lastShotBy = playerId;

    /*
     * Jeder abgegebene Schuss wird gemeldet — an EINER Stelle, vor der
     * Verzweigung nach Anflugart.
     *
     * Fund (belegt): Für Projektile gab es `projectile_spawn`, für Treffer
     * `hitscan`/`projectile_impact` — aber nichts für einen Schuss, der weder
     * trifft noch ein Projektil erzeugt. Die Trefferquote (`Treffer / Schüsse`)
     * ließ sich damit nicht rechnen: Der Nenner fehlte, und für Hitscan-Waffen
     * wäre er grundsätzlich 0 gewesen.
     *
     * Die drei Wege (Selbstwirkung, Hitscan, Projektil) melden alle hier.
     */
    this.#events.emit('shot', { playerId, weaponId: weapon.id, angle, power });

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
      damage: weapon.damage * profile.damageMultiplier * this.#statuses.damageMultiplier(playerId),
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

  // ------------------------------------------------------------- Geschütze

  /**
   * Stellt ein Geschütz am Standort des Spielers auf.
   *
   * Gesucht wird ein freier Platz in der Nähe: direkt unter der Figur, sonst
   * wenige Pixel daneben. Der Boden wird abgefragt, damit das Geschütz nicht im
   * Gestein steht.
   *
   * @returns {object|null} der Eintrag oder null, wenn kein Platz frei ist
   */
  #deployTurret(playerId, effect) {
    const spieler = this.#players.find(entry => entry.entityId === playerId);
    if (!spieler?.alive) return null;

    const startX = this.#world.getComponent(playerId, 'Position', 'x') ?? 0;
    // Abwechselnd rechts und links suchen — feste Reihenfolge, damit die
    // Platzwahl bei gleichem Seed dieselbe bleibt (Determinismus).
    const kandidaten = [startX];
    for (let abstand = 12; abstand <= 60; abstand += 12) {
      kandidaten.push(startX + abstand, startX - abstand);
    }

    let platz = null;
    for (const x of kandidaten) {
      const gerundet = Math.round(x);
      if (gerundet < PLAYER_HALF_WIDTH || gerundet > this.width - PLAYER_HALF_WIDTH) continue;
      const boden = this.surfaceYAt(gerundet);
      // Festes Gelände über dem Wasser: Ein Geschütz im Hochwasser wäre weg.
      if (boden <= 0 || this.waterLevelAt(gerundet, boden) >= WET_LEVEL) continue;
      platz = { x: gerundet, y: boden - 6 };
      break;
    }
    if (!platz) return null;

    const entityId = this.#nextTurretId();
    const eintrag = {
      entityId,
      ownerId: playerId,
      teamId: spieler.teamId,
      x: platz.x,
      y: platz.y,
      damage: Math.max(1, Math.round(effect.damage ?? 10)),
      range: Math.max(60, Math.round(effect.range ?? 300)),
      roundsLeft: Math.max(1, Math.round(effect.turns ?? 3)),
    };
    this.#turrets.set(entityId, eintrag);
    this.#events.emit('turret_deployed', {
      turretId: entityId, ownerId: playerId, teamId: spieler.teamId,
      x: eintrag.x, y: eintrag.y, damage: eintrag.damage, range: eintrag.range,
      rounds: eintrag.roundsLeft,
    });
    return eintrag;
  }

  /**
   * Vergibt die nächste Geschützkennung.
   *
   * Eigener Zähler, NICHT `world.createEntity()`: Die Kennungen der Geschütze
   * müssen von den Entity-IDs getrennt bleiben. Sonst könnte ein Geschütz die
   * Kennung einer gefallenen Figur tragen — genau die Falle, die in diesem
   * Projekt schon zwei Fehler verursacht hat.
   */
  #nextTurretId() {
    let hoechste = 0;
    for (const id of this.#turrets.keys()) if (id > hoechste) hoechste = id;
    return hoechste + 1;
  }

  /**
   * Lässt alle Geschütze einmal feuern — je Runde einmal.
   *
   * Ziel ist der NÄCHSTE lebende Gegner innerhalb der Reichweite. Ohne Ziel in
   * Reichweite wird nicht geschossen (kein Blindfeuer).
   *
   * Läuft am Rundenanfang, nach `round_start`. Das ist bewusst NICHT der
   * Zugbeginn: Ein Geschütz, das an den Zug eines bestimmten Spielers gebunden
   * wäre, träfe je nach Zugreihenfolge unterschiedlich oft.
   */
  #fireTurrets() {
    if (this.#turrets.size === 0) return;

    for (const turret of [...this.#turrets.values()]) {
      turret.roundsLeft -= 1;
      if (turret.roundsLeft <= 0) {
        this.#turrets.delete(turret.entityId);
        this.#events.emit('turret_expired', { turretId: turret.entityId, x: turret.x, y: turret.y });
        continue;
      }

      const ziel = this.#nearestEnemyOf(turret);
      if (!ziel) continue;

      const schuss = this.#turretShot(turret, ziel);
      if (!schuss) continue;

      this.#spawnTurretProjectile(turret, schuss, ziel);
    }
  }

  /** Nächster lebender Gegner eines Geschützes innerhalb seiner Reichweite. */
  #nearestEnemyOf(turret) {
    let bestes = null;
    let besteDistanz = Infinity;
    for (const entry of this.#players) {
      if (!entry.alive || entry.teamId === turret.teamId) continue;
      const x = this.#world.getComponent(entry.entityId, 'Position', 'x') ?? 0;
      const y = this.#world.getComponent(entry.entityId, 'Position', 'y') ?? 0;
      const distanz = Math.hypot(x - turret.x, y - turret.y);
      if (distanz > turret.range) continue;
      // Bei Gleichstand entscheidet die kleinere Kennung — deterministisch.
      if (distanz < besteDistanz || (distanz === besteDistanz && entry.entityId < (bestes?.entityId ?? Infinity))) {
        besteDistanz = distanz;
        bestes = { entityId: entry.entityId, x, y, distanz };
      }
    }
    return bestes;
  }

  /**
   * Sucht Winkel und Kraft für ein Geschütz.
   *
   * ## Warum gesucht und nicht gerechnet
   *
   * Die Bahn hängt an Schwerkraft, Luftwiderstand, Wind und Eigengewicht der
   * Waffe (`gravityScale`). Eine geschlossene Lösung gäbe es nur für die reine
   * Wurfparabel — sie würde bei Wind und gezogenen Waffen danebenliegen.
   *
   * Deshalb wird die ECHTE Bahn verschossen: Für eine Reihe von Winkeln wird die
   * Flugbahn schrittweise nachgerechnet und der Winkel gewählt, dessen Bahn dem
   * Ziel am nächsten kommt. Das nutzt dieselbe Rechnung wie das Spiel — eine
   * zweite Formel könnte von ihr abweichen.
   *
   * Die Winkelliste ist fest (kein Zufall), damit das Ergebnis bei gleichem Seed
   * dasselbe bleibt.
   *
   * @returns {{angle: number, power: number}|null}
   */
  #turretShot(turret, ziel) {
    const waffe = TURRET_WEAPON;
    // Nur die Waagerechte entscheidet die Richtung — die Höhe steckt in der
    // Winkelsuche (die Bahn wird für jeden Winkel wirklich durchgerechnet).
    const dx = ziel.x - turret.x;

    // Grundrichtung: nach links oder rechts. Der Winkel wird gegen die
    // Bildschirmachse gemessen (0 = rechts, π/2 = oben).
    const basis = dx >= 0 ? 0 : Math.PI;
    const richtung = dx >= 0 ? 1 : -1;

    let bestes = null;
    let bestesDelta = Infinity;

    for (const kraft of TURRET_POWERS) {
      for (const steigung of TURRET_ELEVATIONS) {
        const winkel = basis + richtung * steigung;
        const bahn = this.#simulateTurretPath(turret, winkel, kraft, waffe);
        if (bahn.length === 0) continue;

        // Kürzester Abstand der Bahn zum Ziel — nicht „letzter Punkt": Ein
        // Schuss, der das Ziel im Vorbeiflug streift, ist ein Treffer.
        let naehe = Infinity;
        for (const punkt of bahn) {
          const d = Math.hypot(punkt.x - ziel.x, punkt.y - ziel.y);
          if (d < naehe) naehe = d;
        }
        // Kraft bevorzugen, die nicht volle Leistung braucht: Bei gleicher
        // Näherung ist der flachere Schuss schneller am Ziel.
        const bewertet = naehe + kraft * 0.002;
        if (bewertet < bestesDelta) {
          bestesDelta = bewertet;
          bestes = { angle: winkel, power: kraft, naehe };
        }
      }
    }

    if (!bestes) return null;
    // Kein Blindfeuer: Liegt die beste Bahn weiter als die halbe Zielbreite
    // entfernt, wird nicht geschossen.
    if (bestes.naehe > TURRET_MAX_MISS) return null;
    return bestes;
  }

  /** Rechnet eine Flugbahn schrittweise nach — wie das echte Geschoss. */
  #simulateTurretPath(turret, winkel, kraft, waffe) {
    const speed = kraft * POWER_TO_SPEED * (waffe.speedFactor ?? 1);
    let x = turret.x;
    let y = turret.y;
    let vx = Math.cos(winkel) * speed;
    let vy = -Math.sin(winkel) * speed;
    const gravitation = GRAVITY * (waffe.gravityScale ?? 1);
    const wind = this.#world.services.match?.currentStrength ?? 0;

    const bahn = [];
    for (let schritt = 0; schritt < TURRET_PATH_STEPS; schritt++) {
      vy += gravitation;
      vx += wind * 0.02;
      vx *= 0.995;
      x += vx;
      y += vy;
      if (x < 0 || x > this.width || y > this.height) break;
      if (this.surfaceYAt(Math.round(x)) > 0 && y >= this.surfaceYAt(Math.round(x))) {
        bahn.push({ x, y });
        break;
      }
      bahn.push({ x, y });
    }
    return bahn;
  }

  /** Erzeugt das Geschoss eines Geschützes. */
  #spawnTurretProjectile(turret, schuss, ziel = null) {
    const waffe = TURRET_WEAPON;
    const speed = schuss.power * POWER_TO_SPEED * (waffe.speedFactor ?? 1);
    const vx = Math.cos(schuss.angle) * speed;
    const vy = -Math.sin(schuss.angle) * speed;

    const entityId = this.#world.createEntity();
    this.#world.addComponent(entityId, 'Position', { x: turret.x, y: turret.y });
    this.#world.addComponent(entityId, 'Velocity', { x: vx, y: vy });
    this.#world.addComponent(entityId, 'Projectile', {
      // Verursacher ist der EIGENTÜMER des Geschützes: Ein Abschuss durch das
      // eigene Geschütz soll ihm zugerechnet werden (Kennzahlen, Sieg).
      owner: turret.ownerId,
      weaponId: waffe.index,
      damage: turret.damage,
      blastRadius: waffe.blastRadius || 18,
      knockback: waffe.knockback ?? 0,
      drag: 0.995,
      gravityScale: waffe.gravityScale ?? 1,
      windFactor: 1,
      terrainDamage: waffe.terrainDamage ?? 0,
      bounces: 0,
      lifetime: Math.max(30, Math.round(turret.range / Math.max(1, speed)) * 2),
      fuseTicks: 0,
      alive: 1,
    });

    this.#shotsInFlight.set(entityId, TURRET_WEAPON_ID);

    /*
     * Ein Geschützgeschoss meldet sich wie jedes andere ankommende Geschoss.
     *
     * Fund (belegt): Anfangs feuerte das Geschütz nur `turret_fired`. Gemessen
     * fehlte damit das `projectile_spawn` zu einem Geschützschuss — wer dieses
     * Ereignis auswertet (Effekte, Ton, Protokoll), hätte das Geschoss nicht
     * gesehen, obwohl es fliegt. `playerId` bleibt der EIGENTÜMER: Das Geschoss
     * gehört ihm, auch wenn er in dieser Runde nicht geschossen hat.
     *
     * Bewusst KEIN `shot`-Ereignis: Das zählt die Schüsse eines Spielers, und der
     * Eigentümer hat in dieser Runde nicht geschossen. Sein Geschütz hat es. Ein
     * zusätzliches `shot` würde seine Trefferquote verfälschen.
     */
    this.#events.emit('projectile_spawn', {
      playerId: turret.ownerId, projectileId: entityId, weaponId: TURRET_WEAPON_ID,
      x: turret.x, y: turret.y, vx, vy,
    });

    this.#events.emit('turret_fired', {
      turretId: turret.entityId, projectileId: entityId, ownerId: turret.ownerId,
      targetId: ziel?.entityId ?? null,
      x: turret.x, y: turret.y, angle: schuss.angle, power: schuss.power,
    });
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
    if (!this.isPlayerAlive(playerId)) errors.push('Spieler ist nicht mehr aktiv');
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
    const begrenztX = Math.min(this.width - 12, Math.max(12, nextX));

    const boden = this.surfaceYAt(Math.round(begrenztX));

    // Wasser an der Landestelle? Dann NICHT landen, sondern weiterfliegen.
    // Das ist die einzige harte Regel des Abwurfs.
    const wasser = this.waterLevelAt(begrenztX, Math.max(0, boden));
    const ueberWasser = wasser > WET_LEVEL;

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

      case EFFECT_KIND.TURRET: {
        const turret = this.#deployTurret(playerId, effect);
        // Ohne freien Platz in der Nähe wird nicht aufgestellt — ein Geschütz im
        // Fels wäre unsichtbar und nutzlos. Der Aufrufer meldet das.
        return turret
          ? { turretId: turret.entityId, x: turret.x, y: turret.y, rounds: turret.roundsLeft }
          : { turretId: null, reason: 'kein Platz für ein Geschütz' };
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
      if (targetX < PLAYER_HALF_WIDTH || targetX > this.width - PLAYER_HALF_WIDTH) continue;
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
    if (!ziel || !this.isPlayerAlive(targetId)) return null;
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

      case EFFECT_KIND.WATER_PUSH: {
        /*
         * Wasserschub: erst wegstoßen, dann fluten.
         *
         * Die Reihenfolge ist wesentlich. Der Wasserstand wird an der NEUEN
         * Position angehoben — würde zuerst geflutet, läge das Wasser auf der
         * alten Zelle und das Ziel stünde daneben im Trockenen. Die Waffe würde
         * dann sichtbar nichts bewirken.
         *
         * Der Wasserstand wird auf den vorhandenen Wert AUFgesetzt, nicht
         * gesetzt: Ein Schuss in eine schon geflutete Mulde macht sie tiefer,
         * statt sie auf den Wert der Waffe zurückzusetzen.
         */
        const versetzt = this.#pushAway(targetId, attackerId, effect.distance);

        const neueX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
        const neueY = this.#world.getComponent(targetId, 'Position', 'y') ?? 0;
        const vorher = this.waterLevelAt(neueX, neueY);
        const nachher = clampWaterLevel(vorher + effect.raise);
        /*
         * Einen BEREICH fluten, nicht eine Zelle — sonst meldet der Zustand der
         * Figur weiter 0, weil sie mit ihrem Zentrum zehn Pixel über der
         * gefluteten Bodenzelle steht (siehe `floodArea`).
         */
        const geflutet = this.floodArea(neueX, neueY, nachher);

        /*
         * Wenn weder Bewegung noch Flutung stattfand, ist die Wirkung eine
         * stille Nullnummer (z. B. Wand hinter dem Ziel und bereits geflutete
         * Zelle). Dann `null` zurückgeben — der Aufrufer zählt die Wirkung sonst
         * als Erfolg, obwohl nichts geschehen ist.
         */
        const bewegt = versetzt.dx !== 0 || versetzt.dy !== 0;
        if (!bewegt && geflutet.zellen === 0) return null;

        this.#events.emit('water_pushed', {
          playerId: targetId,
          by: attackerId,
          dx: versetzt.dx,
          dy: versetzt.dy,
          waterBefore: vorher,
          waterAfter: nachher,
          cellsFlooded: geflutet.zellen,
        });
        return {
          kind: effect.kind,
          ...versetzt,
          waterBefore: vorher,
          waterAfter: nachher,
        };
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
    const schuetzeX = this.#world.getComponent(attackerId, 'Position', 'x') ?? 0;
    return this.#shiftToward(targetId, Math.sign(schuetzeX - zielX), distance);
  }

  /**
   * Versetzt ein Ziel vom Angreifer WEG — der Gegenpol zu `#pullToward`.
   *
   * Beide benutzen dieselbe Schrittsuche: Die Verschiebung wird in Zehn-Pixel-
   * Schritten geprüft und darf nicht durch massives Gelände führen. Ein Ziel
   * durch eine Wand zu schieben wäre ein Fehler, kein Effekt.
   *
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #pushAway(targetId, attackerId, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const schuetzeX = this.#world.getComponent(attackerId, 'Position', 'x') ?? 0;
    return this.#shiftToward(targetId, Math.sign(zielX - schuetzeX), distance);
  }

  /**
   * Verschiebt ein Ziel waagerecht um `distance`, verankert auf der
   * Geländeoberfläche.
   *
   * @param {number} richtung - -1 oder 1; 0 bedeutet keine Bewegung
   * @returns {{dx:number, dy:number}} tatsächliche Verschiebung
   */
  #shiftToward(targetId, richtung, distance) {
    const zielX = this.#world.getComponent(targetId, 'Position', 'x') ?? 0;
    const zielY = this.#world.getComponent(targetId, 'Position', 'y') ?? 0;
    if (richtung === 0) return { dx: 0, dy: 0 };

    // In kleinen Schritten prüfen, damit das Ziel nicht durch eine Wand springt.
    const schritt = 10;
    let erreicht = 0;
    for (let d = schritt; d <= distance; d += schritt) {
      const kandidatX = zielX + richtung * d;
      if (kandidatX < PLAYER_HALF_WIDTH || kandidatX > this.width - PLAYER_HALF_WIDTH) break;
      const surface = this.surfaceYAt(Math.round(kandidatX));
      if (surface < 0) break;
      /*
       * Kein Sprung auf eine Klippe.
       *
       * Fund (belegt): Die Verschiebung verankert das Ziel auf der
       * Geländeoberfläche der neuen Stelle. Stand dort ein Hügel, wurde das Ziel
       * katapultiert statt geschoben — gemessen: 120 px seitwärts und **115 px
       * nach oben** in einem Schritt, mitten auf einen Berggipfel. Ein Erdstoß,
       * der jemanden auf eine Klippe setzt, ist kein Effekt, sondern ein Fehler.
       *
       * Der Höhenunterschied wird deshalb begrenzt: Die Verschiebung endet, wo
       * der Boden mehr als `MAX_SCHUB_STEIGUNG` über der Fußposition liegt.
       * Bezugspunkt ist die FUSSPOSITION (`zielY + PLAYER_HALF_HEIGHT`), weil
       * dort der Bodenkontakt stattfindet.
       */
      if (Math.abs(surface - (zielY + PLAYER_HALF_HEIGHT)) > MAX_SHIFT_SLOPE) break;
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
  #applyAreaEffect(effect, x, y, radius, attackerId, { ueberspringe = null } = {}) {
    const angewendet = [];
    for (const entry of this.#players) {
      if (!entry.alive) continue;
      if (entry.entityId === attackerId) continue;
      /*
       * Das direkt getroffene Ziel NICHT noch einmal.
       *
       * Fund (belegt): Bei einer Waffe mit Flächenwirkung läuft der Effekt
       * zweimal über das direkt getroffene Ziel — einmal direkt aus dem
       * Projekteinschlag, einmal über die Fläche, die ja auch das Ziel einschließt.
       * Gemessen am Wasserschub: `waterAfter` stieg in einem Einschlag erst auf
       * 0,4 und dann auf 0,8; dieselbe Verdopplung trifft Einfrierdauer
       * (doppelt so lange), Heranziehen (doppelte Distanz) und Schaden über Zeit
       * (doppelte Stapel). Bei Flächenwaffen mit großem Radius fiel das auf, bei
       * den meisten Waffen (Radius 0) nicht.
       */
      if (ueberspringe !== null && entry.entityId === ueberspringe) continue;
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
    // Giftwolke wirkt nicht nur auf den direkt getroffenen Gegner. Das direkt
    // getroffene Ziel ist ausgenommen: es hat den Effekt oben schon bekommen.
    if (blastRadius > 0) {
      this.#applyAreaEffect(effect, x, y, blastRadius, owner, { ueberspringe: target });
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
      if (!entry.alive) continue;
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
    // Klasse und Archetyp kommen zusammen aus dem gemeinsamen Kampfprofil.
    const profile = combatProfile(
      CLASS_IDS[player?.classId ?? 0], ARCHETYPE_IDS[player?.archetypeId ?? 0],
    );

    const x = this.#world.getComponent(playerId, 'Position', 'x') || 0;
    const y = this.#world.getComponent(playerId, 'Position', 'y') || 0;
    // Der Geschwindigkeitsfaktor der Waffe wirkt jetzt tatsächlich. Vorher flog
    // jedes Geschoss gleich schnell, obwohl die Quelldaten 14 verschiedene
    // Geschwindigkeiten (48-100) nennen — eine Minigun war im Flug nicht von
    // einem Mörser zu unterscheiden.
    const weaponFactor = weapon?.speedFactor ?? 1;
    const speed = power * POWER_TO_SPEED * profile.launchSpeedMultiplier * weaponFactor;

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
    if (!this.isPlayerAlive(playerId)) return [];
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
      if (x < 0 || x > this.width || y > this.height || y < 0) break;
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
      if (this.isPlayerAlive(this.#turnOrder[nextIndex])) break;
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
    /*
     * Geschütze feuern am Rundenanfang — nach `round_start`, damit die Anzeige
     * den Rundenwechsel vor den Schüssen sieht.
     *
     * Einmal je Runde und nicht je Zug: Sonst träfe ein Geschütz je nach
     * Zugreihenfolge unterschiedlich oft, und mit vier Spielern viermal so oft
     * wie mit zwei.
     */
    this.#fireTurrets();
  }

  /**
   * Ends the match because the round limit is reached. Der Sieger ist das Team
   * mit der höchsten Summe verbleibender Gesundheit; bei Gleichstand gewinnt
   * das niedrigere Team-ID (stabil und damit deterministisch).
   */
  #finishByAttrition() {
    const healthByTeam = new Map();
    for (const entry of this.#players) {
      const health = entry.alive
        ? (this.#world.getComponent(entry.entityId, 'Health', 'current') || 0)
        : 0;
      // Ein Gefallener trägt nichts bei. Vorher entschied hier `isActive` —
      // und damit eine möglicherweise wiederverwendete ID (siehe
      // `#registerSystems`): Eine Kiste auf dem Platz des Toten hätte ihm
      // dessen Restgesundheit wieder zugeschrieben.
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
    // Lebensstatus des Spielers, nicht der ECS-Platz (siehe #checkVictory).
    if (!this.isPlayerAlive(entityId)) return;

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

    if (turnState.damage > 0 && this.isPlayerAlive(entityId)) {
      this.#world.getSystem('damage')?.applyDamage(this.#world, entityId, turnState.damage, null);
      this.#events.emit('dot_tick', {
        playerId: entityId,
        damage: turnState.damage,
        elements: turnState.elements,
      });
    }

    // Eingefroren: der Spieler setzt diesen Zug aus. `advanceTurn` hat die
    // Dauer bereits heruntergezählt, deshalb endet die Wirkung von selbst.
    if (turnState.frozeThisTurn && this.isPlayerAlive(entityId) && this.#status === 'playing') {
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
      /*
       * Der Lebensstatus des SPIELERS entscheidet, nicht `isActive`.
       *
       * Fund (belegt): Das ECS vergibt die IDs gefallener Entities neu. Starb
       * eine Figur und erbte eine Kiste ihre ID, meldete `isActive` sie als
       * lebendig — das ausgelöschte Team galt damit weiter als vorhanden und die
       * Runde endete nie durch Ausschaltung. Nachgestellt: vier gefallene
       * Figuren, Status weiterhin „playing", Runde 8 (siehe
       * tests/victory-elimination.test.js).
       */
      if (entry.alive) aliveTeams.add(entry.teamId);
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
    const groundY = findSurfaceY(this.#bitmap, this.width, this.height, x);
    return groundY < 0 ? -1 : groundY;
  }

  /**
   * Füllstand des Wassers an einer Weltposition (0..1).
   *
   * Die Abfrage stand vorher an zwei Stellen inline (Abwurf und Figurenphysik)
   * — mit unterschiedlichen Ersatzwegen, falls das Feld die Methode nicht
   * anbietet. Hier gebündelt, damit die Anzeige denselben Wert sieht wie die
   * Simulation.
   */
  waterLevelAt(worldX, worldY) {
    if (!this.#water) return 0;
    const x = Math.max(0, Math.min(this.width - 1, worldX ?? 0));
    const y = Math.max(0, Math.min(this.height - 1, worldY ?? 0));
    const roh = typeof this.#water.levelAtWorld === 'function'
      ? this.#water.levelAtWorld(x, y)
      : this.#water.getLevel(Math.floor(x), Math.floor(y));
    return clampWaterLevel(roh);
  }

  /**
   * Setzt den Wasserstand an einer Weltposition (Gegenstück zu `waterLevelAt`).
   *
   * Gedacht für Tests, Kulissenbau und Diagnose: Wassertiefe ist sonst nur über
   * das interne Raster erreichbar, was jede Prüfung an die Rasterrechnung
   * koppelt. Die Zelle wird begrenzt, außerhalb der Karte passiert nichts.
   *
   * @returns {boolean} true, wenn der Wert gesetzt wurde
   */
  setWaterLevelAt(worldX, worldY, level) {
    if (!this.#water) return false;
    const zelle = typeof this.#water.toGrid === 'function'
      ? this.#water.toGrid(worldX, worldY)
      : { x: Math.floor(worldX / WATER_SCALE), y: Math.floor(worldY / WATER_SCALE) };
    if (!Number.isFinite(zelle.x) || !Number.isFinite(zelle.y)) return false;
    if (zelle.x < 0 || zelle.x >= this.#water.width) return false;
    if (zelle.y < 0 || zelle.y >= this.#water.height) return false;
    this.#water.setLevel(zelle.x, zelle.y, clampWaterLevel(level));
    return true;
  }

  /**
   * Flutet einen kleinen Bereich um einen Punkt.
   *
   * ## Warum nicht eine einzelne Zelle
   *
   * Fund (belegt): Ein Wasserschub, der genau eine Zelle flutet, wirkt für die
   * Anzeige NICHT. Das Wasserfeld ist ein Raster aus 4 px großen Zellen
   * (WATER_SCALE), und zwei Dinge fallen auseinander:
   *
   *   - Der Zustand einer Figur liest `waterLevelAt(figur.x, figur.y)` — die
   *     MITTE der Figur.
   *   - Die Figur steht auf `Boden - HALF_HEIGHT` (10 px), ihr Fuß also zehn
   *     Pixel unter der abgefragten Stelle.
   *
   * Bei 4-px-Zellen liegen Zentrum und Fuß in verschiedenen Zellen. Wird nur die
   * Bodenzelle geflutet, meldet der Zustand weiter 0 — und die Ertrinkgefahr im
   * CharacterSystem greift nie. Gemessen: `waterLevelAt(600, 420)` = 0,5,
   * `state.waterLevel` = 0.
   *
   * Deshalb wird ein Bereich geflutet, der Zentrum UND Fuß abdeckt. Der Bereich
   * ist bewusst klein (Standard: 16 × 20 px): Es soll ein Wasserloch entstehen,
   * kein See.
   *
   * Der vorhandene Füllstand wird nie verringert — mehrfaches Treffen macht die
   * Stelle tiefer, ein Schuss in trockenes Gelände hebt sie auf das Niveau der
   * Waffe.
   *
   * @param {number} worldX
   * @param {number} worldY - Bezugspunkt (Mitte der Figur)
   * @param {number} level - Ziel-Füllstand
   * @param {object} [optionen]
   * @returns {{zellen:number, hoechster:number}} geflutete Zellen und Höchststand
   */
  floodArea(worldX, worldY, level, { radiusX = 8, radiusY = 10 } = {}) {
    if (!this.#water) return { zellen: 0, hoechster: 0 };
    let zellen = 0;
    let hoechster = 0;
    for (let dx = -radiusX; dx <= radiusX; dx += WATER_SCALE) {
      for (let dy = -radiusY; dy <= radiusY; dy += WATER_SCALE) {
        const x = worldX + dx;
        const y = worldY + dy;
        const vorher = this.waterLevelAt(x, y);
        const ziel = clampWaterLevel(Math.max(vorher, level));
        if (ziel > vorher && this.setWaterLevelAt(x, y, ziel)) zellen += 1;
        if (ziel > hoechster) hoechster = ziel;
      }
    }
    return { zellen, hoechster };
  }

  /**
   * Lebt dieser SPIELER noch?
   *
   * Nicht `world.isActive` benutzen: Das ECS vergibt die IDs gefallener
   * Entities neu, und dann liegt unter derselben ID eine Kiste (siehe
   * `#registerSystems`). Diese Methode ist die einzige verlässliche Auskunft
   * über den Lebensstatus einer Figur.
   */
  isPlayerAlive(playerId) {
    return this.#players.find(entry => entry.entityId === playerId)?.alive === true;
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
      /*
       * `alive` ist der Lebensstatus des SPIELERS, nicht die Belegung des
       * ECS-Platzes.
       *
       * Fund (belegt): Beides fiel auseinander, weil das ECS die IDs
       * gefallener Entities neu vergibt. Die Anzeige meldete eine tote Figur
       * dann als lebendig mit 0 Leben — und zeichnete sie weiter, weil die
       * Position einer Kiste gelesen wurde, die inzwischen dieselbe ID trug.
       */
      const alive = entry.alive;
      return {
        entityId: entry.entityId,
        teamId: entry.teamId,
        classId: entry.classId,
        archetypeId: entry.archetypeId,
        label: entry.label,
        alive,
        x: alive ? this.#world.getComponent(entry.entityId, 'Position', 'x') : 0,
        y: alive ? this.#world.getComponent(entry.entityId, 'Position', 'y') : 0,
        /**
         * Füllstand des Wassers an der Position der Figur (0..1).
         *
         * Ohne diesen Wert konnte die Anzeige weder „nass" noch „ertrinkt"
         * zeigen: Die Schwellen kannte nur das CharacterSystem, und übertragen
         * wurde nichts davon. Der Wert wird gerundet, damit Anzeige und
         * Drahtformat (ein Byte) dieselbe Zahl sehen.
         */
        waterLevel: alive
          ? Math.round(this.waterLevelAt(
            this.#world.getComponent(entry.entityId, 'Position', 'x'),
            this.#world.getComponent(entry.entityId, 'Position', 'y'),
          ) * 1000) / 1000
          : 0,
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
      /*
       * Aufgestellte Geschütze.
       *
       * Sie stehen im Zustand, damit die Anzeige sie zeigen kann — und damit
       * Tests sie prüfen können, ohne in private Felder zu greifen.
       */
      turrets: [...this.#turrets.values()].map(t => ({
        entityId: t.entityId,
        teamId: t.teamId,
        ownerId: t.ownerId,
        x: t.x,
        y: t.y,
        damage: t.damage,
        range: t.range,
        roundsLeft: t.roundsLeft,
      })),
      terrainWidth: this.width,
      terrainHeight: this.height,
      orientation: this.orientation,
      guenther: this.#guenther ? this.#guenther.snapshot() : null,
      // Die Kulisse geht als Kennung mit, nicht als volles Objekt: der Client
      // baut sie ohnehin selbst aus dem Seed. Die Kennungen dienen der Anzeige
      // und den Tests.
      scenery: {
        biomeId: this.scenery.biomeId,
        skyId: this.scenery.skyId,
        waterId: this.scenery.waterId,
      },
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

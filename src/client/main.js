/**
 * Browser-Einstiegspunkt für Project Armageddon.
 *
 * Zwei Betriebsarten teilen sich Rendering, HUD und Eingabe:
 *  - Lokal: die Simulation läuft im Browser (MatchController).
 *  - Online: der Server ist autoritativ; der Client rendert Snapshots und
 *    sendet nur Eingabewünsche.
 *
 * Die Simulation läuft lokal mit fester Zeitschrittweite (60 Hz), das Rendering
 * folgt der Bildwiederholrate. Ereignisse werden einmalig in Rendering, HUD und
 * Protokoll gespiegelt.
 *
 * @module main
 */
import { MatchController, MAP_WIDTH, MAP_HEIGHT, TEAM_COLORS, WATER_SCALE } from '../engine/match.js';
import { Renderer } from './renderer.js';
import { InputController } from './input.js';
import { Hud } from './hud.js';
import { NetworkClient, CONNECTION_STATE } from './networkClient.js';
import { buildTerrainForSeed } from './terrainPreview.js';
import { getWeapon } from '../shared/config/weapons.js';
import { CLASS_IDS, ARCHETYPE_IDS } from '../engine/match.js';

const FIXED_TIMESTEP = 1000 / 60;
const MAX_STEPS_PER_FRAME = 8;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas);
    this.hud = new Hud(document);
    this.match = null;          // lokale Simulation
    this.network = null;        // Online-Verbindung
    this.mode = 'local';
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.running = false;
    this.autoLoop = true;
    this.aim = { angle: Math.PI / 4, power: 55 };
    this.waterFrame = 0;
    this.lastEvents = [];

    this.input = new InputController(this.canvas, {
      getOrigin: () => this.#origin(),
      onAim: (angle, power) => { this.aim = { angle, power }; },
      onFire: () => this.fire(),
      onWeaponSelect: index => this.selectWeapon(index),
    });

    this.#bindMenu();
    this.#exposeDebugApi();
  }

  #bindMenu() {
    this.menuOverlay = document.getElementById('menu-overlay');
    this.endOverlay = document.getElementById('end-overlay');
    this.winnerText = document.getElementById('winner-text');
    this.endSummary = document.getElementById('end-summary');

    document.getElementById('start-button')?.addEventListener('click', () => this.startFromMenu());
    document.getElementById('rematch-button')?.addEventListener('click', () => {
      this.endOverlay.hidden = true;
      this.menuOverlay.hidden = false;
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'r' || event.key === 'R') {
        this.network?.disconnect();
        this.network = null;
        this.match = null;
        this.mode = 'local';
        this.endOverlay.hidden = true;
        this.menuOverlay.hidden = false;
      }
    });
  }

  #origin() {
    const state = this.currentViewState;
    if (!state?.activePlayerId) return null;
    const active = state.entities.find(entity => entity.entityId === state.activePlayerId);
    return active ? { x: active.x, y: active.y } : null;
  }

  /** Liest die Menükonfiguration und startet das passende Match. */
  startFromMenu() {
    const teams = Number(document.getElementById('cfg-teams')?.value ?? 2);
    const playersPerTeam = Number(document.getElementById('cfg-players')?.value ?? 2);
    const preset = document.getElementById('cfg-preset')?.value ?? 'hills';
    const rawSeed = document.getElementById('cfg-seed')?.value?.trim();
    const seed = rawSeed === '' || rawSeed === undefined ? undefined : Number(rawSeed);
    const serverUrl = document.getElementById('cfg-server')?.value?.trim() ?? '';
    const lobbyId = document.getElementById('cfg-lobby')?.value?.trim() ?? '';

    if (serverUrl) {
      return this.startOnline({ serverUrl, lobbyId, teams, playersPerTeam, preset, seed });
    }
    return this.startMatch({ teams, playersPerTeam, preset, seed });
  }

  /** Lokales Match im Browser. */
  startMatch({ teams = 2, playersPerTeam = 2, preset = 'hills', seed = undefined } = {}) {
    this.network?.disconnect();
    this.network = null;
    this.mode = 'local';

    this.match = new MatchController({ seed, teams, playersPerTeam, preset });
    this.match.start();
    this.#afterWorldReady(this.match.bitmap, this.match.water);

    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    this.running = true;
    this.hud.log(`Lokales Match — Seed ${this.match.seedManager.baseSeed}`, 'accent');
    if (!this.animationHandle) this.#loop(performance.now());
    return { ok: true, mode: 'local' };
  }

  /**
   * Online-Match: optional wird die Lobby per HTTP erzeugt, danach verbindet
   * sich der Client per WebSocket. Der Server bleibt die Source of Truth.
   */
  async startOnline({ serverUrl, lobbyId = '', teams = 2, playersPerTeam = 2, preset = 'hills', seed = undefined, name = 'Spieler' } = {}) {
    this.menuOverlay.hidden = true;
    this.endOverlay.hidden = true;
    this.hud.clearLog();
    this.hud.log('Verbinde mit Server …', 'accent');
    this.mode = 'online';
    this.running = true;

    let targetLobby = lobbyId;
    let resolvedSeed = seed;
    let hostToken = null;

    try {
      if (!targetLobby) {
        const response = await fetch(new URL('/api/lobby/create', serverUrl), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ teams, playersPerTeam, preset, seed }),
        });
        if (!response.ok) throw new Error(`Lobby konnte nicht erstellt werden (${response.status})`);
        const created = await response.json();
        targetLobby = created.lobby.id;
        resolvedSeed = created.lobby.seed ?? seed ?? null;
        // Der Ersteller hat bereits einen Platz reserviert; dieser Token setzt
        // ihn fort und verhindert eine Doppelbelegung.
        hostToken = created.player?.token ?? null;
      }
    } catch (error) {
      this.hud.log(`Serverfehler: ${error.message}`, 'danger');
      this.menuOverlay.hidden = false;
      return { ok: false, error: error.message };
    }

    const wsUrl = new URL('/ws', serverUrl).toString().replace(/^http/, 'ws');
    const client = new NetworkClient({
      url: wsUrl,
      lobbyId: targetLobby,
      token: hostToken,
      playerName: name,
      seed: resolvedSeed,
      preset,
      teams,
      playersPerTeam,
    });
    this.network = client;
    this.lobbyId = targetLobby;

    client.on('hello', () => this.hud.log('Handshake abgeschlossen', 'good'));
    client.on('joined', payload => {
      this.hud.log(`Lobby ${client.lobbyId} — Platz ${payload.seatIndex + 1}`, 'accent');
      if (payload.seed !== null && payload.seed !== undefined) {
        this.#buildRemoteTerrain(payload.seed, preset);
      }
    });
    client.on('lobby_state', payload => {
      if (payload.seed !== null && payload.seed !== undefined && !this.remoteTerrain) {
        this.#buildRemoteTerrain(payload.seed, payload.preset ?? preset);
      }
    });
    client.on('state', state => {
      if (state === CONNECTION_STATE.RECONNECTING) this.hud.log('Verbindung verloren — versuche Wiederverbindung', 'danger');
      if (state === CONNECTION_STATE.CONNECTED) this.hud.log('Verbunden', 'good');
    });
    client.on('server_error', message => {
      const text = message.errors?.[0] ?? message.error ?? 'Serverfehler';
      this.hud.log(`Server: ${text}`, 'danger');
    });
    client.on('game_event', message => this.#handleRemoteEvent(message));

    await client.connect();
    if (!this.animationHandle) this.#loop(performance.now());
    return { ok: true, mode: 'online', lobbyId: targetLobby };
  }

  #buildRemoteTerrain(seed, preset) {
    const terrain = buildTerrainForSeed(seed, preset);
    this.remoteTerrain = terrain;
    this.renderer.buildTerrainLayer(terrain.bitmap, MAP_WIDTH, MAP_HEIGHT);
    this.renderer.particles = [];
    this.hud.log(`Terrain aus Seed ${seed} rekonstruiert`, 'neutral');
  }

  /** Lokalen Zustand für Renderer und HUD bereitstellen. */
  currentState() {
    return this.mode === 'online' ? this.onlineViewState : this.match?.getState() ?? null;
  }

  get currentViewState() {
    return this.currentState();
  }

  /** Übersetzt den neuesten Snapshot in das Renderformat. */
  get onlineViewState() {
    const snapshot = this.network?.latestSnapshot;
    if (!snapshot) return null;

    // Zugzeit kommt aus dem Snapshot. Die Gesamtdauer wird aus dem höchsten
    // beobachteten Wert abgeleitet, damit sie ohne Zusatzfeld korrekt ist.
    const remaining = snapshot.turnRemainingMs ?? 0;
    if (remaining > (this.remoteTurnDurationMs ?? 0)) this.remoteTurnDurationMs = remaining;
    const turnDurationMs = this.remoteTurnDurationMs || 30_000;

    const entities = (this.network.interpolatedEntities() ?? []).map((entity, index) => ({
      entityId: entity.entityId,
      teamId: entity.teamId,
      classId: CLASS_IDS[index % CLASS_IDS.length] === 'scout' ? 0 : 1,
      archetypeId: ARCHETYPE_IDS[index % ARCHETYPE_IDS.length] === 'brawler' ? 0 : 1,
      label: `P${index + 1}`,
      alive: entity.alive,
      x: entity.x,
      y: entity.y,
      health: entity.health,
      maxHealth: 100,
      angle: entity.entityId === snapshot.activePlayerId ? this.aim.angle : Math.PI / 4,
      power: this.aim.power,
      activeWeaponId: null,
      inventory: [],
      ammo: {},
    }));

    return {
      status: this.remoteStatus ?? 'playing',
      round: snapshot.round,
      maxRounds: 30,
      wind: snapshot.wind,
      tick: snapshot.tick,
      turnElapsedMs: Math.max(0, turnDurationMs - remaining),
      turnDurationMs,
      activePlayerId: snapshot.activePlayerId,
      winnerTeamId: this.remoteWinner ?? null,
      maelstrom: { active: (snapshot.round ?? 0) >= 15, inset: this.remoteInset ?? 0 },
      entities,
      projectiles: snapshot.projectiles ?? [],
      crates: [],
      terrainWidth: MAP_WIDTH,
      terrainHeight: MAP_HEIGHT,
    };
  }

  #handleRemoteEvent(message) {
    switch (message.t) {
      case 'terrain_destroyed':
        this.renderer.applyCrater(message.x, message.y, message.radius || 12);
        break;
      case 'explosion':
        this.renderer.spawnExplosionParticles(message.x, message.y, message.radius || 12);
        this.renderer.addFlash(message.x, message.y, (message.radius || 12) * 1.4);
        this.renderer.applyCrater(message.x, message.y, message.radius || 12);
        break;
      case 'hitscan':
        this.#drawHitscanBeam(message);
        break;
      case 'projectile_impact':
        this.renderer.addFlash(message.x, message.y, 14);
        break;
      case 'maelstrom_contract':
        this.remoteInset = message.inset;
        this.renderer.applyContraction(message.inset);
        this.hud.log('Mahlstrom zieht sich zusammen', 'danger');
        break;
      case 'death':
        this.hud.log('Eine Einheit wurde ausgeschaltet', 'danger');
        break;
      case 'turn_start':
        this.remoteStatus = 'playing';
        break;
      case 'round_start':
        this.hud.log(`Runde ${message.round} — Wind ${Number(message.wind ?? 0).toFixed(3)}`, 'neutral');
        break;
      case 'match_over':
        this.remoteStatus = 'gameover';
        this.remoteWinner = message.winnerTeamId ?? null;
        this.#showEndScreen(message.winnerTeamId ?? null);
        break;
      default:
        break;
    }
  }

  selectWeapon(index) {
    if (this.mode === 'online') {
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      const weaponId = active?.inventory?.[index];
      if (weaponId) this.network?.selectWeapon(weaponId);
      return;
    }
    if (!this.match) return;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return;
    const inventory = this.match.inventory.get(playerId);
    const weaponId = inventory?.weapons[index];
    if (!weaponId) return;
    this.match.inventory.selectWeapon(playerId, weaponId);
    this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
  }

  /** Feuert in der aktuellen Betriebsart. */
  fire() {
    const state = this.currentState();
    if (!state) return { ok: false, errors: ['Kein laufendes Match'] };
    if (state.status !== 'playing') return { ok: false, errors: ['Match ist beendet'] };

    const charging = this.input.isCharging;
    const power = charging
      ? Math.min(100, Math.max(8, Math.round(30 + this.input.chargeRatio * 70)))
      : this.aim.power;

    if (this.mode === 'online') {
      if (!this.network?.isConnected) return { ok: false, errors: ['Nicht verbunden'] };
      if (!this.network.isMyTurn) {
        this.hud.log('Nicht am Zug', 'danger');
        return { ok: false, errors: ['Nicht am Zug'] };
      }
      this.network.sendInput(this.aim.angle, power);
      this.hud.log(`Schuss gesendet (${Math.round(power)} Kraft)`, 'accent');
      return { ok: true, projectileId: null, hit: null };
    }

    const playerId = this.match.activePlayerId;
    if (playerId === null) return { ok: false, errors: ['Kein aktiver Spieler'] };

    const result = this.match.fire(playerId, this.aim.angle, power);
    if (!result.ok) {
      this.hud.log(`Schuss verweigert: ${result.errors[0] ?? 'unbekannt'}`, 'danger');
    } else {
      this.hud.log(`Schuss abgegeben (${Math.round(power)} Kraft)`, 'accent');
    }
    return result;
  }

  /** Ein lokaler Simulationsschritt inklusive Ereignisverarbeitung. */
  step() {
    if (this.mode !== 'local' || !this.match) return;
    const before = this.match.status;
    this.match.step();
    const events = this.match.consumeEvents();
    this.lastEvents = events;
    this.#handleEvents(events);
    if (before === 'playing' && this.match.status === 'gameover') {
      this.#showEndScreen(this.match.winnerTeamId);
    }
  }

  #handleEvents(events) {
    for (const { type, payload } of events) {
      switch (type) {
        case 'explosion':
          this.renderer.applyCrater(payload.x, payload.y, payload.radius || 12);
          this.renderer.addFlash(payload.x, payload.y, (payload.radius || 12) * 1.4);
          break;
        case 'hitscan':
          // Soforttreffer sichtbar machen: Strahl vom Schützen zum Einschlag.
          this.#drawHitscanBeam(payload);
          break;
        case 'drowning':
          this.hud.log('Eine Einheit ertrinkt', 'danger');
          break;
        case 'maelstrom_contract':
          this.renderer.applyContraction(payload.inset);
          this.hud.log('Mahlstrom zieht sich zusammen', 'danger');
          break;
        case 'death': {
          const victim = this.match.players.find(player => player.entityId === payload.entityId);
          this.hud.log(`${victim?.label ?? `Entity ${payload.entityId}`} ausgeschaltet`, 'danger');
          break;
        }
        case 'crate_pickup': {
          const who = this.match.players.find(player => player.entityId === payload.playerId);
          const reward = payload.reward;
          const text = reward?.kind === 'weapon'
            ? `${who?.label ?? 'Spieler'} findet ${getWeapon(reward.weaponId)?.displayName ?? 'eine Waffe'}`
            : reward?.kind === 'heal' ? `${who?.label ?? 'Spieler'} heilt ${reward.amount} HP`
            : reward?.kind === 'trap' ? `${who?.label ?? 'Spieler'} löst eine Sprengfalle aus`
            : `${who?.label ?? 'Spieler'} öffnet eine leere Kiste`;
          this.hud.log(text, reward?.kind === 'trap' ? 'danger' : 'good');
          break;
        }
        case 'fall_damage':
          this.hud.log(`Sturzschaden: ${Math.round(payload.damage)}`, 'danger');
          break;
        case 'round_start':
          this.hud.log(`Runde ${payload.round} — Wind ${Number(payload.wind ?? 0).toFixed(3)}`, 'neutral');
          break;
        case 'toxic_rain':
          if (payload.affected?.length) this.hud.log('Toxischer Regen trifft die Zone', 'danger');
          break;
        case 'match_over':
          this.hud.log('Match beendet', 'accent');
          break;
        default:
          break;
      }
    }
  }

  /** Zeichnet den Strahl eines Hitscan-Schusses zwischen Schütze und Einschlag. */
  #drawHitscanBeam(payload) {
    // currentState() liefert den lokalen ODER den Online-Zustand, damit
    // Soforttreffer in beiden Betriebsarten sichtbar sind.
    const state = this.currentState();
    if (!state) return;
    const shooter = state.entities.find(entity => entity.entityId === payload.playerId);
    if (!shooter) return;
    this.renderer.addBeam(
      shooter.x,
      shooter.y,
      payload.hitX,
      payload.hitY,
      { hit: Boolean(payload.hit) },
    );
  }

  #afterWorldReady(bitmap, water) {
    this.renderer.buildTerrainLayer(bitmap, MAP_WIDTH, MAP_HEIGHT);
    this.renderer.particles = [];
    this.hud.clearLog();
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.water = water;

    const first = this.match.players[0];
    const firstAngle = first?.teamId === 0 ? Math.PI / 4 : (Math.PI * 3) / 4;
    this.input.reset(firstAngle, 55);
    this.aim = { angle: firstAngle, power: 55 };
  }

  #showEndScreen(winnerTeamId) {
    if (this.endOverlay.hidden === false) return;
    this.running = false;
    this.winnerText.textContent = winnerTeamId === null || winnerTeamId === undefined
      ? 'Unentschieden — niemand überlebt'
      : `Team ${winnerTeamId + 1} gewinnt`;
    this.winnerText.style.color = winnerTeamId === null || winnerTeamId === undefined
      ? '#e8eef5'
      : TEAM_COLORS[winnerTeamId % TEAM_COLORS.length];
    this.endSummary.textContent = this.mode === 'online'
      ? `Online-Match — Lobby ${this.network?.lobbyId ?? '-'}, ${this.network?.latencyMs ?? 0} ms`
      : `${this.match.round} Runden, ${this.match.world.tickCount} Simulationsticks, Seed ${this.match.seedManager.baseSeed}`;
    this.endOverlay.hidden = false;
  }

  #loop(timestamp) {
    this.animationHandle = requestAnimationFrame(time => this.#loop(time));
    if (this.mode === 'local' && !this.match) return;
    if (this.mode === 'online' && !this.network) return;

    if (this.lastFrameTime === 0) this.lastFrameTime = timestamp;
    let delta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    if (delta > 250) delta = FIXED_TIMESTEP; // Tab war inaktiv: nicht nachholen
    this.accumulator += delta;

    let steps = 0;
    if (this.autoLoop && this.mode === 'local') {
      while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
        this.step();
        this.accumulator -= FIXED_TIMESTEP;
        steps++;
        if (this.match.status !== 'playing') break;
      }
    }

    this.#render();
  }

  #render() {
    const state = this.currentState();
    if (!state) return;

    const playerId = state.activePlayerId;
    const myTurn = this.mode === 'online'
      ? this.network?.isMyTurn === true
      : state.status === 'playing' && playerId !== null;
    const aimPreview = (myTurn && this.mode === 'local')
      ? this.match.aimPreview(playerId, this.aim.angle, this.aim.power)
      : null;

    this.waterFrame = (this.waterFrame + 1) % 4;

    // Flächenwirkung der gewählten Waffe für die Radius-Vorschau.
    const activeEntity = state.entities.find(entity => entity.entityId === playerId);
    const activeWeapon = activeEntity?.activeWeaponId ? getWeapon(activeEntity.activeWeaponId) : null;

    this.renderer.render(state, {
      aimPreview,
      aim: this.aim,
      water: this.mode === 'local' ? (this.waterFrame === 0 ? this.match.water : null) : null,
      blastRadius: activeWeapon?.blastRadius ?? 0,
    });
    this.hud.update(state, { aim: this.aim, onWeaponSelect: index => this.selectWeapon(index) });
    if (this.mode === 'online') this.hud.setConnection?.(
      this.network?.state ?? CONNECTION_STATE.IDLE,
      this.network?.latencyMs ?? 0,
    );
  }

  #exposeDebugApi() {
    window.__PA__ = {
      game: this,
      getMode: () => this.mode,
      getMatch: () => this.match,
      getNetwork: () => this.network,
      getState: () => this.currentState(),
      startMatch: options => this.startMatch(options),
      startOnline: options => this.startOnline(options),
      fire: (angle, power) => {
        if (angle !== undefined) this.aim = { angle, power: power ?? this.aim.power };
        return this.fire();
      },
      aimPreview: (angle, power) => this.match?.aimPreview(this.match.activePlayerId, angle, power) ?? [],
      setAutoLoop: flag => {
        this.autoLoop = Boolean(flag);
        return this.autoLoop;
      },
      stateHash: () => this.match?.stateHash() ?? null,
      activePlayerId: () => this.currentState()?.activePlayerId ?? null,
      players: () => this.match?.players ?? [],
      advance: ticks => {
        if (this.mode !== 'local' || !this.match) return this.currentState();
        for (let i = 0; i < ticks; i++) {
          this.step();
          if (this.match.status !== 'playing') break;
        }
        return this.match.getState();
      },
      events: () => this.lastEvents,
      constants: { MAP_WIDTH, MAP_HEIGHT, WATER_SCALE, FIXED_TIMESTEP },
    };
  }
}

const game = new Game();
export default game;

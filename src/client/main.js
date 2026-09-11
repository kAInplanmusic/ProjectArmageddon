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
import { isTextEntry } from './dom.js';
import { MatchController, MAP_WIDTH, MAP_HEIGHT, TEAM_COLORS, WATER_SCALE } from '../engine/match.js';
import { Renderer } from './renderer.js';
import { InputController } from './input.js';
import { Hud } from './hud.js';
import { NetworkClient, CONNECTION_STATE } from './networkClient.js';
import { buildTerrainForSeed } from './terrainPreview.js';
import { getWeapon, WEAPONS, orderInventoryBySubcategory } from '../shared/config/weapons.js';
import { buildEffect } from '../engine/specials.js';
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
      // Aktive Waffe abwerfen (Q).
      onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()),
      // Springen (Leertaste), mit A/D als Richtung.
      onJump: seitlich => this.jump(seitlich),
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

    // Lobby-Browser: manuell über den Button, zusätzlich automatisch beim
    // Aufklappen. Sonst müsste der Nutzer erst laden, ohne zu wissen, dass es
    // die Möglichkeit gibt.
    const lobbyBrowser = document.getElementById('lobby-browser');
    const refresh = () => this.refreshLobbies();
    document.getElementById('lobby-refresh')?.addEventListener('click', refresh);
    lobbyBrowser?.addEventListener('toggle', () => {
      if (lobbyBrowser.open) refresh();
    });

    window.addEventListener('keydown', event => {
      // Der Neustart darf nicht ausgelöst werden, während in ein Formularfeld
      // getippt wird — sonst beendet ein "r" im Seed- oder Serverfeld das Match.
      if (isTextEntry(event.target)) return;
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

  /**
   * Lädt die offenen Lobbys vom konfigurierten Server und zeigt sie im Menü an.
   *
   * Rein lesend: Es wird nichts am Serverzustand geändert. Ein Klick auf einen
   * Eintrag übernimmt die Lobby-ID ins Formular, damit derselbe Startweg
   * verwendet wird wie bei manueller Eingabe.
   */
  async refreshLobbies() {
    const status = document.getElementById('lobby-status');
    const list = document.getElementById('lobby-list');
    const serverUrl = document.getElementById('cfg-server')?.value?.trim() ?? '';
    if (!list) return { ok: false, reason: 'keine Liste im DOM' };

    if (!serverUrl) {
      if (status) status.textContent = 'Dafür bitte eine Server-URL eintragen.';
      list.replaceChildren();
      return { ok: false, reason: 'kein Server konfiguriert' };
    }

    if (status) status.textContent = 'Lade …';
    let lobbies = [];
    try {
      const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/lobby`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      lobbies = Array.isArray(payload.lobbies) ? payload.lobbies : [];
    } catch (error) {
      // Kein Absturz bei nicht erreichbarem Server: das Menü bleibt bedienbar.
      if (status) status.textContent = `Server nicht erreichbar (${error.message})`;
      list.replaceChildren();
      return { ok: false, reason: error.message };
    }

    const offen = lobbies.filter(lobby => lobby.status === 'open');
    if (offen.length === 0) {
      if (status) status.textContent = 'Keine offene Lobby gefunden.';
      list.replaceChildren();
      return { ok: true, count: 0 };
    }

    if (status) status.textContent = `${offen.length} offene Lobby(s)`;
    list.replaceChildren(...offen.map(lobby => {
      const item = document.createElement('li');

      const label = document.createElement('span');
      const belegt = `${lobby.occupied ?? 0}/${lobby.capacity ?? '?'}`;
      label.textContent = `${lobby.id} · ${lobby.preset ?? 'hills'} · ${belegt} Plätze`;

      const join = document.createElement('button');
      join.type = 'button';
      join.textContent = lobby.occupied >= lobby.capacity ? 'Voll' : 'Beitreten';
      join.disabled = lobby.occupied >= lobby.capacity;
      join.addEventListener('click', () => {
        const lobbyInput = document.getElementById('cfg-lobby');
        if (lobbyInput) lobbyInput.value = lobby.id;
        if (status) status.textContent = `Lobby ${lobby.id} ausgewählt — auf "Match starten" klicken.`;
      });

      item.append(label, join);
      return item;
    }));
    return { ok: true, count: offen.length };
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
  /**
   * Springt mit der Figur am Zug.
   *
   * Der Sprung ist eine echte Physik (siehe `MatchController.jump`): Er setzt
   * einen Impuls, die Figur fliegt und landet. Der zweite Druck in der Luft ist
   * der Doppelsprung — je Zug sind zwei Sprünge möglich.
   *
   * @param {number} [seitlich] - -1 links, 0 gerade, 1 rechts
   */
  jump(seitlich = 0) {
    if (!this.match || this.mode !== 'local') return null;
    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;

    const ergebnis = this.match.jump(playerId, seitlich);
    if (!ergebnis.ok) {
      // Kein Grund zur Beunruhigung: eine Meldung genügt.
      this.hud.log(ergebnis.errors.join(', '), 'neutral');
      return ergebnis;
    }
    this.hud.log(ergebnis.double ? 'Doppelsprung' : 'Sprung', 'accent');
    return ergebnis;
  }

  /**
   * Wirft die Waffe an einer Anzeigeposition ab.
   *
   * Der Abwurf ist die Antwort auf einen vollen Vorrat: statt eine Waffe zu
   * verlieren, entscheidet der Spieler bewusst, welche er ablegt. Die Waffe
   * bleibt als Kiste liegen und ist für alle aufhebbar.
   *
   * @param {number} anzeigePosition - Position wie in der Liste (0-basiert)
   */
  dropWeapon(anzeigePosition) {
    if (!this.match || this.mode !== 'local') {
      this.hud.log('Abwerfen ist nur im lokalen Match möglich', 'neutral');
      return null;
    }
    const index = this.#inventoryIndexAt(anzeigePosition);
    if (index === null) return null;

    const playerId = this.match.activePlayerId;
    if (playerId === null) return null;
    const weaponId = this.match.inventory.getWeapons(playerId)[index];
    if (!weaponId) return null;

    const ergebnis = this.match.dropWeapon(playerId, weaponId);
    if (!ergebnis.ok) {
      this.hud.log(`Abwerfen nicht möglich: ${ergebnis.errors?.join(', ')}`, 'danger');
      return ergebnis;
    }
    const name = getWeapon(weaponId)?.displayName ?? weaponId;
    const vorrat = ergebnis.ammo < 0 ? '∞' : ergebnis.ammo;
    this.hud.log(`${name} abgeworfen (${vorrat} Munition liegt bereit)`, 'accent');
    // Die Liste muss sofort nachziehen.
    this.hud.update(this.currentState(), { aim: this.aim, onWeaponSelect: i => this.selectWeapon(i), onWeaponDrop: () => this.dropWeapon(this.#activeDisplayPosition()), onJump: seitlich => this.jump(seitlich) });
    return ergebnis;
  }

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
    // Bestände kommen wegen ihrer variablen Länge nicht im binären Snapshot,
    // sondern als eigene Nachricht bei Änderung.
    // Der Ansichtszustand wird jeden Frame neu gebaut; die Bestände werden dort
    // gelesen. Ein zusätzlicher Anstoß ist nicht nötig.
    this.remoteLoadouts = {};
    client.on('loadouts', table => { this.remoteLoadouts = table; });

    await client.connect();
    // Laufende Latenzmessung, damit die HUD-Anzeige den echten Wert zeigt.
    client.startPing(2000);
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

    // Zustände kommen je Spieler mit dem Snapshot (Protokoll v3) und werden in
    // den Ansichtszustand übernommen, damit die Anzeige sie darstellen kann.
    const statuses = {};
    for (const entity of snapshot.entities ?? []) {
      if ((entity.shield ?? 0) > 0 || (entity.frozenTurns ?? 0) > 0) {
        statuses[entity.entityId] = {
          shield: entity.shield ?? 0,
          frozenTurns: entity.frozenTurns ?? 0,
          dots: [],
          boostMultiplier: 1,
        };
      }
    }

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
      // Bestände aus der Loadout-Nachricht: der binäre Snapshot führt sie nicht.
      // Ohne diese Zuordnung blieb die Waffenliste im Online-Modus leer.
      activeWeaponId: this.remoteLoadouts?.[entity.entityId]?.activeWeaponId ?? null,
      inventory: this.remoteLoadouts?.[entity.entityId]?.inventory ?? [],
      ammo: this.remoteLoadouts?.[entity.entityId]?.ammo ?? {},
      cooldowns: this.remoteLoadouts?.[entity.entityId]?.cooldowns ?? {},
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
      statuses,
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
      // Wirkungen und Zustände kommen im Online-Modus als Serverereignisse.
      // Sie werden über dieselben Helfer gemeldet wie lokal, damit die
      // Meldungen in beiden Betriebsarten gleich lauten.
      case 'special_effect':
        this.#logSpecialEffect(message);
        break;
      case 'frozen':
        this.hud.log(`${this.#nameOf(message.playerId)} ist eingefroren (${message.turns} Zug/Züge)`, 'accent');
        break;
      case 'turn_skipped':
        this.hud.log(`${this.#nameOf(message.playerId)} setzt aus — eingefroren`, 'danger');
        break;
      case 'dot_tick':
        this.hud.log(`${this.#nameOf(message.playerId)} erleidet ${Math.round(message.damage)} Schaden (${(message.elements ?? []).join(', ')})`, 'danger');
        break;
      case 'shield_absorbed':
        this.hud.log(`Schild fängt ${Math.round(message.absorbed)} Schaden ab`, 'good');
        break;
      case 'pulled':
        this.hud.log(`${this.#nameOf(message.playerId)} wurde herangezogen`, 'accent');
        break;
      case 'heal':
        this.hud.log(`+${Math.round(message.amount)} Heilung`, 'good');
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

  /**
   * Anzeigeposition der gerade gewählten Waffe.
   *
   * Nötig für das Abwerfen per Taste: die Liste gliedert nach Gruppen um, der
   * Inventarindex der aktiven Waffe ist deshalb nicht ihre Position in der
   * Anzeige. Ohne diese Übersetzung träfe das Abwerfen die falsche Waffe.
   */
  #activeDisplayPosition() {
    const weapons = this.#weaponIdsForActivePlayer();
    const aktiv = this.mode === 'online'
      ? this.onlineViewState?.entities
        ?.find(e => e.entityId === this.onlineViewState.activePlayerId)?.activeWeaponId
      : this.match?.activePlayerId === null || !this.match
        ? null
        : this.match.inventory.getActiveWeaponId(this.match.activePlayerId);
    if (aktiv === undefined || aktiv === null) return 0;

    const reihenfolge = orderInventoryBySubcategory(weapons);
    const inventarIndex = weapons.indexOf(aktiv);
    if (inventarIndex < 0) return 0;
    const position = reihenfolge.indexOf(inventarIndex);
    return position >= 0 ? position : 0;
  }

  /**
   * Inventar-Index zu einer Anzeigeposition.
   *
   * Liest die Waffen des aktiven Spielers, ordnet sie wie die Liste
   * (`orderInventoryBySubcategory`) und gibt den Inventar-Index an dieser
   * Position zurück. Ohne diese Übersetzung träfen die Zifferntasten bei
   * gegliederter Liste die falsche Waffe.
   *
   * @returns {number|null} Inventar-Index oder null
   */
  #inventoryIndexAt(anzeigePosition) {
    const position = Number(anzeigePosition);
    if (!Number.isInteger(position) || position < 0 || position > 8) return null;

    const reihenfolge = orderInventoryBySubcategory(this.#weaponIdsForActivePlayer());
    return position < reihenfolge.length ? reihenfolge[position] : null;
  }

  /** Waffen des aktiven Spielers, je nach Betriebsart. */
  #weaponIdsForActivePlayer() {
    if (this.mode === 'online') {
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      return active?.inventory ?? [];
    }
    if (!this.match || this.match.activePlayerId === null) return [];
    return this.match.inventory.getWeapons(this.match.activePlayerId);
  }

  /**
   * Wählt eine Waffe anhand ihrer ANGEZEIGTEN Nummer (1-basiert übergeben als
   * 0-basierte Position).
   *
   * Die Liste ist nach den vier Gruppen gegliedert, die Nummern folgen der
   * Anzeige — nicht der Inventarreihenfolge. Diese Methode übersetzt deshalb
   * Position → Inventar-Index über dieselbe Ordnungsfunktion, die die Liste
   * verwendet.
   */
  selectWeapon(anzeigePosition) {
    const inventarIndex = this.#inventoryIndexAt(anzeigePosition);
    if (inventarIndex === null) return;
    const index = inventarIndex;

    if (this.mode === 'online') {
      // Nur die eigene Waffe wählen und nur am eigenen Zug: sonst schickte der
      // Client eine Waffe, die dem aktiven Spieler gar nicht gehört, und der
      // Server lehnte sie ab.
      if (!this.network?.isMyTurn) {
        this.hud.log('Nur am eigenen Zug kann die Waffe gewechselt werden', 'neutral');
        return;
      }
      const view = this.onlineViewState;
      const active = view?.entities.find(entity => entity.entityId === view.activePlayerId);
      const weaponId = active?.inventory?.[index];
      if (weaponId) {
        // Eine nachladende Waffe lässt sich wählen, aber nicht abfeuern — der
        // Server lehnt den Schuss ab. Die Anzeige sagt warum.
        this.network?.selectWeapon(weaponId);
        // Rückmeldung wie im lokalen Spiel: ohne sie bliebe unklar, ob die Wahl
        // angekommen ist. Der Server bestätigt die Auswahl über den Bestand.
        this.hud.log(`Waffe: ${getWeapon(weaponId)?.displayName ?? weaponId}`);
      }
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
        case 'special_effect':
          // Wirkungen auf den Schützen: Heilung, Schild, Sprung, Munition.
          this.#logSpecialEffect(payload);
          break;
        case 'frozen':
          this.hud.log(`${this.#nameOf(payload.playerId)} ist eingefroren (${payload.turns} Zug/Züge)`, 'accent');
          break;
        case 'turn_skipped':
          this.hud.log(`${this.#nameOf(payload.playerId)} setzt aus — eingefroren`, 'danger');
          break;
        case 'dot_tick':
          this.hud.log(`${this.#nameOf(payload.playerId)} erleidet ${Math.round(payload.damage)} Schaden (${payload.elements.join(', ')})`, 'danger');
          break;
        case 'shield_absorbed': {
          // Sichtbar am Ort der Figur, nicht am Ursprung: ein Blitz bei (0,0)
          // hätte mit der Figur nichts zu tun.
          const geschuetzt = this.currentState()?.entities?.find(e => e.entityId === payload.playerId);
          if (geschuetzt) this.renderer.addFlash(geschuetzt.x, geschuetzt.y, 16, { color: '#4cc9f0' });
          this.hud.log(`Schild fängt ${Math.round(payload.absorbed)} Schaden ab`, 'good');
          break;
        }
        case 'pulled':
          this.hud.log(`${this.#nameOf(payload.playerId)} wurde herangezogen`, 'accent');
          break;
        case 'jumped':
          this.hud.log(`${this.#nameOf(payload.playerId)} springt${payload.double ? ' (Doppelsprung)' : ''}`, 'accent');
          break;
        case 'landed':
          this.hud.log(`${this.#nameOf(payload.playerId)} ist gelandet`);
          break;
        case 'crate_landed':
          this.hud.log('Abgeworfene Waffe gelandet', 'neutral');
          break;
        case 'crate_pickup_blocked':
          // Der Vorrat ist voll: das ist der Moment, in dem Abwerfen nötig wird.
          this.hud.log('Vorrat voll — erst eine Waffe abwerfen (Q)', 'danger');
          break;
        case 'heal':
          this.hud.log(`+${Math.round(payload.amount)} Heilung für ${this.#nameOf(payload.entityId)}`, 'good');
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

  /** Name einer Spielfigur für Log-Meldungen. */
  #nameOf(playerId) {
    const state = this.currentState();
    const entity = state?.entities?.find(e => e.entityId === playerId);
    return entity?.label ?? `Einheit ${playerId}`;
  }

  /** Meldet eine Wirkung auf den Schützen im Protokoll. */
  #logSpecialEffect(payload) {
    const name = this.#nameOf(payload.playerId);
    switch (payload.kind) {
      case 'heal':
        this.hud.log(payload.healed > 0
          ? `${name} heilt ${Math.round(payload.healed)} Lebenspunkte`
          : `${name} ist bereits vollständig geheilt`, payload.healed > 0 ? 'good' : 'neutral');
        break;
      case 'shield':
        this.hud.log(`${name} erhält ${Math.round(payload.shield)} Schild`, 'accent');
        break;
      case 'damage_boost':
        this.hud.log(`${name} macht ×${payload.multiplier} Schaden`, 'accent');
        break;
      case 'armor':
        this.hud.log(`${name} nimmt ${Math.round(payload.reduction * 100)} % weniger Schaden`, 'accent');
        break;
      case 'ammo':
        this.hud.log(payload.restored > 0
          ? `${name} füllt ${payload.restored} Ladungen nach`
          : `${name} hat nichts nachzufüllen`, payload.restored > 0 ? 'good' : 'neutral');
        break;
      case 'move':
        this.hud.log(`${name} versetzt sich um ${Math.round(Math.hypot(payload.moved?.dx ?? 0, payload.moved?.dy ?? 0))} px`, 'accent');
        break;
      case 'reveal':
        this.hud.log(`${name} ist für ${payload.revealedTurns} Züge aufgedeckt`, 'accent');
        break;
      case 'random':
        this.hud.log(`${name}: Zufallswirkung ${payload.randomKind}`, 'accent');
        break;
      default:
        this.hud.log(`${name} nutzt eine Wirkung (${payload.kind})`);
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
      refreshLobbies: () => this.refreshLobbies(),
      /** Waffe wählen wie über die Liste (Index im Inventar). */
      selectWeapon: index => this.selectWeapon(index),
      /** Waffe abwerfen (Position wie in der Liste). */
      dropWeapon: index => this.dropWeapon(index),
      /** Springen (seitlich: -1, 0, 1). */
      jump: seitlich => this.jump(seitlich ?? 0),
      /** Steht die Figur am Zug auf festem Grund? */
      isGrounded: () => this.match ? this.match.isGrounded(this.match.activePlayerId) : false,
      /** Verbleibende Sprünge des Spielers am Zug. */
      jumpsLeft: () => this.match ? this.match.jumpsLeft(this.match.activePlayerId) : 0,
      /**
       * Waffenkatalog und Wirkungen für Tests und Automatisierung.
       * Ohne diese Zugänge müssten E2E-Tests Module dynamisch nachladen, was im
       * Browser an der Pfadauflösung scheitert.
       */
      weapons: () => WEAPONS,
      getWeapon: id => getWeapon(id),
      buildEffect: id => buildEffect(getWeapon(id)),
      findWeaponByEffect: kind => WEAPONS.find(weapon => buildEffect(weapon)?.kind === kind) ?? null,
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

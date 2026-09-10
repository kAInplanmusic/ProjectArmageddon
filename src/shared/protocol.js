/**
 * Netzwerkprotokoll für Project Armageddon.
 *
 * Aufteilung:
 *  - Steuernachrichten laufen als JSON-Textframes (lesbar, selten, versioniert).
 *  - Snapshots laufen als Binärframes (häufig, kompakt, festes Layout).
 *
 * Binärlayout Snapshot v2 (Little Endian):
 *   [0..1]   Magic 'P','A'
 *   [2]      Protokollversion
 *   [3]      Nachrichtentyp
 *   [4..7]   Tick (Uint32)
 *   [8..9]   Runde (Uint16)
 *   [10..13] Wind (Float32)
 *   [14..15] aktive Entity-ID (Uint16, 0 = keine)
 *   [16]     Spieleranzahl
 *   [17]     Projektilanzahl
 *   [18..19] Restzugzeit in 100 ms (Uint16, 0 = keine laufende Zugzeit)
 *   [20..21] Flags (Uint16, Bit 0 = Vollsnapshot statt Delta)
 *   ab [22]  je Spieler 12 Byte:
 *     id Uint16, team Uint8, alive Uint8,
 *     x Int16 (0.25 px), y Int16 (0.25 px), health Int16 (0.1 HP),
 *     turnFlag Uint8 (1 = am Zug), dirty Uint8 (Bitfeld, siehe DIRTY)
 *   danach je Projektil 6 Byte: id Uint16, x Int16, y Int16 (0.25 px)
 *
 * Delta-Encoding: Im `dirty`-Byte markiert der Server, welche Felder sich seit
 * dem letzten an diesen Client gesendeten Snapshot geändert haben. Der Client
 * behält für nicht markierte Felder seine vorherigen Werte. Das spart bei
 * ruhigen Ticks einen Großteil der Nutzlast.
 *
 * @module protocol
 */

export const PROTOCOL_VERSION = 2;
export const MAGIC = [0x50, 0x41]; // 'PA'

export const MESSAGE_TYPE = Object.freeze({
  SNAPSHOT: 1,
  MATCH_OVER: 2,
  PONG: 3,
});

export const CONTROL = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  CREATE_LOBBY: 'create_lobby',
  JOIN_LOBBY: 'join_lobby',
  LOBBY_STATE: 'lobby_state',
  START_MATCH: 'start_match',
  INPUT: 'input',
  SELECT_WEAPON: 'select_weapon',
  RESUME: 'resume',
  ERROR: 'error',
  PING: 'ping',
});

export const COORD_SCALE = 4;      // 0.25 px Auflösung
export const HEALTH_SCALE = 10;    // 0.1 HP Auflösung
export const TURN_MS_SCALE = 100;  // 0.1 s Auflösung

/** Bitfeld im dirty-Byte: welche Felder eines Spielers sich geändert haben. */
export const DIRTY = Object.freeze({
  POSITION: 1 << 0,
  HEALTH: 1 << 1,
  ALIVE: 1 << 2,
});

/** Bitfeld in den Snapshot-Flags. */
export const SNAPSHOT_FLAG = Object.freeze({
  FULL: 1 << 0,
});

const PLAYER_STRIDE = 12;
const PROJECTILE_STRIDE = 6;
const HEADER_SIZE = 22;

function clampInt16(value) {
  const rounded = Math.round(value);
  if (rounded > 32767) return 32767;
  if (rounded < -32768) return -32768;
  return rounded;
}

function clampUint16(value) {
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > 65535) return 65535;
  return rounded;
}

/**
 * Normalisiert beliebige Binärdaten zu einer DataView.
 * Unterstützt Buffer (Node), Uint8Array und ArrayBuffer (Browser).
 */
function toDataView(input) {
  if (input instanceof DataView) return input;
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (ArrayBuffer.isView(input)) return new DataView(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

/**
 * Kodiert einen Match-State in einen kompakten Binärpuffer.
 *
 * Verwendet DataView statt Node-Buffer-Methoden, damit dieselbe Funktion im
 * Browser und auf dem Server läuft. Rückgabe ist ein Uint8Array.
 *
 * @param {object} state - MatchController.getState()
 * @param {number} [turnRemainingMs=0] - Restzugzeit in Millisekunden
 * @param {Map<number, object>} [previous] - vorheriger Zustand je Entity-ID
 *   (für Delta-Encoding). Ohne Angabe wird ein Vollsnapshot erzeugt.
 *   Erwartet die Rohwerte aus decodeSnapshot().previous (bereits skalierte
 *   Ganzzahlen), damit der Vergleich exakt ist.
 * @returns {Uint8Array}
 */
export function encodeSnapshot(state, { turnRemainingMs = 0, previous = null } = {}) {
  const players = state.entities ?? [];
  const projectiles = state.projectiles ?? [];
  const size = HEADER_SIZE + players.length * PLAYER_STRIDE + projectiles.length * PROJECTILE_STRIDE;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  const isDelta = previous instanceof Map && previous.size > 0;

  bytes[0] = MAGIC[0];
  bytes[1] = MAGIC[1];
  bytes[2] = PROTOCOL_VERSION;
  bytes[3] = MESSAGE_TYPE.SNAPSHOT;
  view.setUint32(4, state.tick >>> 0, true);
  view.setUint16(8, (state.round ?? 0) & 0xffff, true);
  view.setFloat32(10, Number(state.wind) || 0, true);
  view.setUint16(14, (state.activePlayerId ?? 0) & 0xffff, true);
  bytes[16] = Math.min(255, players.length);
  bytes[17] = Math.min(255, projectiles.length);
  view.setUint16(18, clampUint16(turnRemainingMs / TURN_MS_SCALE), true);
  view.setUint16(20, isDelta ? 0 : SNAPSHOT_FLAG.FULL, true);

  let offset = HEADER_SIZE;
  for (const player of players) {
    // Rohwerte als Ganzzahlen: der Delta-Vergleich läuft auf genau den Zahlen,
    // die auch übertragen werden — keine Gleitkomma-Ungenauigkeit.
    const xRaw = clampInt16((player.x ?? 0) * COORD_SCALE);
    const yRaw = clampInt16((player.y ?? 0) * COORD_SCALE);
    const healthRaw = clampInt16((player.health ?? 0) * HEALTH_SCALE);
    const alive = Boolean(player.alive);

    let dirty = DIRTY.POSITION | DIRTY.HEALTH | DIRTY.ALIVE;
    if (isDelta) {
      const before = previous.get(player.entityId);
      if (before) {
        dirty = 0;
        if (before.xRaw !== xRaw || before.yRaw !== yRaw) dirty |= DIRTY.POSITION;
        if (before.healthRaw !== healthRaw) dirty |= DIRTY.HEALTH;
        if (before.alive !== alive) dirty |= DIRTY.ALIVE;
      }
    }

    view.setUint16(offset, (player.entityId ?? 0) & 0xffff, true);
    view.setUint8(offset + 2, (player.teamId ?? 0) & 0xff);
    view.setUint8(offset + 3, alive ? 1 : 0);
    view.setInt16(offset + 4, xRaw, true);
    view.setInt16(offset + 6, yRaw, true);
    view.setInt16(offset + 8, healthRaw, true);
    view.setUint8(offset + 10, player.entityId === state.activePlayerId ? 1 : 0);
    view.setUint8(offset + 11, dirty);
    offset += PLAYER_STRIDE;
  }

  for (const projectile of projectiles) {
    view.setUint16(offset, (projectile.entityId ?? 0) & 0xffff, true);
    view.setInt16(offset + 2, clampInt16((projectile.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 4, clampInt16((projectile.y ?? 0) * COORD_SCALE), true);
    offset += PROJECTILE_STRIDE;
  }

  return bytes;
}

/**
 * Dekodiert einen Snapshot. Gibt bei ungültigem Puffer null zurück.
 *
 * @param {ArrayBuffer|Uint8Array|Buffer|DataView} input
 * @param {Map<number, object>} [previous] - vorheriger Client-Zustand; fehlende
 *   Felder werden daraus übernommen (Delta-Encoding).
 */
export function decodeSnapshot(input, previous = null) {
  const view = toDataView(input);
  if (!view || view.byteLength < HEADER_SIZE) return null;
  if (view.getUint8(0) !== MAGIC[0] || view.getUint8(1) !== MAGIC[1]) return null;
  if (view.getUint8(2) !== PROTOCOL_VERSION) return null;
  if (view.getUint8(3) !== MESSAGE_TYPE.SNAPSHOT) return null;

  const tick = view.getUint32(4, true);
  const round = view.getUint16(8, true);
  const wind = view.getFloat32(10, true);
  const activePlayerId = view.getUint16(14, true) || null;
  const playerCount = view.getUint8(16);
  const projectileCount = view.getUint8(17);
  const turnRemainingMs = view.getUint16(18, true) * TURN_MS_SCALE;
  const flags = view.getUint16(20, true);
  const isFull = (flags & SNAPSHOT_FLAG.FULL) !== 0;
  const carry = !isFull && previous instanceof Map ? previous : null;

  let offset = HEADER_SIZE;
  const entities = [];
  // Rohwerte für den nächsten Delta-Vergleich: exakt das, was übertragen wurde.
  const nextPrevious = new Map();
  for (let i = 0; i < playerCount; i++) {
    if (offset + PLAYER_STRIDE > view.byteLength) return null;
    const entityId = view.getUint16(offset, true);
    const dirty = view.getUint8(offset + 11);
    const aliveRaw = view.getUint8(offset + 3) === 1;
    const xRaw = view.getInt16(offset + 4, true);
    const yRaw = view.getInt16(offset + 6, true);
    const healthRaw = view.getInt16(offset + 8, true);

    const before = carry?.get(entityId);
    entities.push({
      entityId,
      teamId: view.getUint8(offset + 2),
      alive: (dirty & DIRTY.ALIVE) !== 0 || !before ? aliveRaw : before.alive,
      x: ((dirty & DIRTY.POSITION) !== 0 || !before ? xRaw : before.xRaw) / COORD_SCALE,
      y: ((dirty & DIRTY.POSITION) !== 0 || !before ? yRaw : before.yRaw) / COORD_SCALE,
      health: ((dirty & DIRTY.HEALTH) !== 0 || !before ? healthRaw : before.healthRaw) / HEALTH_SCALE,
      isActiveTurn: view.getUint8(offset + 10) === 1,
    });
    nextPrevious.set(entityId, {
      xRaw: (dirty & DIRTY.POSITION) !== 0 || !before ? xRaw : before.xRaw,
      yRaw: (dirty & DIRTY.POSITION) !== 0 || !before ? yRaw : before.yRaw,
      healthRaw: (dirty & DIRTY.HEALTH) !== 0 || !before ? healthRaw : before.healthRaw,
      alive: (dirty & DIRTY.ALIVE) !== 0 || !before ? aliveRaw : before.alive,
    });
    offset += PLAYER_STRIDE;
  }

  const projectiles = [];
  for (let i = 0; i < projectileCount; i++) {
    if (offset + PROJECTILE_STRIDE > view.byteLength) break;
    projectiles.push({
      entityId: view.getUint16(offset, true),
      x: view.getInt16(offset + 2, true) / COORD_SCALE,
      y: view.getInt16(offset + 4, true) / COORD_SCALE,
    });
    offset += PROJECTILE_STRIDE;
  }

  return {
    version: PROTOCOL_VERSION,
    isFull,
    tick,
    round,
    wind,
    turnRemainingMs,
    activePlayerId,
    entities,
    projectiles,
    previous: nextPrevious,
  };
}

/** Erzeugt eine JSON-Steuernachricht mit Protokollversion. */
export function controlMessage(type, payload = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload });
}

/**
 * Erzeugt die Delta-Basis aus einem Match-State — in genau der Rohform, die
 * encodeSnapshot/decodeSnapshot erwarten.
 *
 * Wichtig: NICHT von Hand eine Map mit Weltkoordinaten bauen. Der Vergleich
 * läuft auf den skalierten Ganzzahlen; unskalierte Werte führen dazu, dass der
 * Encoder jede Position als "geändert" meldet und das Delta nichts spart.
 *
 * @param {object} state - MatchController.getState()
 * @returns {Map<number, {xRaw:number,yRaw:number,healthRaw:number,alive:boolean}>}
 */
export function toDeltaBase(state) {
  const base = new Map();
  for (const entity of state.entities ?? []) {
    base.set(entity.entityId, {
      xRaw: clampInt16((entity.x ?? 0) * COORD_SCALE),
      yRaw: clampInt16((entity.y ?? 0) * COORD_SCALE),
      healthRaw: clampInt16((entity.health ?? 0) * HEALTH_SCALE),
      alive: Boolean(entity.alive),
    });
  }
  return base;
}

/** Parst eine Steuernachricht. Gibt bei Fehlern null zurück. */
export function parseControlMessage(raw) {
  try {
    const parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

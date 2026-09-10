/**
 * Netzwerkprotokoll für Project Armageddon.
 *
 * Aufteilung:
 *  - Steuernachrichten laufen als JSON-Textframes (lesbar, selten, versioniert).
 *  - Snapshots laufen als Binärframes (häufig, kompakt, festes Layout).
 *
 * Binärlayout Snapshot (Little Endian):
 *   [0..1]  Magic 'P','A'
 *   [2]     Protokollversion
 *   [3]     Nachrichtentyp
 *   [4..7]  Tick (Uint32)
 *   [8..9]  Runde (Uint16)
 *   [10..13] Wind (Float32)
 *   [14..15] aktive Entity-ID (Uint16, 0 = keine)
 *   [16]    Spieleranzahl
 *   [17]    Projektilanzahl
 *   ab [18] je Spieler 12 Byte:
 *     id Uint16, team Uint8, alive Uint8, x Int16 (0.25 px), y Int16 (0.25 px),
 *     health Int16 (0.1 HP), maxHealth Int16 (0.1 HP), flags Uint8 (=1 wenn am Zug)
 *   danach je Projektil 6 Byte: id Uint16, x Int16, y Int16 (0.25 px)
 *
 * @module protocol
 */

export const PROTOCOL_VERSION = 1;
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
  ERROR: 'error',
  PING: 'ping',
});

export const COORD_SCALE = 4;      // 0.25 px Auflösung
export const HEALTH_SCALE = 10;    // 0.1 HP Auflösung

const PLAYER_STRIDE = 12;
const PROJECTILE_STRIDE = 6;
const HEADER_SIZE = 18;

function clampInt16(value) {
  const rounded = Math.round(value);
  if (rounded > 32767) return 32767;
  if (rounded < -32768) return -32768;
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
 * Browser und auf dem Server läuft. Rückgabe ist ein Uint8Array (Browser-tauglich),
 * auf Node zusätzlich als Buffer nutzbar.
 */
export function encodeSnapshot(state) {
  const players = state.entities ?? [];
  const projectiles = state.projectiles ?? [];
  const size = HEADER_SIZE + players.length * PLAYER_STRIDE + projectiles.length * PROJECTILE_STRIDE;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

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

  let offset = HEADER_SIZE;
  for (const player of players) {
    view.setUint16(offset, (player.entityId ?? 0) & 0xffff, true);
    view.setUint8(offset + 2, (player.teamId ?? 0) & 0xff);
    view.setUint8(offset + 3, player.alive ? 1 : 0);
    view.setInt16(offset + 4, clampInt16((player.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 6, clampInt16((player.y ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 8, clampInt16((player.health ?? 0) * HEALTH_SCALE), true);
    view.setUint8(offset + 10, player.entityId === state.activePlayerId ? 1 : 0);
    view.setUint8(offset + 11, 0);
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

/** Dekodiert einen Snapshot. Gibt bei ungültigem Puffer null zurück. */
export function decodeSnapshot(input) {
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

  let offset = HEADER_SIZE;
  const entities = [];
  for (let i = 0; i < playerCount; i++) {
    if (offset + PLAYER_STRIDE > view.byteLength) return null;
    entities.push({
      entityId: view.getUint16(offset, true),
      teamId: view.getUint8(offset + 2),
      alive: view.getUint8(offset + 3) === 1,
      x: view.getInt16(offset + 4, true) / COORD_SCALE,
      y: view.getInt16(offset + 6, true) / COORD_SCALE,
      health: view.getInt16(offset + 8, true) / HEALTH_SCALE,
      isActiveTurn: view.getUint8(offset + 10) === 1,
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

  return { tick, round, wind, activePlayerId, entities, projectiles };
}

/** Erzeugt eine JSON-Steuernachricht mit Protokollversion. */
export function controlMessage(type, payload = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload });
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

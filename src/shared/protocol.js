/**
 * Netzwerkprotokoll für Project Armageddon.
 *
 * Aufteilung:
 *  - Steuernachrichten laufen als JSON-Textframes (lesbar, selten, versioniert).
 *  - Snapshots laufen als Binärframes (häufig, kompakt, festes Layout).
 *
 * Binärlayout Snapshot v4 (Little Endian):
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
 *   [22]     Kistenanzahl (ab v5)
 *   [23]     Geschützanzahl (ab v6)
 *   [24]     Kackhaufenzahl (ab v7)
 *   ab [25]  je Spieler 15 Byte:
 *     id Uint16, team Uint8, alive Uint8,
 *     x Int16 (0.25 px), y Int16 (0.25 px), health Int16 (0.1 HP),
 *     turnFlag Uint8 (1 = am Zug), dirty Uint8 (Bitfeld, siehe DIRTY),
 *     shield Uint8, frozenTurns Uint8, waterLevel Uint8 (Wasserstand 0..255)
 *   danach je Projektil 6 Byte: id Uint16, x Int16, y Int16 (0.25 px)
 *   danach je Kiste 8 Byte (ab v5): id, x, y, Art, Seltenheit
 *   danach je Geschütz 8 Byte (ab v6): id, x, y, Team, Restrunden
 *   danach der Günther-Block, IMMER 6 Byte (ab v7):
 *     x Int16 (0.25 px), y Int16 (0.25 px), richtung Int8 (±1), Flags Uint8 (Bit 0 = aktiv)
 *   und ganz zuletzt je Kackhaufen die Anzahl aus [24] × 4 Byte: x Int16, y Int16 (0.25 px)
 *
 * v3 → v4: Wasserstand je Spieler. Die Anzeige konnte bisher weder „nass" noch
 * „ertrinkt" darstellen — die Schwellen kannte nur das CharacterSystem, und
 * übertragen wurde nichts davon. Ein Byte genügt: 0 = trocken, 255 = Zelle voll.
 * Die Zustandsgrenzen liegen in `src/shared/config/water.js` und gelten damit
 * für Server, Client und Simulation gleich.
 *
 * Delta-Encoding: Im `dirty`-Byte markiert der Server, welche Felder sich seit
 * dem letzten an diesen Client gesendeten Snapshot geändert haben. Der Client
 * behält für nicht markierte Felder seine vorherigen Werte. Das spart bei
 * ruhigen Ticks einen Großteil der Nutzlast.
 *
 * @module protocol
 */

// Wasserstand: Quantisierung und Grenzen kommen aus der gemeinsamen Config —
// ein zweiter Satz Zahlen hier wäre die nächste doppelte Regel.
import { toWireWaterLevel, fromWireWaterLevel } from './config/water.js';
// Ebenso die Kackhaufen-Obergrenze: Sie steht in der Config, aus der die
// Simulation sie liest — ein zweiter Deckel hier wäre die nächste doppelte Regel.
import { GUENTHER_POOP } from './config/guenther.js';

/**
 * Version des Drahtformats.
 *
 * 5: Kisten werden übertragen (Kampffeld-Loot). Vorher fehlten sie im Snapshot,
 *    weshalb ONLINE keine Kiste zu sehen war — im lokalen Match dagegen schon.
 * 6: Aufgestellte Geschütze werden übertragen. Sie sind ein SPIELZUSTAND (der
 *    Gegner muss wissen, wo eines steht und wie lange es noch feuert), kein
 *    Beiwerk — ohne Übertragung wäre der Auto-Turret online unsichtbar und damit
 *    ein unsichtbarer Angreifer.
 *    Eine ältere Gegenstelle lehnt den Snapshot ab, statt ihn falsch zu lesen;
 *    genau dafür gibt es diese Zahl.
 * 7: Günther und seine Kackhaufen werden übertragen. Er ist derselbe Fall wie die
 *    Geschütze, nur schlimmer: Er läuft frei über die Karte, pinkelt Spieler an
 *    (Schaden) und legt Haufen, die langsamer machen und vergiften. Sein Aufbau
 *    lag bisher allein im lokalen Ansichtszustand; online sah man weder ihn noch
 *    die Haufen — man wurde geschwächt und verlangsamt, ohne eine Ursache zu
 *    sehen. Eine ältere Gegenstelle lehnt den Snapshot ab, statt ihn falsch zu
 *    lesen; genau dafür gibt es diese Zahl.
 */
export const PROTOCOL_VERSION = 7;
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
  JUMP: 'jump',
  DROP_WEAPON: 'drop_weapon',
  RESUME: 'resume',
  ERROR: 'error',
  PING: 'ping',
  /**
   * Waffenbestand je Spieler (Waffen, Munition, aktive Waffe).
   *
   * Wird nur bei Änderung gesendet. Nötig, weil der binäre Snapshot die
   * Bestände nicht führt: variable Längen je Spieler würden das Delta-Format
   * sprengen. Ohne diese Nachricht blieb die Waffenliste im Online-Modus leer.
   */
  LOADOUTS: 'loadouts',
});

const COORD_SCALE = 4;      // 0.25 px Auflösung
const HEALTH_SCALE = 10;    // 0.1 HP Auflösung
const TURN_MS_SCALE = 100;  // 0.1 s Auflösung
/** Obergrenze für Einfrierdauer im Drahtformat (ein Byte). */
const MAX_WIRE_FREEZE_TURNS = 255;
/** Bitfeld im dirty-Byte: welche Felder eines Spielers sich geändert haben. */
export const DIRTY = Object.freeze({
  POSITION: 1 << 0,
  HEALTH: 1 << 1,
  ALIVE: 1 << 2,
  /** Schild und Einfrierdauer (Protokoll v3). */
  STATUS: 1 << 3,
  /** Wasserstand (Protokoll v4). */
  WATER: 1 << 4,
});

/** Bitfeld in den Snapshot-Flags. */
export const SNAPSHOT_FLAG = Object.freeze({
  FULL: 1 << 0,
});

/*
 * Diese drei sind exportiert, weil Tests die Übertragungsgröße prüfen
 * (`tests/snapshot-size.test.js`): Die Größe eines Zustandstakts ist eine
 * bewusste Entscheidung, keine Zufallszahl — und sie soll nicht unbemerkt
 * wachsen.
 */
export const PLAYER_STRIDE = 15;
export const PROJECTILE_STRIDE = 6;
/**
 * Kiste im Snapshot: Kennung (2), x (2), y (2), Art (1), Seltenheit (1).
 *
 * `inFlight` fehlt bewusst: Es steuert die Landephysik auf dem SERVER und hat
 * für die Anzeige keine Bedeutung — die Kiste wird an ihrer Position gezeichnet,
 * ob sie fällt oder liegt.
 */
export const CRATE_STRIDE = 8;
/**
 * Geschütz im Snapshot: Kennung (2), x (2), y (2), Team (1), Restrunden (1).
 *
 * Der Schaden geht NICHT mit: Er ist eine Eigenschaft der aufstellenden Waffe
 * und für die Anzeige ohne Bedeutung — dort zählt, WO das Geschütz steht und wie
 * lange es noch feuert.
 */
export const TURRET_STRIDE = 8;
/**
 * Günther im Snapshot: x (2), y (2), Richtung (1), Flags (1).
 *
 * `identity` und `plan` fehlen bewusst: Der Aufbau (Name, Fellfarbe, Maße) und
 * der Auftrittsplan sind statische Konfiguration aus
 * `src/shared/config/guenther.js` — der Client liest sie ohnehin direkt. Sie
 * mitzusenden hieße, jeden Zustandstakt um konstante Bytes für nichts zu
 * verlängern. Übertragen wird, was sich BEWEGT: wo er steht, wohin er schaut und
 * ob er gerade da ist.
 */
export const GUENTHER_STRIDE = 6;
/**
 * Kackhaufen im Snapshot: x (2), y (2).
 *
 * Ein Haufen ist ein Punkt auf der Karte — sonst nichts. Wirkdauer
 * (`GUENTHER_POOP.turns`) und Schaden stecken in der Config, nicht im Zustand.
 */
export const GUENTHER_POOP_STRIDE = 4;
/** Bitfeld im Günther-Block. */
export const GUENTHER_FLAG = Object.freeze({
  /** Günther ist in dieser Runde auf der Karte. */
  AKTIV: 1 << 0,
});
/**
 * Höchstzahl der Haufen auf der Leitung — und damit die Obergrenze des
 * Zustandstakts.
 *
 * Die Liste in `GuentherSystem` wächst NICHT unbegrenzt: Beim Ablegen fällt der
 * älteste Haufen heraus, sobald `GUENTHER_POOP.maxPiles` erreicht ist
 * (`guentherSystem.js`, „Älteste Haufen entfernen, damit sich das Feld nicht
 * zupflastert"). Diese Zahl wird hier NICHT neu gesetzt, sondern aus derselben
 * Config gelesen — der Deckel gehört der Simulation, das Drahtformat folgt ihm.
 * Ein Byte als Zählfeld reicht damit mit großem Abstand (6 statt 255); wer
 * `maxPiles` über 255 hebt, muss das Zählfeld mitziehen.
 */
export const MAX_WIRE_POOPS = Math.min(GUENTHER_POOP.maxPiles, 255);
/**
 * Kopf des Snapshots.
 *
 * 22 → 23 mit Protokoll v5: Die Kistenzahl brauchte ein eigenes Feld.
 * 23 → 24 mit Protokoll v6: dazu die Geschützzahl. Beide Zahlen in die freien
 * Bits der Flags zu packen wäre platzsparender gewesen, aber der Kopf ist die
 * Stelle, an der man nachliest, was übertragen wird — zwei Zahlen in einem Feld
 * machen das schwerer. Ein Byte je Art ist hier gut angelegt.
 * 24 → 25 mit Protokoll v7: dazu die Kackhaufenzahl, aus demselben Grund.
 */
export const HEADER_SIZE = 25;

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
  const crates = state.crates ?? [];
  const turrets = state.turrets ?? [];
  const guenther = state.guenther ?? null;
  // Die Haufenliste wird auf die Obergrenze gekürzt, BEVOR die Größe gerechnet
  // wird: Sonst verspräche das Zählfeld mehr Einträge, als der Puffer hergibt.
  // (Eigener Name, weil `haufen` unten der Laufeintrag ist — Singular und Plural
  // heißen hier gleich.)
  const haufenListe = (guenther?.haufen ?? []).slice(0, MAX_WIRE_POOPS);
  const size = HEADER_SIZE
    + players.length * PLAYER_STRIDE
    + projectiles.length * PROJECTILE_STRIDE
    + crates.length * CRATE_STRIDE
    + turrets.length * TURRET_STRIDE
    + GUENTHER_STRIDE
    + haufenListe.length * GUENTHER_POOP_STRIDE;
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
  bytes[22] = Math.min(255, crates.length);
  bytes[23] = Math.min(255, turrets.length);
  bytes[24] = haufenListe.length;

  let offset = HEADER_SIZE;
  for (const player of players) {
    // Rohwerte als Ganzzahlen: der Delta-Vergleich läuft auf genau den Zahlen,
    // die auch übertragen werden — keine Gleitkomma-Ungenauigkeit.
    const xRaw = clampInt16((player.x ?? 0) * COORD_SCALE);
    const yRaw = clampInt16((player.y ?? 0) * COORD_SCALE);
    const healthRaw = clampInt16((player.health ?? 0) * HEALTH_SCALE);
    const alive = Boolean(player.alive);
    // Zustände ganzzahlig: Schild in Punkten, Einfrierdauer in Zügen.
    const shieldRaw = Math.max(0, Math.min(255, Math.round(player.shield ?? 0)));
    const frozenRaw = Math.max(0, Math.min(
      MAX_WIRE_FREEZE_TURNS,
      Math.round(player.frozenTurns ?? 0),
    ));
    // Wasserstand ganzzahlig — wie alle Drahtwerte, damit der Delta-Vergleich
    // auf genau den übertragenen Zahlen läuft.
    const waterRaw = toWireWaterLevel(player.waterLevel ?? 0);

    let dirty = DIRTY.POSITION | DIRTY.HEALTH | DIRTY.ALIVE | DIRTY.STATUS | DIRTY.WATER;
    if (isDelta) {
      const before = previous.get(player.entityId);
      if (before) {
        dirty = 0;
        if (before.xRaw !== xRaw || before.yRaw !== yRaw) dirty |= DIRTY.POSITION;
        if (before.healthRaw !== healthRaw) dirty |= DIRTY.HEALTH;
        if (before.alive !== alive) dirty |= DIRTY.ALIVE;
        if (before.shieldRaw !== shieldRaw || before.frozenRaw !== frozenRaw) dirty |= DIRTY.STATUS;
        if (before.waterRaw !== waterRaw) dirty |= DIRTY.WATER;
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
    view.setUint8(offset + 12, shieldRaw);
    view.setUint8(offset + 13, frozenRaw);
    view.setUint8(offset + 14, waterRaw);
    offset += PLAYER_STRIDE;
  }

  for (const projectile of projectiles) {
    view.setUint16(offset, (projectile.entityId ?? 0) & 0xffff, true);
    view.setInt16(offset + 2, clampInt16((projectile.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 4, clampInt16((projectile.y ?? 0) * COORD_SCALE), true);
    offset += PROJECTILE_STRIDE;
  }

  for (const crate of crates) {
    view.setUint16(offset, (crate.entityId ?? 0) & 0xffff, true);
    view.setInt16(offset + 2, clampInt16((crate.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 4, clampInt16((crate.y ?? 0) * COORD_SCALE), true);
    view.setUint8(offset + 6, (crate.crateType ?? 0) & 0xff);
    view.setUint8(offset + 7, (crate.rarity ?? 0) & 0xff);
    offset += CRATE_STRIDE;
  }

  for (const turret of turrets) {
    view.setUint16(offset, (turret.entityId ?? 0) & 0xffff, true);
    view.setInt16(offset + 2, clampInt16((turret.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 4, clampInt16((turret.y ?? 0) * COORD_SCALE), true);
    view.setUint8(offset + 6, (turret.teamId ?? 0) & 0xff);
    view.setUint8(offset + 7, Math.max(0, Math.min(255, Math.round(turret.roundsLeft ?? 0))));
    offset += TURRET_STRIDE;
  }

  /*
   * Günther steht NACH den Geschützen — die Reihenfolge muss zu decodeSnapshot
   * passen. Sein Block ist IMMER vorhanden, auch wenn er gerade nicht auftritt:
   * Ein fester Platz hält die Größenformel ehrlich ("Summe ihrer Teile"), und
   * `aktiv` im Flags-Byte sagt der Anzeige, ob sie ihn zeichnet. Eine weggelassene
   * Sektion müsste im Kopf angekündigt werden — eine Fallunterscheidung mehr auf
   * beiden Seiten für sechs Bytes.
   *
   * Fehlt `guenther` im Zustand (von Hand gebaute Zustände in Tests und
   * Werkzeugen), wird ein INAKTIVER Block geschrieben: gültig, leer, kein Wurf.
   */
  view.setInt16(offset, clampInt16((guenther?.x ?? 0) * COORD_SCALE), true);
  view.setInt16(offset + 2, clampInt16((guenther?.y ?? 0) * COORD_SCALE), true);
  // Richtung ist immer ±1 (`GuentherSystem` kippt sie nur per Vorzeichen) —
  // als Int8 geht sie damit verlustfrei auf die Leitung.
  view.setInt8(offset + 4, (guenther?.richtung ?? 1) < 0 ? -1 : 1);
  view.setUint8(offset + 5, guenther?.aktiv ? GUENTHER_FLAG.AKTIV : 0);
  offset += GUENTHER_STRIDE;

  for (const haufen of haufenListe) {
    view.setInt16(offset, clampInt16((haufen.x ?? 0) * COORD_SCALE), true);
    view.setInt16(offset + 2, clampInt16((haufen.y ?? 0) * COORD_SCALE), true);
    offset += GUENTHER_POOP_STRIDE;
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
  // Kistenzahl — ab Protokoll v5. Ältere Snapshots kommen hier nicht an: Die
  // Versionsprüfung oben lehnt sie ab, statt sie fehlzuinterpretieren.
  const crateCount = view.getUint8(22);
  // Geschützzahl — ab Protokoll v6.
  const turretCount = view.getUint8(23);
  // Kackhaufenzahl — ab Protokoll v7. Die Haufen selbst stehen ganz am Ende,
  // hinter dem Günther-Block; diese Zahl ist ihre Länge.
  const poopCount = view.getUint8(24);
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
    const shieldRaw = view.getUint8(offset + 12);
    const frozenRaw = view.getUint8(offset + 13);
    const waterRaw = view.getUint8(offset + 14);

    const before = carry?.get(entityId);
    entities.push({
      entityId,
      teamId: view.getUint8(offset + 2),
      alive: (dirty & DIRTY.ALIVE) !== 0 || !before ? aliveRaw : before.alive,
      x: ((dirty & DIRTY.POSITION) !== 0 || !before ? xRaw : before.xRaw) / COORD_SCALE,
      y: ((dirty & DIRTY.POSITION) !== 0 || !before ? yRaw : before.yRaw) / COORD_SCALE,
      health: ((dirty & DIRTY.HEALTH) !== 0 || !before ? healthRaw : before.healthRaw) / HEALTH_SCALE,
      isActiveTurn: view.getUint8(offset + 10) === 1,
      shield: (dirty & DIRTY.STATUS) !== 0 || !before ? shieldRaw : before.shieldRaw,
      frozenTurns: (dirty & DIRTY.STATUS) !== 0 || !before ? frozenRaw : before.frozenRaw,
      waterLevel: fromWireWaterLevel(
        (dirty & DIRTY.WATER) !== 0 || !before ? waterRaw : before.waterRaw,
      ),
    });
    nextPrevious.set(entityId, {
      xRaw: (dirty & DIRTY.POSITION) !== 0 || !before ? xRaw : before.xRaw,
      yRaw: (dirty & DIRTY.POSITION) !== 0 || !before ? yRaw : before.yRaw,
      healthRaw: (dirty & DIRTY.HEALTH) !== 0 || !before ? healthRaw : before.healthRaw,
      alive: (dirty & DIRTY.ALIVE) !== 0 || !before ? aliveRaw : before.alive,
      shieldRaw: (dirty & DIRTY.STATUS) !== 0 || !before ? shieldRaw : before.shieldRaw,
      frozenRaw: (dirty & DIRTY.STATUS) !== 0 || !before ? frozenRaw : before.frozenRaw,
      waterRaw: (dirty & DIRTY.WATER) !== 0 || !before ? waterRaw : before.waterRaw,
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

  /*
   * Kisten stehen NACH den Projektilen — die Reihenfolge muss zu encodeSnapshot
   * passen. Sie werden im Zustand ausdrücklich mitgeführt, weil sie sonst online
   * unsichtbar wären: `onlineViewState` im Client konnte sie nicht erfinden.
   */
  const crates = [];
  for (let i = 0; i < crateCount; i++) {
    // Ein abgeschnittener Puffer beendet die Schleife, statt zu werfen: Ein
    // halber Snapshot ist besser als ein Absturz, und die Prüfung darüber
    // erkennt ihn ohnehin.
    if (offset + CRATE_STRIDE > view.byteLength) break;
    crates.push({
      entityId: view.getUint16(offset, true),
      x: view.getInt16(offset + 2, true) / COORD_SCALE,
      y: view.getInt16(offset + 4, true) / COORD_SCALE,
      crateType: view.getUint8(offset + 6),
      rarity: view.getUint8(offset + 7),
    });
    offset += CRATE_STRIDE;
  }

  /*
   * Geschütze stehen NACH den Kisten — die Reihenfolge muss zu encodeSnapshot
   * passen. Sie sind ein Spielzustand: Ohne sie wäre ein aufgestelltes Geschütz
   * online unsichtbar, und sein Besitzer hätte einen unsichtbaren Angreifer.
   */
  const turrets = [];
  for (let i = 0; i < turretCount; i++) {
    if (offset + TURRET_STRIDE > view.byteLength) break;
    turrets.push({
      entityId: view.getUint16(offset, true),
      x: view.getInt16(offset + 2, true) / COORD_SCALE,
      y: view.getInt16(offset + 4, true) / COORD_SCALE,
      teamId: view.getUint8(offset + 6),
      roundsLeft: view.getUint8(offset + 7),
    });
    offset += TURRET_STRIDE;
  }

  /*
   * Günther steht NACH den Geschützen, seine Haufen danach — die Reihenfolge muss
   * zu encodeSnapshot passen. Er wird im Zustand ausdrücklich mitgeführt, weil er
   * sonst online unsichtbar wäre: Der Client konnte ihn nicht erfinden, sah aber
   * sehr wohl seine Wirkung (Schaden, verlangsamte Bewegung) — ein Angreifer und
   * Verlangsamer ohne Ursache im Bild.
   *
   * Die Anzeige liest genau diese Felder: `aktiv`, `x`, `y`, `richtung` und die
   * Haufenliste. Ein abgeschnittener Puffer liefert einen INAKTIVEN Block statt
   * einer Ausnahme — wie bei Kisten und Geschützen gilt: ein halber Snapshot ist
   * besser als ein Absturz.
   */
  const guenther = { aktiv: false, x: 0, y: 0, richtung: 1, haufen: [] };
  if (offset + GUENTHER_STRIDE <= view.byteLength) {
    guenther.x = view.getInt16(offset, true) / COORD_SCALE;
    guenther.y = view.getInt16(offset + 2, true) / COORD_SCALE;
    guenther.richtung = view.getInt8(offset + 4);
    guenther.aktiv = (view.getUint8(offset + 5) & GUENTHER_FLAG.AKTIV) !== 0;
    offset += GUENTHER_STRIDE;

    for (let i = 0; i < Math.min(poopCount, MAX_WIRE_POOPS); i++) {
      if (offset + GUENTHER_POOP_STRIDE > view.byteLength) break;
      guenther.haufen.push({
        x: view.getInt16(offset, true) / COORD_SCALE,
        y: view.getInt16(offset + 2, true) / COORD_SCALE,
      });
      offset += GUENTHER_POOP_STRIDE;
    }
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
    crates,
    turrets,
    guenther,
    previous: nextPrevious,
  };
}

/** Erzeugt eine JSON-Steuernachricht mit Protokollversion. */
export function controlMessage(type, payload = {}) {
  return JSON.stringify({ v: PROTOCOL_VERSION, t: type, ...payload });
}

/* ---------------------------------------------------------------------------
 * SENDEFILTER FÜR DEN EREIGNISKANAL
 * ---------------------------------------------------------------------------
 *
 * ## Der Befund, der zu diesem Block führte
 *
 * Der Server schickte JEDES Motorereignis ungefiltert an alle Clients
 * (`gameServer.js`: Schleife über `consumeEvents()`). Gemessen bei vier Figuren
 * auf der Karte `hills`: 3428 `landed`-Nachrichten in 100 s (34,3/s) = 143,9 von
 * 165,8 KB der Steuerlast (86,8 %). Bei 40 Figuren auf `flooded` waren es
 * 1147 Nachrichten/s = 94,65 KB/s JE CLIENT — gegen 12,48 KB/s Snapshot, also
 * Ursache ist KEIN Spielgeschehen, sondern ein Bounce-Artefakt: Eine stehende
 * Figur pendelt um 4 px, und der Bodenkontakt wechselt dabei 17-mal in 120
 * Takten (gemessen: alle 7 Takte, Median 7). Jeder Wechsel erzeugt ein `landed`.
 *
 * Im Browser hatte das eine Folge, die den Spieler wirklich trifft: Das
 * HUD-Protokoll führt 60 Zeilen (`src/client/hud.js`). Bei ~34 Landungen/s läuft
 * es in unter zwei Sekunden durch — eine wichtige Servermeldung („In der Luft
 * ist kein erster Sprung möglich") war damit faktisch unsichtbar.
 *
 * ## Was hier entschieden wird — und was ausdrücklich NICHT
 *
 * Zwei Mengen, und jede Ereignisart des Motors steht in GENAU einer:
 *
 *  - `ZUSTANDSEREIGNISARTEN` tragen Zustand, den der Client sonst nicht
 *    erfährt: Schaden und seine Höhe, Wasserstand und Ertrinken, Zugwechsel,
 *    Terrainzerstörung, Projektile, Tode, Kisten, Waffenbestand. Sie werden
 *    NIE gefiltert — eine verlorene Meldung wäre ein Informationsverlust, kein
 *    Bandbreitengewinn.
 *  - `ANZEIGE_EREIGNISARTEN` sind Blitz, Klang und Protokollzeile. Was sie
 *    nennen, steht bereits im Snapshot: die Positionen der Figuren, den
 *    Wasserstand, die Projektile. Ein verlorenes `landed` nimmt dem Spieler
 *    keine Information über den Spielzustand — nur eine Zeile im Protokoll.
 *
 * Gedrosselt werden davon die Arten, die NACHWEISLICH wiederholen, ohne dass
 * sich etwas geändert hat (`GEDROSSELTE_EREIGNISARTEN`, siehe dort). Die
 * übrigen Anzeigearten sind so selten (unter 0,05/s gemessen), dass eine Drossel
 * nichts einspart und nur Risiko wäre: Was nichts kostet, muss man auch nicht
 * anfassen.
 *
 * ## Determinismus — warum dieser Filter die Simulation nicht berühren kann
 *
 * Der Filter sitzt HINTER `consumeEvents()`: Die Ereignisse sind zu diesem
 * Zeitpunkt bereits entstanden, die Simulation ist durchgelaufen, der
 * Zufallsstrom ist verbraucht. Hier wird nur noch entschieden, was auf die
 * Leitung geht. Replays zeichnen EINGABEN auf, nicht Ereignisse
 * (`src/engine/replay.js`) — die Wiedergabegleichheit hängt damit nicht an
 * diesem Filter. `tests/event-coverage.test.js` weist beides nach: kein
 * Importeur unter `src/engine/`, und zwei identische Matches (mit und ohne
 * Filter) liefern denselben Zustandshash.
 */

/**
 * Ereignisarten, die NUR die Anzeige bedienen (Blitz, Klang, Protokollzeile).
 *
 * Jede dieser Arten steht in genau EINER der beiden Mengen; die Vollständigkeit
 * prüft `tests/event-coverage.test.js` gegen die tatsächlich emittierten Arten,
 * damit die Einteilung nicht still veraltet.
 */
export const ANZEIGE_EREIGNISARTEN = Object.freeze([
  'landed',
  'jumped',
  'crate_landed',
  'projectile_impact',
  'projectile_expired',
  'projectile_pierced',
  'explosion',
  'hitscan',
  'special_effect',
  'fuse_armed',
  'fuse_expired',
  'guenther_wheel',
  'guenther_pee',
  'guenther_poop',
  'guenther_poop_hit',
]);

/**
 * Ereignisarten, die ZUSTAND tragen — sie werden nie gefiltert.
 *
 * Die Aufzählung ist absichtlich vollständig statt „alles außer Anzeige": Wer
 * eine neue Ereignisart einführt, muss sie hier eintragen und dabei einmal
 * entscheiden, ob sie Zustand trägt. Ein Filter, der unbekannte Arten still
 * durchwinkt, wäre die zweite Regel an einer zweiten Stelle.
 */
export const ZUSTANDSEREIGNISARTEN = Object.freeze([
  'crate_pickup',
  'crate_pickup_blocked',
  'damage',
  'death',
  'dot_applied',
  'dot_tick',
  'drowning',
  'entity_in_water',
  'fall_damage',
  'frozen',
  'heal',
  'karte_unerreichbar',
  'loot_error',
  'maelstrom_contract',
  'match_over',
  'projectile_spawn',
  'pulled',
  'round_crates',
  'round_start',
  'shield_absorbed',
  'shot',
  'terrain_destroyed',
  'toxic_rain',
  'turn_end',
  'turn_skipped',
  'turn_start',
  'turret_deployed',
  'turret_expired',
  'turret_fired',
  'water_pushed',
  'weapon_cooldown',
  'weapon_dropped',
]);

/**
 * Die gedrosselten Arten — die Schnittmenge aus „reine Anzeige" und
 * „wiederholt sich nachweislich".
 *
 * Alle drei sind BODENKONTAKT-Meldungen: Eine Figur (oder eine abgeworfene
 * Kiste) meldet ihre Landung. Genau dieser Übergang flattert bei einer
 * STEHENDEN Figur — gemessen 17 Landungen in 120 Takten (alle 7 Takte), ohne
 * dass sich die Figur bewegt.
 *
 * Warum das keinen echten Vorgang verschluckt: Die erste Meldung je Fenster geht
 * IMMER raus (siehe `durchlassen`) — es bleibt also sichtbar, DASS gelandet
 * wurde. Ein zweiter ECHTER Bodenkontakt derselben Figur kann innerhalb des
 * Fensters gar nicht stattfinden: Zwischen zwei echten Landungen liegt immer
 * eine Flugphase, und die ist länger als das Fenster (gemessen: ein Sprung
 * dauert 50 Takte bis zur Landung — siehe `EREIGNIS_DROSSEL_TAKTE`).
 */
export const GEDROSSELTE_EREIGNISARTEN = Object.freeze([
  'landed',
  'jumped',
  'crate_landed',
]);

/**
 * Länge des Wiederholungsfensters in Takten (60 Hz ⇒ 30 Takte = 0,5 s).
 *
 * Untergrenze: Das Bounce-Artefakt wiederholt sich alle 7 Takte. Das Fenster ist
 * damit gut viermal so lang wie die Störung und schluckt sie zuverlässig —
 * gemessen sinkt `landed` bei vier Figuren von 3428 auf 688 Nachrichten in 100 s
 * (34,3/s auf 6,9/s), bei 40 Figuren von 34283 auf 6880 (342,8/s auf 68,8/s).
 *
 * Obergrenze: Das Fenster muss KÜRZER sein als die kürzeste echte Flugphase,
 * sonst verschluckte es eine echte Landung. Gemessen dauert ein Sprung 50 Takte
 * bis zum `landed` (0,83 s, auf `hills` und `flooded` gleich), und ein zweiter
 * Sprung ist erst nach dem Landen möglich. 30 Takte liegen damit mit Abstand
 * unter dem kürzesten echten Folgeereignis derselben Figur.
 *
 * Beide Zahlen stammen aus `docs/ereigniskanal-filter.md` (Messläufe 1–5).
 */
export const EREIGNIS_DROSSEL_TAKTE = 30;

/**
 * Die Kennung, auf die sich ein Wiederholungsfenster bezieht.
 *
 * Gedrosselt wird je ART UND FIGUR — zwei verschiedene Figuren, die im selben
 * Takt landen, dürfen sich nicht gegenseitig die Meldung wegnehmen. Gesucht
 * wird das erste Feld, das die handelnde Einheit benennt; fehlt es (Meldung
 * ohne Einheit), gilt die Art als Ganzes als eine Kennung.
 */
function fensterKennung(nutzlast) {
  for (const feld of ['playerId', 'entityId', 'crateId', 'turretId']) {
    const wert = nutzlast?.[feld];
    if (wert !== undefined && wert !== null) return String(wert);
  }
  return '';
}

/**
 * Sendefilter für den Ereigniskanal: drosselt Wiederholungen, zählt mit.
 *
 * ## Warum eine Klasse und nicht eine Funktion
 *
 * Die Drossel braucht GEDÄCHTNIS: den letzten Takt je Art und Figur. Dieses
 * Gedächtnis gehört zu EINER Partie — zwei Lobbys mit eigenen Taktzählern
 * dürfen sich nicht dieselben Fenster teilen. Die Instanz lebt deshalb in der
 * Sitzung (`LobbySession`), nicht im Modul.
 *
 * ## Die Regeln im Einzelnen
 *
 *  - Die erste Meldung einer Art je Figur geht immer raus.
 *  - Weitere derselben Art und Figur erst wieder nach `drosselTakte` Takten.
 *  - Zustandsarten und unbekannte Arten laufen UNGEKUERZT durch.
 *  - Ohne Taktangabe (`takt` fehlt oder ist keine Zahl) wird NICHT gedrosselt:
 *    Eine verlorene Meldung ist schlimmer als eine überflüssige.
 */
export class EreignisSendefilter {
  #drosselTakte;
  #gedrosselt;
  #letzterTakt = new Map();
  #zaehler = new Map();

  /**
   * @param {object} [optionen]
   * @param {number} [optionen.drosselTakte] Fensterlänge in Takten
   * @param {Iterable<string>} [optionen.gedrosselt] zu drosselnde Arten.
   *   `[]` schaltet die Drossel ab — genau das ist die VORHER-Messung des
   *   Berichts: derselbe Server, dieselbe Sitzung, nur ohne Drossel.
   */
  constructor({ drosselTakte = EREIGNIS_DROSSEL_TAKTE, gedrosselt = GEDROSSELTE_EREIGNISARTEN } = {}) {
    if (!Number.isFinite(drosselTakte) || drosselTakte < 1) {
      throw new TypeError('Das Drosselfenster muss mindestens einen Takt betragen');
    }
    this.#drosselTakte = Math.round(drosselTakte);
    this.#gedrosselt = new Set(gedrosselt);
  }

  /** Ist diese Art gedrosselt? (Anzeige) */
  drosselt(art) {
    return this.#gedrosselt.has(art);
  }

  /** Fensterlänge in Takten. */
  get drosselTakte() {
    return this.#drosselTakte;
  }

  #zaehlerFuer(art) {
    let eintrag = this.#zaehler.get(art);
    if (!eintrag) {
      eintrag = { art, empfangen: 0, gesendet: 0, unterdrueckt: 0 };
      this.#zaehler.set(art, eintrag);
    }
    return eintrag;
  }

  /**
   * Darf diese Meldung raus?
   *
   * @param {string} art Ereignisart (wird die `t` der Steuernachricht)
   * @param {object} [nutzlast] Felder des Ereignisses (Kennung der Figur)
   * @param {number} [takt] Takt der Simulation, in dem das Ereignis anfiel
   * @returns {boolean} true = senden, false = unterdrückt
   */
  durchlassen(art, nutzlast = {}, takt = null) {
    const zaehler = this.#zaehlerFuer(art);
    zaehler.empfangen += 1;

    if (this.#gedrosselt.has(art) && Number.isFinite(takt)) {
      const schluessel = `${art}\u0000${fensterKennung(nutzlast)}`;
      const letzter = this.#letzterTakt.get(schluessel);
      if (letzter !== undefined && takt - letzter < this.#drosselTakte) {
        zaehler.unterdrueckt += 1;
        return false;
      }
      this.#letzterTakt.set(schluessel, takt);
    }

    zaehler.gesendet += 1;
    return true;
  }

  /**
   * Die eigenen Zahlen — je Art, absteigend nach unterdrückten Meldungen.
   *
   * Sie sind der Beleg, dass der Filter wirkt: Ohne sie wäre „der Kanal ist
   * jetzt ruhiger" eine Behauptung. Der Bericht
   * (`docs/ereigniskanal-filter.md`) druckt genau diese Liste ab.
   *
   * @returns {Array<{art: string, empfangen: number, gesendet: number, unterdrueckt: number}>}
   */
  zahlen() {
    return [...this.#zaehler.values()]
      .map(eintrag => ({ ...eintrag }))
      .sort((a, b) => b.unterdrueckt - a.unterdrueckt || a.art.localeCompare(b.art));
  }

  /** Summe über alle Arten. */
  summe() {
    const summe = { empfangen: 0, gesendet: 0, unterdrueckt: 0 };
    for (const eintrag of this.#zaehler.values()) {
      summe.empfangen += eintrag.empfangen;
      summe.gesendet += eintrag.gesendet;
      summe.unterdrueckt += eintrag.unterdrueckt;
    }
    return summe;
  }
}


/**
 * Erzeugt die Delta-Basis aus einem Match-State — in genau der Rohform, die
 * encodeSnapshot/decodeSnapshot erwarten.
 *
 * Wichtig: NICHT von Hand eine Map mit Weltkoordinaten bauen. Der Vergleich
 * läuft auf den skalierten Ganzzahlen; unskalierte Werte führen dazu, dass der
 * Encoder jede Position als "geändert" meldet und das Delta nichts spart.
 *
 * Günther steht hier bewusst NICHT drin — wie Kisten und Geschütze ist er nicht
 * deltafähig: Er bewegt sich bei jedem Takt, und „ein Haufen ist dazugekommen"
 * bräuchte Kennungen und Entfernungsmeldungen, die mehr kosten als sie sparen.
 *
 * @param {object} state - MatchController.getState()
 * @returns {Map<number, object>} Rohwerte je Entity-ID (Position, Gesundheit,
 *   Leben, Schild, Einfrierdauer, Wasserstand)
 */
export function toDeltaBase(state) {
  const base = new Map();
  for (const entity of state.entities ?? []) {
    base.set(entity.entityId, {
      xRaw: clampInt16((entity.x ?? 0) * COORD_SCALE),
      yRaw: clampInt16((entity.y ?? 0) * COORD_SCALE),
      healthRaw: clampInt16((entity.health ?? 0) * HEALTH_SCALE),
      alive: Boolean(entity.alive),
      shieldRaw: Math.max(0, Math.min(255, Math.round(entity.shield ?? 0))),
      frozenRaw: Math.max(0, Math.min(
        MAX_WIRE_FREEZE_TURNS,
        Math.round(entity.frozenTurns ?? 0),
      )),
      waterRaw: toWireWaterLevel(entity.waterLevel ?? 0),
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

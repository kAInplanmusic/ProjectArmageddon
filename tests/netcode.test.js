import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeSnapshot,
  decodeSnapshot,
  controlMessage,
  parseControlMessage,
  PROTOCOL_VERSION,
  MAGIC,
  MESSAGE_TYPE,
  DIRTY,
  SNAPSHOT_FLAG,
  toDeltaBase,
  // Nicht die 22 von Hand schreiben: Die Kopfgröße ist eine Entscheidung des
  // Drahtformats und wird dort gepflegt. Ein Literal hier bricht bei jeder
  // Erweiterung — so geschehen beim Kistenfeld in v5.
  HEADER_SIZE,
  CRATE_STRIDE,
} from '../src/shared/protocol.js';
import { SnapshotHistory } from '../src/server/lagCompensation.js';
import { LobbyManager, LOBBY_STATUS } from '../src/server/lobby.js';
import { BotController } from '../src/server/bot.js';
import { MatchController } from '../src/engine/match.js';
import { validateCommand, isTickInWindow } from '../src/shared/validation.js';
import { SeededRandom } from '../src/shared/prng.js';

test('Snapshot-Protokoll kodiert und dekodiert verlustarm', () => {
  const state = {
    tick: 12345,
    round: 7,
    wind: -0.03125,
    activePlayerId: 3,
    entities: [
      { entityId: 1, teamId: 0, alive: true, x: 256.5, y: 380.25, health: 96.5, isActiveTurn: false },
      { entityId: 3, teamId: 1, alive: true, x: 1024.75, y: 443.5, health: 62.5, isActiveTurn: true },
      { entityId: 4, teamId: 1, alive: false, x: 0, y: 0, health: 0, isActiveTurn: false },
    ],
    projectiles: [{ entityId: 9, x: 640.5, y: 120.25 }],
  };

  const buffer = encodeSnapshot(state);
  // Portables Binärformat: Uint8Array (Browser) statt Node-only Buffer.
  assert.ok(buffer instanceof Uint8Array);
  assert.equal(buffer[0], MAGIC[0]);
  assert.equal(buffer[1], MAGIC[1]);
  assert.equal(buffer[2], PROTOCOL_VERSION);
  assert.equal(buffer[3], MESSAGE_TYPE.SNAPSHOT);

  const decoded = decodeSnapshot(buffer);
  assert.equal(decoded.tick, 12345);
  assert.equal(decoded.round, 7);
  assert.ok(Math.abs(decoded.wind - (-0.03125)) < 1e-6);
  assert.equal(decoded.activePlayerId, 3);
  assert.equal(decoded.entities.length, 3);
  assert.equal(decoded.entities[0].x, 256.5);
  assert.equal(decoded.entities[0].health, 96.5);
  assert.equal(decoded.entities[1].isActiveTurn, true);
  assert.equal(decoded.entities[2].alive, false);
  assert.equal(decoded.projectiles.length, 1);
  assert.equal(decoded.projectiles[0].y, 120.25);

  // Dieselben Bytes müssen auch als Node-Buffer dekodierbar sein.
  const fromNodeBuffer = decodeSnapshot(Buffer.from(buffer));
  assert.equal(fromNodeBuffer.tick, decoded.tick);
  assert.equal(fromNodeBuffer.entities.length, decoded.entities.length);

  // Binärformat muss deutlich kompakter sein als JSON.
  const jsonSize = Buffer.byteLength(JSON.stringify(state));
  assert.ok(buffer.length < jsonSize / 2, `Binärgrösse ${buffer.length} vs JSON ${jsonSize}`);
});

test('Snapshot-Dekoder lehnt ungültige Puffer ab', () => {
  assert.equal(decodeSnapshot(Buffer.from('nope')), null);
  assert.equal(decodeSnapshot(Buffer.from([0x50, 0x41, 99, 1, 0, 0, 0, 0])), null);
  assert.equal(decodeSnapshot(null), null);
});

test('Steuernachrichten sind versioniert und robust geparst', () => {
  const message = controlMessage('input', { angle: 1, power: 50 });
  const parsed = parseControlMessage(message);
  assert.equal(parsed.v, PROTOCOL_VERSION);
  assert.equal(parsed.t, 'input');
  assert.equal(parsed.power, 50);
  assert.equal(parseControlMessage('kein json'), null);
  assert.equal(parseControlMessage('{"x":1}'), null);
});

test('Lag-Kompensation hält nur das konfigurierte Fenster', () => {
  const history = new SnapshotHistory({ windowMs: 200, tickDurationMs: 1000 / 60 });
  assert.equal(history.windowTicks, 12);

  for (let tick = 0; tick < 60; tick++) {
    history.push(tick, { tick });
  }

  assert.ok(history.size <= history.windowTicks + 1);
  assert.equal(history.latest.tick, 59);
  assert.equal(history.get(59).tick, 59);
  // Zu alte Ticks wurden verworfen: der älteste Eintrag muss nahe am Fenster liegen.
  assert.ok(history.get(0) === null || history.get(0).tick >= 47);
  assert.equal(history.isWithinWindow(55, 59), true);
  assert.equal(history.isWithinWindow(10, 59), false);
  assert.equal(history.isWithinWindow(70, 59), false);
});

test('Lobby verwaltet Plätze, Kapazität und Wiederverbindung', () => {
  const lobbies = new LobbyManager();
  const { lobby, player } = lobbies.create({ teams: 2, playersPerTeam: 2, preset: 'islands', hostName: 'Anna' });

  assert.equal(lobby.capacity, 4);
  assert.equal(lobby.occupied, 1);
  assert.equal(lobby.connected, 1);
  assert.equal(lobby.preset, 'islands');
  assert.equal(player.resumed, false);
  assert.ok(player.token);

  const second = lobbies.join(lobby.id, { name: 'Ben' });
  assert.equal(lobbies.describe(lobby.id).occupied, 2);
  assert.equal(second.seatIndex, 1);
  assert.equal(lobbies.describe(lobby.id).seats[1].teamId, 1);

  // Wiederverbindung mit Token belegt keinen neuen Platz.
  const resumed = lobbies.join(lobby.id, { token: player.token });
  assert.equal(resumed.resumed, true);
  assert.equal(lobbies.describe(lobby.id).occupied, 2);

  lobbies.join(lobby.id, { name: 'Cara' });
  lobbies.join(lobby.id, { name: 'Dan' });
  assert.throws(() => lobbies.join(lobby.id, { name: 'Eve' }), /voll/);

  // Disconnect + Reconnect-Fenster
  lobbies.disconnect(lobby.id, second.token);
  assert.equal(lobbies.describe(lobby.id).seats[1].connected, false);
  assert.equal(lobbies.describe(lobby.id).connected, 3);
  assert.equal(lobbies.pruneDisconnected(Date.now()).length, 0);
  assert.equal(lobbies.pruneDisconnected(Date.now() + 60_000).length, 1);

  lobbies.markRunning(lobby.id);
  assert.equal(lobbies.get(lobby.id).status, LOBBY_STATUS.RUNNING);
  assert.throws(() => lobbies.join(lobby.id, { name: 'Eve' }), /auf/);
});

test('Lag-Kompensation und Bot-Auswahl funktionieren im Match', () => {
  const match = new MatchController({ seed: 1234, teams: 2, playersPerTeam: 2 });
  match.start();

  const bot = new BotController({ rng: new SeededRandom(42), skill: 0.7 });
  const active = match.activePlayerId;
  const shot = bot.chooseShot(match, active);

  assert.ok(shot);
  assert.ok(shot.angle >= 0 && shot.angle <= Math.PI);
  assert.ok(shot.power >= 20 && shot.power <= 100);

  const result = match.fire(active, shot.angle, shot.power);
  assert.equal(result.ok, true);
});

test('Servervalidierung blockiert fremde, ungültige und veraltete Befehle', () => {
  const known = [1, 2, 3, 4];

  // Nicht am Zug
  assert.equal(validateCommand(
    { playerId: 2, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Unbekannter Spieler
  assert.equal(validateCommand(
    { playerId: 99, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 99, knownPlayerIds: known }
  ).valid, false);

  // Kraft ausserhalb der Grenzen
  assert.equal(validateCommand(
    { playerId: 1, angle: 1, power: 500, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Winkel ausserhalb der Grenzen
  assert.equal(validateCommand(
    { playerId: 1, angle: 9, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Unbekannte Waffe
  assert.equal(validateCommand(
    { playerId: 1, angle: 1, power: 50, weaponId: 'cheat_gun', tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  ).valid, false);

  // Gültiger Befehl geht durch
  const valid = validateCommand(
    { playerId: 1, angle: 1, power: 50, tick: 10 },
    { currentTick: 10, activePlayerId: 1, knownPlayerIds: known }
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.input.power, 50);

  assert.equal(isTickInWindow(10, 10), true);
  assert.equal(isTickInWindow(400, 500), true);
  // Drift von 490 Ticks liegt ausserhalb des 400-Tick-Fensters.
  assert.equal(isTickInWindow(10, 500), false);
  assert.equal(isTickInWindow(10, 5000), false);
});

test('Protokoll überträgt die Restzugzeit', () => {
  const state = {
    tick: 500,
    round: 3,
    wind: 0.01,
    activePlayerId: 1,
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 10, y: 20, health: 100, isActiveTurn: true }],
    projectiles: [],
  };

  const buffer = encodeSnapshot(state, { turnRemainingMs: 24_500 });
  const decoded = decodeSnapshot(buffer);

  /*
   * Mindestversion statt fester Zahl: „die Restzugzeit ist im Drahtformat" gilt
   * ab v1, der Wasserstand ab v4, die Kisten ab v5. Eine feste Zahl bricht bei
   * jeder Erweiterung, ohne etwas auszusagen — die MINDESTversion sagt, was der
   * Test eigentlich braucht.
   */
  assert.ok(PROTOCOL_VERSION >= 1, `Protokollversion ${PROTOCOL_VERSION}`);
  assert.ok(Math.abs(decoded.turnRemainingMs - 24_500) < 100, `Zugzeit: ${decoded.turnRemainingMs}`);
  assert.equal(decoded.isFull, true, 'Ohne vorherigen Zustand muss es ein Vollsnapshot sein');
  assert.equal(buffer[2], PROTOCOL_VERSION, `Versionsbyte muss ${PROTOCOL_VERSION} sein`);
});

test('Delta-Encoding markiert unveränderte Felder und überträgt sie nicht', () => {
  const base = {
    tick: 100,
    round: 1,
    wind: 0,
    activePlayerId: 1,
    entities: [
      { entityId: 1, teamId: 0, alive: true, x: 100, y: 200, health: 90, isActiveTurn: true },
      { entityId: 2, teamId: 1, alive: true, x: 300, y: 200, health: 100, isActiveTurn: false },
    ],
    projectiles: [],
  };

  // Vollsnapshot als Basis.
  const full = decodeSnapshot(encodeSnapshot(base));
  assert.equal(full.isFull, true);

  // Zweiter Zustand: nur Spieler 1 hat sich bewegt.
  const moved = {
    ...base,
    tick: 101,
    entities: [
      { ...base.entities[0], x: 105 },
      { ...base.entities[1] },
    ],
  };
  const deltaBuffer = encodeSnapshot(moved, { previous: full.previous });
  const delta = decodeSnapshot(deltaBuffer, full.previous);

  assert.equal(delta.isFull, false, 'Mit vorherigem Zustand muss es ein Delta sein');
  assert.equal(delta.entities.length, 2);

  // Spieler 1: Position geändert, Gesundheit unverändert.
  assert.equal(delta.entities[0].x, 105);
  assert.equal(delta.entities[0].health, 90);

  // Spieler 2: unverändert → Werte stammen aus dem vorherigen Snapshot.
  assert.equal(delta.entities[1].x, 300);
  assert.equal(delta.entities[1].y, 200);
  assert.equal(delta.entities[1].health, 100);
  assert.equal(delta.entities[1].alive, true);

  // Das Delta darf nie größer sein als der Vollsnapshot.
  assert.ok(deltaBuffer.length <= encodeSnapshot(moved).length);
});

test('Delta ohne vorherigen Zustand liefert weiterhin korrekte Werte', () => {
  const state = {
    tick: 10,
    round: 1,
    wind: 0,
    activePlayerId: 2,
    entities: [
      { entityId: 1, teamId: 0, alive: false, x: 0, y: 0, health: 0, isActiveTurn: false },
      { entityId: 2, teamId: 1, alive: true, x: 640, y: 360, health: 55, isActiveTurn: true },
    ],
    projectiles: [],
  };
  // Delta-Basis über den offiziellen Helfer: enthält nur Spieler 1, Spieler 2
  // ist dem Client unbekannt und muss vollständig ankommen.
  const previous = toDeltaBase({
    entities: [{ entityId: 1, x: 999, y: 999, health: 999, alive: true }],
  });
  assert.equal(previous.has(2), false, 'Spieler 2 darf nicht in der Basis sein');

  // Ein Delta senden, obwohl der Client Spieler 2 noch nie gesehen hat: seine
  // Werte müssen vollständig ankommen, nicht als 0.
  const delta = decodeSnapshot(encodeSnapshot(state, { previous }), previous);
  const player2 = delta.entities.find(entity => entity.entityId === 2);
  assert.equal(player2.x, 640);
  assert.equal(player2.y, 360);
  assert.equal(player2.health, 55);
  assert.equal(player2.alive, true);
});

test('Tod und Wiederbelebung werden im Delta korrekt markiert', () => {
  const alive = {
    tick: 1, round: 1, wind: 0, activePlayerId: 1,
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 50, y: 60, health: 10, isActiveTurn: true }],
    projectiles: [],
  };
  const first = decodeSnapshot(encodeSnapshot(alive));

  // Tod: alive kippt, Gesundheit auf 0.
  const dead = {
    ...alive, tick: 2,
    entities: [{ ...alive.entities[0], alive: false, health: 0 }],
  };
  const delta = decodeSnapshot(encodeSnapshot(dead, { previous: first.previous }), first.previous);
  assert.equal(delta.entities[0].alive, false);
  assert.equal(delta.entities[0].health, 0);
});

test('dirty-Bits entsprechen den geänderten Feldern', () => {
  const previous = toDeltaBase({
    entities: [{ entityId: 1, x: 100, y: 200, health: 90, alive: true }],
  });
  const state = {
    tick: 5, round: 1, wind: 0, activePlayerId: 1,
    // Nur die Gesundheit ändert sich; Position und alive bleiben gleich.
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 100, y: 200, health: 42, isActiveTurn: true }],
    projectiles: [],
  };
  const buffer = encodeSnapshot(state, { previous });
  const dirty = buffer[HEADER_SIZE + 11];

  assert.equal(dirty & DIRTY.HEALTH, DIRTY.HEALTH, 'Gesundheitsbit muss gesetzt sein');
  assert.equal(dirty & DIRTY.POSITION, 0, 'Positionsbit darf nicht gesetzt sein');
  assert.equal(dirty & DIRTY.ALIVE, 0, 'Alive-Bit darf nicht gesetzt sein');
  assert.equal(buffer[20] | (buffer[21] << 8) & SNAPSHOT_FLAG.FULL, 0, 'Kein Vollsnapshot-Flag');
});


test('Protokoll v3 überträgt Schild und Einfrierdauer', () => {
  const state = {
    tick: 900, round: 4, wind: 0.02, activePlayerId: 1,
    entities: [
      { entityId: 1, teamId: 0, alive: true, x: 10, y: 20, health: 80, shield: 42, frozenTurns: 2 },
      { entityId: 2, teamId: 1, alive: true, x: 30, y: 40, health: 50, shield: 0, frozenTurns: 0 },
    ],
    projectiles: [],
  };

  const decoded = decodeSnapshot(encodeSnapshot(state));

  assert.equal(decoded.entities[0].shield, 42);
  assert.equal(decoded.entities[0].frozenTurns, 2);
  assert.equal(decoded.entities[1].shield, 0);
  assert.equal(decoded.entities[1].frozenTurns, 0);
});

test('Zustände überleben das Delta-Encoding, wenn sie sich ändern', () => {
  const basis = {
    tick: 1, round: 1, wind: 0, activePlayerId: 1,
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 10, y: 20, health: 100, shield: 0, frozenTurns: 0 }],
    projectiles: [],
  };
  const erst = decodeSnapshot(encodeSnapshot(basis));

  // Nur der Zustand ändert sich, Position und Gesundheit bleiben gleich.
  const geaendert = {
    ...basis, tick: 2,
    entities: [{ ...basis.entities[0], shield: 25, frozenTurns: 1 }],
  };
  const deltaBuffer = encodeSnapshot(geaendert, { previous: erst.previous });
  const delta = decodeSnapshot(deltaBuffer, erst.previous);

  assert.equal(delta.isFull, false, 'Es muss ein Delta sein');
  assert.equal(delta.entities[0].shield, 25, 'Der neue Schild muss ankommen');
  assert.equal(delta.entities[0].frozenTurns, 1, 'Die Einfrierdauer muss ankommen');
  assert.equal(delta.entities[0].health, 100, 'Gesundheit aus dem vorherigen Zustand');

  // Das Statusbit muss gesetzt sein, die anderen nicht.
  const dirty = deltaBuffer[HEADER_SIZE + 11];
  assert.equal(dirty & DIRTY.STATUS, DIRTY.STATUS, 'Statusbit muss gesetzt sein');
  assert.equal(dirty & DIRTY.POSITION, 0, 'Positionsbit darf nicht gesetzt sein');
});

test('Unveränderte Zustände werden im Delta nicht als geändert gemeldet', () => {
  const basis = {
    tick: 1, round: 1, wind: 0, activePlayerId: 1,
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 10, y: 20, health: 100, shield: 30, frozenTurns: 2 }],
    projectiles: [],
  };
  const erst = decodeSnapshot(encodeSnapshot(basis));
  const gleich = { ...basis, tick: 2 };

  const deltaBuffer = encodeSnapshot(gleich, { previous: erst.previous });
  const dirty = deltaBuffer[HEADER_SIZE + 11];
  assert.equal(dirty & DIRTY.STATUS, 0, 'Ohne Änderung darf das Statusbit nicht gesetzt sein');

  // Der Client behält die Werte aus dem vorherigen Zustand.
  const delta = decodeSnapshot(deltaBuffer, erst.previous);
  assert.equal(delta.entities[0].shield, 30);
  assert.equal(delta.entities[0].frozenTurns, 2);
});

test('Zustandswerte werden auf das Drahtformat begrenzt', () => {
  const state = {
    tick: 1, round: 1, wind: 0, activePlayerId: 1,
    // Absurd hohe Werte dürfen das Ein-Byte-Feld nicht sprengen.
    entities: [{ entityId: 1, teamId: 0, alive: true, x: 0, y: 0, health: 100, shield: 9999, frozenTurns: 400 }],
    projectiles: [],
  };
  const decoded = decodeSnapshot(encodeSnapshot(state));
  assert.equal(decoded.entities[0].shield, 255, 'Schild wird auf ein Byte begrenzt');
  assert.equal(decoded.entities[0].frozenTurns, 255, 'Einfrierdauer wird auf ein Byte begrenzt');

  // Negative Werte werden zu 0, nicht zu einem Überlauf.
  const negativ = {
    ...state,
    entities: [{ ...state.entities[0], shield: -50, frozenTurns: -3 }],
  };
  const decodedNegativ = decodeSnapshot(encodeSnapshot(negativ));
  assert.equal(decodedNegativ.entities[0].shield, 0);
  assert.equal(decodedNegativ.entities[0].frozenTurns, 0);
});

test('toDeltaBase führt Zustände in der Drahtform', () => {
  const base = toDeltaBase({
    entities: [{ entityId: 1, x: 10, y: 20, health: 100, alive: true, shield: 12, frozenTurns: 1 }],
  });
  const eintrag = base.get(1);
  assert.equal(eintrag.shieldRaw, 12);
  assert.equal(eintrag.frozenRaw, 1);

  // Fehlende Zustände müssen als 0 gelten, nicht als undefined.
  const ohne = toDeltaBase({ entities: [{ entityId: 2, x: 0, y: 0, health: 1, alive: true }] });
  assert.equal(ohne.get(2).shieldRaw, 0);
  assert.equal(ohne.get(2).frozenRaw, 0);
});

// ------------------------------------------------------------------- Kisten

test('Kisten überleben die Kodierung (Protokoll v5)', () => {
  /*
   * Fund (belegt): Der Snapshot übertrug Kisten überhaupt nicht — `encodeSnapshot`
   * kannte nur Figuren und Projektile. Zusammen mit `crates: []` im Client
   * bedeutete das: ONLINE war keine einzige Kiste zu sehen, im lokalen Match
   * dagegen schon. Gemessen mit zwei Browsern an einem echten Server: beide
   * sahen 0 Kisten, obwohl der Server sie führte.
   *
   * Der Test hält beides fest: dass Kisten übertragen werden UND dass die
   * übertragenen Werte ankommen. Ein Test nur auf „Anzahl > 0" hätte eine
   * vertauschte Koordinate nicht bemerkt.
   */
  const state = {
    tick: 12,
    round: 1,
    wind: 0,
    activePlayerId: 1,
    entities: [],
    projectiles: [],
    crates: [
      { entityId: 7, x: 462, y: 350, crateType: 2, rarity: 3 },
      // Krumme Koordinaten: Sie prüfen die Quantisierung auf 0,25 px.
      { entityId: 9, x: 123.25, y: 44.5, crateType: 0, rarity: 0 },
    ],
  };

  const bytes = encodeSnapshot(state);
  const decoded = decodeSnapshot(bytes);

  assert.ok(decoded, 'Dekodierung fehlgeschlagen');
  assert.equal(decoded.crates.length, 2, `${decoded.crates.length} Kisten statt 2`);

  assert.deepEqual(decoded.crates[0], {
    entityId: 7, x: 462, y: 350, crateType: 2, rarity: 3,
  });

  // Die krummen Werte müssen innerhalb der Quantisierung ankommen.
  assert.ok(Math.abs(decoded.crates[1].x - 123.25) <= 0.125, `x: ${decoded.crates[1].x}`);
  assert.ok(Math.abs(decoded.crates[1].y - 44.5) <= 0.125, `y: ${decoded.crates[1].y}`);
  assert.equal(decoded.crates[1].crateType, 0);
  assert.equal(decoded.crates[1].rarity, 0);
});

test('Kisten kosten genau CRATE_STRIDE je Stück', () => {
  const basis = {
    tick: 1, round: 1, wind: 0, activePlayerId: null,
    entities: [], projectiles: [], crates: [],
  };
  const leer = encodeSnapshot(basis).length;

  for (const anzahl of [1, 2, 5]) {
    const crates = Array.from({ length: anzahl }, (_, i) => ({
      entityId: i + 1, x: 100 + i, y: 200, crateType: 1, rarity: 2,
    }));
    assert.equal(encodeSnapshot({ ...basis, crates }).length, leer + anzahl * CRATE_STRIDE,
      `${anzahl} Kisten kosten nicht ${anzahl} × ${CRATE_STRIDE} Byte`);
  }
});

test('Ein Snapshot ohne Kistenfeld bleibt gültig', () => {
  /*
   * Rückwärtsverträglichkeit im Aufruf, nicht auf dem Draht: Manche Aufrufer
   * bauen einen Zustand von Hand (Tests, Werkzeuge) und kennen `crates` nicht.
   * Sie dürfen nicht abstürzen — ein fehlendes Feld ist eine leere Liste.
   * Auf dem Draht schützt die Versionsnummer: Eine ältere Gegenstelle lehnt den
   * Snapshot ab, statt ihn fehlzuinterpretieren.
   */
  const bytes = encodeSnapshot({
    tick: 1, round: 1, wind: 0, activePlayerId: null, entities: [], projectiles: [],
  });
  const decoded = decodeSnapshot(bytes);
  assert.ok(decoded);
  assert.deepEqual(decoded.crates, []);
});

test('Ein abgeschnittener Kistenpuffer wirft nicht', () => {
  // Ein unvollständiger Snapshot darf den Client nicht abstürzen lassen: Er wird
  // verworfen (null) oder liefert, was vollständig da ist.
  const bytes = encodeSnapshot({
    tick: 1, round: 1, wind: 0, activePlayerId: null, entities: [], projectiles: [],
    crates: [{ entityId: 1, x: 10, y: 20, crateType: 0, rarity: 0 }],
  });

  const abgeschnitten = bytes.slice(0, bytes.length - 3);
  const decoded = decodeSnapshot(abgeschnitten);
  // Entweder abgelehnt oder mit leerer Kistenliste — beides ist in Ordnung,
  // ein Wurf wäre es nicht.
  if (decoded) {
    assert.equal(decoded.crates.length, 0, 'Ein halber Eintrag wurde übernommen');
  }
});

test('Die Delta-Basis führt Kisten nicht mit — sie sind nicht deltafähig', () => {
  /*
   * Kisten werden bei jedem Snapshot vollständig übertragen. Das ist eine
   * bewusste Entscheidung: Ihre Zahl ist klein (wenige Stück), und „dieselbe
   * Kiste bewegt sich" ist der einzige Änderungsfall — ein Delta bräuchte
   * Kennungen und Entfernungsmeldungen, die mehr kosten als sie sparen.
   *
   * Der Test hält fest, dass `toDeltaBase` keine Kisten erfindet: Wer dort
   * später welche ergänzt, muss den Encoder mitziehen.
   */
  const basis = toDeltaBase({
    entities: [], projectiles: [],
    crates: [{ entityId: 1, x: 10, y: 20, crateType: 0, rarity: 0 }],
  });
  assert.equal(basis.has(1), false, 'toDeltaBase hat eine Kiste als Figur aufgenommen');
});

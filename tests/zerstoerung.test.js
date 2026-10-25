import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { CollisionMask, eachCraterCell, kraterForm, kraterInnen } from '../src/engine/terrain/collisionMask.js';
import { Zerstoerung, spaltenlaeufe } from '../src/engine/zerstoerung.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/world.js';
import {
  ZERSTOERUNG_ALT, ZERSTOERUNG_GELAENDE, ZERSTOERUNG_SCHOLLEN, ZERSTOERUNG_STANDARD, normalisiereZerstoerung,
  kraterTiefeProzent, INSEL_MAX_ZELLEN, INSEL_MAX_ZELLEN_SCHOLLEN, SUCH_BUDGET_PRO_TICK, suchGrenzen,
} from '../src/shared/config/zerstoerung.js';
import { restoreLobby } from '../src/server/persistence.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { WAFFEN_ALT } from '../src/shared/config/waffen-fassung.js';
import { KISTEN_ALT, KISTEN_OFT } from '../src/shared/config/kisten.js';
import {
  applyLogEntryToTerrain, buildTerrainForSeed, bewerteTerrainHash,
} from '../src/client/terrainPreview.js';
import { kraterUmriss } from '../src/client/zerstoerungOptik.js';
import { PLAYER_HALF_HEIGHT } from '../src/shared/config/player.js';

/**
 * Zerstörung ab Fassung 2: raue Krater, Nachrutschen freischwebender Geländeinseln,
 * fallende Objekte. Die Altfassung (Kopf OHNE `zerstoerung`) bleibt Bit für Bit
 * wie vor dem Umbau.
 */

/** Alle Zellen eines Kraters als sortierte Schlüssel. */
function zellen(x, y, radius, tiefe) {
  const liste = [];
  eachCraterCell(400, 300, x, y, radius, (px, py) => liste.push(py * 400 + px), tiefe);
  return liste.sort((a, b) => a - b);
}

test('Altfassung: ohne Tiefe ist der Krater Zelle für Zelle der alte Kreis', () => {
  for (const radius of [2, 5, 18, 40]) {
    const alt = [];
    for (let dy = -radius; dy <= radius; dy++) {
      const dx = Math.sqrt(radius * radius - dy * dy);
      for (let ix = -Math.floor(dx); ix <= Math.floor(dx); ix++) {
        const px = Math.round(200 + ix);
        const py = Math.round(150 + dy);
        if (ix * ix + dy * dy <= radius * radius) alt.push(py * 400 + px);
      }
    }
    assert.deepEqual(zellen(200, 150, radius, null), alt.sort((a, b) => a - b), `Radius ${radius}`);
  }
});

test('Raue Krater: deterministisch, nicht rund, Fläche nahe am Kreis, kleine bleiben glatt', () => {
  const a = zellen(200, 150, 30, 100);
  assert.deepEqual(a, zellen(200, 150, 30, 100), 'gleiche Eingabe, gleiche Zellen');
  assert.notDeepEqual(a, zellen(200, 150, 30, null), 'der Rand weicht vom Kreis ab');
  assert.notDeepEqual(a, zellen(201, 150, 30, 100).map(k => k - 1), 'der Ort ist Teil des Samens: andere Stelle, anderer Rand');
  const verhaeltnis = a.length / (Math.PI * 30 * 30);
  assert.ok(verhaeltnis > 0.85 && verhaeltnis < 1.15, `Fläche ${verhaeltnis.toFixed(3)} des Kreises`);
  // Unter Radius 8 gibt es keine Rauheit: Tiefe 100 ergibt wieder den Kreis.
  assert.deepEqual(zellen(200, 150, 6, 100), zellen(200, 150, 6, null));
  // Die Form hängt nur an vier Ganzzahlen und verwendet keine Winkelfunktion.
  const form = kraterForm(200, 150, 30, 100);
  assert.equal(kraterInnen(form, 0, 0), true);
  assert.equal(kraterInnen(form, 60, 0), false);
});

test('Tiefe nach Waffe: grabende Waffen reichen tiefer als reine Sprengwaffen', () => {
  assert.equal(kraterTiefeProzent(35, 0, 35), 135, 'Spaten: nur terrainDamage');
  assert.equal(kraterTiefeProzent(50, 50, 50), 115, 'Meteor: beides');
  assert.equal(kraterTiefeProzent(0, 48, 29), 85, 'Granate: nur Flächenradius');
  assert.equal(kraterTiefeProzent(0, 0, 4), 100, 'winziges Loch bleibt rund');
  const tiefste = tiefe => Math.max(...zellen(200, 150, 40, tiefe).map(k => Math.floor(k / 400))) - 150;
  assert.ok(tiefste(135) > tiefste(85) * 1.2, `${tiefste(135)} px gegen ${tiefste(85)} px`);
});

test('Der Umriss der Anzeige liegt auf dem Rand der Kollisionsmaske', () => {
  for (const tiefe of [85, 100, 135]) {
    const form = kraterForm(200, 150, 36, tiefe);
    for (const p of kraterUmriss(200, 150, 36, tiefe)) {
      const dx = p.x - 200;
      const dy = p.y - 150;
      assert.equal(kraterInnen(form, dx * 0.97, dy * 0.97), true, `innen (Tiefe ${tiefe})`);
      assert.equal(kraterInnen(form, dx * 1.03, dy * 1.03), false, `außen (Tiefe ${tiefe})`);
    }
  }
});

/* ------------------------------------------------------------ Versionsmarke */

function lauf(optionen, ticks = 5000) {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', ...optionen });
  match.start();
  let schuesse = 0;
  const arten = {};
  for (let tick = 0; tick < ticks; tick++) {
    if (match.activeProjectileCount === 0 && tick % 120 === 0) {
      match.fire(match.activePlayerId, 0.5 + (schuesse % 9) * 0.15, 40 + (schuesse * 13) % 50, null);
      schuesse += 1;
    }
    match.step();
    for (const e of match.consumeEvents()) arten[e.type] = (arten[e.type] ?? 0) + 1;
  }
  return { match, arten };
}

test('Determinismus: zwei Läufe gleichen Seeds ergeben dieselbe Maske, Log und Zustandshash', () => {
  const a = lauf({});
  const b = lauf({});
  assert.equal(a.match.zerstoerung, ZERSTOERUNG_STANDARD);
  assert.ok(a.match.terrain.craterCount >= 10, 'Testaufbau: es müssen Krater entstanden sein');
  assert.equal(a.match.terrain.hash(), b.match.terrain.hash());
  assert.equal(a.match.stateHash(), b.match.stateHash());
  assert.deepEqual(a.match.terrain.craterLog, b.match.terrain.craterLog);
  assert.ok(a.match.terrain.craterLog.every(e => e.length === 4 || e[0] === 's'), 'Fassung 2 loggt die Tiefe mit');
});

test('Fassung 2 (Zwischenstand): Zustands- und Maskenhash bleiben Bit für Bit wie auf main (Goldwerte, gemessen am Stand e350c29)', () => {
  const gold = [
    { seed: 4242, stateHash: '85bd9975', terrainHash: 2599208668, krater: 30 },
    { seed: 606, stateHash: 'e331aaaa', terrainHash: 1925442896, krater: 31 },
    { seed: 31, stateHash: 'e22f0a55', terrainHash: 2205927199, krater: 31 },
    { seed: 9001, stateHash: 'afa508f1', terrainHash: 3786376531, krater: 32 },
  ];
  for (const g of gold) {
    const m = new MatchController({ seed: g.seed, teams: 2, playersPerTeam: 2, preset: 'hills', valhallaRound: 999, zerstoerung: ZERSTOERUNG_GELAENDE, kit: KIT_FLAECHE, waffen: WAFFEN_ALT, kisten: KISTEN_ALT, schaden: 1 });
    m.start();
    let schuesse = 0;
    for (let tick = 0; tick < 6000; tick++) {
      if (m.activeProjectileCount === 0 && tick % 120 === 0) {
        m.fire(m.activePlayerId, 0.5 + (schuesse % 9) * 0.15, 40 + (schuesse * 13) % 50, null);
        schuesse += 1;
      }
      m.step();
      m.consumeEvents();
    }
    assert.equal(m.stateHash(), g.stateHash, `Seed ${g.seed}`);
    assert.equal(m.terrain.hash(), g.terrainHash, `Seed ${g.seed}`);
    assert.equal(m.terrain.craterCount, g.krater, `Seed ${g.seed}`);
  }
});

test('Altfassung: ohne Marke läuft das Match Bit für Bit wie vor dem Umbau (Goldwerte von main)', () => {
  // Zustandshash und Maskenhash, gemessen mit dem Stand VOR dieser Änderung (git main, 2026-10-14).
  const gold = [
    { seed: 4242, stateHash: 'eb0d7904', terrainHash: 3975346680, krater: 30 },
    { seed: 606, stateHash: '560554f0', terrainHash: 1850661404, krater: 31 },
    { seed: 31, stateHash: '80a1308e', terrainHash: 2433242960, krater: 31 },
  ];
  for (const g of gold) {
    const m = new MatchController({ seed: g.seed, teams: 2, playersPerTeam: 2, preset: 'hills', valhallaRound: 999, zerstoerung: ZERSTOERUNG_ALT, kit: KIT_FLAECHE, waffen: WAFFEN_ALT, kisten: KISTEN_ALT, schaden: 1 });
    m.start();
    let schuesse = 0;
    for (let tick = 0; tick < 6000; tick++) {
      if (m.activeProjectileCount === 0 && tick % 120 === 0) {
        m.fire(m.activePlayerId, 0.5 + (schuesse % 9) * 0.15, 40 + (schuesse * 13) % 50, null);
        schuesse += 1;
      }
      m.step();
      m.consumeEvents();
    }
    assert.equal(m.stateHash(), g.stateHash, `Seed ${g.seed}`);
    assert.equal(m.terrain.hash(), g.terrainHash, `Seed ${g.seed}`);
    assert.equal(m.terrain.craterCount, g.krater, `Seed ${g.seed}`);
    assert.ok(m.terrain.craterLog.every(e => e.length === 3), 'Altfassung loggt nur [x, y, r]');
    assert.equal(m.setzung, null, 'Altfassung hat kein Nachrutschen');
  }
});

test('Replay-Kopf: Altdatei ohne Feld = Altfassung, neue Aufzeichnung trägt die Standardfassung (6), Fassung 2 und 3 bleiben erhalten', () => {
  const alt = {
    format: 1, createdAt: 0, seed: 4242,
    config: { teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: 30000, kit: 3 },
    totalTicks: 900, entries: [], rounds: [],
  };
  const recorder = ReplayRecorder.fromJSON(alt);
  assert.equal(recorder.config.zerstoerung, ZERSTOERUNG_ALT);
  const { match } = playReplay(recorder);
  assert.equal(match.zerstoerung, ZERSTOERUNG_ALT);
  assert.equal(match.setzung, null);

  const neu = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 });
  assert.equal(neu.toJSON().config.zerstoerung, ZERSTOERUNG_STANDARD);
  assert.equal(ZERSTOERUNG_STANDARD, 7);
  neu.finalize(300);
  const zurueck = ReplayRecorder.fromJSON(neu.serialize());
  assert.equal(playReplay(zurueck).match.zerstoerung, ZERSTOERUNG_STANDARD);
  const drei = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, zerstoerung: ZERSTOERUNG_SCHOLLEN });
  drei.finalize(300);
  assert.equal(playReplay(ReplayRecorder.fromJSON(drei.serialize())).match.zerstoerung, ZERSTOERUNG_SCHOLLEN);

  // Eine Aufzeichnung der Zwischenzeit (Fassung 2) behält ihre Fassung und damit ihre Grenzen.
  const zwei = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, zerstoerung: ZERSTOERUNG_GELAENDE });
  zwei.finalize(300);
  assert.equal(playReplay(ReplayRecorder.fromJSON(zwei.serialize())).match.zerstoerung, ZERSTOERUNG_GELAENDE);

  assert.equal(normalisiereZerstoerung(undefined), ZERSTOERUNG_STANDARD);
  assert.equal(normalisiereZerstoerung(8), ZERSTOERUNG_STANDARD);
  assert.equal(normalisiereZerstoerung(1), ZERSTOERUNG_ALT);
});

test('Replay mit Schüssen: Altkopf und neuer Kopf geben jeweils den Live-Lauf exakt wieder', () => {
  for (const fassung of [ZERSTOERUNG_ALT, ZERSTOERUNG_GELAENDE, ZERSTOERUNG_SCHOLLEN]) {
    const live = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, zerstoerung: fassung });
    live.start();
    const rec = new ReplayRecorder({
      seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: live.turnDurationMs,
      kit: live.kit, zerstoerung: fassung,
    });
    let schuesse = 0;
    for (let tick = 0; tick < 3000; tick++) {
      if (live.activeProjectileCount === 0 && tick % 120 === 0) {
        const id = live.activePlayerId;
        const winkel = 0.5 + (schuesse % 9) * 0.15;
        const kraft = 40 + (schuesse * 13) % 50;
        const waffe = live.inventory.getActiveWeaponId(id);
        const ergebnis = live.fire(id, winkel, kraft, waffe);
        if (ergebnis.ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
        schuesse += 1;
      }
      live.step();
      live.consumeEvents();
    }
    rec.finalize(live.world.tickCount);
    const json = rec.toJSON();
    if (fassung === ZERSTOERUNG_ALT) delete json.config.zerstoerung; // so sieht eine Datei von vor dem Umbau aus
    const { match } = playReplay(ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(json))));
    assert.equal(match.zerstoerung, fassung);
    assert.equal(match.stateHash(), live.stateHash(), `Fassung ${fassung}: Zustandshash`);
    assert.equal(match.terrain.hash(), live.terrain.hash(), `Fassung ${fassung}: Maske`);
    assert.ok(live.terrain.craterCount > 5, 'Testaufbau: es müssen Krater entstanden sein');
  }
});

test('Alte Sicherung ohne `zerstoerung` wird als Altfassung fortgesetzt, neue als Fassung 2', () => {
  const aufnahmen = [];
  const lobbyManager = {
    create: (optionen) => ({ lobby: { id: 'x1', ...optionen } }),
    get: () => ({ id: 'x1', seats: [] }),
    close: () => {},
    restoreWithId: () => {},
  };
  const sicherung = zerstoerung => ({
    id: 'x1', teams: 2, playersPerTeam: 1, preset: 'hills', seats: [],
    replay: { seed: 5, entries: [], totalTicks: 10, config: { kit: 3, ...(zerstoerung ? { zerstoerung } : {}) } },
  });
  const createSession = (_lobby, optionen) => { aufnahmen.push(optionen.zerstoerung); return null; };
  try { restoreLobby(sicherung(null), { lobbyManager, createSession }); } catch { /* der Rest der Wiederherstellung braucht keine echte Lobby */ }
  try { restoreLobby(sicherung(2), { lobbyManager, createSession }); } catch { /* s. o. */ }
  assert.deepEqual(aufnahmen, [ZERSTOERUNG_ALT, ZERSTOERUNG_GELAENDE]);
});

/* ---------------------------------------------------- Inselfall (mit Match) */

/** Pfeiler + Brett über dem Boden bei der ersten Figur; die Figur steht auf dem Brett. */
function baueBrett(match) {
  const w = match.world;
  const t = match.terrain;
  const figur = match.players[0].entityId;
  const px = Math.round(w.getComponent(figur, 'Position', 'x'));
  const boden = match.surfaceYAt(px);
  const oben = boden - 90;
  const gesetzt = [];
  const setze = (x, y) => { t.setPixel(x, y, true); gesetzt.push([x, y]); };
  for (let y = oben; y < boden + 2; y++) for (let x = px - 4; x <= px + 4; x++) setze(x, y);
  for (let y = oben - 8; y < oben; y++) for (let x = px - 40; x <= px + 40; x++) setze(x, y);
  w.setComponent(figur, 'Position', 'y', oben - 8 - PLAYER_HALF_HEIGHT);
  w.setComponent(figur, 'Velocity', 'y', 0);
  for (let i = 0; i < 5; i++) { match.step(); match.consumeEvents(); }
  return { figur, px, boden, oben, gesetzt };
}

function zaehleFeste(maske) {
  let n = 0;
  for (let x = 0; x < maske.width; x++) for (let y = 0; y < maske.height; y++) if (maske.isSolid(x, y)) n += 1;
  return n;
}

function inselLauf() {
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const aufbau = baueBrett(match);
  const w = match.world;
  const yVorher = w.getComponent(aufbau.figur, 'Position', 'y');
  match.setzung.krater(aufbau.px, aufbau.boden - 45, 14, 100);
  const festeNachKrater = zaehleFeste(match.terrain);
  const ereignisse = [];
  let maxFaellt = 0;
  for (let i = 0; i < 200 && (i < 2 || match.setzung.faellt > 0); i++) {
    match.step();
    maxFaellt = Math.max(maxFaellt, match.setzung.faellt);
    for (const e of match.consumeEvents()) if (/^terrain_(detached|settled)$/.test(e.type)) ereignisse.push(e);
  }
  return { match, aufbau, yVorher, festeNachKrater, ereignisse, maxFaellt };
}

test('Ein gekappter Pfeiler lässt Brett und Figur fallen; nichts geht verloren', () => {
  const { match, aufbau, yVorher, festeNachKrater, ereignisse, maxFaellt } = inselLauf();
  const arten = ereignisse.map(e => e.type);
  assert.deepEqual(arten, ['terrain_detached', 'terrain_settled']);
  const dy = ereignisse[1].payload.dy;
  assert.ok(dy > 10, `die Insel fällt (${dy} px)`);
  assert.equal(ereignisse[0].payload.id, ereignisse[1].payload.id);
  assert.equal(maxFaellt, 1);
  assert.equal(match.setzung.faellt, 0);
  assert.equal(zaehleFeste(match.terrain), festeNachKrater, 'die Insel wird unverändert wieder eingesetzt');
  // Die Figur ist mitgefahren und steht auf dem Brett.
  const y = match.world.getComponent(aufbau.figur, 'Position', 'y');
  assert.equal(y, yVorher + dy);
  assert.equal(match.terrain.isSolid(aufbau.px, Math.round(y + PLAYER_HALF_HEIGHT)), true, 'Boden unter den Füßen');
  // Log: Krater, dann die Insel mit denselben Spaltenläufen wie das Ereignis.
  const log = match.terrain.craterLog;
  assert.equal(log.length, 2);
  assert.deepEqual(log[0], [aufbau.px, aufbau.boden - 45, 14, 100]);
  assert.deepEqual(log[1], ['s', dy, ...ereignisse[1].payload.runs]);
});

test('Der Inselfall ist deterministisch (zwei Läufe, gleicher Hash)', () => {
  const a = inselLauf();
  const b = inselLauf();
  assert.equal(a.match.terrain.hash(), b.match.terrain.hash());
  assert.equal(a.match.stateHash(), b.match.stateHash());
  assert.deepEqual(a.ereignisse.map(e => e.payload), b.ereignisse.map(e => e.payload));
});

test('Client-Nachbau: Seed + Gerüst + Log ergibt zellengleich die Server-Maske (Maske und Bitmap)', () => {
  const { match, aufbau } = inselLauf();
  const karte = buildTerrainForSeed(77, 'hills', 'landscape', null);
  for (const [x, y] of aufbau.gesetzt) { karte.bitmap[y * karte.width + x] = 1; karte.mask.setPixel(x, y, true); }
  for (const eintrag of match.terrain.craterLog) applyLogEntryToTerrain(karte, eintrag);
  let maske = 0;
  let bitmap = 0;
  for (let y = 0; y < karte.height; y++) {
    for (let x = 0; x < karte.width; x++) {
      if (match.terrain.isSolid(x, y) !== karte.mask.isSolid(x, y)) maske += 1;
      if (Boolean(karte.bitmap[y * karte.width + x]) !== match.terrain.isSolid(x, y)) bitmap += 1;
    }
  }
  assert.equal(maske, 0, 'Maske gleich');
  assert.equal(bitmap, 0, 'Bitmap gleich');
  assert.equal(karte.mask.hash(), match.terrain.hash());
  assert.equal(karte.mask.craterCount, match.terrain.craterCount, 'gleiche Zählung des Logs');
});

test('Terrain-Hash: Solange Inseln fallen, vergleicht der Client nicht', () => {
  const { match } = inselLauf();
  const karte = buildTerrainForSeed(77, 'hills', 'landscape', null);
  const meldung = { hash: match.terrain.hash() + 1, craters: match.terrain.craterCount, inset: 0 };
  assert.equal(bewerteTerrainHash(karte, meldung, true).urteil, 'abweichung', 'ohne Fall: Abweichung');
  assert.equal(bewerteTerrainHash(karte, { ...meldung, faellt: 1 }, true).urteil, 'gleich', 'im Fall: kein Vergleich');
});

test('Krater im Flug der Insel verändern das Ergebnis nicht gegenüber dem Log (Client bleibt gleich)', () => {
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const aufbau = baueBrett(match);
  match.setzung.krater(aufbau.px, aufbau.boden - 45, 14, 100);
  match.step();
  assert.equal(match.setzung.faellt, 1, 'Testaufbau: die Insel fällt');
  // Ein zweiter Einschlag trifft die Stelle, an der die Insel EBEN NOCH hing.
  match.setzung.krater(aufbau.px + 20, aufbau.boden - 85, 12, 100);
  for (let i = 0; i < 120 && match.setzung.faellt > 0; i++) match.step();
  match.consumeEvents();
  const karte = buildTerrainForSeed(77, 'hills', 'landscape', null);
  for (const [x, y] of aufbau.gesetzt) { karte.bitmap[y * karte.width + x] = 1; karte.mask.setPixel(x, y, true); }
  for (const eintrag of match.terrain.craterLog) applyLogEntryToTerrain(karte, eintrag);
  assert.equal(karte.mask.hash(), match.terrain.hash());
});

/* ---------------------------------------- Einheit: Suche, Budget, Objekte */

/** Minimale Welt für `Zerstoerung`: Kisten sind frei setzbar, sonst leer. */
function stubWelt() {
  const kisten = new Map();
  return {
    kisten,
    isActive: id => kisten.has(id),
    getEntitiesBySignature: sig => (sig & COMPONENT_SIGNATURES.HEALTH ? [] : [...kisten.keys()]),
    getComponent: (id, komp, feld) => {
      const k = kisten.get(id);
      if (!k) return undefined;
      if (komp === 'Crate') return { inFlight: 0, picked: 0, crateY: k.y }[feld];
      return { x: k.x, y: k.y }[feld];
    },
    setComponent: (id, komp, feld, wert) => { const k = kisten.get(id); if (k && komp !== 'Velocity' && feld === 'y') k.y = wert; },
    getSystem: () => null,
  };
}

function maskeAusBoden(breite, hoehe, bodenY) {
  const bitmap = new Uint8Array(breite * hoehe);
  for (let y = bodenY; y < hoehe; y++) for (let x = 0; x < breite; x++) bitmap[y * breite + x] = 1;
  return CollisionMask.fromBitmap(bitmap, breite, hoehe);
}

function bauEinheit(maske, turrets = new Map(), fassung = ZERSTOERUNG_GELAENDE) {
  const welt = stubWelt();
  const ereignisse = [];
  const z = new Zerstoerung({ terrain: maske, world: welt, events: { emit: (type, payload) => ereignisse.push({ type, payload }) }, turrets, fassung });
  return { z, welt, ereignisse };
}

test('Spaltenläufe: kompakte Beschreibung einer Insel', () => {
  // Spalte 2: Zeilen 3-5 und 8; Spalte 3: Zeile 4 (Höhe 10, Schlüssel x*10+y).
  assert.deepEqual(spaltenlaeufe(Int32Array.from([23, 24, 25, 28, 34]), 10), [2, 3, 5, 2, 8, 8, 3, 4, 4]);
});

test('Eine Brücke, deren beide Pfeiler gekappt sind, stürzt; mit einem Pfeiler bleibt sie hängen', () => {
  const maske = maskeAusBoden(300, 200, 150);
  // Brücke y 80..85 von x 50..250, Pfeiler links (50..58) und rechts (242..250) bis zum Boden.
  for (let x = 50; x <= 250; x++) for (let y = 80; y <= 85; y++) maske.setPixel(x, y, true);
  for (const x0 of [50, 242]) for (let x = x0; x <= x0 + 8; x++) for (let y = 86; y < 150; y++) maske.setPixel(x, y, true);
  const { z, ereignisse } = bauEinheit(maske);

  z.krater(54, 110, 16, 100); // linker Pfeiler weg
  for (let i = 0; i < 5; i++) z.schritt();
  assert.deepEqual(ereignisse.filter(e => e.type === 'terrain_detached'), [], 'am rechten Pfeiler verankert: nichts fällt');
  assert.equal(maske.isSolid(150, 82), true);

  // Der linke Pfeilerrest und die Brücke hängen nun nur noch am rechten; sprenge ihn auch.
  z.krater(246, 110, 16, 100);
  let tick = 0;
  while ((ereignisse.filter(e => e.type === 'terrain_settled').length < 1) && tick++ < 400) z.schritt();
  const geloest = ereignisse.filter(e => e.type === 'terrain_detached');
  const gelandet = ereignisse.filter(e => e.type === 'terrain_settled');
  assert.equal(geloest.length, 1);
  assert.equal(gelandet.length, 1);
  const dy = gelandet[0].payload.dy;
  assert.ok(dy > 20, `die Brücke fiel ${dy} px`);
  assert.equal(maske.isSolid(150, 82), false, 'alte Lage leer');
  assert.equal(maske.isSolid(150, 82 + dy), true, 'neue Lage fest');
  // Sie liegt auf: unter mindestens einem Spaltenlauf ist fester Grund (hier die Pfeilerstümpfe).
  const runs = gelandet[0].payload.runs;
  let aufliegend = 0;
  for (let i = 0; i < runs.length; i += 3) if (maske.isSolid(runs[i], runs[i + 2] + dy + 1)) aufliegend += 1;
  assert.ok(aufliegend > 0, 'die Brücke liegt auf');
  assert.equal(maske.isSolid(150, 86 + dy), false, 'in der Mitte bleibt sie frei (liegt auf den Stümpfen)');
});

test('Kostenbudget: ein großer Krater im Fels kostet je Tick höchstens das Suchbudget (plus eine Masse)', () => {
  const maske = maskeAusBoden(1200, 700, 200);
  const { z, ereignisse } = bauEinheit(maske);
  z.krater(600, 260, 80, 135);
  let maxKosten = 0;
  let ticks = 0;
  let summe = 0;
  while (ticks < 40) {
    z.schritt();
    maxKosten = Math.max(maxKosten, z.suchkosten);
    summe += z.suchkosten;
    ticks += 1;
  }
  assert.ok(maxKosten <= SUCH_BUDGET_PRO_TICK + INSEL_MAX_ZELLEN + 1, `Tickkosten ${maxKosten}`);
  assert.ok(summe > 0, 'Testaufbau: die Suche hat gearbeitet');
  assert.equal(z.suchkosten, 0, 'nach wenigen Ticks ist die Suche fertig');
  assert.deepEqual(ereignisse.filter(e => e.type !== 'terrain_destroyed'), [], 'gewachsener Fels fällt nicht');
});

test('Inseln über der Obergrenze gelten als gewachsener Fels', () => {
  const maske = maskeAusBoden(700, 400, 390);
  // Eine große Scholle (80 x 100 = 8000 Zellen) schwebt, mit einer Brücke zum Boden.
  for (let x = 300; x < 380; x++) for (let y = 100; y < 200; y++) maske.setPixel(x, y, true);
  for (let x = 330; x < 340; x++) for (let y = 200; y < 390; y++) maske.setPixel(x, y, true);
  const { z, ereignisse } = bauEinheit(maske);
  assert.ok(80 * 100 > INSEL_MAX_ZELLEN);
  z.krater(335, 300, 20, 100); // kappt die Brücke
  for (let i = 0; i < 60; i++) z.schritt();
  assert.deepEqual(ereignisse.filter(e => e.type === 'terrain_detached'), []);
});

/** Eine Scholle (`breite` × `hoehe`) schwebt über dem Boden und hängt an einer 10 px breiten Brücke. */
function maskeMitScholle(breite, hoehe) {
  const maske = maskeAusBoden(900, 700, 650);
  for (let x = 300; x < 300 + breite; x++) for (let y = 100; y < 100 + hoehe; y++) maske.setPixel(x, y, true);
  for (let x = 310; x < 320; x++) for (let y = 100 + hoehe; y < 650; y++) maske.setPixel(x, y, true);
  return maske;
}

test('Fassung 3: eine Scholle über 6000 Zellen stürzt nach (Fassung 2 lässt sie hängen); jeder Tick bleibt im Budget', () => {
  assert.equal(suchGrenzen(ZERSTOERUNG_GELAENDE).maxZellen, INSEL_MAX_ZELLEN);
  assert.equal(suchGrenzen(ZERSTOERUNG_SCHOLLEN).maxZellen, INSEL_MAX_ZELLEN_SCHOLLEN);
  for (const [breite, hoehe] of [[80, 100], [200, 150]]) {
    const zellen = breite * hoehe;
    assert.ok(zellen > INSEL_MAX_ZELLEN && zellen < INSEL_MAX_ZELLEN_SCHOLLEN);

    const { z: z2, ereignisse: e2 } = bauEinheit(maskeMitScholle(breite, hoehe), new Map(), ZERSTOERUNG_GELAENDE);
    z2.krater(315, 100 + hoehe + 120, 20, 100);
    for (let i = 0; i < 60; i++) z2.schritt();
    assert.deepEqual(e2.filter(e => e.type === 'terrain_detached'), [], `Fassung 2: ${zellen} Zellen bleiben hängen`);

    const maske = maskeMitScholle(breite, hoehe);
    const { z, ereignisse } = bauEinheit(maske, new Map(), ZERSTOERUNG_SCHOLLEN);
    z.krater(315, 100 + hoehe + 120, 20, 100);
    let maxKosten = 0;
    for (let i = 0; i < 400 && ereignisse.filter(e => e.type === 'terrain_settled').length === 0; i++) {
      z.schritt();
      maxKosten = Math.max(maxKosten, z.suchkosten);
    }
    assert.ok(maxKosten <= SUCH_BUDGET_PRO_TICK, `Tickkosten ${maxKosten} im Budget`);
    const gelandet = ereignisse.filter(e => e.type === 'terrain_settled');
    assert.equal(gelandet.length, 1, `Fassung 3: ${zellen} Zellen stürzen und landen`);
    assert.ok(gelandet[0].payload.dy > 20, `fiel ${gelandet[0].payload.dy} px`);
    assert.equal(maske.isSolid(350, 100), false, 'alte Lage leer');
    assert.equal(maske.isSolid(350, 100 + gelandet[0].payload.dy), true, 'neue Lage fest');
  }
});

test('Fassung 3: über 60 000 Zellen bleibt Fels; gewachsener Boden kostet nur wenige hundert Zellen je Krater', () => {
  const { z, ereignisse } = bauEinheit(maskeMitScholle(260, 260), new Map(), ZERSTOERUNG_SCHOLLEN);
  assert.ok(260 * 260 > INSEL_MAX_ZELLEN_SCHOLLEN);
  z.krater(315, 100 + 260 + 120, 20, 100);
  for (let i = 0; i < 80; i++) z.schritt();
  assert.deepEqual(ereignisse.filter(e => e.type === 'terrain_detached'), []);

  // Ein Krater im Boden: die Masse reicht nach unten bis zum Kartenrand und ist nach wenigen Zellen verankert.
  const { z: boden } = bauEinheit(maskeAusBoden(900, 700, 400), new Map(), ZERSTOERUNG_SCHOLLEN);
  boden.krater(450, 410, 40, 100);
  let kosten = 0;
  for (let i = 0; i < 10; i++) { boden.schritt(); kosten += boden.suchkosten; }
  assert.ok(kosten < 3000, `Kosten ${kosten}`);
});

test('Fassung 3: eine angehaltene Füllung läuft im nächsten Tick weiter und ergibt dieselbe Insel wie ohne Anhalten', () => {
  // Gleiche Scholle, einmal mit dem normalen Budget, einmal Tick für Tick: dasselbe Ereignis (Spaltenläufe).
  const lauf = () => {
    const { z, ereignisse } = bauEinheit(maskeMitScholle(120, 90), new Map(), ZERSTOERUNG_SCHOLLEN);
    z.krater(315, 90 + 100 + 120, 20, 100);
    for (let i = 0; i < 200; i++) z.schritt();
    return ereignisse.filter(e => e.type === 'terrain_detached').map(e => e.payload.runs);
  };
  const a = lauf();
  assert.equal(a.length, 1);
  assert.deepEqual(a, lauf());
  const spalten = new Set();
  for (let i = 0; i < a[0].length; i += 3) spalten.add(a[0][i]);
  assert.ok(spalten.size >= 120, 'die ganze Scholle ist dabei');
});

test('Lose Objekte: Geschütz und Kiste fallen mit, wenn ihnen der Boden fehlt, und stehen danach fest', () => {
  const maske = maskeAusBoden(300, 300, 200);
  const turrets = new Map([[1, { entityId: 1, x: 100, y: 194, teamId: 0 }]]); // Fuß = y + 6 = 200 (Oberfläche)
  const { z, welt } = bauEinheit(maske, turrets);
  welt.kisten.set(7, { x: 180, y: 200 }); // abgeworfene Kiste: y = Oberfläche
  welt.kisten.set(8, { x: 220, y: 186 }); // Rundenkiste: 14 px über dem Boden
  for (let i = 0; i < 3; i++) z.schritt();
  assert.equal(turrets.get(1).y, 194, 'Ausgangslage steht fest');
  assert.equal(welt.kisten.get(7).y, 200);
  assert.equal(welt.kisten.get(8).y, 186);

  // Ein Krater unter allen dreien, 40 px tief.
  z.krater(100, 205, 40, 100);
  z.krater(180, 205, 40, 100);
  z.krater(220, 205, 40, 100);
  for (let i = 0; i < 120; i++) z.schritt();
  assert.ok(turrets.get(1).y > 194 + 20, `Geschütz fiel (y = ${turrets.get(1).y})`);
  assert.ok(welt.kisten.get(7).y > 200 + 20, `Kiste fiel (y = ${welt.kisten.get(7).y})`);
  assert.ok(welt.kisten.get(8).y > 186 + 20, `Rundenkiste fiel (y = ${welt.kisten.get(8).y})`);
  // Sie stehen: Boden in Reichweite der Unterkante, und ein weiterer Tick ändert nichts.
  const vorher = [turrets.get(1).y, welt.kisten.get(7).y, welt.kisten.get(8).y];
  for (let i = 0; i < 10; i++) z.schritt();
  assert.deepEqual([turrets.get(1).y, welt.kisten.get(7).y, welt.kisten.get(8).y], vorher);
  assert.equal(maske.isSolid(100, Math.round(turrets.get(1).y) + 6), true, 'Geschütz steht auf Boden');
});

test('Im Match: eine liegende Kiste fällt in den Krater unter ihr und bleibt liegen', () => {
  const match = new MatchController({ seed: 31, teams: 2, playersPerTeam: 1, preset: 'hills' });
  match.start();
  const kiste = match.getState().crates[0];
  if (!kiste) return; // Dieser Seed hat eine Rundenkiste (siehe water-hud.test.js); sonst gibt es nichts zu prüfen.
  match.setzung.krater(kiste.x, kiste.y + 14, 30, 100);
  for (let i = 0; i < 200; i++) { match.step(); match.consumeEvents(); }
  const danach = match.getState().crates.find(c => c.entityId === kiste.entityId);
  assert.ok(danach.y > kiste.y + 10, `die Kiste fiel (${kiste.y} -> ${danach.y})`);
  const y1 = danach.y;
  for (let i = 0; i < 60; i++) { match.step(); match.consumeEvents(); }
  assert.equal(match.getState().crates.find(c => c.entityId === kiste.entityId).y, y1, 'sie liegt jetzt fest');
});

/* ------------------------------------------- Goldwerte Fassung 3 (Stand vor Fassung 4) */

/** FNV-1a über einen Text — ein kurzer Fingerabdruck für Ereignislisten. */
function fingerabdruck(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function gold3() {
  // (a) Reiner Rechenkern: eine Scholle über 6000 Zellen und zwei Krater in Folge.
  const maske = maskeMitScholle(120, 90);
  const { z, ereignisse } = bauEinheit(maske, new Map(), ZERSTOERUNG_SCHOLLEN);
  z.krater(315, 90 + 100 + 120, 20, 100);
  for (let i = 0; i < 80; i++) z.schritt();
  z.krater(360, 150, 18, 115);
  for (let i = 0; i < 200; i++) z.schritt();
  // (b) Im Match: Brett über der Figur, Pfeiler gekappt.
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1, preset: 'hills', zerstoerung: ZERSTOERUNG_SCHOLLEN, kisten: KISTEN_OFT });
  match.start();
  const aufbau = baueBrett(match);
  match.setzung.krater(aufbau.px, aufbau.boden - 45, 14, 100);
  for (let i = 0; i < 200; i++) { match.step(); match.consumeEvents(); }
  return [maske.hash(), maske.craterCount, fingerabdruck(JSON.stringify(ereignisse)), match.terrain.hash(), match.stateHash(), match.terrain.craterCount];
}

test('Fassung 3 bleibt Bit für Bit: Scholle, Krater und Brett (Goldwerte, gemessen vor Einführung von Fassung 4)', () => {
  assert.deepEqual(gold3(), [3282633924, 3, 927077047, 2643580672, 'c81f0a06', 2]);
  assert.deepEqual(gold3(), gold3(), 'zwei Läufe, gleiche Werte');
});

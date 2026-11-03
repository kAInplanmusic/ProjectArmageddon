/**
 * Seil (Ninja Rope, Seilfassung 2: `config/seil.js`, `engine/seil.js`).
 *
 * Gehalten wird: (1) die belegten Werte (Länge je Stufe, Schüsse, Tempogrenze, Umrechnung 50 → 60 Hz), (2) das
 * Pendel ist deterministisch und schwingt mit der Pendeldauer der Schwerkraft, kürzeres Seil = schneller,
 * (3) Wickeln an einer Kante und Entwickeln beim Zurückschwingen, (4) Neuwürfe je Stufe und der Boden verwirft sie,
 * (5) der Server lehnt ungültige Nachrichten ab, (6) die Aufzeichnung spielt exakt nach; ohne Marke bleibt alles
 * bitgleich (kein `seil` im Zustand, Altköpfe laden als Fassung 1).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { CharacterSystem } from '../src/engine/systems/characterSystem.js';
import { SeilSystem, pendelSchritt, seilStrahl } from '../src/engine/seil.js';
import { SEIL, SEIL_ALT, SEIL_NINJA, SEIL_STANDARD, normalisiereSeil, seilStufe, WA_SCHRITTE_JE_SEKUNDE } from '../src/shared/config/seil.js';
import { pruefeSeilEingabe } from '../src/shared/validation.js';
import { LobbyManager } from '../src/server/lobby.js';
import { LobbySession } from '../src/server/gameServer.js';

// ------------------------------------------------------------------ Hilfen

/** Künstliches Gelände: Decke y < 50, Boden ab y = 700, optional ein Block. */
function gelaende({ block = null } = {}) {
  return {
    width: 1200, height: 800,
    isSolid: (x, y) => y < 50 || y >= 700
      || (block !== null && x >= block.x0 && x < block.x1 && y >= block.y0 && y < block.y1),
  };
}

/** Minimaler Match-Ersatz für das SeilSystem (nur die öffentliche Schnittstelle, die es liest). */
function attrappe(terrain, start = { x: 500, y: 300 }) {
  const komponenten = new Map([['Position', { ...start }], ['Velocity', { x: 0, y: 0 }]]);
  const charakter = { amSeil: false, setzeSeil(id, an) { this.amSeil = an; }, setzeFreiflug() {} };
  const ereignisse = [];
  const m = {
    status: 'playing', activePlayerId: 1, turnPauseMs: 0, terrain,
    events: { emit: (art, nutzlast) => ereignisse.push({ art, ...nutzlast }) },
    world: {
      tickCount: 0,
      getComponent: (id, k, f) => komponenten.get(k)[f],
      setComponent: (id, k, f, w) => { komponenten.get(k)[f] = w; },
      getSystem: () => charakter,
    },
    isPlayerAlive: () => true,
    isGrounded: () => terrain.isSolid(Math.floor(komponenten.get('Position').x), Math.floor(komponenten.get('Position').y + 10)),
    waterLevelAt: () => 0,
    setze(x, y) { komponenten.get('Position').x = x; komponenten.get('Position').y = y; },
  };
  return { m, charakter, ereignisse };
}

function los(m, ticks) { for (let i = 0; i < ticks; i += 1) m.step(); }

/** Niedrige Kammer für die Neuwürfe: Decke y < 50, Boden ab y = 330 (Figur bei y = 300 schwebt, bei 320 steht). */
function kammer() {
  return { width: 1200, height: 800, isSolid: (x, y) => y < 50 || y >= 330 };
}

/** Erster Winkel aus einer festen Liste (von den Seiten nach innen), unter dem das Seil der aktiven Figur hält. */
function schiesseIrgendwohin(seil, id) {
  for (let i = 0; i <= 15; i += 1) {
    const winkel = i % 2 === 0 ? (i / 2) * 0.07 : Math.PI - ((i - 1) / 2) * 0.07;
    if (seil.schiessen(id, winkel).ok) return winkel;
  }
  return null;
}

// ------------------------------------------------------------------ Werte

test('Belegte Werte: Länge je Stufe 297…465 px, Schüsse 1/2/2/3/∞, Tempogrenze 16 px/Schritt bei 50 Hz', () => {
  assert.deepEqual(SEIL.laengen, [297, 339, 381, 423, 465]);
  assert.deepEqual(SEIL.schuesse, [1, 2, 2, 3, Infinity]);
  assert.equal(WA_SCHRITTE_JE_SEKUNDE, 50);
  assert.ok(Math.abs(SEIL.maxTempo * 60 - 800) < 1e-9, '800 px/s wie in WA');
  for (let s = 1; s <= 5; s += 1) assert.equal(seilStufe(s).laenge, SEIL.laengen[s - 1]);
  assert.equal(seilStufe(99).stufe, SEIL.standardStufe);
  assert.equal(SEIL.winkelMin, 0);
  assert.equal(SEIL.winkelMax, Math.PI);
});

test('Schwerkraft am Seil = Schwerkraft der Figuren (kein Ruck beim Loslassen)', () => {
  assert.equal(SEIL.schwerkraft, new CharacterSystem().gravity);
});

test('Versionsmarke: 1 = kein Seil, 2 = Ninja Rope (Standard); unbekannt fällt auf den Standard', () => {
  assert.equal(SEIL_STANDARD, SEIL_NINJA);
  assert.equal(normalisiereSeil(SEIL_ALT), SEIL_ALT);
  assert.equal(normalisiereSeil(7), SEIL_STANDARD);
  assert.equal(new MatchController({ seed: 1 }).seilSystem, null, 'ohne Marke kein Seil');
  assert.ok(new MatchController({ seed: 1, seil: SEIL_NINJA }).seilSystem);
});

test('Länge je Stufe: eine Decke in 400 px erreicht Stufe 5 (465), nicht Stufe 1 (297)', () => {
  const t = { width: 1200, height: 800, isSolid: (x, y) => y < 50 };
  assert.equal(seilStrahl(t, 500, 450, Math.PI / 2, seilStufe(1).laenge).treffer, false);
  const treffer = seilStrahl(t, 500, 450, Math.PI / 2, seilStufe(5).laenge);
  assert.equal(treffer.treffer, true);
  assert.equal(treffer.hy, 49);
  // Nie über den oberen Kartenrand: ein Seil ohne Decke findet keinen Halt.
  assert.equal(seilStrahl({ width: 1200, height: 800, isSolid: () => false }, 500, 100, Math.PI / 2, 465).treffer, false);
});

// ------------------------------------------------------------------ Pendel

function pendel(terrain, start, ticks, absicht = () => ({ sx: 0, sy: 0 })) {
  let s = { vx: 0, vy: 0, maxLaenge: 465, sx: 0, sy: 0, ...start };
  const spur = [];
  for (let t = 0; t < ticks; t += 1) {
    s = { ...s, ...absicht(t, s), ...pendelSchritt(terrain, { ...s, ...absicht(t, s) }) };
    spur.push(s);
  }
  return spur;
}

test('Pendel: deterministisch und mit der Pendeldauer 2π·√(L/g) (±10 %)', () => {
  const t = gelaende();
  const start = { x: 500 + 200 * Math.sin(0.5), y: 50 + 200 * Math.cos(0.5), punkte: [{ x: 500, y: 50 }], laenge: 200 };
  const a = pendel(t, start, 600);
  const b = pendel(t, start, 600);
  assert.deepEqual(a, b, 'zwei Läufe, dieselben Zahlen');
  // Nulldurchgänge (x = 500) zählen: zwei je volle Schwingung.
  const durch = [];
  for (let i = 1; i < a.length; i += 1) if (Math.sign(a[i].x - 500) !== Math.sign(a[i - 1].x - 500)) durch.push(i);
  const dauer = (durch.at(-1) - durch[0]) / ((durch.length - 1) / 2);
  const soll = 2 * Math.PI * Math.sqrt(200 / SEIL.schwerkraft);
  assert.ok(Math.abs(dauer - soll) / soll < 0.1, `Dauer ${dauer.toFixed(1)} Takte, erwartet ${soll.toFixed(1)}`);
  // Das Seil bleibt eine Höchstlänge: nie weiter als 200 px vom Anker.
  for (const s of a) assert.ok(Math.hypot(s.x - 500, s.y - 50) <= 200 + 1e-6);
});

test('Kürzeres Seil = stärkerer Schwung: Einholen im Schwung erhöht das Tempo (Drehimpuls)', () => {
  const t = gelaende();
  const start = { x: 500 + 300 * Math.sin(0.9), y: 50 + 300 * Math.cos(0.9), punkte: [{ x: 500, y: 50 }], laenge: 300 };
  const tempo = s => Math.hypot(s.vx, s.vy);
  const ohne = pendel(t, start, 40);
  const mit = pendel(t, start, 40, i => ({ sy: i >= 25 ? -1 : 0 }));
  assert.ok(tempo(mit.at(-1)) > tempo(ohne.at(-1)) + 0.5, `${tempo(mit.at(-1)).toFixed(2)} > ${tempo(ohne.at(-1)).toFixed(2)}`);
  assert.ok(mit.at(-1).laenge < 300 - 30, 'das Seil ist kürzer geworden');
});

test('Schwung mit links/rechts baut die Auslenkung auf', () => {
  const t = gelaende();
  const start = { x: 500, y: 250, punkte: [{ x: 500, y: 50 }], laenge: 200 };
  const weite = spur => Math.max(...spur.map(s => Math.abs(s.x - 500)));
  const ruhe = pendel(t, start, 300);
  const schwung = pendel(t, start, 300, (i, s) => ({ sx: s.vx >= 0 ? 1 : -1 }));
  assert.ok(weite(ruhe) < 1);
  assert.ok(weite(schwung) > 60, `Auslenkung ${weite(schwung).toFixed(1)} px`);
});

test('Wickeln an einer Kante und Entwickeln beim Zurückschwingen', () => {
  const t = gelaende({ block: { x0: 560, x1: 600, y0: 120, y1: 200 } });
  const start = { x: 750, y: 60, punkte: [{ x: 500, y: 50 }], laenge: 250 };
  const spur = pendel(t, start, 140);
  const knicke = spur.map(s => s.punkte.length);
  const erster = knicke.findIndex(n => n > 1);
  assert.ok(erster > 0, 'das Seil wickelt sich um die Kante');
  const k = spur[erster].punkte[1];
  assert.ok(Math.abs(k.x - 600) < 3 && Math.abs(k.y - 120) < 3, `Knick an der Ecke (600|120): ${k.x.toFixed(1)}|${k.y.toFixed(1)}`);
  assert.ok(knicke.slice(erster).some(n => n === 1), 'beim Zurückschwingen löst sich der Knick wieder');
  assert.ok(Math.max(...knicke) <= 4, `keine Knickkette an der Kante (${Math.max(...knicke)})`);
  for (const s of spur) assert.equal(t.isSolid(Math.floor(s.x), Math.floor(s.y)), false, 'die Figur steckt nie im Gelände');
});

// ------------------------------------------------------------------ Neuwürfe

for (const [stufe, schuesse] of [[1, 1], [2, 2], [3, 2], [4, 3]]) {
  test(`Neuwürfe Stufe ${stufe}: ${schuesse} Schuss je Flugphase, danach erst wieder vom Boden`, () => {
    const { m } = attrappe(kammer());
    const seil = new SeilSystem(m, () => false, stufe);
    for (let i = 0; i < schuesse; i += 1) {
      assert.equal(seil.schiessen(1, Math.PI / 2).ok, true, `Schuss ${i + 1}`);
      assert.equal(seil.loesen(1).ok, true);
    }
    const zuViel = seil.schiessen(1, Math.PI / 2);
    assert.equal(zuViel.ok, false);
    assert.match(zuViel.errors[0], /Neuwürfe/);
    // Boden berührt: die Serie verfällt, vom Boden geht es neu los.
    m.setze(500, 320);
    seil.schritt();
    assert.equal(seil.snapshot(), null);
    assert.equal(seil.schiessen(1, Math.PI / 2).ok, true);
  });
}

test('Neuwürfe Stufe 5: unbegrenzt', () => {
  const { m } = attrappe(kammer());
  const seil = new SeilSystem(m, () => false, 5);
  for (let i = 0; i < 25; i += 1) {
    assert.equal(seil.schiessen(1, Math.PI / 2).ok, true);
    seil.loesen(1);
  }
  assert.equal(seil.snapshot().neuwuerfe, 'unbegrenzt');
});

test('Boden verwirft Neuwürfe: nach einer Landung zählt die Serie neu', () => {
  const { m } = attrappe(kammer());
  const seil = new SeilSystem(m, () => false, 2);
  assert.equal(seil.schiessen(1, Math.PI / 2).ok, true);
  seil.loesen(1);
  assert.equal(seil.snapshot().neuwuerfe, 1);
  m.setze(500, 320); // gelandet
  seil.schritt();
  assert.equal(seil.snapshot(), null, 'der nicht genutzte Neuwurf ist verfallen');
});

test('Regeln: nicht nach dem Schuss, nicht unter den Horizont, nicht fremd, Nahkampf nicht vom Seil', () => {
  const { m, charakter, ereignisse } = attrappe(gelaende());
  let geschossen = false;
  const seil = new SeilSystem(m, () => geschossen, 5);
  assert.equal(seil.schiessen(1, -0.1).ok, false);
  assert.equal(seil.schiessen(1, Math.PI + 0.1).ok, false);
  assert.equal(seil.schiessen(2, Math.PI / 2).ok, false, 'nur der aktive Spieler');
  assert.equal(seil.schiessen(1, Math.PI / 2).ok, true);
  assert.equal(charakter.amSeil, true, 'das CharacterSystem lässt die Figur aus');
  assert.equal(seil.vorWaffe(1, 'pa_001')?.ok, false, 'pa_001 ist Nahkampf');
  assert.equal(seil.loesen(1).ok, true);
  assert.equal(charakter.amSeil, false);
  assert.deepEqual(ereignisse.map(e => e.art), ['seil_angeheftet', 'seil_geloest']);
  geschossen = true;
  assert.equal(seil.schiessen(1, Math.PI / 2).ok, false, 'nach dem Schuss gibt es kein Seil');
});

// ------------------------------------------------------------------ Motor, Aufzeichnung, Server

const KOPF = { seed: 4242, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 99 };

/** Spielt eine feste Seilfolge und zeichnet sie auf. */
function seilPartie(seil = SEIL_NINJA) {
  const m = new MatchController({ ...KOPF, seil });
  m.start();
  const rec = new ReplayRecorder({ ...KOPF, seil });
  const id = m.activePlayerId;
  const eingabe = e => {
    const r = m.seilSystem.eingabe(id, e);
    if (r.ok) rec.recordInput({ tick: m.world.tickCount, playerId: id, ...e, kind: 'seil' });
    return r;
  };
  los(m, 10);
  const winkel = schiesseIrgendwohin({ schiessen: (pid, w) => eingabe({ aktion: 'schuss', winkel: w }) }, id);
  assert.notEqual(winkel, null, 'Testaufbau: das Seil hält irgendwo');
  for (let i = 0; i < 12; i += 1) {
    eingabe({ aktion: 'steuer', sx: i % 4 < 2 ? 1 : -1, sy: i < 6 ? -1 : 0 });
    los(m, 10);
  }
  eingabe({ aktion: 'loesen' });
  los(m, 200);
  rec.finalize(m.world.tickCount);
  return { m, rec };
}

test('Motor: zwei Läufe derselben Seilfolge ergeben denselben Zustandshash', () => {
  const a = seilPartie();
  const b = seilPartie();
  assert.equal(a.m.stateHash(), b.m.stateHash());
  assert.equal(a.m.getState().seil, undefined, 'nach der Landung trägt der Zustand kein Seil mehr');
});

test('Aufzeichnung: Seilschuss, Schwung, Lösen spielen exakt nach; die Marke steht im Kopf', () => {
  const { m, rec } = seilPartie();
  const dok = JSON.parse(JSON.stringify(rec.toJSON()));
  assert.equal(dok.config.seil, SEIL_NINJA);
  assert.ok(dok.entries.some(e => e.kind === 'seil' && e.aktion === 'schuss' && typeof e.winkel === 'number'));
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(dok).toJSON());
  while (spieler.step());
  assert.equal(spieler.match.stateHash(), m.stateHash());
});

test('Ohne Marke bitgleich: Fassung 1 und 2 ohne Seilbenutzung haben dieselben Hashes', () => {
  const lauf = seil => {
    const m = new MatchController({ ...KOPF, seil });
    m.start();
    const hashes = [];
    for (let t = 0; t < 900; t += 1) {
      if (t % 150 === 20 && m.activeProjectileCount === 0) m.fire(m.activePlayerId, 0.6 + (t % 7) * 0.1, 55);
      m.step();
      if (t % 100 === 0) hashes.push(m.stateHash());
    }
    return hashes;
  };
  assert.deepEqual(lauf(SEIL_NINJA), lauf(SEIL_ALT));
});

test('Altaufzeichnung ohne Marke: lädt als Fassung 1, Seileingaben laufen ins Leere', () => {
  const rec = new ReplayRecorder({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'open' });
  const dok = rec.toJSON();
  delete dok.config.seil;
  dok.entries.push({ tick: 3, playerId: 1, kind: 'seil', aktion: 'schuss', winkel: 1 });
  const geladen = ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(dok)));
  assert.equal(geladen.toJSON().config.seil, SEIL_ALT);
  const spieler = new ReplayPlayer(geladen.toJSON());
  assert.equal(spieler.match.seilSystem, null);
});

test('Validierung: nur bekannte Aktionen, Winkel in [0, π], sx/sy ganzzahlig −1…1, keine Zusatzfelder', () => {
  assert.equal(pruefeSeilEingabe({ aktion: 'schuss', winkel: 1.2 }).valid, true);
  assert.equal(pruefeSeilEingabe({ t: 'seil', aktion: 'loesen' }).valid, true);
  assert.equal(pruefeSeilEingabe({ aktion: 'steuer', sx: -1, sy: 1 }).valid, true);
  for (const schlecht of [
    null, [], {}, { aktion: 'fliegen' }, { aktion: 'schuss' }, { aktion: 'schuss', winkel: '1' }, { aktion: 'schuss', winkel: -0.1 },
    { aktion: 'schuss', winkel: 4 }, { aktion: 'schuss', winkel: Number.NaN }, { aktion: 'steuer', sx: 2, sy: 0 },
    { aktion: 'steuer', sx: 0.5, sy: 0 }, { aktion: 'steuer', sx: 0 }, { aktion: 'loesen', playerId: 2 },
    { aktion: 'schuss', winkel: 1, laenge: 9999 },
  ]) {
    assert.equal(pruefeSeilEingabe(schlecht).valid, false, JSON.stringify(schlecht));
  }
});

test('Server: lehnt ungültige und fremde Seil-Nachrichten ab, nimmt gültige an und zeichnet sie auf', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, playersPerTeam: 1, seed: 4242, preset: 'hills' });
  manager.join(lobby.id, { name: 'B' });
  const gesamt = manager.get(lobby.id);
  const session = new LobbySession(gesamt, {});
  session.syncSeats();
  const match = session.match;
  assert.equal(match.seil, SEIL_STANDARD, 'neue Partien spielen mit Seil');
  const aktiv = match.activePlayerId;
  const platz = gesamt.seats.find(seat => seat.entityId === aktiv);
  const fremd = gesamt.seats.find(seat => seat.entityId !== aktiv);
  los(match, 5);

  assert.equal(session.handleSeil(platz.token, { aktion: 'schuss', winkel: 9 }).ok, false);
  assert.equal(session.handleSeil(platz.token, { aktion: 'steuer', sx: 3, sy: 0 }).ok, false);
  assert.equal(session.handleSeil(platz.token, { aktion: 'schuss', winkel: 1, extra: 1 }).ok, false);
  assert.equal(session.handleSeil('falsches-token', { aktion: 'loesen' }).ok, false);
  assert.equal(session.handleSeil(fremd.token, { aktion: 'schuss', winkel: Math.PI / 2 }).ok, false, 'nicht am Zug');

  const winkel = schiesseIrgendwohin({ schiessen: (id, w) => session.handleSeil(platz.token, { aktion: 'schuss', winkel: w }) }, aktiv);
  assert.notEqual(winkel, null, 'Testaufbau: das Seil hält irgendwo');
  assert.equal(match.seilSystem.haengt(aktiv), true);
  assert.equal(session.handleSeil(platz.token, { aktion: 'steuer', sx: 1, sy: -1 }).ok, true);
  assert.equal(session.handleSeil(platz.token, { aktion: 'loesen' }).ok, true);
  const seilEintraege = session.recorder.toJSON().entries.filter(e => e.kind === 'seil');
  assert.deepEqual(seilEintraege.map(e => e.aktion), ['schuss', 'steuer', 'loesen']);
  assert.equal(session.recorder.toJSON().config.seil, SEIL_STANDARD);
});

test('Waffe vom Seil: ein Schuss löst das Seil, der Zug läuft weiter wie nach jedem Schuss', () => {
  const m = new MatchController({ ...KOPF, seil: SEIL_NINJA });
  m.start();
  los(m, 5);
  const id = m.activePlayerId;
  assert.notEqual(schiesseIrgendwohin(m.seilSystem, id), null);
  los(m, 20);
  const waffe = m.inventory.getWeapons(id).find(w => m.seilSystem.vorWaffe(id, w)?.ok);
  assert.ok(waffe, 'Testaufbau: eine Fernwaffe');
  assert.equal(m.fire(id, 1, 40, waffe).ok, true);
  assert.equal(m.seilSystem.haengt(id), false);
  assert.equal(m.seilSystem.schiessen(id, Math.PI / 2).ok, false, 'nach dem Schuss kein neues Seil');
});

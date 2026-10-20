/**
 * Tests: Günthers Aktionen (Fassung 2, `config.guenther`).
 *
 * Zusagen:
 *   - Fassung 1 (und jede Altdatei ohne das Feld) ist Bit für Bit das alte Verhalten
 *     (Goldwerte aus dem Stand VOR der Erweiterung, gemessen mit Fassung 1).
 *   - Jede Aktion hat ihre Wirkung, Zufall nur über den eigenen Teilgenerator.
 *   - Der Replay-Kopf trägt die Marke; fehlt sie, gilt `GUENTHER_ALT`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { GuentherSystem } from '../src/engine/systems/guentherSystem.js';
import { SeededRandom } from '../src/shared/prng.js';
import {
  GUENTHER_ALT, GUENTHER_AKTIONEN, GUENTHER_FASSUNG_STANDARD, GUENTHER_POSEN, GUENTHER_AKTION_IDS,
  GUENTHER_AKTION_REGELN, normalisiereGuenther,
} from '../src/shared/config/guenther.js';
import { COOKIE_ALT, COOKIE_KATER } from '../src/shared/config/cookie.js';
import { encodeSnapshot, decodeSnapshot } from '../src/shared/protocol.js';

/** Eine winzige Welt: Spieler mit Position und Leben. */
function welt(spieler) {
  const daten = new Map(spieler.map(s => [s.id, { x: s.x, y: s.y }]));
  return {
    isActive: id => daten.has(id),
    getComponent: (id, _komp, feld) => daten.get(id)?.[feld],
    setPos: (id, x, y) => daten.set(id, { x, y }),
  };
}

/** Kontext, der alle Handgriffe mitschreibt. */
function kontext(w, ids, extra = {}) {
  const log = { heile: [], stosse: [], krater: [], kisten: [], eaten: [], neu: [], events: [] };
  const ctx = {
    aktiverSpieler: null,
    spielerIds: ids,
    surfaceYAt: () => 100,
    schaden: () => {},
    haufenGetroffen: () => {},
    radAufloesen: () => ({}),
    melde: (typ, d) => log.events.push([typ, d]),
    kisten: () => log.kisten,
    kisteVerzehren: id => { log.eaten.push(id); log.kisten = log.kisten.filter(k => k.id !== id); },
    legeKiste: (rng, x, y) => { log.neu.push([x, y]); return 99; },
    heile: (id, b) => log.heile.push([id, b]),
    stosse: (id, vx, vy) => log.stosse.push([id, vx, vy]),
    krater: (...a) => log.krater.push(a),
    ...extra,
  };
  return { ctx, log };
}

function neuesSystem(fassung = GUENTHER_AKTIONEN, seed = 5) {
  const g = new GuentherSystem({
    rng: new SeededRandom(seed), maxRounds: 30, width: 1280, height: 720, fassung,
    aktionRng: new SeededRandom(seed + 1),
  });
  return g;
}

/** Lässt Günther auftreten, bis er aktiv ist. */
function aktiviere(g) {
  for (let r = 1; r < 30 && !g.aktiv; r++) g.setRunde(r);
  return g.aktiv;
}

function lauf(g, w, ctx, ticks) {
  for (let i = 0; i < ticks; i++) g.update(w, ctx);
}

test('Fassungen: neue Partien bekommen die Aktionsfassung, fehlend oder unbekannt ist Fassung 1', () => {
  assert.equal(GUENTHER_FASSUNG_STANDARD, GUENTHER_AKTIONEN);
  assert.equal(normalisiereGuenther(1), GUENTHER_ALT);
  assert.equal(normalisiereGuenther(2), GUENTHER_AKTIONEN);
  assert.equal(normalisiereGuenther(undefined), GUENTHER_ALT);
  assert.equal(normalisiereGuenther(7), GUENTHER_ALT);
  const ohne = new MatchController({ seed: 3, teams: 2, playersPerTeam: 1, preset: 'open' });
  assert.equal(ohne.guenther, GUENTHER_ALT, 'ohne Angabe spielt ein Match wie vorher');
  assert.equal(ohne.cookie, COOKIE_ALT);
  assert.equal(new ReplayRecorder({ seed: 3 }).config.guenther, GUENTHER_ALT);
});

test('Fassung 1 ist bit-identisch zum Stand vor der Erweiterung (Goldwerte)', () => {
  // Gemessen mit dem Stand VOR der Erweiterung (main 1f1fd54): Zustandshash, Hash des Günther-Zustands, Ereigniszahl.
  const gold = [[11, '50235139', 3746098622, 265], [4242, '7bc6f78c', 2535208100, 266]];
  for (const [seed, hash, gHash, ereignisse] of gold) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 1_000_000, maxRounds: 999, guenther: GUENTHER_ALT, cookie: COOKIE_ALT });
    m.start();
    let schuesse = 0;
    let ev = 0;
    for (let tick = 0; tick < 5000; tick++) {
      if (m.activeProjectileCount === 0 && tick % 150 === 0) {
        m.fire(m.activePlayerId, 0.5 + (schuesse % 9) * 0.15, 40 + (schuesse * 13) % 50, null);
        schuesse++;
      }
      m.step();
      ev += m.consumeEvents().length;
    }
    const g = JSON.stringify(m.getState().guenther);
    let h = 0;
    for (const c of g) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    assert.equal(m.stateHash(), hash, `Hash Seed ${seed}`);
    assert.equal(h, gHash, `Günther-Zustand Seed ${seed}`);
    assert.equal(ev, ereignisse, `Ereigniszahl Seed ${seed}`);
    assert.equal('pose' in m.getState().guenther, false, 'Fassung 1 kennt keine Pose');
    assert.equal('cookie' in m.getState(), false, 'Fassung 1 kennt keinen Cookie');
  }
});

test('Replay-Kopf: Altdatei ohne `guenther`/`cookie` = Fassung 1, neue Aufzeichnung trägt Fassung 2', () => {
  const alt = {
    format: 1, createdAt: 0, seed: 4242,
    config: { teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, turnDurationMs: 30000, kit: 3, zerstoerung: 3, kisten: 2 },
    totalTicks: 600, entries: [], rounds: [],
  };
  const recorder = ReplayRecorder.fromJSON(alt);
  assert.equal(recorder.config.guenther, GUENTHER_ALT);
  assert.equal(recorder.config.cookie, COOKIE_ALT);
  const { match } = playReplay(recorder);
  assert.equal(match.guenther, GUENTHER_ALT);
  assert.equal(match.cookie, COOKIE_ALT);
  assert.equal('cookie' in match.getState(), false);

  const neu = new ReplayRecorder({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, guenther: GUENTHER_AKTIONEN, cookie: COOKIE_KATER });
  assert.equal(neu.toJSON().config.guenther, GUENTHER_AKTIONEN);
  assert.equal(neu.toJSON().config.cookie, COOKIE_KATER);
  neu.finalize(300);
  const zurueck = ReplayRecorder.fromJSON(neu.serialize());
  const spiel = playReplay(zurueck).match;
  assert.equal(spiel.guenther, GUENTHER_AKTIONEN);
  assert.equal(spiel.cookie, COOKIE_KATER);
});

test('Wiedergabe gleicht der Live-Partie (Fassung 2) und bleibt bei Altkopf gleich', () => {
  for (const fassung of [GUENTHER_ALT, GUENTHER_AKTIONEN]) {
    const optionen = { seed: 31, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5, guenther: fassung, cookie: fassung };
    const live = new MatchController(optionen);
    const aufnahme = new ReplayRecorder(optionen);
    live.start();
    for (let tick = 0; tick < 2400; tick++) { live.step(); live.consumeEvents(); }
    aufnahme.finalize(live.world.tickCount);
    const json = JSON.parse(aufnahme.serialize());
    if (fassung === GUENTHER_ALT) { delete json.config.guenther; delete json.config.cookie; }
    const { match } = playReplay(ReplayRecorder.fromJSON(json));
    assert.equal(match.stateHash(), live.stateHash(), `Fassung ${fassung}`);
  }
});

test('Aktionsregeln: jede Aktion hat eine Pose aus der Sprite-Liste und sinnvolle Zeiten', () => {
  for (const id of GUENTHER_AKTION_IDS) {
    const r = GUENTHER_AKTION_REGELN[id];
    assert.ok(GUENTHER_POSEN.includes(r.pose), `${id}: Pose ${r.pose}`);
    assert.ok(r.ticks > 0 && r.gewicht > 0, id);
    assert.ok(r.wirkung <= r.ticks, id);
  }
  assert.ok(GUENTHER_POSEN.length <= 32, 'passt in die fünf Flag-Bits');
  assert.deepEqual([...GUENTHER_AKTION_IDS].sort(),
    ['chaos', 'essen', 'huepfen', 'kraulen', 'kuscheln', 'platz', 'sitz', 'wuehlen', 'ziehen']);
});

test('Fassung 2 verlangt einen eigenen Aktionsgenerator', () => {
  assert.throws(() => new GuentherSystem({ rng: new SeededRandom(1), width: 1280, height: 720, fassung: GUENTHER_AKTIONEN }), TypeError);
  assert.throws(() => neuesSystem(GUENTHER_ALT).erzwingeAktion('essen'), /nicht verfügbar/);
});

test('essen: frisst die Kiste und heilt den nächsten Spieler', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const { x, y } = g.position;
  const w = welt([{ id: 1, x: x + 40, y: 100 }]);
  const { ctx, log } = kontext(w, [1]);
  log.kisten = [{ id: 7, x: x + 20, y }];
  g.erzwingeAktion('essen', 7);
  assert.equal(g.pose, 'essen');
  lauf(g, w, ctx, GUENTHER_AKTION_REGELN.essen.ticks + 2);
  assert.deepEqual(log.eaten, [7]);
  assert.deepEqual(log.heile, [[1, GUENTHER_AKTION_REGELN.essen.heilung]]);
  const wirkung = log.events.find(e => e[0] === 'guenther_aktion_wirkung');
  assert.equal(wirkung[1].aktion, 'essen');
  assert.equal(wirkung[1].amount, GUENTHER_AKTION_REGELN.essen.heilung);
});

test('essen: ohne Kiste in Reichweite wird die Aktion nie gewählt', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext(w, [1]);
  lauf(g, w, ctx, 3000);
  assert.equal(log.events.filter(e => e[0] === 'guenther_aktion' && e[1].aktion === 'essen').length, 0);
});

test('kuscheln heilt, Rücken kraulen heilt mehr (Bonus)', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const { x } = g.position;
  const w = welt([{ id: 1, x: x + 30, y: 100 }]);
  const { ctx, log } = kontext(w, [1]);
  g.erzwingeAktion('kuscheln', 1);
  assert.equal(g.pose, 'kuscheln');
  lauf(g, w, ctx, GUENTHER_AKTION_REGELN.kuscheln.ticks);
  g.erzwingeAktion('kraulen', 1);
  assert.equal(g.pose, 'rueckenlage');
  lauf(g, w, ctx, GUENTHER_AKTION_REGELN.kraulen.ticks);
  const heilungen = log.heile.map(h => h[1]);
  assert.deepEqual(heilungen.slice(0, 2), [GUENTHER_AKTION_REGELN.kuscheln.heilung, GUENTHER_AKTION_REGELN.kraulen.heilung]);
  assert.ok(GUENTHER_AKTION_REGELN.kraulen.heilung > GUENTHER_AKTION_REGELN.kuscheln.heilung);
});

test('ziehen: das Seil zieht den Spieler zu Günther hin (Vorzeichen folgt der Seite)', () => {
  for (const seite of [-1, 1]) {
    const g = neuesSystem();
    assert.ok(aktiviere(g), 'Günther tritt auf');
    const { x } = g.position;
    const w = welt([{ id: 1, x: x + seite * 150, y: 100 }]);
    const { ctx, log } = kontext(w, [1]);
    g.erzwingeAktion('ziehen', 1);
    lauf(g, w, ctx, GUENTHER_AKTION_REGELN.ziehen.ticks);
    assert.equal(log.stosse.length, 1);
    assert.equal(Math.sign(log.stosse[0][1]), -seite, 'Zug zeigt zu Günther');
    assert.ok(log.stosse[0][2] < 0, 'leicht nach oben');
  }
});

test('wühlen: wühlt das Gelände auf und findet manchmal eine Kiste', () => {
  let funde = 0;
  let krater = 0;
  let getestet = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g = neuesSystem(GUENTHER_AKTIONEN, seed);
    if (!aktiviere(g)) continue; // dieser Seed würfelt keinen Auftritt
    getestet += 1;
    const w = welt([{ id: 1, x: 5000, y: 100 }]);
    const { ctx, log } = kontext(w, [1]);
    g.erzwingeAktion('wuehlen');
    lauf(g, w, ctx, GUENTHER_AKTION_REGELN.wuehlen.ticks);
    krater += log.krater.length;
    funde += log.neu.length;
    assert.equal(log.krater.length, 1, 'genau ein Loch je Wühlen');
    assert.ok(log.neu.length <= 1);
  }
  assert.equal(krater, getestet);
  assert.ok(getestet >= 20, `genug Seeds mit Auftritt: ${getestet}`);
  assert.ok(funde > 0 && funde < getestet, `Funde ${funde} von ${getestet} (Chance ${GUENTHER_AKTION_REGELN.wuehlen.fundChance})`);
});

test('wildes Bellen: scheucht Spieler im Radius auf, ferne bleiben ungestört, er läuft schneller', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const { x } = g.position;
  const w = welt([{ id: 1, x: x - 100, y: 100 }, { id: 2, x: x - 900, y: 100 }]);
  const { ctx, log } = kontext(w, [1, 2]);
  g.erzwingeAktion('chaos');
  assert.equal(g.pose, 'bellen');
  let weg = 0;
  let letzte = g.position.x;
  for (let i = 0; i < GUENTHER_AKTION_REGELN.chaos.ticks; i++) {
    g.update(w, ctx);
    weg += Math.abs(g.position.x - letzte);
    letzte = g.position.x;
  }
  assert.ok(log.stosse.length >= 4, 'mehrere Takte');
  assert.ok(log.stosse.every(s => s[0] === 1), 'nur der Nahe wird aufgescheucht');
  assert.ok(log.stosse.every(s => s[2] === GUENTHER_AKTION_REGELN.chaos.stossY));
  assert.ok(weg > GUENTHER_AKTION_REGELN.chaos.ticks * 0.5, `er bleibt nicht stehen (Weg ${weg.toFixed(0)} px)`);
});

test('Sitz und Platz: Günther steht still und pinkelt/kackt währenddessen nicht', () => {
  for (const id of ['sitz', 'platz']) {
    const g = neuesSystem();
    assert.ok(aktiviere(g), 'Günther tritt auf');
    const { x } = g.position;
    const w = welt([{ id: 1, x: x + 20, y: 100 }]);
    const { ctx, log } = kontext(w, [1]);
    g.erzwingeAktion(id);
    const start = g.position.x;
    lauf(g, w, ctx, GUENTHER_AKTION_REGELN[id].ticks - 1);
    assert.equal(g.position.x, start, `${id}: bleibt stehen`);
    assert.equal(log.events.filter(e => e[0] === 'guenther_pee' || e[0] === 'guenther_poop').length, 0, `${id}: ruhig`);
  }
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const w = welt([{ id: 1, x: g.position.x + 20, y: 100 }]);
  const { ctx } = kontext(w, [1]);
  g.erzwingeAktion('platz');
  lauf(g, w, ctx, GUENTHER_AKTION_REGELN.platz.ticks - 5);
  assert.equal(g.pose, 'schlafen', 'beim Platz döst er in der zweiten Hälfte');
});

test('hüpfen: nur Pose und Meldung, keine Wirkung auf die Welt', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const w = welt([{ id: 1, x: g.position.x + 20, y: 100 }]);
  const { ctx, log } = kontext(w, [1]);
  g.erzwingeAktion('huepfen');
  assert.equal(g.pose, 'huepfen');
  lauf(g, w, ctx, GUENTHER_AKTION_REGELN.huepfen.ticks);
  assert.deepEqual([log.heile, log.stosse, log.krater, log.eaten], [[], [], [], []]);
});

test('kacken: beim Ablegen eines Haufens zeigt die Pose „kacken"', () => {
  const g = neuesSystem();
  assert.ok(aktiviere(g), 'Günther tritt auf');
  const w = welt([{ id: 1, x: 5000, y: 100 }]);
  const { ctx, log } = kontext(w, [1]);
  let gesehen = false;
  for (let i = 0; i < 400 && !gesehen; i++) {
    g.update(w, ctx);
    if (log.events.some(e => e[0] === 'guenther_poop')) gesehen = g.pose === 'kacken';
  }
  assert.ok(gesehen);
});

test('Auswahl: nur Aktionen mit erfüllter Bedingung, nie dieselbe zweimal hintereinander, deterministisch', () => {
  const lauf1 = (seed) => {
    const g = neuesSystem(GUENTHER_AKTIONEN, seed);
    assert.ok(aktiviere(g), 'Günther tritt auf');
    const w = welt([{ id: 1, x: g.position.x + 50, y: 100 }]);
    const { ctx, log } = kontext(w, [1]);
    lauf(g, w, ctx, 6000);
    return log.events.filter(e => e[0] === 'guenther_aktion').map(e => e[1].aktion);
  };
  const a = lauf1(9);
  assert.ok(a.length >= 8);
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i], a[i - 1]);
  assert.ok(!a.includes('essen'), 'ohne Kiste kein Essen');
  assert.deepEqual(lauf1(9), a, 'gleicher Seed, gleiche Folge');
});

test('Die Aktionen verschieben den Zufallsstrom der Fassung 1 nicht (Auftrittsplan gleich)', () => {
  const alt = neuesSystem(GUENTHER_ALT, 77);
  const neu = neuesSystem(GUENTHER_AKTIONEN, 77);
  assert.deepEqual(neu.plan, alt.plan);
});

test('Partie in Fassung 2: Günther zeigt Posen, die Aktionen laufen durch den Motor', () => {
  const m = new MatchController({ seed: 7, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, guenther: GUENTHER_AKTIONEN, cookie: COOKIE_KATER });
  m.start();
  const arten = new Set();
  const posen = new Set();
  for (let i = 0; i < 60 * 150; i++) {
    m.step();
    for (const e of m.consumeEvents()) if (e.type === 'guenther_aktion') arten.add(e.payload.aktion);
    const gs = m.getState().guenther;
    if (gs.aktiv) posen.add(gs.pose);
  }
  assert.ok(arten.size >= 4, `verschiedene Aktionen: ${[...arten]}`);
  assert.ok(posen.size >= 4, `verschiedene Posen: ${[...posen]}`);
  for (const p of posen) assert.ok(GUENTHER_POSEN.includes(p), p);
});

test('Protokoll: die Pose reist in den Flag-Bits, alte Sender (ohne Pose) bleiben lesbar', () => {
  const basis = {
    tick: 5, round: 1, wind: 0, activePlayerId: 0, entities: [], projectiles: [], crates: [], turrets: [],
  };
  for (const pose of GUENTHER_POSEN) {
    const bytes = encodeSnapshot({ ...basis, guenther: { aktiv: true, x: 100, y: 200, richtung: -1, haufen: [], pose } });
    const d = decodeSnapshot(bytes);
    assert.equal(d.guenther.aktiv, true);
    assert.equal(d.guenther.pose, pose);
  }
  const alt = decodeSnapshot(encodeSnapshot({ ...basis, guenther: { aktiv: true, x: 1, y: 2, richtung: 1, haufen: [] } }));
  assert.equal(alt.guenther.aktiv, true);
  assert.equal('pose' in alt.guenther, false, 'ohne Pose bleibt das Feld weg');
  assert.equal('cookie' in alt, false);
});

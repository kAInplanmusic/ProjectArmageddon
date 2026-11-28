/**
 * Ereignisfassung 2 (TODO 2.13, Wunsch des Auftraggebers 2026-11-28): Blondine, Gewitter, Erdbeben.
 * Fassung 1 bleibt bitgleich; Wetter und Beben töten nie, die Blondine darf (Kuss : Auslachen = 8 : 1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, playReplay } from '../src/engine/replay.js';
import { EREIGNISSE, EREIGNISSE_ALT, EREIGNISSE_START, EREIGNISSE_FEUER_RISSE, EREIGNISSE_STANDARD, normalisiereEreignisse } from '../src/shared/config/ereignisse.js';
import { MENUE_FASSUNGEN } from '../src/shared/config/menueStart.js';

function spiele(seed, ereignisse, maxRounds = 8) {
  const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', ereignisse, maxRounds, turnDurationMs: 300 });
  m.start();
  const liste = [];
  let n = 0;
  while (m.status === 'playing' && n < 40_000) {
    m.step();
    for (const e of m.consumeEvents()) if (e.type === 'ereignis') liste.push({ ...e.payload, runde: m.round });
    n += 1;
  }
  return { m, liste };
}

test('Die neueste Fassung (3) ist der Standard und steht im Menü; Unbekanntes schaltet nichts ein', () => {
  assert.equal(EREIGNISSE_STANDARD, EREIGNISSE_FEUER_RISSE);
  assert.equal(MENUE_FASSUNGEN.ereignisse, EREIGNISSE_STANDARD);
  assert.equal(normalisiereEreignisse(EREIGNISSE_START), EREIGNISSE_START);
  assert.equal(normalisiereEreignisse(99), EREIGNISSE_ALT);
  assert.equal(normalisiereEreignisse(undefined), EREIGNISSE_ALT);
});

test('Fassung 1: kein Ereignis, kein Eingriff (Zustandshash wie ohne Angabe)', () => {
  const a = new MatchController({ seed: 5, teams: 2, playersPerTeam: 2 });
  const b = new MatchController({ seed: 5, teams: 2, playersPerTeam: 2, ereignisse: EREIGNISSE_ALT });
  a.start(); b.start();
  for (let i = 0; i < 3000; i += 1) { a.step(); b.step(); }
  assert.equal(a.stateHash(), b.stateHash());
  assert.equal(b.ereignisSystem, null);
  assert.equal(spiele(5, EREIGNISSE_ALT).liste.length, 0);
});

test('Fassung 2: alle drei Ereignisse kommen vor, nie vor Runde 2, höchstens eines je Runde', () => {
  const arten = new Set();
  for (let seed = 1; seed <= 30; seed += 1) {
    const { liste } = spiele(seed, EREIGNISSE_START);
    const jeRunde = new Map();
    for (const e of liste) {
      arten.add(e.art);
      assert.ok(e.runde >= EREIGNISSE.abRunde);
      jeRunde.set(e.runde, (jeRunde.get(e.runde) ?? 0) + 1);
    }
    for (const n of jeRunde.values()) assert.equal(n, 1);
  }
  assert.deepEqual([...arten].sort(), ['blondine', 'erdbeben', 'gewitter']);
});

test('Gewitter und Erdbeben töten nie; die Blondine küsst (+10 bis +50) oder lacht aus (−69), Verhältnis etwa 8 : 1', () => {
  let kuss = 0;
  let lachen = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const { liste } = spiele(seed, EREIGNISSE_START);
    for (const e of liste) {
      if (e.art === 'blondine') {
        if (e.ausgang === 'kuss') { kuss += 1; assert.ok(e.betrag >= 0 && e.betrag <= EREIGNISSE.kussMax); }
        else { lachen += 1; assert.equal(e.betrag, EREIGNISSE.auslachen); }
      }
      const treffer = e.art === 'gewitter' ? e.blitze.flatMap(b => b.getroffen) : (e.getroffen ?? []);
      if (e.art !== 'blondine') for (const t of treffer) assert.ok(t.betrag >= 0 && t.betrag <= EREIGNISSE.blitzSchadenMax);
    }
  }
  assert.ok(kuss + lachen >= 30, `genug Blondinen gemessen (${kuss + lachen})`);
  const anteil = kuss / (kuss + lachen);
  assert.ok(anteil > 0.75 && anteil < 0.97, `Kussanteil ${anteil.toFixed(2)} nahe 8/9`);
});

test('Ein Erdbeben lässt jede Figur mit mindestens 1 Leben stehen', () => {
  const m = new MatchController({ seed: 7, teams: 2, playersPerTeam: 1, preset: 'hills', ereignisse: EREIGNISSE_START });
  m.start();
  const welt = m.world;
  for (const p of m.players) welt.setComponent(p.entityId ?? p.id, 'Health', 'current', 2);
  const regeln = { ...EREIGNISSE, abRunde: 1, chance: 1, gewichte: { erdbeben: 1 }, bebenSchaden: 50 };
  const sys = new (m.ereignisSystem.constructor)(m, { next: () => 0.5 }, regeln);
  assert.equal(sys.rundenbeginn(3), 'erdbeben');
  for (const p of m.players) assert.equal(welt.getComponent(p.entityId ?? p.id, 'Health', 'current'), 1);
});

test('Replay: Kopf trägt Fassung 2, die Wiedergabe ergibt denselben Hash', () => {
  const kopf = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 6, ereignisse: EREIGNISSE_START, turnDurationMs: 300 };
  const live = new MatchController(kopf);
  const recorder = new ReplayRecorder(kopf);
  live.start();
  for (let t = 0; t < 6000; t += 1) live.step();
  recorder.finalize(6000);
  assert.equal(recorder.toJSON().config.ereignisse, EREIGNISSE_START);
  const { match } = playReplay(ReplayRecorder.fromJSON(recorder.serialize()));
  assert.equal(match.stateHash(), live.stateHash());
});

test('Fassung 3: Blitze entzünden Brennbares, Erdbeben reißen Risse; Fassung 2 tut beides nicht', () => {
  const lauf = (fassung) => {
    let feuer = 0;
    let risse = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', ereignisse: fassung, maxRounds: 8, turnDurationMs: 300, feuer: 2, kartentyp: 'autonom', biom: 'dschungel' });
      m.start();
      let n = 0;
      while (m.status === 'playing' && n < 40_000) {
        m.step();
        for (const e of m.consumeEvents()) {
          if (e.type === 'feuer_schritt') feuer += 1;
          if (e.type === 'ereignis' && e.payload.art === 'erdbeben') risse += e.payload.risse.length;
        }
        n += 1;
      }
    }
    return { feuer, risse };
  };
  const alt = lauf(EREIGNISSE_START);
  const neu = lauf(EREIGNISSE_FEUER_RISSE);
  assert.equal(alt.risse, 0);
  assert.ok(neu.risse > 0, 'Fassung 3 reißt Risse');
  assert.ok(neu.feuer > alt.feuer, `Fassung 3 entzündet (${neu.feuer} gegen ${alt.feuer} Feuerschritte)`);
});

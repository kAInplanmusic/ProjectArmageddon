import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { SchussAufnahme, MINDESTPUNKTE } from '../src/client/schussWiederholung.js';

/*
 * Zugpause (Entscheidung des Auftraggebers, 2026-10-13): vor jedem Zug steht das Spiel still;
 * nach einem Schuss zeigt die Anzeige vorher die Wiederholung. Die Engine kennt die Pause nur
 * als Option — ohne sie (Vorgabe) verhält sie sich wie bisher.
 */
const neu = opts => {
  const m = new MatchController({ seed: 6, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 20_000, ...opts });
  m.start();
  return m;
};
const schritte = (m, n) => { for (let i = 0; i < n; i += 1) { m.step(); m.consumeEvents(); } };

test('Ohne Option gibt es keine Pause (Vorgabe 0)', () => {
  const m = neu({});
  assert.equal(m.turnPauseMs, 0);
  assert.equal(m.fire(m.activePlayerId, 0.8, 60, m.inventory.getActiveWeaponId(m.activePlayerId)).ok, true);
});

test('In der Pause sind Schießen und Springen gesperrt, die Zugzeit steht, danach geht alles', () => {
  const m = neu({ turnPauseTicks: 180, turnReplayTicks: 120 });
  const id = m.activePlayerId;
  const waffe = m.inventory.getActiveWeaponId(id);
  assert.equal(m.turnPauseMs, 3000, 'der erste Zug hat keine Wiederholung: 3 s');
  assert.equal(m.fire(id, 0.8, 60, waffe).ok, false);
  assert.equal(m.jump(id, 1).ok, false);
  schritte(m, 90);
  assert.equal(m.getState().turnElapsedMs, 0, 'die Zugzeit läuft in der Pause nicht');
  schritte(m, 91);
  assert.equal(m.turnPauseMs, 0);
  assert.equal(m.fire(id, 0.8, 60, waffe).ok, true);
});

test('Nach einem Schuss kommt die Wiederholung vor die Pause; ohne Schuss nicht', () => {
  const m = neu({ turnPauseTicks: 180, turnReplayTicks: 120 });
  schritte(m, 181);
  const a = m.activePlayerId;
  assert.equal(m.fire(a, 0.8, 60, m.inventory.getActiveWeaponId(a)).ok, true);
  let turnStart = null;
  for (let i = 0; i < 1200 && !turnStart; i += 1) {
    m.step();
    turnStart = m.consumeEvents().find(e => e.type === 'turn_start') ?? null;
  }
  assert.ok(turnStart, 'der nächste Zug beginnt');
  const nutz = turnStart.payload ?? turnStart;
  assert.equal(nutz.replayTicks, 120);
  assert.equal(nutz.pauseTicks, 300);

  // Zug ohne Schuss (Zeit läuft ab): keine Wiederholung.
  const m2 = neu({ turnPauseTicks: 180, turnReplayTicks: 120, turnDurationMs: 1000 });
  let ts = null;
  for (let i = 0; i < 1000 && !ts; i += 1) {
    m2.step();
    for (const e of m2.consumeEvents()) if (e.type === 'turn_start') ts = e;
  }
  const n2 = ts.payload ?? ts;
  assert.equal(n2.replayTicks, 0);
  assert.equal(n2.pauseTicks, 180);
});

test('SchussAufnahme: ein Flug wird aufgenommen, kurze Flüge und laufende nicht gezeigt', () => {
  const a = new SchussAufnahme();
  assert.equal(a.vorhanden, false);
  for (let i = 0; i < MINDESTPUNKTE + 4; i += 1) a.erfasse([{ x: i * 10, y: 100 - i }]);
  assert.equal(a.vorhanden, false, 'solange es fliegt, gibt es nichts zu wiederholen');
  a.erfasse([]);
  assert.equal(a.vorhanden, true);
  const z0 = a.zustand(0);
  assert.equal(z0.spur.length, 1);
  assert.equal(z0.aufprall, false);
  const z1 = a.zustand(1);
  assert.equal(z1.spur.length, MINDESTPUNKTE + 4);
  assert.equal(z1.aufprall, true);
  assert.deepEqual(z1.kopf, [(MINDESTPUNKTE + 3) * 10, 100 - (MINDESTPUNKTE + 3)]);

  // Ein neuer Schuss ersetzt den alten.
  a.erfasse([{ x: 1, y: 1 }]);
  assert.equal(a.vorhanden, false);
  a.erfasse([]);
  assert.equal(a.vorhanden, false, 'ein 1-Punkt-Flug ist keine Wiederholung wert');
  assert.equal(a.zustand(0.5), null);
});

test('Die Zugpause steht im Zustandshash (nur solange sie läuft) und im Beitritts-Zustand', async () => {
  const { hashState } = await import('../src/engine/stateSnapshot.js');
  const m = neu({ turnPauseTicks: 180 });
  const mitPause = hashState(m.getState());
  assert.equal(m.getState().turnPauseMs, 3000);
  schritte(m, 1);
  assert.notEqual(hashState(m.getState()), mitPause);
  const o = neu({});
  assert.equal(o.getState().turnPauseMs, 0);
  // Ohne Pause bleibt der Hash der bisherigen Form (keine Pause-Marke im Hash).
  const ohne = new MatchController({ seed: 6, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 20_000 });
  ohne.start();
  assert.equal(hashState(ohne.getState()), hashState(o.getState()));
});

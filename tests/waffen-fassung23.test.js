/**
 * Waffenfassung 23 (TURRET-1, TODO 2.17b): Tesla-Turm, Kampfgeschütz und Gatlingkanone stellen ein Geschütz auf.
 * Fassungen 1 bis 22 bleiben unverändert.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { buildEffect, EFFECT_KIND } from '../src/engine/specials.js';
import { getWaffe, WAFFEN_TURM, WAFFEN_WURF, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { WAFFEN_F23_WERTE } from '../src/shared/config/waffen-f23.js';
import { FESTE_STARTWAFFEN, GIMMICKS, LEGENDAERE_WAFFEN } from '../src/shared/config/ausruestung.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { SPEZIAL_JE_FIGUR } from '../src/shared/config/ausruestung-spezial.js';

const GESCHUETZE = Object.keys(WAFFEN_F23_WERTE).filter(id => WAFFEN_F23_WERTE[id].special === 'auto_target');

test('Fassung 23 ist der Standard: drei Geschütze, keines davon eine feste Startwaffe; Tesla und Gatling nur aus Kisten', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_TURM);
  assert.deepEqual(GESCHUETZE.slice().sort(), ['pa_043', 'pa_060', 'pa_129']);
  const fest = new Set([...FESTE_STARTWAFFEN, ...Object.keys(GIMMICKS)]);
  for (const id of GESCHUETZE) assert.ok(!fest.has(id), `${id} ist keine feste Startwaffe`);
  const spezial = new Set(Object.values(SPEZIAL_JE_FIGUR));
  assert.ok(!spezial.has('pa_129') && !spezial.has('pa_060'), 'Tesla-Turm und Gatling kommen nur aus Kisten');
});

test('Fassung 23: mindestens zehn legendäre Waffen (11), dieselben wie in der Startausrüstung; Fassung 22 hatte 3', () => {
  const legendaer = f => WEAPONS.filter(w => getWaffe(w.id, f).powerTier === 'legendary').map(w => w.id).sort();
  assert.equal(legendaer(WAFFEN_WURF).length, 3);
  assert.ok(legendaer(WAFFEN_TURM).length >= 10);
  assert.deepEqual(legendaer(WAFFEN_TURM), [...LEGENDAERE_WAFFEN].sort());
});

test('Fassung 22 bleibt unverändert, Fassung 23 macht ein Geschütz daraus (unterschiedliche Dauer und Stärke)', () => {
  const dauer = new Set();
  for (const id of GESCHUETZE) {
    const alt = buildEffect(getWaffe(id, WAFFEN_WURF));
    assert.notEqual(alt?.kind, EFFECT_KIND.TURRET, `${id} war in Fassung 22 kein Geschütz`);
    const neu = buildEffect(getWaffe(id, WAFFEN_TURM));
    assert.equal(neu.kind, EFFECT_KIND.TURRET);
    assert.equal(neu.turns, WAFFEN_F23_WERTE[id].wirkung.turns);
    assert.ok(neu.damage > 0 && neu.range > 0);
    dauer.add(neu.turns);
  }
  assert.equal(dauer.size, 3, 'die drei Geschütze unterscheiden sich');
  // Das Wachgeschütz behält seine Werte.
  assert.deepEqual(buildEffect(getWaffe('pa_124', WAFFEN_TURM)), buildEffect(getWaffe('pa_124', WAFFEN_WURF)));
});

test('Im Motor: jede der drei Waffen stellt ein Geschütz auf, das in den Folgerunden von selbst feuert', () => {
  for (const waffe of GESCHUETZE) {
    const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'open', turnDurationMs: 300, maxRounds: 12, waffen: WAFFEN_TURM });
    match.start();
    const spieler = match.activePlayerId;
    match.inventory.register(spieler, [waffe]);
    match.inventory.selectWeapon(spieler, waffe);
    const ergebnis = match.fire(spieler, 0.5, 60, waffe);
    assert.equal(ergebnis.ok, true, `${waffe}: ${JSON.stringify(ergebnis)}`);
    assert.equal(ergebnis.special?.kind, EFFECT_KIND.TURRET, waffe);
    assert.equal(match.getState().turrets.length, 1, `${waffe}: Geschütz steht`);
    const schuesse = [];
    let schritte = 0;
    while (match.status === 'playing' && match.round < 4 && schritte < 20_000) {
      match.step();
      for (const e of match.consumeEvents()) if (e.type === 'turret_fired') schuesse.push(e);
      schritte += 1;
    }
    assert.ok(schuesse.length >= 1, `${waffe}: das Geschütz feuert`);
  }
});

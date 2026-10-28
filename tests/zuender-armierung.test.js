/**
 * Tests: Armierung der Zündergranaten (Waffenfassung 6, `docs/balance-auslese/zuender-test.md`).
 *
 * Bis Fassung 5 sank eine armierte Granate je Takt rund 0,3 px, weil der Treffpunkt (erster
 * Abtastpunkt im Festen) jeden Takt neu gesetzt und die Schwerkraft neu aufgeschlagen wurde. Sie
 * zündete 11 bis 82 px unter dem Aufprall, teils außerhalb des eigenen Sprengradius. Fassung 6
 * lässt sie am Aufprallpunkt liegen. Belegt:
 *  1. Fassung 6: Zündort = Aufprallort, innerhalb des eigenen Sprengradius, für alle 11 Zünderwaffen;
 *  2. Fassung 6: ein Ziel am Aufprallpunkt nimmt Schaden (Mindestwirkung) und mindestens so viel wie in Fassung 5;
 *  3. Fassung 5 verhält sich unverändert (sinkt weiter), Fassung 1 und 4 ebenso;
 *  4. Determinismus: gleicher Seed, gleiche Fassung, gleicher Zustandshash.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { WAFFEN_ALT, WAFFEN_FEIN, WAFFEN_FAIR, WAFFEN_ZUENDER } from '../src/shared/config/waffen-fassung.js';

const ZUENDER_IDS = Object.freeze([
  'pa_028', 'pa_029', 'pa_030', 'pa_046', 'pa_047', 'pa_048', 'pa_052', 'pa_053', 'pa_070', 'pa_073', 'pa_144',
]);

/** Wirksamer Radius wie im Motor (`shooting.js`: `blastRadius || 24`). */
const radiusVon = waffe => waffe.blastRadius || 24;

/**
 * Ein Wurf (Winkel 0,7, Kraft 60) auf die Hügelkarte; optional steht das Ziel mit voller
 * Gesundheit schon dort, wo die Granate armiert wurde.
 */
function wurf(waffenId, fassung, { seed = 4242, ziel = null } = {}) {
  const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000_000, waffen: fassung });
  match.start();
  match.consumeEvents();
  const schuetze = match.activePlayerId;
  const gegner = match.players.find(p => p.entityId !== schuetze).entityId;
  const w = match.world;
  if (ziel) {
    w.setComponent(gegner, 'Position', 'x', ziel.x);
    w.setComponent(gegner, 'Position', 'y', ziel.y);
  }
  w.setComponent(gegner, 'Health', 'max', 1000);
  w.setComponent(gegner, 'Health', 'current', 1000);
  match.inventory.register(schuetze, [waffenId]);
  const schuss = match.fire(schuetze, 0.7, 60, waffenId);
  assert.equal(schuss.ok, true, `${waffenId}: Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  let armiert = null;
  let gezuendet = null;
  const lagen = [];
  for (let i = 0; i < 1500 && !gezuendet; i += 1) {
    match.step();
    for (const e of match.consumeEvents()) {
      if (e.type === 'fuse_armed' && !armiert) armiert = { x: e.payload.x, y: e.payload.y, tick: i };
      if (e.type === 'fuse_armed') lagen.push({ x: e.payload.x, y: e.payload.y });
      if (e.type === 'fuse_expired' && !gezuendet) gezuendet = { x: e.payload.x, y: e.payload.y, tick: i };
    }
  }
  for (let i = 0; i < 12; i += 1) { match.step(); match.consumeEvents(); }
  const schaden = 1000 - (w.getComponent(gegner, 'Health', 'current') ?? 0);
  return { match, armiert, gezuendet, schaden, lagen };
}

test('Katalog: die elf Zünderwaffen tragen einen Zünder', () => {
  for (const id of ZUENDER_IDS) assert.ok(WEAPONS_BY_ID[id].fuseTime > 0, id);
});

test('Fassung 6: jede Zünderwaffe zündet am Aufprallpunkt, innerhalb ihres Sprengradius', () => {
  for (const id of ZUENDER_IDS) {
    const r = wurf(id, WAFFEN_ZUENDER);
    assert.ok(r.armiert, `${id}: wurde nicht armiert`);
    assert.ok(r.gezuendet, `${id}: zündete nicht`);
    const abstand = Math.hypot(r.gezuendet.x - r.armiert.x, r.gezuendet.y - r.armiert.y);
    assert.ok(abstand < 0.001, `${id}: zündete ${abstand.toFixed(2)} px vom Aufprallpunkt`);
    assert.ok(abstand <= radiusVon(WEAPONS_BY_ID[id]), `${id}: außerhalb des eigenen Sprengradius`);
    assert.equal(r.lagen.length, 1, `${id}: fuse_armed einmal, nicht je Takt (${r.lagen.length})`);
    const dauer = r.gezuendet.tick - r.armiert.tick;
    const soll = Math.round(WEAPONS_BY_ID[id].fuseTime * 60);
    assert.ok(dauer > 0 && dauer <= soll, `${id}: Zündung ${dauer} Takte nach dem Aufprall, Zünder ${soll}`);
  }
});

test('Fassung 6: ein Ziel am Aufprallpunkt nimmt Schaden, mindestens so viel wie in Fassung 5', () => {
  for (const id of ZUENDER_IDS) {
    const ort = wurf(id, WAFFEN_ZUENDER).armiert;
    const ziel = { x: ort.x, y: ort.y };
    const neu = wurf(id, WAFFEN_ZUENDER, { ziel });
    const alt = wurf(id, WAFFEN_FAIR, { ziel });
    assert.ok(neu.schaden >= 5, `${id}: Fassung 6 nur ${neu.schaden.toFixed(1)} Schaden am Aufprallpunkt`);
    // Brand- und Giftwaffen wirken über Züge und mit großem Radius; ihr Wert streut um wenige Prozent
    // (Rückstoß, Fall des Ziels), sie sinken in Fassung 5 kaum aus dem Radius. Alle anderen gewinnen deutlich.
    const dot = ['pa_052', 'pa_070', 'pa_073'].includes(id);
    assert.ok(neu.schaden >= alt.schaden * (dot ? 0.9 : 1) - 0.01, `${id}: Fassung 6 ${neu.schaden.toFixed(1)} < Fassung 5 ${alt.schaden.toFixed(1)}`);
  }
});

test('Fassung 5 unverändert: die armierte Granate sinkt weiter (Zünderwaffen mit langem Zünder)', () => {
  let gesunken = 0;
  for (const id of ZUENDER_IDS) {
    const r = wurf(id, WAFFEN_FAIR);
    assert.ok(r.armiert && r.gezuendet, id);
    const tiefe = r.gezuendet.y - r.armiert.y;
    assert.ok(tiefe >= 0, `${id}: sinkt nie nach oben`);
    if (WEAPONS_BY_ID[id].fuseTime >= 2) {
      assert.ok(tiefe > 5, `${id}: Fassung 5 sank nur ${tiefe.toFixed(1)} px`);
      gesunken += 1;
    }
    assert.ok(r.lagen.length > 1, `${id}: Fassung 5 meldet fuse_armed weiter je Takt`);
  }
  assert.ok(gesunken >= 8, `nur ${gesunken} Waffen sanken`);
});

test('Fassung 1 und 4 sinken wie Fassung 5 (nur Fassung 6 ändert die Regel)', () => {
  for (const fassung of [WAFFEN_ALT, WAFFEN_FEIN]) {
    const r = wurf('pa_047', fassung);
    assert.ok(r.gezuendet.y - r.armiert.y > 5, `Fassung ${fassung}: sank nicht`);
  }
});

test('Determinismus: gleicher Seed und gleiche Fassung geben denselben Zustandshash', () => {
  for (const id of ['pa_047', 'pa_144', 'pa_052']) {
    const a = wurf(id, WAFFEN_ZUENDER, { seed: 777 });
    const b = wurf(id, WAFFEN_ZUENDER, { seed: 777 });
    assert.equal(a.match.stateHash(), b.match.stateHash(), id);
    assert.deepEqual(a.gezuendet, b.gezuendet, id);
    const alt = wurf(id, WAFFEN_FAIR, { seed: 777 });
    assert.notEqual(a.gezuendet.y, alt.gezuendet.y, `${id}: Fassung 6 zündet an anderer Stelle als 5`);
  }
});

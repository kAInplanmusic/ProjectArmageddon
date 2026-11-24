/**
 * Bodenobjektfassung 8 (PORTAL-1, `docs/auftraege/portal.md`, Stufe 1): seltenes Kartenportal; die Beamwaffen (Portal pa_076,
 * Hologrammportal pa_128, Dimensionssprung pa_087) beamen die eigene Figur dorthin; zu Fuß wirkt es nicht; Fassung 7 bleibt ohne Portal und mit alter Wirkung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODENOBJEKTE_BIOM_2, BODENOBJEKTE_PORTAL, BODENOBJEKTE_STANDARD, PORTAL_REGEL, normalisiereBodenobjekte } from '../src/shared/config/bodenobjekte.js';
import { waehlePortal } from '../src/engine/portal.js';
import { SeededRandom } from '../src/shared/prng.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';

test('Marke: 8 ist der Standard, 7 bleibt gültig', () => {
  assert.equal(BODENOBJEKTE_PORTAL, 8);
  assert.equal(BODENOBJEKTE_STANDARD, BODENOBJEKTE_PORTAL);
  assert.equal(normalisiereBodenobjekte(7), BODENOBJEKTE_BIOM_2);
  assert.equal(normalisiereBodenobjekte(8), 8);
});

test('Wahl: in rund 20 % der Seeds ein Portal, erhöht, trocken, weit genug von den Startplätzen, deterministisch', () => {
  // Gebaute Karte: Hügel (Höhe wechselt), Wasser links unter x = 200.
  const breite = 2000;
  const surfaceYAt = x => 600 - Math.round(150 * Math.sin(x / 300));
  const waterLevelAt = x => (x < 200 ? 1 : 0);
  const startplaetze = [{ x: 400, y: surfaceYAt(400) - 12 }, { x: 1600, y: surfaceYAt(1600) - 12 }];
  let mit = 0;
  for (let seed = 1; seed <= 1000; seed += 1) {
    const p = waehlePortal({ rng: new SeededRandom(seed), breite, surfaceYAt, waterLevelAt, startplaetze });
    const q = waehlePortal({ rng: new SeededRandom(seed), breite, surfaceYAt, waterLevelAt, startplaetze });
    assert.deepEqual(p, q, `Seed ${seed}: deterministisch`);
    if (!p) continue;
    mit += 1;
    assert.ok(p.x >= 200, 'nicht im Wasser');
    for (const s of startplaetze) assert.ok(Math.hypot(s.x - p.x, s.y - p.y) >= PORTAL_REGEL.minAbstand, 'Abstand zum Start');
    assert.ok(surfaceYAt(p.x) <= 600, 'erhöht (obere Hälfte der Hügel)');
  }
  assert.ok(mit >= 160 && mit <= 240, `${mit} von 1000 mit Portal`);
});

/** Erster Seed mit Portal (Menüweg, 1 gegen 1); dazu dieselbe Partie in Fassung 7. */
function partieMitPortal() {
  for (let seed = 1; seed <= 60; seed += 1) {
    const m = neuesMatch(seed, 4, { teams: 2, proTeam: 1 });
    if (m.status !== 'playing') m.start();
    if (m.getState().portal) {
      const alt = neuesMatch(seed, 4, { teams: 2, proTeam: 1, extra: { bodenobjekte: BODENOBJEKTE_BIOM_2 } });
      if (alt.status !== 'playing') alt.start();
      return { seed, m, alt };
    }
  }
  throw new Error('kein Seed mit Portal unter 60');
}

/** Gibt der aktiven Figur die Waffe, wartet die Zugpause ab und feuert sie. */
function feuere(m, waffe) {
  for (let i = 0; i < 600 && m.turnPauseMs > 0; i += 1) m.step();
  const id = m.activePlayerId;
  m.inventory.register(id, [waffe]);
  const r = m.fire(id, 0.8, 50, waffe);
  assert.equal(r.ok, true, `Schuss mit ${waffe}: ${JSON.stringify(r.errors ?? [])}`);
  return id;
}

test('Beamwaffen beamen zum Portal; Fassung 7 hat keines und verschiebt wie bisher; die Teleportplattform (Direkttreffer) nicht', () => {
  for (const waffe of ['pa_076', 'pa_128', 'pa_087']) {
    const { m, alt } = partieMitPortal();
    const portal = m.getState().portal;
    const id = feuere(m, waffe);
    const ereignisse = m.consumeEvents();
    assert.deepEqual([m.world.getComponent(id, 'Position', 'x'), m.world.getComponent(id, 'Position', 'y')], [portal.x, portal.y], `${waffe}: am Portal`);
    assert.ok(ereignisse.some(e => e.type === 'portal_sprung'), `${waffe}: Ereignis`);

    assert.equal(alt.getState().portal, undefined, 'Fassung 7: kein Portal im Zustand');
    const altId = feuere(alt, waffe);
    assert.ok(!alt.consumeEvents().some(e => e.type === 'portal_sprung'));
    assert.notDeepEqual([alt.world.getComponent(altId, 'Position', 'x'), alt.world.getComponent(altId, 'Position', 'y')], [portal.x, portal.y]);
  }
});

test('Zu Fuß über das Portal: keine Wirkung (ohne Gegenstück passiert nichts); das Portal steht im Hash', () => {
  const { m } = partieMitPortal();
  const portal = m.getState().portal;
  for (let i = 0; i < 600 && m.turnPauseMs > 0; i += 1) m.step();
  const id = m.activePlayerId;
  m.world.setComponent(id, 'Position', 'x', portal.x + 30);
  m.world.setComponent(id, 'Position', 'y', portal.y);
  for (let i = 0; i < 60; i += 1) { m.gehen.setzeRichtung(id, -1); m.step(); }
  assert.ok(!m.consumeEvents().some(e => e.type === 'portal_sprung'), 'kein Sprung zu Fuß');
  const ohne = { ...m.getState() }; delete ohne.portal;
  assert.notEqual(JSON.stringify(m.getState()), JSON.stringify(ohne));
});

test('Replay: eine Partie mit Portal spielt bitgleich nach (der Portalort steht im Hash)', () => {
  let a = null; let b = null;
  for (let seed = 1; seed <= 80 && !a; seed += 1) {
    const recorder = new ReplayRecorder({ seed, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp: 'autonom', bodenobjekte: BODENOBJEKTE_PORTAL });
    recorder.finalize(120);
    const kandidat = new ReplayPlayer(recorder.serialize());
    if (kandidat.match.getState().portal) { a = kandidat; b = new ReplayPlayer(recorder.serialize()); }
  }
  assert.ok(a, 'eine Aufzeichnung mit Portal gefunden');
  assert.equal(a.match.bodenobjekte, BODENOBJEKTE_PORTAL);
  assert.deepEqual(b.match.getState().portal, a.match.getState().portal, 'dasselbe Portal in der Wiedergabe');
  for (let i = 0; i < 120; i += 1) { a.step(); b.step(); }
  assert.equal(a.match.stateHash(), b.match.stateHash());
});

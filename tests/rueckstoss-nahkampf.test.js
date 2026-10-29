/**
 * Tests: Waffenfassung 11, Teil C: Rückstoß der Nahkämpfer und passender Waffen (`engine/stoss.js`, `config/waffen-f11.js`).
 *
 * Belegt:
 *  1. Die Tabelle: 21 Nahkämpfer und 14 weitere Waffen tragen Stärke und Richtung; Fassung 10 und älter sehen nichts davon.
 *  2. Der Vektor: Richtung in Grad, Seite nach der Schussrichtung, Zug zum Schützen bei Winkeln über 90, Obergrenze `STOSS_MAX`.
 *  3. Im Spiel: ein Strahl (Energiefaust) und ein geworfener Nahkämpfer (Baseballschläger) stoßen das Ziel in Fassung 11, in Fassung 10 nicht.
 *  4. Der Stoß ist deterministisch (zwei Läufe, gleicher Hash) und schiebt nicht durch Fels (die Figurenphysik hält die Figur auf).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { WAFFEN_SPREIZUNG, WAFFEN_MUNITION, getWaffe } from '../src/shared/config/waffen-fassung.js';
import { RUECKSTOSS_TABELLE } from '../src/shared/config/waffen-f11.js';
import { STOSS_MAX, stossVektor, stossSeite, wendeStossAn } from '../src/engine/stoss.js';

test('Tabelle: alle 21 Nahkämpfer und 14 weitere Waffen haben Stärke und Richtung; Fassung 10 sieht sie nicht', () => {
  const nahkampf = WEAPONS.filter(w => w.category === 'melee').map(w => w.id);
  assert.equal(nahkampf.length, 21);
  for (const id of nahkampf) assert.ok(RUECKSTOSS_TABELLE[id], `${id} fehlt in der Tabelle`);
  assert.equal(Object.keys(RUECKSTOSS_TABELLE).length, 35);
  for (const [id, [staerke, grad, text]] of Object.entries(RUECKSTOSS_TABELLE)) {
    const w = getWaffe(id, WAFFEN_MUNITION);
    assert.equal(w.knockback, staerke, id);
    assert.equal(w.stossRichtung, grad, id);
    assert.ok(text.length > 5);
    assert.ok(staerke > 0 && staerke <= 300, `${id}: Stärke ${staerke}`);
    assert.ok(grad >= -90 && grad <= 180, `${id}: Richtung ${grad}`);
    assert.ok(w.blastRadius === 0, `${id}: Waffen mit Sprengradius stoßen schon radial`);
    const alt = getWaffe(id, WAFFEN_SPREIZUNG);
    assert.equal(alt.stossRichtung, undefined, `${id}: Fassung 10 kennt keine Richtung`);
    assert.equal(alt.knockback, WEAPONS.find(x => x.id === id).knockback, `${id}: Fassung 10 behält den Katalogwert`);
  }
});

test('Beispiele des Auftraggebers: Baseballschläger nach vorn und weit, Flammenwerfer mittel und nach oben', () => {
  const schlaeger = getWaffe('pa_001', WAFFEN_MUNITION);
  const flamme = getWaffe('pa_062', WAFFEN_MUNITION);
  assert.ok(schlaeger.knockback >= 280 && schlaeger.stossRichtung <= 20, 'weit und flach nach vorn');
  assert.ok(flamme.knockback >= 120 && flamme.knockback < schlaeger.knockback, 'mittel');
  assert.ok(flamme.stossRichtung >= 60 && flamme.stossRichtung <= 90, 'nach oben');
  const hammer = getWaffe('pa_008', WAFFEN_MUNITION);
  assert.ok(hammer.stossRichtung >= 60, 'Hämmer stoßen nach oben');
  assert.ok(getWaffe('pa_003', WAFFEN_MUNITION).stossRichtung > 90, 'Haken ziehen heran');
});

test('Vektor: Richtung, Seite, Zug und Obergrenze', () => {
  const vor = stossVektor(100, 0, 1);
  assert.deepEqual(vor, { x: 2, y: -0 });
  const links = stossVektor(100, 0, -1);
  assert.equal(links.x, -2);
  const hoch = stossVektor(100, 90, 1);
  assert.ok(Math.abs(hoch.x) < 1e-5 && Math.abs(hoch.y + 2) < 1e-5, 'nach oben ist y negativ');
  const schraeg = stossVektor(100, 45, 1);
  assert.ok(schraeg.x > 1.4 && schraeg.y < -1.4);
  const zug = stossVektor(100, 180, 1);
  assert.equal(zug.x, -2, 'über 90 Grad zieht zum Schützen hin');
  const riesig = stossVektor(10_000, 30, 1);
  assert.ok(Math.hypot(riesig.x, riesig.y) <= STOSS_MAX + 1e-9);
  assert.equal(stossVektor(100, 20, 1).x, stossVektor(100, 20, 1).x, 'rein deterministisch');
  assert.equal(stossSeite(3, 0, 50), 1);
  assert.equal(stossSeite(-3, 100, 50), -1);
  assert.equal(stossSeite(0, 100, 50), -1, 'ohne Flugrichtung: vom Schützen zum Ziel');
});

function paar(extra = {}) {
  const match = new MatchController({
    seed: 777, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, kisten: KISTEN_ALT, ...extra,
  });
  match.start();
  const schuetze = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const boden = match.surfaceYAt(300);
  match.world.setComponent(schuetze, 'Position', 'x', 300);
  match.world.setComponent(schuetze, 'Position', 'y', boden - 12);
  match.world.setComponent(ziel, 'Position', 'x', 322);
  match.world.setComponent(ziel, 'Position', 'y', boden - 12);
  for (const id of [schuetze, ziel]) {
    match.world.setComponent(id, 'Health', 'max', 1000);
    match.world.setComponent(id, 'Health', 'current', 1000);
  }
  return { match, schuetze, ziel };
}

/** Schießt `waffe` waagerecht auf das Ziel und liefert dessen Weg in 30 Takten (und die Geschwindigkeit gleich nach dem Treffer). */
function stoss(waffe, extra = {}, winkel = 0) {
  const { match, schuetze, ziel } = paar(extra);
  const x0 = match.world.getComponent(ziel, 'Position', 'x');
  match.inventory.grantWeapon(schuetze, waffe);
  match.inventory.selectWeapon(schuetze, waffe);
  const feuer = match.fire(schuetze, winkel, 40, waffe);
  assert.ok(feuer.ok, `${waffe}: ${JSON.stringify(feuer.errors)}`);
  let vMax = 0;
  for (let i = 0; i < 30; i += 1) {
    match.step();
    vMax = Math.max(vMax, Math.abs(match.world.getComponent(ziel, 'Velocity', 'x') || 0));
  }
  return { dx: match.world.getComponent(ziel, 'Position', 'x') - x0, vMax, hash: match.stateHash(), leben: match.world.getComponent(ziel, 'Health', 'current') };
}

test('Strahl (Energiefaust): in Fassung 11 stößt der Treffer das Ziel nach vorn, in Fassung 10 nicht', () => {
  const alt = stoss('pa_120', { waffen: WAFFEN_SPREIZUNG }, 0.15);
  const neu = stoss('pa_120', { waffen: WAFFEN_MUNITION }, 0.15);
  assert.ok(alt.leben < 1000 && neu.leben < 1000, 'beide treffen');
  assert.ok(Math.abs(alt.dx) < 1, `Fassung 10 schiebt nicht: ${alt.dx}`);
  assert.ok(neu.dx > 10, `Fassung 11 schiebt nach vorn: ${neu.dx}`);
  assert.ok(neu.vMax <= STOSS_MAX + 1e-6);
});

test('Geworfener Nahkämpfer (Baseballschläger): weiter Stoß nach vorn in Fassung 11', () => {
  const alt = stoss('pa_001', { waffen: WAFFEN_SPREIZUNG });
  const neu = stoss('pa_001', { waffen: WAFFEN_MUNITION });
  assert.ok(alt.leben < 1000 && neu.leben < 1000, `beide treffen: ${alt.leben}/${neu.leben}`);
  assert.ok(Math.abs(alt.dx) < 1, `Fassung 10 schiebt nicht: ${alt.dx}`);
  assert.ok(neu.dx > 15, `Fassung 11 schiebt weit: ${neu.dx}`);
});

test('Deterministisch: zwei Läufe, gleicher Zustands-Hash', () => {
  assert.equal(stoss('pa_120', {}, 0.15).hash, stoss('pa_120', {}, 0.15).hash);
  assert.equal(stoss('pa_001').hash, stoss('pa_001').hash);
});

test('Ein Stoß gegen eine Felswand schiebt nicht hindurch', () => {
  const { match, ziel } = paar();
  const x = match.world.getComponent(ziel, 'Position', 'x');
  const y = match.world.getComponent(ziel, 'Position', 'y');
  // Wand: fester Block rechts vom Ziel, Höhe der Figur.
  for (let wx = Math.floor(x) + 12; wx < Math.floor(x) + 40; wx += 1) {
    for (let wy = Math.floor(y) - 40; wy < Math.floor(y) + 14; wy += 1) match.terrain.setPixel(wx, wy, true);
  }
  assert.ok(wendeStossAn(match.world, ziel, 300, 0, 1), 'der Stoß wird gesetzt');
  for (let i = 0; i < 40; i += 1) match.step();
  const nach = match.world.getComponent(ziel, 'Position', 'x');
  assert.ok(nach < x + 12, `Ziel bleibt vor der Wand: ${nach}`);
});

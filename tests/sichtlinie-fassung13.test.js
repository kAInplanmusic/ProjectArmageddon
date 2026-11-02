/**
 * EREIGNIS-1: Zauberpeitsche (pa_108) und Tesla-Turm (pa_129) maßen in `npm run balance:waffen` 0 Schaden.
 *
 * Ursache (gemessen 2026-11-02): `hasLineOfSight` prüfte die Zielgerade über die VOLLE Reichweite der
 * Waffe (370 bzw. 640 px), nicht bis zum Ziel. Das Messskript stellt Schütze und Ziel auf eine flache
 * Strecke; 6 px hinter dem Ziel stieg der Hang an, die Gerade traf ihn, und der Motor lehnte jeden Schuss
 * mit „Sichtlinie versperrt" ab — obwohl der Strahl (`resolveHitscan`) am Ziel davor endet. Im Spiel
 * dasselbe: Ein Hang HINTER dem Gegner sperrte Sichtlinienwaffen.
 *
 * Waffenfassung 13 (`WAFFEN_SICHT`, Standard): die Gerade endet an der ersten Figur. Fassung 12 und
 * älter behalten die alte Prüfung (alte Aufzeichnungen bitgleich).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { WAFFEN_MINE, WAFFEN_SICHT, WAFFEN_STANDARD } from '../src/shared/config/waffen-fassung.js';
import { getWeapon } from '../src/shared/config/weapons.js';

/** Flache Karte, Schütze bei x=1000, Ziel 90 px rechts, eine Wand 6 px hinter dem Ziel (oder davor). */
function aufbau(waffen, wandX) {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1e6, schaden: 1, waffen });
  match.start();
  const schuetze = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const w = match.world;
  const y = 300; // frei in der Luft über dem Gelände
  for (const [id, x] of [[schuetze, 1000], [ziel, 1090]]) {
    w.setComponent(id, 'Position', 'x', x);
    w.setComponent(id, 'Position', 'y', y);
    w.setComponent(id, 'Health', 'max', 1000);
    w.setComponent(id, 'Health', 'current', 1000);
  }
  // Eine senkrechte Wand quer zur Schusslinie (die Kollisionsmaske ist die des Motors).
  for (let yy = y - 60; yy <= y + 60; yy += 1) for (let xx = wandX; xx < wandX + 8; xx += 1) match.terrain.setPixel(xx, yy, true);
  return { match, schuetze, ziel };
}

function schiesse({ match, schuetze }, waffeId) {
  match.inventory.grantWeapon(schuetze, waffeId);
  match.inventory.selectWeapon(schuetze, waffeId);
  return match.fire(schuetze, 0, 100, waffeId);
}

test('Standard ist Waffenfassung 13', () => {
  assert.equal(WAFFEN_STANDARD, WAFFEN_SICHT);
  assert.equal(WAFFEN_SICHT, WAFFEN_MINE + 1);
});

for (const id of ['pa_108', 'pa_129']) {
  test(`${id}: Wand HINTER dem Ziel sperrt ab Fassung 13 nicht mehr, Treffer mit Katalogschaden`, () => {
    const a = aufbau(WAFFEN_SICHT, 1096);
    const r = schiesse(a, id);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(1000 - a.match.world.getComponent(a.ziel, 'Health', 'current'), getWeapon(id).damage);
  });

  test(`${id}: Fassung 12 behält die alte Prüfung (Wand hinter dem Ziel sperrt)`, () => {
    const a = aufbau(WAFFEN_MINE, 1096);
    const r = schiesse(a, id);
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Sichtlinie ist versperrt/);
    assert.equal(a.match.world.getComponent(a.ziel, 'Health', 'current'), 1000, 'kein Schaden');
  });

  test(`${id}: Wand ZWISCHEN Schütze und Ziel sperrt auch in Fassung 13`, () => {
    const a = aufbau(WAFFEN_SICHT, 1040);
    const r = schiesse(a, id);
    assert.equal(r.ok, false);
    assert.match(r.errors[0], /Sichtlinie ist versperrt/);
  });
}

test('Fassung 13: ohne Figur auf der Geraden bleibt die volle Reichweite maßgeblich', () => {
  const a = aufbau(WAFFEN_SICHT, 1096);
  // Steil nach oben: keine Figur, kein Gestein bis zum Kartenrand — frei.
  assert.equal(a.match.hasLineOfSight(a.schuetze, Math.PI / 2, 100, getWeapon('pa_108')), true);
  // Nach rechts, das Ziel weggestellt: die Wand dahinter sperrt wie bisher.
  a.match.world.setComponent(a.ziel, 'Position', 'y', 900);
  assert.equal(a.match.hasLineOfSight(a.schuetze, 0, 100, getWeapon('pa_108')), false);
});

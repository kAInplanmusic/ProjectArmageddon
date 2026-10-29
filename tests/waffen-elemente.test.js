/**
 * Tests: Waffenfassung 11, Teil D: Elemente für Versetzer und Flieger (Feuerspur, Frostboden, Blitz) und Reinigung der Heiler.
 *
 * Belegt:
 *  1. Tabelle: acht Waffen tragen Element, Spur und passende Schadensart; Entfernung und Pause aus Fassung 10 bleiben erhalten.
 *  2. Fassung 10 und älter kennen kein Element: kein Malus auf Figuren am Weg.
 *  3. Feuer auf dem Weg gibt Brand, Eis am Landepunkt Frost, Blitz am Zielpunkt Schock; wer weit weg steht und der Schütze selbst bleiben unberührt.
 *  4. Heilzauber nimmt Frost, Heilspritze nimmt Schock (zusätzlich zu Brand und Gift, die schon die Heilung löst).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { WAFFEN_SPREIZUNG, WAFFEN_MUNITION, WAFFEN_F10_WERTE, getWaffe } from '../src/shared/config/waffen-fassung.js';
import { buildEffect } from '../src/engine/specials.js';

const ELEMENTE = {
  pa_032: ['fire', 'weg'], // Raketenrucksack
  pa_112: ['fire', 'start'], // Düsenrucksack
  pa_089: ['fire', 'weg'], // Zauberstiefel
  pa_114: ['ice', 'ziel'], // Gleitschirm
  pa_110: ['ice', 'ziel'], // Dimensionskugel
  pa_087: ['electric', 'ziel'], // Dimensionssprung
  pa_088: ['electric', 'ziel'], // Dimensionsriss
  pa_111: ['electric', 'ziel'], // Enterhaken
};

test('Tabelle: Element, Spur und Schadensart; Weite und Pause der Fassung 10 bleiben', () => {
  for (const [id, [element, spur]] of Object.entries(ELEMENTE)) {
    const w = getWaffe(id, WAFFEN_MUNITION);
    const effekt = buildEffect(w);
    assert.equal(effekt.kind, 'move', id);
    assert.equal(effekt.element, element, id);
    assert.equal(effekt.spur, spur, id);
    assert.equal(w.damageType, element === 'electric' ? 'electric' : element, `${id}: Schadensart folgt dem Element`);
    assert.equal(effekt.distance, WAFFEN_F10_WERTE[id].wirkung.distance, `${id}: Weite wie Fassung 10`);
    assert.equal(w.cooldown, getWaffe(id, WAFFEN_SPREIZUNG).cooldown, `${id}: Pause wie Fassung 10`);
    assert.equal(buildEffect(getWaffe(id, WAFFEN_SPREIZUNG)).element, undefined, `${id}: Fassung 10 kennt kein Element`);
  }
  // Alle drei Elemente kommen vor, jede Spur auch.
  assert.deepEqual([...new Set(Object.values(ELEMENTE).map(e => e[0]))].sort(), ['electric', 'fire', 'ice']);
  assert.deepEqual([...new Set(Object.values(ELEMENTE).map(e => e[1]))].sort(), ['start', 'weg', 'ziel']);
});

function paar(extra = {}) {
  const match = new MatchController({
    seed: 777, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, kisten: KISTEN_ALT, ...extra,
  });
  match.start();
  const schuetze = match.activePlayerId;
  const ziel = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const setze = (id, x) => {
    match.world.setComponent(id, 'Position', 'x', x);
    match.world.setComponent(id, 'Position', 'y', match.surfaceYAt(x) - 12);
    match.world.setComponent(id, 'Health', 'max', 1000);
    match.world.setComponent(id, 'Health', 'current', 1000);
  };
  setze(schuetze, 300);
  return { match, schuetze, ziel, setze };
}

function benutze(match, schuetze, waffe) {
  match.inventory.grantWeapon(schuetze, waffe);
  match.inventory.selectWeapon(schuetze, waffe);
  const r = match.fire(schuetze, 0.05, 40, waffe);
  assert.ok(r.ok, `${waffe}: ${JSON.stringify(r.errors)}`);
  match.consumeEvents();
  return r;
}

const MALI = ['brand', 'frost', 'schock'];
const hat = (match, id) => MALI.filter(m => match.mali.hat(id, m));

test('Feuerspur: wer am Weg des Raketenrucksacks steht, brennt; wer weit weg steht, nicht; der Schütze auch nicht', () => {
  const { match, schuetze, ziel, setze } = paar();
  setze(ziel, 350); // Weg: 300 bis 400
  const wurf = benutze(match, schuetze, 'pa_032');
  assert.ok(Math.abs(wurf.special.moved.dx) > 50, 'der Schütze wurde versetzt');
  assert.deepEqual(hat(match, ziel), ['brand']);
  assert.deepEqual(hat(match, schuetze), [], 'der Schütze brennt nicht');
  assert.deepEqual(wurf.special.element.getroffen, [ziel]);

  const fern = paar();
  fern.setze(fern.ziel, 1200);
  benutze(fern.match, fern.schuetze, 'pa_032');
  assert.deepEqual(hat(fern.match, fern.ziel), []);
});

test('Fassung 10 und älter: kein Element, kein Malus', () => {
  const { match, schuetze, ziel, setze } = paar({ waffen: WAFFEN_SPREIZUNG });
  setze(ziel, 350);
  benutze(match, schuetze, 'pa_032');
  assert.deepEqual(hat(match, ziel), []);
});

test('Frostboden: wer am Landepunkt des Gleitschirms steht, bekommt Frost', () => {
  const { match, schuetze, ziel, setze } = paar();
  const weite = buildEffect(getWaffe('pa_114')).distance;
  setze(ziel, 300 + weite + 15);
  benutze(match, schuetze, 'pa_114');
  assert.deepEqual(hat(match, ziel), ['frost']);
});

test('Blitz beim Aufprall: wer am Zielpunkt des Dimensionssprungs steht, bekommt Schock', () => {
  const { match, schuetze, ziel, setze } = paar();
  const weite = buildEffect(getWaffe('pa_087')).distance;
  setze(ziel, 300 + weite + 12);
  benutze(match, schuetze, 'pa_087');
  assert.deepEqual(hat(match, ziel), ['schock']);
});

test('Düsenabgas am Startpunkt: nur wer beim Start nahe steht, brennt', () => {
  const { match, schuetze, ziel, setze } = paar();
  setze(ziel, 320); // nahe am Start (300)
  benutze(match, schuetze, 'pa_112');
  assert.deepEqual(hat(match, ziel), ['brand']);
  const weit = paar();
  weit.setze(weit.ziel, 300 + buildEffect(getWaffe('pa_112')).distance);
  benutze(weit.match, weit.schuetze, 'pa_112');
  assert.deepEqual(hat(weit.match, weit.ziel), [], 'am Landepunkt gibt es keine Spur');
});

test('Heilzauber nimmt Frost, Heilspritze nimmt Schock; beide heilen weiter', () => {
  for (const [waffe, malus] of [['pa_092', 'frost'], ['pa_094', 'schock']]) {
    const { match, schuetze } = paar();
    match.world.setComponent(schuetze, 'Health', 'current', 500);
    match.mali.wende(schuetze, malus, { by: null });
    assert.equal(match.mali.hat(schuetze, malus), true, `${waffe}: Vorbedingung`);
    benutze(match, schuetze, waffe);
    assert.equal(match.mali.hat(schuetze, malus), false, `${waffe}: ${malus} ist weg`);
    assert.ok(match.world.getComponent(schuetze, 'Health', 'current') > 500, `${waffe}: heilt`);
  }
  const alt = paar({ waffen: WAFFEN_SPREIZUNG });
  alt.match.world.setComponent(alt.schuetze, 'Health', 'current', 500);
  alt.match.mali.wende(alt.schuetze, 'frost', { by: null });
  benutze(alt.match, alt.schuetze, 'pa_092');
  assert.equal(alt.match.mali.hat(alt.schuetze, 'frost'), true, 'Fassung 10 reinigt Frost nicht');
});

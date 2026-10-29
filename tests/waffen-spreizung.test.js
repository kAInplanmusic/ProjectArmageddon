/**
 * Tests: Waffenfassung 10 (2026-10-29), die Dubletten der Selbstwirkungen auseinandergezogen und mit Element.
 *
 * Belegt:
 *  1. Alte Fassungen (1 bis 9) sehen weder Staffelung noch Element: `buildEffect` liefert die Standardwerte.
 *  2. Je Gruppe unterscheiden sich die Zahlen (Stärke, Dauer, Abklingzeit, Weite) paarweise.
 *  3. Verstärkung mit Element: der Treffer des Schützen trägt Brand, Frost, Schock oder Gift dazu.
 *  4. Elementschild: wer das Schild trifft, bekommt Frost oder Schock; ein leergeschlagenes Schild verliert sein Element.
 *  5. Zufall: vier getrennte Pools, die Wahl bleibt im Pool des Wurfs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  WAFFEN_SPREIZUNG, WAFFEN_VORSTRAHL, WAFFEN_F10_WERTE, getWaffe,
} from '../src/shared/config/waffen-fassung.js';
import { buildEffect } from '../src/engine/specials.js';

const GRUPPEN = {
  verstaerkung: ['pa_084', 'pa_095', 'pa_099', 'pa_109'],
  zufall: ['pa_085', 'pa_105', 'pa_100', 'pa_096'],
  versetzen: ['pa_089', 'pa_087', 'pa_110', 'pa_088'],
  schild: ['pa_101', 'pa_093'],
  heilung: ['pa_092', 'pa_094'],
  fliegen: ['pa_111', 'pa_112', 'pa_032', 'pa_114'],
  haken: ['pa_003', 'pa_004'],
  munition: ['pa_119', 'pa_122', 'pa_125'],
  ruestung: ['pa_130', 'pa_126'],
};

test('Fassung 9 und älter sehen nichts von Fassung 10: Katalog, Standardwerte, kein Element', () => {
  assert.equal(WAFFEN_SPREIZUNG, 10);
  for (const id of Object.keys(WAFFEN_F10_WERTE)) {
    const alt = getWaffe(id, WAFFEN_VORSTRAHL);
    assert.equal(alt.wirkung, undefined, id);
    assert.equal(alt.cooldown, WEAPONS_BY_ID[id].cooldown, `${id}: Abklingzeit der Fassung 9 = Katalog`);
    assert.equal(alt.damageType, WEAPONS_BY_ID[id].damageType, id);
  }
  assert.deepEqual(buildEffect(getWaffe('pa_084', 9)), { kind: 'damage_boost', multiplier: 1.5 });
  assert.deepEqual(buildEffect(getWaffe('pa_112', 9)), { kind: 'move', distance: 60 });
  assert.deepEqual(buildEffect(getWaffe('pa_101', 9)), { kind: 'shield', amount: 40 });
  assert.deepEqual(buildEffect(getWaffe('pa_085', 9)).pool, ['heal', 'shield', 'damage_boost', 'armor', 'ammo', 'move']);
});

test('Jede Gruppe ist gestaffelt: keine zwei Waffen mit denselben Zahlen', () => {
  const kennzahl = id => {
    const w = getWaffe(id, WAFFEN_SPREIZUNG);
    const e = buildEffect(w);
    return JSON.stringify({ e, c: w.cooldown, a: w.maxAmmo, d: w.damage });
  };
  for (const [name, ids] of Object.entries(GRUPPEN)) {
    const werte = ids.map(kennzahl);
    assert.equal(new Set(werte).size, ids.length, `${name}: zwei Waffen gleichen sich`);
  }
  // Die vier Verstärkungen: kurz und stark gegen lang und schwach.
  const boost = GRUPPEN.verstaerkung.map(id => buildEffect(getWaffe(id)));
  assert.deepEqual(boost.map(b => b.multiplier), [1.7, 1.3, 1.2, 1.15]);
  assert.deepEqual(boost.map(b => b.turns), [2, 3, 4, 5]);
  assert.deepEqual(boost.map(b => b.element), ['fire', 'electric', 'ice', 'poison']);
  // Versetzen und Fliegen wachsen mit der Weite.
  assert.deepEqual(GRUPPEN.versetzen.map(id => buildEffect(getWaffe(id)).distance), [40, 80, 110, 165]);
  assert.deepEqual(GRUPPEN.fliegen.map(id => buildEffect(getWaffe(id)).distance), [45, 70, 100, 160]);
});

test('Schadensart und Element der Dubletten passen zusammen', () => {
  const art = { fire: 'fire', ice: 'ice', electric: 'electric', poison: 'poison' };
  for (const [id, wert] of Object.entries(WAFFEN_F10_WERTE)) {
    const element = wert.wirkung.element;
    if (!element) continue;
    assert.equal(getWaffe(id).damageType, art[element], `${id}: Schadensart folgt dem Element`);
  }
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
  match.world.setComponent(ziel, 'Position', 'x', 330);
  match.world.setComponent(ziel, 'Position', 'y', boden - 12);
  for (const id of [schuetze, ziel]) {
    match.world.setComponent(id, 'Health', 'max', 1000);
    match.world.setComponent(id, 'Health', 'current', 1000);
  }
  return { match, schuetze, ziel };
}

function schiesse(match, von, waffe) {
  match.inventory.grantWeapon(von, waffe);
  match.inventory.selectWeapon(von, waffe);
  const ergebnis = match.fire(von, 0.05, 80, waffe);
  assert.ok(ergebnis.ok, `${waffe}: ${JSON.stringify(ergebnis.errors)}`);
  match.consumeEvents();
  return ergebnis;
}

test('Verstärkung mit Element: der Wurf setzt Stärke, Dauer und Element, jeder Treffer trägt den Nachteil dazu', () => {
  const erwartet = { pa_084: 'brand', pa_095: 'schock', pa_099: 'frost', pa_109: 'gift' };
  for (const [waffe, malus] of Object.entries(erwartet)) {
    const { match, schuetze, ziel } = paar();
    const wurf = schiesse(match, schuetze, waffe);
    const soll = buildEffect(getWaffe(waffe));
    assert.equal(wurf.special.multiplier, soll.multiplier, waffe);
    assert.equal(match.statuses.boostElementOf(schuetze), soll.element, waffe);
    // Der Wurf beendete den Zug; die Wirkung läuft weiter. Treffer des Schützen laufen über die Mali-Regeln der Waffe:
    assert.equal(match.mali.hat(ziel, malus), false);
    match.mali.treffer(null, getWaffe('pa_083'), ziel, schuetze);
    assert.equal(match.mali.hat(ziel, malus), true, `${waffe}: ${malus} auf dem Ziel`);
  }
});

test('Ohne Verstärkung bleibt der Treffer ohne Zusatz', () => {
  const { match, schuetze, ziel } = paar();
  match.mali.treffer(null, getWaffe('pa_083'), ziel, schuetze);
  for (const m of ['brand', 'frost', 'schock', 'gift']) assert.equal(match.mali.hat(ziel, m), false, m);
});

test('Verstärkung läuft ab: nach der Dauer ist auch das Element weg', () => {
  const { match, schuetze } = paar();
  match.statuses.addBoost(schuetze, 1.7, 2, 'fire');
  assert.equal(match.statuses.boostElementOf(schuetze), 'fire');
  match.statuses.advanceTurn(schuetze);
  match.statuses.advanceTurn(schuetze);
  assert.equal(match.statuses.boostElementOf(schuetze), null);
  assert.equal(match.statuses.damageMultiplier(schuetze), 1);
  assert.equal(match.statuses.snapshot()[schuetze].boostArt, undefined, 'der Hash ohne Element bleibt unverändert');
});

test('Elementschild: der Angreifer bekommt Frost oder Schock, das letzte Auffangen zählt noch', () => {
  for (const [waffe, malus] of [['pa_101', 'frost'], ['pa_093', 'schock']]) {
    const { match, schuetze, ziel } = paar();
    // Das Ziel wirft das Schild (es ist erst später am Zug, daher direkt über den Speicher mit denselben Zahlen).
    const soll = buildEffect(getWaffe(waffe));
    assert.equal(soll.gegen, malus === 'frost' ? 'ice' : 'electric');
    match.statuses.addShield(ziel, soll.amount, soll.gegen);
    assert.equal(match.statuses.shieldGegenOf(ziel), soll.gegen);
    schiesse(match, schuetze, 'pa_083');
    assert.equal(match.mali.hat(schuetze, malus), true, `${waffe}: ${malus} auf dem Angreifer`);
  }
  // Ein Schild ohne Element gibt nichts zurück.
  const { match, schuetze, ziel } = paar();
  match.statuses.addShield(ziel, 80);
  schiesse(match, schuetze, 'pa_083');
  for (const m of ['frost', 'schock', 'brand', 'gift']) assert.equal(match.mali.hat(schuetze, m), false, m);
});

test('Ein leergeschlagenes Elementschild verliert sein Element', () => {
  const { match, ziel } = paar();
  match.statuses.addShield(ziel, 10, 'ice');
  match.statuses.absorbWithShield(ziel, 50);
  assert.equal(match.statuses.shieldGegenOf(ziel), null);
  assert.equal(match.statuses.snapshot()[ziel].shieldGegen, undefined);
});

test('Zufall: vier getrennte Pools, die Wahl bleibt im Pool; Verstärkung und Schild des Wurfs tragen das Element', () => {
  const pools = {};
  for (const id of GRUPPEN.zufall) pools[id] = buildEffect(getWaffe(id)).pool;
  assert.equal(new Set(Object.values(pools).map(p => p.join())).size, 4, 'vier verschiedene Pools');
  const element = { pa_085: 'fire', pa_105: 'ice', pa_100: 'electric', pa_096: 'poison' };
  for (const id of GRUPPEN.zufall) {
    const gesehen = new Set();
    for (let seed = 1; seed <= 24; seed += 1) {
      const { match, schuetze } = paar({ seed });
      const wurf = schiesse(match, schuetze, id);
      assert.ok(pools[id].includes(wurf.special.randomKind), `${id}: ${wurf.special.randomKind} liegt im Pool`);
      gesehen.add(wurf.special.randomKind);
      if (wurf.special.randomKind === 'damage_boost') assert.equal(match.statuses.boostElementOf(schuetze), element[id], id);
      if (wurf.special.randomKind === 'shield') assert.equal(match.statuses.shieldGegenOf(schuetze), element[id], id);
    }
    assert.ok(gesehen.size >= 2, `${id}: der Zufall wählt nicht immer dasselbe (${[...gesehen]})`);
  }
});

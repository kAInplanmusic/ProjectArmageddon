/**
 * Tests: Waffenfassung 11, Teil B: drei Schilde mit eigenem Charakter (Eisschild fest/Frost, Funkenschild magisch/Schock,
 * Feuerschild normal/Brand). Der Feuerschild ist die frühere Waffe "Himmelswächter" (`pa_148`, dieselbe Schildwirkung):
 * Kennung und `internalName` bleiben, Katalogzahl 150 und Beute unverändert.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { KISTEN_ALT } from '../src/shared/config/kisten.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { WAFFEN_SPREIZUNG, WAFFEN_MUNITION, getWaffe } from '../src/shared/config/waffen-fassung.js';
import { buildEffect } from '../src/engine/specials.js';

const SCHILDE = ['pa_101', 'pa_093', 'pa_148'];

test('Genau drei Schild-Waffen: Eisschild, Funkenschild, Feuerschild; Katalog bleibt bei 150', () => {
  assert.equal(WEAPONS.length, 150);
  for (const fassung of [WAFFEN_SPREIZUNG, WAFFEN_MUNITION]) {
    const schilde = WEAPONS.filter(w => buildEffect(getWaffe(w.id, fassung))?.kind === 'shield').map(w => w.id).sort();
    assert.deepEqual(schilde, [...SCHILDE].sort(), `Fassung ${fassung}`);
  }
  assert.deepEqual(SCHILDE.map(id => WEAPONS_BY_ID[id].displayName), ['Eisschild', 'Funkenschild', 'Feuerschild']);
  assert.equal(WEAPONS_BY_ID.pa_148.internalName, 'himmelswachter', 'internalName bleibt stabil');
});

test('Jeder Schild trägt sein Element: Eis gegen Frost, Funken gegen Schock, Feuer gegen Brand; Schadensart folgt', () => {
  const soll = { pa_101: ['ice', 'ice'], pa_093: ['electric', 'electric'], pa_148: ['fire', 'fire'] };
  for (const [id, [gegen, art]] of Object.entries(soll)) {
    const effekt = buildEffect(getWaffe(id, WAFFEN_MUNITION));
    assert.equal(effekt.gegen, gegen, id);
    assert.equal(getWaffe(id, WAFFEN_MUNITION).damageType, art, id);
  }
  // Der Feuerschild ist der größte, Pause und Stufe tragen es.
  const menge = SCHILDE.map(id => buildEffect(getWaffe(id, WAFFEN_MUNITION)).amount);
  assert.deepEqual(menge, [55, 40, 75]);
});

test('Fassung 10 kennt den Feuerschild nicht: Schildmenge nach Katalog, kein Element', () => {
  const alt = buildEffect(getWaffe('pa_148', WAFFEN_SPREIZUNG));
  assert.equal(alt.kind, 'shield');
  assert.equal(alt.gegen, undefined);
  assert.equal(getWaffe('pa_148', WAFFEN_SPREIZUNG).damageType, 'holy');
});

function paar() {
  const match = new MatchController({
    seed: 777, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE, kisten: KISTEN_ALT,
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

test('Der Feuerschild setzt den Angreifer in Brand, sobald er den Treffer auffängt', () => {
  const { match, schuetze, ziel } = paar();
  const soll = buildEffect(getWaffe('pa_148'));
  match.statuses.addShield(ziel, soll.amount, soll.gegen);
  assert.equal(match.statuses.shieldGegenOf(ziel), 'fire');
  match.inventory.grantWeapon(schuetze, 'pa_083');
  match.inventory.selectWeapon(schuetze, 'pa_083');
  assert.ok(match.fire(schuetze, 0.05, 80, 'pa_083').ok);
  match.consumeEvents();
  assert.equal(match.mali.hat(schuetze, 'brand'), true, 'Brand auf dem Angreifer');
});

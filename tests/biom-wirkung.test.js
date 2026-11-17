/**
 * QV-3 (2026-11-17): Die Biom-Wahl muss im Menümodus wenigstens die Stoffe der Karte ändern.
 *
 * Schützt vor dem Rückfall, den QV-1 aufgedeckt hat: ohne autonome Karte gab es kein Stofffeld und
 * alle Biome spielten gleich. Ob die Stoffe auch den Spielverlauf ändern, misst
 * `scripts/biom-wirkung.mjs` (Bot-Duelle, zu langsam für die Unit-Suite).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOME, karte } from '../scripts/biom-wirkung.mjs';
import { MENUE_KARTENTYP } from '../src/shared/config/menueStart.js';

const SEED = 20261111;

test('Jedes Sonderbiom hat ein anderes Stofffeld als „klassisch“ (Menümodus)', () => {
  const basis = karte('klassisch', SEED);
  assert.equal(basis.kartentyp, MENUE_KARTENTYP);
  assert.ok(basis.stoffe, 'klassisch ohne Stofffeld');
  const gleich = BIOME.filter(b => b !== 'klassisch').filter(b => karte(b, SEED).stoffe === basis.stoffe);
  assert.deepEqual(gleich, [], `Biome mit gleichem Stofffeld wie klassisch: ${gleich.join(', ')}`);
});

test('Die Biomliste umfasst klassisch und 20 Sonderbiome', () => {
  assert.equal(BIOME[0], 'klassisch');
  assert.equal(BIOME.length, 21);
  assert.equal(new Set(BIOME).size, 21);
});

/**
 * Tests: Kisten und Zielwirkungen sind eigene Module über eine Quelle.
 *
 * `match.js` hielt den Kistenwurf (`dropWeapon`, `#rollDropThrow`, `#stepCrate`)
 * und die Zielwirkungen (`#applyTargetEffect`, Verschiebung, Bodenmaterial) selbst.
 * Beide liegen jetzt in `engine/kistenWurf.js` und `engine/zieleffekte.js` — nach
 * dem Muster von `turret.js` (`tests/turret-zerlegung.test.js`): Der Match baut
 * eine Quelle, das Modul liest nur daraus.
 *
 * Geprüft wird:
 *  1. Kein `this` in den Modulen (reine Funktionen über die Quelle).
 *  2. `match.js` rechnet nicht mehr nach: die Rümpfe stehen dort nicht mehr.
 *  3. Die Quelle genügt: `wirfWaffe` und `rolleWurf` laufen mit einem Literal,
 *     und die Reihenfolge der Zufallszüge ist festgehalten
 *     (Richtung, Zieldistanz, Höhe).
 *  4. Oberfläche und Wasserstand (`wasserOberflaeche.js`) laufen mit Literalen:
 *     der Spalten-Merker sucht nur einmal je Maskenversion, Wasserstand und
 *     Fluten folgen der Quelle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rolleWurf, wirfWaffe } from '../src/engine/kistenWurf.js';
import { OberflaechenCache, wasserstandAn, setzeWasserstandAn, flutBereich } from '../src/engine/wasserOberflaeche.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lies = rel => readFileSync(resolve(ROOT, rel), 'utf8');

for (const datei of ['src/engine/kistenWurf.js', 'src/engine/zieleffekte.js']) {
  test(`${datei} greift nicht auf \`this\` zu`, () => {
    const treffer = ohneKommentare(lies(datei)).match(/\bthis\b/g) ?? [];
    assert.deepEqual(treffer, [], `${datei} muss über die Quelle (Parameter) laufen`);
  });
}

test('match.js enthält die Rümpfe nicht mehr', () => {
  const match = ohneKommentare(lies('src/engine/match.js'));
  for (const alt of ['#rollDropThrow(', '#stepCrate(', '#stepFlyingCrates(', '#pullToward(',
    '#pushAway(', '#shiftToward(', '#wendeBodenmaterialAn(', 'CRATE_GRAVITY', 'MAX_SHIFT_SLOPE']) {
    assert.ok(!match.includes(alt), `${alt} gehört nach kistenWurf.js / zieleffekte.js`);
  }
  assert.match(match, /wirfWaffe\(this\.#kistenQuelle\(\)/);
  assert.match(match, /wendeZielwirkungAn\(this\.#wirkungsQuelle\(\)/);
  assert.ok(!match.includes('OBERFLAECHE_UNBEKANNT'), 'der Spalten-Merker gehört nach wasserOberflaeche.js');
});

test('rolleWurf zieht Richtung, Zieldistanz, Höhe — in dieser Reihenfolge', () => {
  const zuege = [];
  const rng = {
    nextBoolean: () => { zuege.push('bool'); return true; },
    nextFloat: (a, b) => { zuege.push(`float ${a} ${b}`); return a; },
  };
  const wurf = rolleWurf({ rng });
  assert.equal(zuege.length, 3);
  assert.equal(zuege[0], 'bool');
  assert.match(zuege[1], /^float 154 330$/);
  assert.equal(zuege[2], 'float 9 14');
  assert.ok(wurf.vx < 0, 'true = nach links');
  assert.equal(wurf.vy, -9);
});

test('wirfWaffe prüft vor dem Würfeln: kein Zufallszug bei abgelehntem Abwurf', () => {
  let gezogen = 0;
  const rng = { nextBoolean: () => { gezogen += 1; return true; }, nextFloat: () => { gezogen += 1; return 1; } };
  const q = {
    status: 'playing', activePlayerId: 1, isPlayerAlive: () => true, rng,
    getWeapon: () => ({ index: 0, rarity: 'common' }),
    inventory: { removeWeapon: () => ({ ok: false, reason: 'Reservewaffe' }) },
  };
  assert.deepEqual(wirfWaffe(q, 2, 'x'), { ok: false, errors: ['Nur der aktive Spieler kann eine Waffe abwerfen'] });
  assert.deepEqual(wirfWaffe(q, 1, 'x'), { ok: false, errors: ['Reservewaffe'] });
  assert.equal(gezogen, 0);
});

test('OberflaechenCache sucht je Spalte einmal und verwirft den Merker bei neuer Maskenversion', () => {
  let suchen = 0;
  const terrain = { version: 1, topSolidY: spalte => { suchen += 1; return 100 + spalte; } };
  const cache = new OberflaechenCache(10);
  assert.equal(cache.hoeheAn(terrain, 3), 103);
  assert.equal(cache.hoeheAn(terrain, 3.9), 103);
  assert.equal(suchen, 1);
  assert.equal(cache.hoeheAn(terrain, 99), 109, 'außerhalb wird auf die letzte Spalte begrenzt');
  assert.equal(cache.hoeheAn(terrain, NaN), -1);
  terrain.version = 2;
  cache.hoeheAn(terrain, 3);
  assert.equal(suchen, 3, 'neue Version: Suche beginnt von vorn');
});

test('Wasserstand und Fluten laufen über die Quelle', () => {
  const zellen = new Map();
  const water = {
    width: 10, height: 10,
    toGrid: (x, y) => ({ x: Math.floor(x / 4), y: Math.floor(y / 4) }),
    levelAtWorld: (x, y) => zellen.get(`${Math.floor(x / 4)},${Math.floor(y / 4)}`) ?? 0,
    setLevel: (x, y, l) => zellen.set(`${x},${y}`, l),
  };
  const q = { water, width: 40, height: 40, skala: 4 };
  q.waterLevelAt = (x, y) => wasserstandAn(q, x, y);
  q.setWaterLevelAt = (x, y, l) => setzeWasserstandAn(q, x, y, l);
  assert.equal(wasserstandAn({ water: null }, 1, 1), 0);
  assert.equal(setzeWasserstandAn(q, -5, 5, 1), false, 'außerhalb der Karte passiert nichts');
  assert.equal(setzeWasserstandAn(q, 8, 8, 0.5), true);
  assert.equal(wasserstandAn(q, 8, 8), 0.5);
  const geflutet = flutBereich(q, 20, 20, 0.7);
  assert.ok(geflutet.zellen > 0);
  assert.equal(geflutet.hoechster, 0.7);
});

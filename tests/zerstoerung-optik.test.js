import assert from 'node:assert/strict';
import test from 'node:test';
import {
  erzeugeTruemmer, schreiteTruemmerFort, erzeugeStaub, kraterUmriss, inselGrenzen,
  schreiteInselFort, nimmPflanzenDerInsel, verschiebePflanzenMitInsel, inselStaub, inselTruemmer,
  TRUEMMER_MAX, STAUB_SCHWELLE,
} from '../src/client/zerstoerungOptik.js';

/**
 * Optik der Zerstörung: reiner Rechenkern, nur Anzeige (kein Hash, kein Zufall).
 */

test('Trümmer: deterministisch, nach oben gefächert, gedeckelt, und sie altern weg', () => {
  const a = erzeugeTruemmer(100, 200, 40, 135);
  assert.deepEqual(a, erzeugeTruemmer(100, 200, 40, 135));
  assert.ok(a.length > 6 && a.length <= TRUEMMER_MAX);
  assert.ok(a.every(t => t.vy < 0), 'alle fliegen zunächst nach oben');
  assert.equal(erzeugeTruemmer(100, 200, 2).length, 0, 'Winzlöcher werfen nichts auf');
  assert.equal(erzeugeTruemmer(100, 200, 500).length, TRUEMMER_MAX);

  let liste = a;
  const vorher = liste[0].y;
  for (let i = 0; i < 20; i++) liste = schreiteTruemmerFort(liste);
  assert.ok(liste[0].y !== vorher && liste[0].vy > a[0].vy, 'sie fliegen und fallen');
  for (let i = 0; i < 100; i++) liste = schreiteTruemmerFort(liste);
  assert.equal(liste.length, 0, 'nach genug Bildern ist alles aufgeräumt');
});

test('Staub: erst ab Schwelle, Erdfarbe, steigt langsam', () => {
  assert.deepEqual(erzeugeStaub(0, 0, STAUB_SCHWELLE - 1, 'red'), []);
  const staub = erzeugeStaub(50, 50, 40, 'rgb(1, 2, 3)');
  assert.ok(staub.length >= 3);
  assert.ok(staub.every(w => w.farbe === 'rgb(1, 2, 3)' && w.vy < 0 && w.life === 1 && w.decay > 0));
});

test('Umriss ohne Tiefe ist ein Kreis, mit Tiefe weicht er ab und ist geschlossen', () => {
  const kreis = kraterUmriss(100, 100, 30, null, 24);
  assert.ok(kreis.every(p => Math.abs(Math.hypot(p.x - 100, p.y - 100) - 30) < 1e-9));
  const rau = kraterUmriss(100, 100, 30, 135, 24);
  assert.equal(rau.length, 25);
  assert.deepEqual(rau[0], rau[24]);
  assert.ok(rau.some(p => Math.abs(Math.hypot(p.x - 100, p.y - 100) - 30) > 1.5));
});

test('Insel: Grenzen, Anzeigefall hinkt der Simulation nach, Staub und Trümmer am Fuß', () => {
  const runs = [10, 5, 9, 11, 5, 9, 12, 6, 8];
  assert.deepEqual(inselGrenzen(runs), { x0: 10, y0: 5, x1: 12, y1: 9, breite: 3, hoehe: 5 });
  assert.equal(inselGrenzen([]), null);
  let insel = { versatz: 0, tempo: 0 };
  for (let i = 0; i < 10; i++) insel = schreiteInselFort(insel);
  assert.ok(insel.versatz > 20 && insel.tempo <= 10);
  assert.ok(inselStaub(runs, 'c').every(w => w.y === 9));
  assert.equal(inselTruemmer(runs).length, 10);
});

test('Pflanzen: wurzelnde Pflanzen werden mit der Insel abgenommen und bei der Landung mitverschoben', () => {
  const runs = [10, 50, 58, 11, 50, 58, 12, 50, 58];
  const pflanzen = [{ x: 11, y: 52 }, { x: 40, y: 52 }];
  const genommen = nimmPflanzenDerInsel(pflanzen, runs);
  assert.deepEqual(genommen, [{ x: 11, y: 52 }]);
  assert.equal(pflanzen.length, 1);
  const rest = [{ x: 11, y: 52 }, { x: 40, y: 52 }];
  assert.equal(verschiebePflanzenMitInsel(rest, runs, 7), true);
  assert.deepEqual(rest, [{ x: 11, y: 59 }, { x: 40, y: 52 }]);
  assert.equal(verschiebePflanzenMitInsel([], runs, 7), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  erzeugeTruemmer, schreiteTruemmerFort, erzeugeStaub, kraterUmriss, inselGrenzen,
  schreiteInselFort, nimmPflanzenDerInsel, verschiebePflanzenMitInsel, inselStaub, inselTruemmer,
  TRUEMMER_MAX, STAUB_SCHWELLE, inselZellen, aufprallStaerke, aufprallEffekt,
} from '../src/client/zerstoerungOptik.js';
import {
  ruckAufprall, ruckVersatz, altereRuck, ruckFuer, AUFPRALL_RUCK_BILDER, RUCK_MAX,
} from '../src/client/gefuehl.js';
import { pflanzenStreifen, pflanzenRahmen } from '../src/client/pflanzen.js';

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

/** Eine Insel aus `breite` Spalten à `hoehe` Zeilen, linke obere Ecke (x0, y0). */
function scholle(x0, y0, breite, hoehe) {
  const runs = [];
  for (let x = x0; x < x0 + breite; x++) runs.push(x, y0, y0 + hoehe - 1);
  return runs;
}

test('Aufprall: Stärke wächst mit Masse und Fallhöhe, bleibt in 0..1 und ist deterministisch', () => {
  assert.equal(inselZellen(scholle(0, 0, 10, 5)), 50);
  const kiesel = aufprallStaerke(scholle(0, 0, 6, 4), 8);
  const brocken = aufprallStaerke(scholle(0, 0, 100, 80), 150);
  assert.ok(kiesel > 0 && kiesel < 0.3, `Kiesel ${kiesel}`);
  assert.ok(brocken > 0.9 && brocken <= 1, `Brocken ${brocken}`);
  assert.ok(aufprallStaerke(scholle(0, 0, 60, 40), 100) > aufprallStaerke(scholle(0, 0, 60, 40), 10), 'tiefer = härter');
  assert.ok(aufprallStaerke(scholle(0, 0, 100, 80), 50) > aufprallStaerke(scholle(0, 0, 20, 10), 50), 'schwerer = härter');
  assert.equal(aufprallStaerke(scholle(0, 0, 100, 80), 150), brocken);
});

test('Aufprall: Staubwolke am Fuß mit zwei Druckwellen nach außen, Brocken und Stärke wachsen mit dem Schlag', () => {
  const klein = aufprallEffekt(scholle(100, 300, 12, 6), 6, 'c');
  const gross = aufprallEffekt(scholle(100, 300, 120, 80), 140, 'c');
  assert.deepEqual(gross, aufprallEffekt(scholle(100, 300, 120, 80), 140, 'c'));
  assert.ok(gross.staub.length > klein.staub.length && gross.truemmer.length > klein.truemmer.length);
  assert.ok(gross.staub.every(w => w.farbe === 'c' && w.life === 1 && w.y === 379));
  const links = gross.staub.filter(w => w.vx < -0.9 && w.x === 100);
  const rechts = gross.staub.filter(w => w.vx > 0.9 && w.x === 219);
  assert.equal(links.length, 1, 'Druckwelle nach links');
  assert.equal(rechts.length, 1, 'Druckwelle nach rechts');
  assert.deepEqual(aufprallEffekt([], 10, 'c'), { staerke: 0, staub: [], truemmer: [] });
});

test('Aufprall-Ruck: erst ab Schwelle, skaliert mit der Stärke, hält länger als der Kraterruck und verklingt', () => {
  assert.equal(ruckAufprall(0.1), null);
  assert.equal(ruckAufprall(0.9, { reducedMotion: true }), null);
  assert.equal(ruckAufprall(Number.NaN), null);
  const leicht = ruckAufprall(0.31);
  const hart = ruckAufprall(1);
  assert.ok(leicht.skala < hart.skala && hart.skala === 1);
  const amplitude = ruck => Math.max(...[0, 1, 2, 3, 4, 5, 6].map(bild => Math.max(Math.abs(ruckVersatz(ruck, { bild }).x), Math.abs(ruckVersatz(ruck, { bild }).y))));
  assert.ok(amplitude(leicht) < amplitude(hart));
  assert.ok(amplitude(hart) <= RUCK_MAX + 1e-9, 'nie über dem Deckel');
  assert.ok(amplitude(hart) <= amplitude(ruckFuer(100)) + 1e-9, 'höchstens so hart wie der größte Krater');
  let ruck = hart;
  let bilder = 0;
  while (ruck) { ruck = altereRuck(ruck); bilder += 1; }
  assert.equal(bilder, AUFPRALL_RUCK_BILDER);
  assert.ok(AUFPRALL_RUCK_BILDER > 8, 'länger als der Kraterruck');
});

test('Pflanzenstreifen: überschneidungsfrei, decken jeden Rahmen ab und bleiben im Bild', () => {
  const pflanzen = [
    { art: 'busch', x: 100, y: 500, h: 16 }, { art: 'palme', x: 120, y: 480, h: 50 },
    { art: 'gras', x: 600, y: 300, h: 10 }, { art: 'tanne', x: 2550, y: 700, h: 60 },
  ];
  const streifen = pflanzenStreifen(pflanzen, 2560, 1440);
  assert.ok(streifen.length >= 2 && streifen.length < pflanzen.length, 'Nachbarn verschmelzen');
  for (let i = 1; i < streifen.length; i++) assert.ok(streifen[i].x0 >= streifen[i - 1].x1, 'ohne Überlappung');
  for (const p of pflanzen) {
    const r = pflanzenRahmen(p, 2560, 1440);
    assert.ok(streifen.some(s => s.x0 <= r.x0 && s.x1 >= r.x1 && s.y0 <= r.y0 && s.y1 >= r.y1), `${p.art} bei ${p.x} abgedeckt`);
  }
  assert.ok(streifen.every(s => s.x0 >= 0 && s.y0 >= 0 && s.x1 <= 2560 && s.y1 <= 1440));
  assert.deepEqual(pflanzenStreifen([], 2560, 1440), []);
});

/* ------------------------------------------------- Risse und Geröll nach dem Einschlag */

test('Risse und Geröll: erst ab Mindestradius, deterministisch, Geröll liegt unten am Rand und gedeckelt', async () => {
  const { kraterRisse, geroellZellen, RISS_MIN_RADIUS } = await import('../src/client/schuttOptik.js');
  const umriss = kraterUmriss(300, 200, 30, 115);
  assert.deepEqual(kraterRisse(kraterUmriss(300, 200, 6, 100), 300, 200, 6, 5), []);
  assert.deepEqual(geroellZellen(kraterUmriss(300, 200, RISS_MIN_RADIUS - 1, 100), 300, 200, RISS_MIN_RADIUS - 1, 5), []);
  const risse = kraterRisse(umriss, 300, 200, 30, 7);
  assert.deepEqual(risse, kraterRisse(umriss, 300, 200, 30, 7));
  assert.ok(risse.length >= 4 && risse.length <= 9);
  for (const r of risse) assert.ok(r.length >= 4 && r.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.notDeepEqual(risse, kraterRisse(umriss, 300, 200, 30, 8), 'anderer Seed, andere Risse');

  const zellen = geroellZellen(umriss, 300, 200, 30, 7);
  assert.deepEqual(zellen, geroellZellen(umriss, 300, 200, 30, 7));
  assert.ok(zellen.length > 0 && zellen.length <= 26);
  for (const z of zellen) {
    assert.ok(Number.isInteger(z.x) && Number.isInteger(z.y) && z.w >= 1 && z.w <= 3 && z.ton >= 0 && z.ton < 4);
    assert.ok(z.y >= 200 - 30 * 0.2 - 6, `Zelle (${z.x}, ${z.y}) liegt oben am Rand`);
    const d = Math.hypot(z.x - 300, z.y - 200);
    assert.ok(d >= 30 * 0.4 && d <= 30 * 1.7, `Zelle ${d.toFixed(1)} px vom Zentrum`);
  }
});

test('Geröll wird nur mit source-atop gemalt (kein Pixel im Freien), Risse ebenso', async () => {
  const { zeichneKraterRisse, zeichneGeroell } = await import('../src/client/schuttOptik.js');
  const modi = [];
  let rechtecke = 0;
  const ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() { rechtecke += 1; },
    set globalCompositeOperation(v) { modi.push(v); },
  };
  zeichneGeroell(ctx, [{ x: 1, y: 2, w: 2, ton: 1 }, { x: 5, y: 6, w: 1, ton: 3 }], ['a', 'b', 'c', 'd']);
  zeichneKraterRisse(ctx, [[{ x: 0, y: 0 }, { x: 4, y: 3 }]]);
  assert.equal(rechtecke, 2);
  assert.deepEqual(modi, ['source-atop', 'source-atop']);
});

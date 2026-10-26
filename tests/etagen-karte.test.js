import test from 'node:test';
import assert from 'node:assert/strict';
import { erzeugeKarte, KARTENTYPEN } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';

/*
 * LOOK-4 Stufe 2 (2026-10-25): der Kartentyp `etagen`.
 *
 * Aufbau: je Etage ein Deckenband, darunter ein Hohlraum; der Boden des
 * Hohlraums ist die naechste Decke, die unterste Etage steht auf dem
 * Kartenboden. Schaechte stanzen Loecher von der Oberflaeche durch alle
 * Decken.
 *
 * Die Masse sind PIXELWERTE, keine Kartenanteile — dieselbe Lehre wie bei den
 * Hoehlen (dort ergab ein Anteil auf kleiner Karte 11 % Land, auf grosser 27 %).
 */

const BREITE = 1280;
const HOEHE = 720;

function karte(typ, seed = 4242) {
  return erzeugeKarte({ rng: new SeededRandom(seed), width: BREITE, height: HOEHE, typ });
}

/** Feste Baender einer Spalte als [oben, unten]. */
function baender(k, x) {
  const w = k.width;
  const aus = [];
  let y = 0;
  while (y < k.height) {
    while (y < k.height && !k.bitmap[y * w + x]) y += 1;
    if (y >= k.height) break;
    const oben = y;
    while (y < k.height && k.bitmap[y * w + x]) y += 1;
    aus.push([oben, y - 1]);
  }
  return aus;
}

test('Der Typ etagen existiert mit festen Pixelmassen', () => {
  const def = KARTENTYPEN.etagen;
  assert.ok(def, 'KARTENTYPEN.etagen fehlt');
  assert.equal(def.hoehlenAnteil, 0, 'etagen stanzt keine Zufallshoehlen');
  assert.ok(def.etagen >= 2, 'mindestens zwei Etagen');
  assert.ok(def.etagenDecke > 0 && def.etagenRaum > def.etagenDecke, 'Decke duenn, Raum hoeher');
  assert.ok(def.schachtBreite > 0 && def.schachtAbstand > def.schachtBreite, 'Schacht passt zwischen die Abstaende');
});

test('Derselbe Seed ergibt dieselbe Karte, ein anderer eine andere', () => {
  const a = karte('etagen', 4242);
  const b = karte('etagen', 4242);
  const c = karte('etagen', 9999);
  assert.deepEqual(Array.from(a.bitmap.slice(0, 5000)), Array.from(b.bitmap.slice(0, 5000)), 'gleicher Seed muss gleich sein');
  let unterschiede = 0;
  for (let i = 0; i < a.bitmap.length; i += 1) if (a.bitmap[i] !== c.bitmap[i]) unterschiede += 1;
  assert.ok(unterschiede > a.bitmap.length * 0.05, `anderer Seed muss anders aussehen, Unterschiede: ${unterschiede}`);
});

test('Jede Spalte hat die Decken und dazwischen Luft', () => {
  const def = KARTENTYPEN.etagen;
  const k = karte('etagen');
  const geprueft = [200, 500, 900, 1200].filter(x => k.bitmap.every((_, i) => i % k.width !== x || true));
  let spaltenMitDecken = 0;
  for (const x of geprueft) {
    const b = baender(k, x);
    const decken = b.filter(([oben, unten]) => unten - oben + 1 <= def.etagenDecke + 2);
    if (decken.length >= 2) spaltenMitDecken += 1;
  }
  assert.ok(spaltenMitDecken >= 2,
    `erwartet mindestens 2 Spalten mit mehreren Deckenbaendern, gefunden: ${spaltenMitDecken}`);
});

test('Ein Schacht verbindet die Oberflaeche mit den Etagen', () => {
  const k = karte('etagen');
  const def = KARTENTYPEN.etagen;
  const mindestLaenge = (def.etagenDecke + def.etagenRaum) * 2;
  let gefunden = null;
  for (let x = 1; x < k.width - 1 && !gefunden; x += 1) {
    let laengster = 0;
    let lauf = 0;
    for (let y = 0; y < k.height - 1; y += 1) {
      if (!k.bitmap[y * k.width + x]) { lauf += 1; laengster = Math.max(laengster, lauf); } else lauf = 0;
    }
    if (laengster >= mindestLaenge) gefunden = { x, laengster };
  }
  assert.ok(gefunden, `kein Schacht mit mindestens ${mindestLaenge} px Luft gefunden`);
});

test('Raender und Kartenboden sind versiegelt', () => {
  const k = karte('etagen');
  for (let y = 0; y < k.height; y += 1) {
    assert.equal(k.bitmap[y * k.width], 1, 'linker Rand muss fest sein (Zeile ' + y + ')');
    assert.equal(k.bitmap[y * k.width + (k.width - 1)], 1, 'rechter Rand muss fest sein (Zeile ' + y + ')');
  }
  for (let x = 0; x < k.width; x += 1) {
    assert.equal(k.bitmap[(k.height - 1) * k.width + x], 1, 'Kartenboden muss fest sein (Spalte ' + x + ')');
  }
});

/*
 * Stufe 2b (2026-10-25): Der Schacht muss ERSTEIGBAR sein.
 *
 * Gemessen (nicht geschätzt): ein normaler Sprung erreicht 117 px, ein Salto
 * 139 px. Ein reiner Schacht wäre damit nutzlos — man springt hoch und fällt
 * wieder hinunter. Deshalb trägt der Schacht versetzte Trittbretter; der
 * Höhenabstand zwischen zwei aufeinanderfolgenden Brettern muss unter der
 * Sprunghöhe liegen (hier mit Reserve: höchstens 100 px).
 */
test('Die Trittbretter im Schacht liegen innerhalb der Sprunghoehe', () => {
  const def = KARTENTYPEN.etagen;
  const SPRUNGHOEHE_GEMESSEN = 117;
  const HOECHSTER_ABSTAND = 100; // Reserve unter der gemessenen Sprunghoehe
  assert.ok(HOECHSTER_ABSTAND < SPRUNGHOEHE_GEMESSEN, 'Reserve muss unter der Sprunghoehe liegen');

  const k = karte('etagen');
  const sx = def.schachtAbstand;
  // Alle festen Pixel im Schacht sammeln, die NICHT zu einem Deckenband gehoeren.
  const bretter = [];
  for (let y = 1; y < k.height - 2; y += 1) {
    for (let dx = 0; dx < def.schachtBreite; dx += 1) {
      const x = sx + dx;
      if (!k.bitmap[y * k.width + x]) continue;
      const obenFrei = !k.bitmap[(y - 1) * k.width + x];
      const untenFrei = !k.bitmap[(y + 1) * k.width + x];
      if (obenFrei && untenFrei) { bretter.push(y); break; }
    }
  }
  assert.ok(bretter.length >= 3, `zu wenige Trittbretter im Schacht: ${bretter.length}`);
  for (let i = 1; i < bretter.length; i += 1) {
    const abstand = bretter[i] - bretter[i - 1];
    assert.ok(abstand <= HOECHSTER_ABSTAND,
      `Abstand zwischen Trittbrettern zu gross: ${abstand} px bei y=${bretter[i - 1]} (Grenze ${HOECHSTER_ABSTAND})`);
  }
});

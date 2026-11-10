/**
 * Stoff-Varianten (reine Client-Optik): Anzahl 5 bis 7 je Stoff, Determinismus, Bindung an die Weltkoordinate,
 * Verteilung, Wirkung auf die Färbung ohne Einfluss auf die Maske.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { STOFFE } from '../src/shared/config/stoffe.js';
import {
  VARIANTEN_MIN, VARIANTEN_MAX, BLOCK_PX, variantenAnzahl, variantenTabellen, waehleVariante, varianteAnPunkt,
} from '../src/client/stoffVarianten.js';
import { tinteStoffe } from '../src/client/stoffOptik.js';
import {
  STOFF_TEXTUR, TEXTUR_NAMEN, TEXTUR_GROESSE, registriereStoffTextur, leereStoffTexturen,
} from '../src/client/stoffTexturen.js';

test('Jeder der 126 Stoffe hat 5, 6 oder 7 Varianten, fest aus der Kennung', () => {
  assert.equal(STOFFE.length, 126);
  const haeufigkeit = { 5: 0, 6: 0, 7: 0 };
  for (let id = 0; id < STOFFE.length; id += 1) {
    const k = variantenAnzahl(id);
    assert.ok(Number.isInteger(k) && k >= VARIANTEN_MIN && k <= VARIANTEN_MAX, `Stoff ${id}: ${k}`);
    assert.equal(variantenAnzahl(id), k, 'stabil bei Wiederholung');
    haeufigkeit[k] += 1;
  }
  // Alle drei Anzahlen kommen vor, keine dominiert mit mehr als zwei Dritteln.
  for (const k of [5, 6, 7]) assert.ok(haeufigkeit[k] >= 20 && haeufigkeit[k] <= 84, `Anzahl ${k}: ${haeufigkeit[k]} Stoffe`);
  assert.equal(variantenTabellen().anzahl[10], variantenAnzahl(10));
});

test('Variante 0 ist die unveränderte Textur, die übrigen unterscheiden sich in Parametern', () => {
  const { ganz, farbe } = variantenTabellen();
  for (let id = 0; id < STOFFE.length; id += 1) {
    const k = variantenAnzahl(id);
    const o0 = id * VARIANTEN_MAX * 4;
    assert.deepEqual([...ganz.slice(o0, o0 + 4)], [0, 0, 0, 256], `Stoff ${id}: Variante 0 unverändert`);
    const gesehen = new Set();
    for (let v = 0; v < k; v += 1) {
      const o = (id * VARIANTEN_MAX + v) * 4;
      const f = (id * VARIANTEN_MAX + v) * 3;
      gesehen.add([...ganz.slice(o, o + 4), ...farbe.slice(f, f + 3)].join(','));
      for (let c = 0; c < 3; c += 1) assert.ok(farbe[f + c] > 0.85 && farbe[f + c] < 1.15, 'Farbabweichung maßvoll');
    }
    assert.equal(gesehen.size, k, `Stoff ${id}: alle ${k} Varianten verschieden`);
  }
});

test('Gleiche Koordinate, Seed und Stoff ergeben dieselbe Variante; andere Seeds ändern die Wahl', () => {
  for (let i = 0; i < 400; i += 1) {
    const id = (i * 7) % STOFFE.length;
    const x = (i * 131) % 2560;
    const y = (i * 71) % 1440;
    const v = varianteAnPunkt(4242, id, x, y);
    assert.equal(varianteAnPunkt(4242, id, x, y), v);
    assert.ok(v >= 0 && v < variantenAnzahl(id));
    // Innerhalb desselben Blocks gilt dieselbe Variante.
    assert.equal(varianteAnPunkt(4242, id, x - (x % BLOCK_PX) + 3, y - (y % BLOCK_PX) + 5), v);
  }
  let verschieden = 0;
  for (let b = 0; b < 200; b += 1) if (waehleVariante(1, 20, b, 3) !== waehleVariante(2, 20, b, 3)) verschieden += 1;
  assert.ok(verschieden > 60, `Seed wirkt: ${verschieden}/200 Blöcke anders`);
});

test('Verteilung nicht degeneriert: alle Varianten kommen vor, keine dominiert', () => {
  for (const id of [0, 3, 18, 40, 77, 125]) {
    const k = variantenAnzahl(id);
    const zaehler = new Array(k).fill(0);
    const n = 6000;
    for (let i = 0; i < n; i += 1) zaehler[waehleVariante(20260916, id, i % 80, (i / 80) | 0)] += 1;
    for (let v = 0; v < k; v += 1) {
      assert.ok(zaehler[v] > (n / k) * 0.7 && zaehler[v] < (n / k) * 1.3, `Stoff ${id} Variante ${v}: ${zaehler[v]} von ${n}`);
    }
  }
  // Nachbarblöcke sind nicht fast immer gleich (kein Streifen- oder Flächenmuster).
  let gleich = 0;
  for (let b = 0; b < 2000; b += 1) if (waehleVariante(9, 30, b, 5) === waehleVariante(9, 30, b + 1, 5)) gleich += 1;
  assert.ok(gleich < 2000 / variantenAnzahl(30) * 1.4, `Nachbarn gleich: ${gleich}`);
});

// --- Wirkung auf die Färbung ---

const B = 512;
const H = 384;

function fuelleTexturen() {
  leereStoffTexturen();
  for (const n of TEXTUR_NAMEN) {
    const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
    // Asymmetrisches Muster, damit Spiegelung/Drehung sichtbar wird.
    for (let i = 0; i < px.length; i += 4) {
      const p = i >> 2;
      const x = p & 511;
      const y = p >> 9;
      const v = 60 + ((x * 3 + y * 5 + ((x * y) >> 4)) % 140);
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
    registriereStoffTextur(n, px);
  }
}

/** Karte aus einem einzigen Stoff, Bitmap voll (`ausgespart` = Rechteck, das fehlt, wie ein Krater). */
function faerbe(stoffId, seed, ausgespart = null) {
  const spalten = B / 8;
  const zeilen = H / 8;
  const feld = new Uint8Array(spalten * zeilen).fill(stoffId);
  const bitmap = new Uint8Array(B * H).fill(1);
  if (ausgespart) {
    for (let y = ausgespart.y0; y < ausgespart.y1; y += 1) for (let x = ausgespart.x0; x < ausgespart.x1; x += 1) bitmap[y * B + x] = 0;
  }
  const d = new Uint8ClampedArray(B * H * 4).fill(128);
  tinteStoffe(d, bitmap, B, H, { feld, spalten, zeilen }, seed);
  return d;
}

test('Varianten ändern nur Farben, sind deterministisch und folgen dem Seed', () => {
  fuelleTexturen();
  const stoff = STOFFE.findIndex((s) => s.key === 'kristall' && STOFF_TEXTUR[s.key]);
  assert.ok(stoff > 0);
  const a = faerbe(stoff, 11);
  const a2 = faerbe(stoff, 11);
  const b = faerbe(stoff, 12);
  assert.deepEqual(a, a2, 'gleicher Seed, gleiches Bild');
  let anders = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i]) anders += 1;
  assert.ok(anders > B * H * 0.2, `anderer Seed ändert die Varianten sichtbar (${anders})`);
  leereStoffTexturen();
});

test('Abtragen lässt die Varianten der übrigen Pixel stehen (an Weltkoordinaten gebunden)', () => {
  fuelleTexturen();
  const stoff = STOFFE.findIndex((s) => s.key === 'kristall' && STOFF_TEXTUR[s.key]);
  const voll = faerbe(stoff, 31);
  const loch = { x0: 100, x1: 220, y0: 40, y1: 150 };
  const ohneLoch = faerbe(stoff, 31, loch);
  let abweichend = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < B; x += 1) {
      if (x >= loch.x0 && x < loch.x1 && y >= loch.y0 && y < loch.y1) continue;
      const o = (y * B + x) * 4;
      if (voll[o] !== ohneLoch[o] || voll[o + 1] !== ohneLoch[o + 1] || voll[o + 2] !== ohneLoch[o + 2]) abweichend += 1;
    }
  }
  assert.equal(abweichend, 0, 'Pixel außerhalb des Kraters unverändert');
  leereStoffTexturen();
});

test('Weiche Übergänge: keine harten Nähte zwischen Varianten, aber sichtbare Abwechslung', () => {
  leereStoffTexturen();
  // Glatte, nahtlose Textur: Sprünge im Bild können nur von Variantenwechseln kommen.
  for (const n of TEXTUR_NAMEN) {
    const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
    for (let i = 0; i < px.length; i += 4) {
      const p = i >> 2;
      const x = p & 511;
      const y = p >> 9;
      const v = 128 + 70 * Math.sin((2 * Math.PI * x) / 512) * Math.cos((2 * Math.PI * (y + 100)) / 512) + 30 * Math.sin((2 * Math.PI * y) / 256);
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
    registriereStoffTextur(n, px);
  }
  const stoff = STOFFE.findIndex((s) => s.key === 'kristall' && STOFF_TEXTUR[s.key]);
  const d = faerbe(stoff, 5);
  let maxSprung = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 1; x < B; x += 1) maxSprung = Math.max(maxSprung, Math.abs(d[(y * B + x) * 4] - d[(y * B + x - 1) * 4]));
  }
  for (let y = 1; y < H; y += 1) {
    for (let x = 0; x < B; x += 1) maxSprung = Math.max(maxSprung, Math.abs(d[(y * B + x) * 4] - d[((y - 1) * B + x) * 4]));
  }
  assert.ok(maxSprung <= 25, `größter Sprung zwischen Nachbarpixeln ${maxSprung}`);
  // Abwechslung: Die Blockmittel (BLOCK_PX) streuen deutlich.
  const mittel = [];
  for (let by = 0; by < H / BLOCK_PX; by += 1) {
    for (let bx = 0; bx < B / BLOCK_PX; bx += 1) {
      let sum = 0;
      for (let y = 0; y < BLOCK_PX; y += 1) for (let x = 0; x < BLOCK_PX; x += 1) sum += d[((by * BLOCK_PX + y) * B + bx * BLOCK_PX + x) * 4];
      mittel.push(sum / (BLOCK_PX * BLOCK_PX));
    }
  }
  const mw = mittel.reduce((a, b) => a + b, 0) / mittel.length;
  const streu = Math.sqrt(mittel.reduce((a, b) => a + (b - mw) ** 2, 0) / mittel.length);
  assert.ok(streu > 0.5, `Blockmittel streuen (${streu.toFixed(2)})`);
  leereStoffTexturen();
});

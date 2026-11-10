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
  STOFF_TEXTUR, TEXTUR_NAMEN, TEXTUR_GROESSE, NAHT_SCHWELLE, nahtWert, registriereStoffTextur, leereStoffTexturen, stoffTextur,
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

/** Setzt jede angemeldete Textur auf `bild(x, y)` (Helligkeit 0..255). */
function fuelleMit(bild) {
  leereStoffTexturen();
  for (const n of TEXTUR_NAMEN) {
    const px = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
    for (let i = 0; i < px.length; i += 4) {
      const v = bild((i >> 2) & 511, (i >> 2) >> 9);
      px[i] = v; px[i + 1] = v; px[i + 2] = v; px[i + 3] = 255;
    }
    registriereStoffTextur(n, px);
  }
}

test('Blockgrenzen: Sprünge nur im schmalen Randband, nirgends eine durchgehende Naht', () => {
  // Glatte, nahtlose Textur: Sprünge im Bild können nur von Variantenwechseln kommen.
  fuelleMit((x, y) => 128 + 70 * Math.sin((2 * Math.PI * x) / 512) * Math.cos((2 * Math.PI * (y + 100)) / 512) + 30 * Math.sin((2 * Math.PI * y) / 256));
  const stoff = STOFFE.findIndex((s) => s.key === 'kristall' && STOFF_TEXTUR[s.key]);
  const d = faerbe(stoff, 5);
  let grosse = 0;
  let paare = 0;
  const spalte = new Float64Array(B); // große Sprünge je Spalte: eine gerade Naht häufte sie in wenigen Spalten
  for (let y = 0; y < H; y += 1) {
    for (let x = 1; x < B; x += 1) {
      paare += 1;
      if (Math.abs(d[(y * B + x) * 4] - d[(y * B + x - 1) * 4]) > 25) { grosse += 1; spalte[x] += 1; }
    }
  }
  assert.ok(grosse / paare < 0.02, `Anteil großer Sprünge ${(100 * grosse / paare).toFixed(2)} %`);
  assert.ok(Math.max(...spalte) < H * 0.5, `keine Spalte mit durchgehender Naht (${Math.max(...spalte)} von ${H})`);
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

test('Kein Ghosting: je Pixel genau eine Variante, keine Mischwerte zweier Rissmuster', () => {
  // Zweiwertige Textur (dunkel/hell, wie Risse auf Grund). Überblenden zweier Varianten ergäbe im Randband
  // Zwischenwerte (doppelte, halbe Risse); mit einer Probe je Pixel bleiben die Werte in zwei Gruppen.
  fuelleMit((x, y) => (((x >> 3) + (y >> 3)) % 5 === 0 ? 220 : 40));
  const stoff = STOFFE.findIndex((s) => s.key === 'risszone' && STOFF_TEXTUR[s.key]);
  assert.ok(stoff > 0);
  const d = faerbe(stoff, 9);
  const werte = [];
  for (let i = 0; i < d.length; i += 4) werte.push(d[i]);
  const sortiert = [...werte].sort((a, b) => a - b);
  const lo = sortiert[Math.floor(sortiert.length * 0.05)];
  const hi = sortiert[Math.floor(sortiert.length * 0.95)];
  assert.ok(hi - lo > 30, `beide Gruppen unterscheidbar (${lo}..${hi})`);
  let mitte = 0;
  for (const v of werte) if (v > lo + 0.35 * (hi - lo) && v < lo + 0.65 * (hi - lo)) mitte += 1;
  assert.ok(mitte / werte.length < 0.002, `Anteil Mischwerte ${(100 * mitte / werte.length).toFixed(2)} %`);
  leereStoffTexturen();
});

test('Texturen mit Kachelnaht werden gespiegelt gekachelt, nahtlose nicht', () => {
  leereStoffTexturen();
  const naht = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
  const glatt = new Uint8ClampedArray(TEXTUR_GROESSE * TEXTUR_GROESSE * 4);
  for (let i = 0; i < naht.length; i += 4) {
    const x = (i >> 2) & 511;
    const y = (i >> 2) >> 9;
    const v = 128 + 60 * Math.sin((2 * Math.PI * x) / 512 * 3) + 20 * Math.cos((2 * Math.PI * y) / 512 * 2);
    glatt[i] = v; glatt[i + 1] = v; glatt[i + 2] = v; glatt[i + 3] = 255;
    const w = (x * 200) / 511 + (((x >> 4) + (y >> 4)) & 1) * 15; // läuft von dunkel nach hell: harter Sprung an der Kante
    naht[i] = w; naht[i + 1] = w; naht[i + 2] = w; naht[i + 3] = 255;
  }
  assert.ok(nahtWert(glatt) < NAHT_SCHWELLE, `glatt: ${nahtWert(glatt)}`);
  assert.ok(nahtWert(naht) > NAHT_SCHWELLE, `Naht: ${nahtWert(naht)}`);
  registriereStoffTextur('glatt-test', glatt);
  registriereStoffTextur('naht-test', naht);
  assert.equal(stoffTextur('glatt-test').spiegel, false);
  assert.equal(stoffTextur('naht-test').spiegel, true);
  leereStoffTexturen();
});

// --- Großflächige Variation (Verzerrung + Fleckung statt Blockwechsel) ---

import { readFileSync } from 'node:fs';
import { WARP, MAKRO_HELL } from '../src/client/stoffVarianten.js';

/** Nahtlose Zufallstextur (Summe periodischer Wellen), Detail im Bereich 20 bis 60 px. */
function rauschBild(x, y) {
  let v = 128;
  for (let k = 1; k <= 9; k += 1) {
    const a = (k * 37) % 11;
    v += 14 * Math.sin((2 * Math.PI * (x * (k + 3) + y * (a - 5))) / 512 + k * 1.7) + 9 * Math.cos((2 * Math.PI * (y * (k + 5) - x * (a - 4))) / 512 + k);
  }
  return Math.max(0, Math.min(255, v));
}

function streifen(stoff, seed, breite, hoehe) {
  const spalten = breite / 8;
  const zeilen = hoehe / 8;
  const feld = new Uint8Array(spalten * zeilen).fill(stoff);
  const bitmap = new Uint8Array(breite * hoehe).fill(1);
  const d = new Uint8ClampedArray(breite * hoehe * 4).fill(128);
  tinteStoffe(d, bitmap, breite, hoehe, { feld, spalten, zeilen }, seed);
  return d;
}

/** Autokorrelation der Helligkeit (Hochpass 33 px waagrecht) bei Verschiebung `lag`, Mittel über alle Zeilen. */
function korrelation(d, breite, hoehe, lag) {
  let sab = 0; let saa = 0; let sbb = 0;
  for (let y = 0; y < hoehe; y += 1) {
    const z = new Float64Array(breite);
    for (let x = 0; x < breite; x += 1) z[x] = d[(y * breite + x) * 4];
    const hp = new Float64Array(breite);
    for (let x = 16; x < breite - 16; x += 1) {
      let s = 0; for (let k = -16; k <= 16; k += 1) s += z[x + k];
      hp[x] = z[x] - s / 33;
    }
    for (let x = 16; x + lag < breite - 16; x += 1) { sab += hp[x] * hp[x + lag]; saa += hp[x] ** 2; sbb += hp[x + lag] ** 2; }
  }
  return sab / Math.sqrt(saa * sbb);
}

test('Kachelperiode 512 px ist im Bild nicht als Wiederholung zu erkennen', () => {
  fuelleMit(rauschBild);
  const stoff = STOFFE.findIndex((s) => s.key === 'fels' && STOFF_TEXTUR[s.key]);
  const b = 2304;
  const h = 96;
  const d = streifen(stoff, 3, b, h);
  // Gegenprobe: ohne Verzerrung (reine Kachelung der Textur) ist die Korrelation bei 512 nahezu 1.
  const roh = new Uint8ClampedArray(b * h * 4);
  const tex = stoffTextur(STOFF_TEXTUR.fels).rgba;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < b; x += 1) roh[(y * b + x) * 4] = tex[((y << 9) | (x & 511)) * 4];
  assert.ok(korrelation(roh, b, h, 512) > 0.95, 'Gegenprobe: Kachelung wiederholt exakt');
  const r512 = korrelation(d, b, h, 512);
  const r1024 = korrelation(d, b, h, 1024);
  assert.ok(Math.abs(r512) < 0.3 && Math.abs(r1024) < 0.3, `Korrelation bei 512 / 1024: ${r512.toFixed(2)} / ${r1024.toFixed(2)}`);
  leereStoffTexturen();
});

test('Fleckung: Helligkeit ändert sich über die Breite, ohne Sprünge an Rastern', () => {
  fuelleMit(() => 128); // glatte Textur: nur Fleckung und Stofffarbe bleiben
  const stoff = STOFFE.findIndex((s) => s.key === 'sand' && STOFF_TEXTUR[s.key]);
  const b = 3072;
  const h = 64;
  const d = streifen(stoff, 8, b, h);
  const spaltenMittel = new Float64Array(b);
  for (let x = 0; x < b; x += 1) { let s = 0; for (let y = 0; y < h; y += 1) s += d[(y * b + x) * 4]; spaltenMittel[x] = s / h; }
  const mw = spaltenMittel.reduce((a, c) => a + c, 0) / b;
  const spanne = Math.max(...spaltenMittel) - Math.min(...spaltenMittel);
  assert.ok(spanne > mw * 0.04, `Fleckung sichtbar (Spanne ${spanne.toFixed(1)} bei Mittel ${mw.toFixed(1)})`);
  assert.ok(spanne < mw * 4 * MAKRO_HELL * 3, `Fleckung maßvoll (Spanne ${spanne.toFixed(1)})`);
  let maxSprung = 0;
  for (let x = 1; x < b; x += 1) maxSprung = Math.max(maxSprung, Math.abs(spaltenMittel[x] - spaltenMittel[x - 1]));
  assert.ok(maxSprung < 2, `kein Sprung zwischen Nachbarspalten (${maxSprung.toFixed(2)})`);
  leereStoffTexturen();
});

test('Verzerrungsfeld: Steigung bleibt unter 1 (keine Faltung der Textur), grobe und feine Wellen', () => {
  // Obere Schranke je Oktave: bilinear verbundene Gitterwerte ändern sich höchstens um 2 * Amplitude je Zelle.
  let schranke = 0;
  for (const [lambda, amp] of WARP) schranke += (2 * amp) / lambda;
  assert.ok(schranke < 1, `Schranke ${schranke.toFixed(2)}`);
  assert.ok(WARP.length >= 3 && Math.max(...WARP.map((w) => w[0])) >= 360 && Math.min(...WARP.map((w) => w[0])) <= 80);
});

test('Messwerte der Stoffoptik (scripts/stoff-naht-messwerte.json, Abschnitt optik) belegen: keine Wiederholung, Bake-Zeit', () => {
  const o = JSON.parse(readFileSync(new URL('../scripts/stoff-naht-messwerte.json', import.meta.url), 'utf8')).optik;
  assert.ok(o && o.streifen[0] === 6272, 'Streifen in Kartenbreite 6272');
  const werte = Object.values(o.stoffe);
  assert.ok(werte.length >= 90, `${werte.length} Stoffe gemessen`);
  const med = [...werte.map((w) => w.wiederholung)].sort((a, b) => a - b)[werte.length >> 1];
  assert.ok(med < 0.05, `Median der Wiederholung ${med}`);
  for (const [n, w] of Object.entries(o.stoffe)) assert.ok(w.wiederholung < 0.3, `${n}: Wiederholung ${w.wiederholung}`);
  assert.ok(o.bake.ms_max < 2000, `Bake-Zeit je Stoff ${o.bake.ms_max} ms`);
});

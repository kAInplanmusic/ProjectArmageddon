/**
 * Gelände-Fassung 11 („Naht“): Zonenkarten (ab 2800 px) ohne Wand an den Nähten, ohne Schwebereste, mit Brücken zwischen den großen
 * Landmassen, dazu schnelleres Aufräumen und Zonen-Zwischenspeicher über die Ziehungen.
 *
 * Belegt wird: (1) die Marke, (2) Fassung 10 und Karten unter 2800 px bleiben Bit für Bit gleich (Goldwerte aus dem Stand vor dem
 * schnelleren `raeumeAuf`), (3) Determinismus, (4) Böschung statt Wand an der Naht, (5) keine Schwebereste, (6) wenige Ziehungen je
 * Karte (die Kosten der Generierung sind Ziehungen × Aufbau), (7) Matchstart und Erreichbarkeit mit 8 und mehr Figuren.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { SeededRandom } from '../src/shared/prng.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { pruefeErreichbarkeit } from '../src/shared/erreichbarkeit.js';
import {
  GELAENDE_OHNE_SCHACHT, GELAENDE_WEIT, GELAENDE_NAHT, GELAENDE_STANDARD, GELAENDE_WEIT_AB_BREITE, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';

const hash = (bitmap) => {
  let h = 2166136261;
  for (let i = 0; i < bitmap.length; i += 7) h = Math.imul(h ^ bitmap[i], 16777619) >>> 0;
  return h;
};
const karte = (seed, width, height, fassung) => erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width, height, fassung, stoffe: false });

test('Marke: Fassung 11 ist gültig und der Standard, 10 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_NAHT, 11);
  assert.equal(GELAENDE_STANDARD, GELAENDE_NAHT);
  assert.equal(normalisiereGelaende(10), 10);
  assert.equal(normalisiereGelaende(11), 11);
  assert.equal(normalisiereGelaende(12), GELAENDE_STANDARD);
});

test('Fassung 10 bleibt bitgleich: Goldwerte vom Stand vor Fassung 11 (schnelleres Aufräumen, Zonenkopie), schmale Karten gleich zu 10', () => {
  for (const [seed, w, h, gold] of [[2, 4704, 1764, 0xa7900188], [5, 4704, 1764, 0xb966a365], [4, 6272, 2352, 0xc9bef256]]) {
    assert.equal(hash(karte(seed, w, h, GELAENDE_WEIT).bitmap), gold, `Fassung 10, Seed ${seed}, ${w}×${h}`);
  }
  for (const [w, h] of [[2560, 1440], [1568, 588], [2216, 1662]]) {
    assert.ok(w < GELAENDE_WEIT_AB_BREITE);
    for (const seed of [1, 2]) {
      const a = karte(seed, w, h, GELAENDE_WEIT);
      const b = karte(seed, w, h, GELAENDE_NAHT);
      assert.equal(hash(a.bitmap), hash(b.bitmap), `${w}×${h} Seed ${seed}`);
      assert.equal(a.wasserY, b.wasserY);
    }
  }
});

test('Breite Karte in Fassung 11: deterministisch, anders als Fassung 10, Zonen und Statistik vorhanden', () => {
  const a = karte(3, 4704, 1764, GELAENDE_NAHT);
  const b = karte(3, 4704, 1764, GELAENDE_NAHT);
  assert.equal(hash(a.bitmap), hash(b.bitmap));
  assert.equal(a.kartenart, b.kartenart);
  assert.notEqual(hash(a.bitmap), hash(karte(3, 4704, 1764, GELAENDE_WEIT).bitmap));
  assert.notEqual(hash(a.bitmap), hash(karte(4, 4704, 1764, GELAENDE_NAHT).bitmap));
  assert.ok(a.bauteile && a.versuche <= 8);
});

test('Naht: Böschung statt Wand — die steilste Stufe der Oberkante im Nahtfenster ist klein', () => {
  const W = 4704;
  const H = 1764;
  const stufe = (fassung, seed) => {
    const k = karte(seed, W, H, fassung);
    const oben = new Int32Array(W);
    for (let x = 0; x < W; x += 1) {
      let y = 0;
      while (y < H && !k.bitmap[y * W + x]) y += 1;
      oben[x] = Math.min(y, k.wasserY);
    }
    let m = 0;
    for (let x = W / 2 - 450; x < W / 2 + 450; x += 1) m = Math.max(m, Math.abs(oben[x + 12] - oben[x]));
    return m;
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const neu = seeds.map((s) => stufe(GELAENDE_NAHT, s));
  // Gemessen (zehn Seeds, 4704×1764): Fassung 10 bis 724 px auf 12 px Weite (senkrechte Wand, Mittel 383), Fassung 11 höchstens 295 px (Mittel 151).
  assert.ok(Math.max(...neu) <= 350, `Fassung 11: steilste Stufe ${Math.max(...neu)} px (${neu})`);
  assert.ok(neu.reduce((a, b) => a + b, 0) / neu.length < 250, `mittlere steilste Stufe ${neu}`);
});

test('Keine Schwebereste: jedes Landstück der Fassung 11 ist größer als die Splittergrenze (5000 px bei 2560×1440, wächst mit der Fläche)', () => {
  const W = 4704;
  const H = 1764;
  const grenze = 5000 * ((W * H) / (2560 * 1440));
  for (const seed of [1, 2, 3, 4]) {
    const k = karte(seed, W, H, GELAENDE_NAHT);
    const bm = k.bitmap;
    const marke = new Uint8Array(W * H);
    const stapel = new Int32Array(W * H);
    let kleinstes = Infinity;
    for (let start = 0; start < W * H; start += 1) {
      if (!bm[start] || marke[start]) continue;
      let n = 0;
      let sp = 0;
      stapel[sp++] = start;
      marke[start] = 1;
      while (sp > 0) {
        const i = stapel[--sp];
        n += 1;
        const x = i % W;
        if (x > 0 && bm[i - 1] && !marke[i - 1]) { marke[i - 1] = 1; stapel[sp++] = i - 1; }
        if (x < W - 1 && bm[i + 1] && !marke[i + 1]) { marke[i + 1] = 1; stapel[sp++] = i + 1; }
        if (i >= W && bm[i - W] && !marke[i - W]) { marke[i - W] = 1; stapel[sp++] = i - W; }
        if (i < W * (H - 1) && bm[i + W] && !marke[i + W]) { marke[i + W] = 1; stapel[sp++] = i + W; }
      }
      kleinstes = Math.min(kleinstes, n);
    }
    assert.ok(kleinstes >= grenze, `Seed ${seed}: kleinstes Landstück ${kleinstes} px² < ${Math.round(grenze)}`);
  }
});

test('Kosten: wenige Ziehungen je Karte (gross und riesig), nie die Notkarte nach acht Versuchen', () => {
  // Fassung 10 brauchte gemessen 59 Ziehungen für 16 Seeds (gross, zwei Notkarten) und 37 für 12 (riesig); Fassung 11 16 für 16 und 13 für 12.
  let summeGross = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    const k = karte(seed, 4704, 1764, GELAENDE_NAHT);
    assert.ok(k.versuche <= 8, `gross Seed ${seed}: ${k.versuche} Versuche${k.warnung ? ` (${k.warnung})` : ''}`);
    summeGross += k.versuche;
  }
  assert.ok(summeGross <= 6 * 1.5, `gross: ${summeGross} Ziehungen für 6 Karten`);
  let summeRiesig = 0;
  for (let seed = 1; seed <= 4; seed += 1) {
    const k = karte(seed, 6272, 2352, GELAENDE_NAHT);
    assert.ok(k.versuche <= 8, `riesig Seed ${seed}: ${k.versuche} Versuche`);
    summeRiesig += k.versuche;
  }
  assert.ok(summeRiesig <= 4 * 1.5, `riesig: ${summeRiesig} Ziehungen für 4 Karten`);
});

test('Matchstart (Standard 11): 8 bis 10 Figuren, alle erreichbar mit fester Wurfweite 939 px', () => {
  for (const [seed, teams, proTeam, format, groesse] of [
    [1, 2, 4, '24:9', 'gross'], [2, 2, 5, '24:9', 'gross'], [3, 4, 2, '24:9', 'gross'], [4, 2, 5, '24:9', 'riesig'],
    [5, 3, 3, '24:9', 'riesig'], [6, 2, 4, '16:9', 'gross'],
  ]) {
    const m = new MatchController({ seed, teams, playersPerTeam: proTeam, kartentyp: 'autonom', maxRounds: 2, format, groesse, zerstoerung: 5 });
    m.start();
    assert.equal(m.gelaende, GELAENDE_NAHT);
    const figuren = (m.getState().entities ?? []).filter((e) => e.alive && e.type !== 'crate').map((e) => ({ x: e.x, y: e.y, teamId: e.teamId }));
    assert.ok(figuren.length >= 8, `${seed}: mindestens 8 Figuren (${figuren.length})`);
    assert.equal(m.erreichbarkeit?.ok, true, `${seed} ${format}/${groesse}: Engine-Prüfung (${m.erreichbarkeit?.grund})`);
    const urteil = pruefeErreichbarkeit({ bitmap: m.bitmap, width: m.width, height: m.height, figuren, wurfweite: 939 });
    assert.equal(urteil.ok, true, `${seed} ${format}/${groesse}: ${urteil.grund} bei 939 px`);
  }
});

test('Alte Partie mit Marke 10 baut weiter die Karte der Fassung 10', () => {
  const m10 = new MatchController({ seed: 2, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', maxRounds: 2, format: '24:9', groesse: 'gross', zerstoerung: 5, gelaende: GELAENDE_WEIT });
  m10.start();
  assert.equal(m10.gelaende, GELAENDE_WEIT);
  assert.equal(m10.width, 4704);
  assert.equal(hash(karte(2, m10.width, m10.height, GELAENDE_WEIT).bitmap), 0xa7900188);
});

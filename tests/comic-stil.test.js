/**
 * Comic-Darstellung: deterministisch und ohne Zufall.
 *
 * Geprüft werden die reinen Teile (Gelände-Färbung auf einer Attrappe, Pflanzenplätze,
 * Schadenszahlen) und dass im Zeichencode kein `Math.random`/`Date.now` steht.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ohneKommentare } from './helfer/ohne-kommentare.js';
import { veredleGelaende } from '../src/client/gelaendeStil.js';
import { plazierePflanzen } from '../src/client/pflanzen.js';
import { findeZahlen, ergaenzeZahlen, schreiteZahlenFort } from '../src/client/schadenszahlen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = 120;
const H = 80;

function karte() {
  const bitmap = new Uint8Array(B * H);
  for (let x = 0; x < B; x += 1) {
    const top = 30 + Math.round(8 * Math.sin(x / 9));
    for (let y = top; y < H; y += 1) bitmap[y * B + x] = 1;
  }
  return bitmap;
}

function attrappe(bitmap) {
  const data = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < bitmap.length; i += 1) {
    if (bitmap[i]) { data[i * 4] = 80; data[i * 4 + 1] = 120; data[i * 4 + 2] = 70; data[i * 4 + 3] = 255; }
  }
  const noop = () => {};
  const ctx = {
    getImageData: () => ({ data, width: B, height: H }),
    putImageData: noop,
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
    closePath: noop, fill: noop, stroke: noop,
  };
  return { layer: { getContext: () => ctx }, data };
}

const PALETTE = { surface: [96, 138, 92], deep: [38, 54, 46] };

test('Die Geländefärbung ist deterministisch und lässt die Maske unberührt', () => {
  const bitmap = karte();
  const kopie = bitmap.slice();
  const a = attrappe(bitmap);
  const b = attrappe(bitmap);
  veredleGelaende(a.layer, bitmap, B, H, PALETTE, 7);
  veredleGelaende(b.layer, bitmap, B, H, PALETTE, 7);
  assert.deepEqual([...a.data], [...b.data]);
  assert.deepEqual([...bitmap], [...kopie]);
  const c = attrappe(bitmap);
  veredleGelaende(c.layer, bitmap, B, H, PALETTE, 8);
  assert.notDeepEqual([...a.data], [...c.data], 'ein anderer Seed muss ein anderes Muster geben');
});

test('Pflanzenplätze hängen nur von Gelände und Seed ab', () => {
  const bitmap = karte();
  const a = plazierePflanzen(bitmap, B, H, 5, 'forest');
  const b = plazierePflanzen(bitmap, B, H, 5, 'forest');
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
});

test('Schadenszahlen entstehen nur aus Zustandsänderungen', () => {
  const figur = (health, extra = {}) => ({ entityId: 1, health, maxHealth: 100, x: 50, y: 60, alive: health > 0, ...extra });
  let werte = findeZahlen(new Map(), [figur(100)]);
  assert.equal(werte.neu.length, 0);
  werte = findeZahlen(werte.zustand, [figur(25)]);
  assert.equal(werte.neu[0].text, '-75');
  assert.equal(werte.neu[0].art, 'schaden');
  werte = findeZahlen(werte.zustand, [figur(75)]);
  assert.equal(werte.neu[0].text, '+50');
  assert.equal(werte.neu[0].art, 'heilung');
  werte = findeZahlen(werte.zustand, [figur(0, { x: 0, y: 0 })]);
  assert.equal(werte.neu[0].text, '-75');
  assert.equal(werte.neu[0].x, 50, 'eine gefallene Figur steht im Zustand bei 0 — die letzte Position gilt');
  const schwer = findeZahlen(new Map([[1, { health: 150, maxHealth: 150, x: 1, y: 1 }]]), [figur(0, { maxHealth: 150 })]);
  assert.equal(schwer.neu[0].text, '-150!');
  assert.equal(schwer.neu[0].art, 'kritisch');
  const schild = findeZahlen(new Map([[1, { health: 100, schild: 0, x: 1, y: 1 }]]), [figur(100, { shield: 25 })]);
  assert.equal(schild.neu[0].text, '+25');
  assert.equal(schild.neu[0].art, 'schild');
});

test('Schadenszahlen altern und verschwinden; ohne Bewegung steigen sie nicht', () => {
  let liste = ergaenzeZahlen([], [{ x: 0, y: 10, text: '-5', art: 'schaden' }]);
  assert.equal(schreiteZahlenFort(liste, true)[0].y, 10);
  assert.ok(schreiteZahlenFort(liste, false)[0].y < 10);
  for (let i = 0; i < 200; i += 1) liste = schreiteZahlenFort(liste);
  assert.equal(liste.length, 0);
});

test('Im Zeichencode der Comic-Optik steht kein Zufall und keine Uhr', () => {
  for (const datei of ['stil', 'gelaendeStil', 'pflanzen', 'figuren', 'effektStil', 'schadenszahlen', 'sceneryPainter']) {
    const text = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src', 'client', `${datei}.js`), 'utf8'));
    assert.ok(!/Math\.random|Date\.now|performance\.now/.test(text), `${datei}.js benutzt Zufall oder Uhr`);
  }
});

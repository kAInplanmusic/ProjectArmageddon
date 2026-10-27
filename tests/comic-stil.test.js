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
import { veredleGelaende, baueGelaendeEbene, faerbeGelaende } from '../src/client/gelaendeStil.js';
import { plazierePflanzen, zeichnePflanzenAusschnitt, zeichnePflanzenSchicht, entfernePflanzenImKrater } from '../src/client/pflanzen.js';
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

test('Ein-Zug-Aufbau: Ausgangsfarben zählen nicht, nur die Deckkraft — das Bild ist das der alten Zwei-Stufen-Fassung', () => {
  const bitmap = karte();
  // Alt: erst eine fertige Bodenfarbe (so wie der Baker sie liefert), dann veredeln.
  const alt = attrappe(bitmap);
  veredleGelaende(alt.layer, bitmap, B, H, PALETTE, 7);
  // Neu: nur Deckkraft aus der Maske, dann in einem Zug färben.
  let geschrieben = null;
  const noop = () => {};
  const ctx = {
    createImageData: (b, h) => ({ data: new Uint8ClampedArray(b * h * 4), width: b, height: h }),
    putImageData: (bild) => { geschrieben = bild.data; },
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
    closePath: noop, fill: noop, stroke: noop,
  };
  baueGelaendeEbene({ getContext: () => ctx }, bitmap, B, H, PALETTE, 7);
  assert.deepEqual([...geschrieben], [...alt.data]);

  // Und die Rechnung hängt wirklich nicht an den Ausgangsfarben.
  const d1 = new Uint8ClampedArray(B * H * 4);
  const d2 = new Uint8ClampedArray(B * H * 4);
  for (let i = 0; i < bitmap.length; i += 1) {
    if (bitmap[i]) { d1[i * 4 + 3] = 255; d2[i * 4] = 200; d2[i * 4 + 1] = 3; d2[i * 4 + 2] = 99; d2[i * 4 + 3] = 255; }
  }
  faerbeGelaende(d1, bitmap, B, H, PALETTE, 7);
  faerbeGelaende(d2, bitmap, B, H, PALETTE, 7);
  assert.deepEqual([...d1], [...d2]);
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

test('Die Färbung bleibt bitgleich zum Stand vor der Optimierung (Fingerabdruck) und die Tabellen-Zwischenspeicherung ändert nichts', () => {
  const bitmap = karte();
  const lauf = (seed, palette) => {
    const d = new Uint8ClampedArray(B * H * 4);
    for (let i = 0; i < bitmap.length; i += 1) if (bitmap[i]) d[i * 4 + 3] = 255;
    faerbeGelaende(d, bitmap, B, H, palette, seed);
    let h = 0x811c9dc5;
    for (let k = 0; k < d.length; k += 1) h = Math.imul(h ^ d[k], 0x01000193);
    return h >>> 0;
  };
  const a = lauf(7, PALETTE);
  assert.equal(lauf(7, PALETTE), a, 'zweiter Lauf (aus dem Zwischenspeicher) gleich');
  const anders = lauf(8, PALETTE);
  assert.notEqual(anders, a);
  assert.equal(lauf(7, PALETTE), a, 'nach einem anderen Seed wieder dasselbe Bild');
  assert.equal(lauf(7, { surface: [236, 240, 250], deep: [90, 100, 120] }) === a, false, 'andere Palette, anderes Bild');
  // Bewusst neu gesetzt am 2026-10-27 (vorher 1239382613, Stand vor der Optimierung): Das Gelände dunkelt jetzt nach Tiefe ab
  // (`dunkleNachTiefe`) und die Stoffe laufen vor Saum, Kantenlicht und Kontur. Auftraggeber: düsterer und realer. Mit dem
  // Zwischenspeicher und den Seeds bleibt die Eigenschaft dieselbe: gleiche Eingabe, gleiches Bild.
  // Gleicher Tag, zweiter Schritt (vorher 2561716384): das Gras am Saum ist dunkler und ohne Neon (30 % zum Nachtton).
  // Dritter Schritt (vorher 4079594140): das Gestein wird zur Palette der Kulisse hin getönt (`toeneNachPalette`, Helligkeit bleibt).
  assert.equal(a, 868038621, 'Fingerabdruck der Färbung (Stand 2026-10-27: Tiefe, Stoffe vor Saum, dunkles Gras, Palettentönung)');
});

test('Pflanzenebene nach einem Krater: nur der Ausschnitt wird neu gezeichnet, mit denselben Pflanzen wie ein Vollaufbau', () => {
  const bitmap = new Uint8Array(1600 * 300);
  for (let y = 150; y < 300; y += 1) for (let x = 0; x < 1600; x += 1) bitmap[y * 1600 + x] = 1;
  const pflanzen = plazierePflanzen(bitmap, 1600, 300, 11, 'forest');
  assert.ok(pflanzen.length > 8, 'Testaufbau: es gibt Pflanzen');
  const aufnahme = () => {
    const log = [];
    const ctx = new Proxy({}, { get: (_, name) => (name === 'canvas' ? {} : (...args) => { log.push(`${String(name)}${name === 'clearRect' || name === 'rect' ? args.join(',') : ''}`); }), set: () => true });
    return { ctx, log };
  };
  const weg = [];
  assert.equal(entfernePflanzenImKrater(pflanzen, 800, 150, 60, weg), true);
  assert.ok(weg.length > 0 && weg.length < 8);
  const voll = aufnahme();
  zeichnePflanzenSchicht(voll.ctx, pflanzen, 1600, 300, { surface: [96, 138, 92], deep: [38, 54, 46] });
  const teil = aufnahme();
  const u = { x0: Math.min(...weg.map(p => p.x)) - 200, x1: Math.max(...weg.map(p => p.x)) + 200, y0: 0, y1: 300 };
  zeichnePflanzenAusschnitt(teil.ctx, pflanzen, 1600, 300, { surface: [96, 138, 92], deep: [38, 54, 46] }, u);
  assert.ok(teil.log.some(l => l.startsWith('clearRect')), 'der Ausschnitt wird geleert');
  assert.ok(teil.log.includes('clip'), 'und beschnitten');
  assert.ok(teil.log.length < voll.log.length, `weniger Zeichenbefehle als beim Vollaufbau (${teil.log.length} < ${voll.log.length})`);
});

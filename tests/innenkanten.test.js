import test from 'node:test';
import assert from 'node:assert/strict';
import { daempfeInnenkanten } from '../src/client/gelaendeStil.js';

/*
 * LOOK-4 Stufe 3 (2026-10-25): Innenkanten abdunkeln.
 *
 * Warum: Luft ist im Gelände-Layer transparent (Krater stanzen mit
 * `destination-out`). Ein Hohlraum sieht damit wie offener Himmel aus — der
 * Spieler erkennt nicht, dass die Figur in einem Raum steht. Abgedunkelt werden
 * deshalb feste Pixel, die TIEF unter der Oberfläche liegen UND an Luft grenzen;
 * die Oberfläche selbst bleibt unberührt, sonst wirkt jede Karte wie ein Keller.
 */

const BREITE = 64;
const HOEHE = 40;
const HELL = 200;

/** Flache Oberfläche bei y=10, darunter eine Kammer (x 20..40, y 16..22). */
function probe() {
  const bitmap = new Uint8Array(BREITE * HOEHE);
  for (let y = 10; y < HOEHE; y += 1) for (let x = 0; x < BREITE; x += 1) bitmap[y * BREITE + x] = 1;
  for (let y = 16; y <= 22; y += 1) for (let x = 20; x <= 40; x += 1) bitmap[y * BREITE + x] = 0;
  const d = new Uint8ClampedArray(BREITE * HOEHE * 4);
  for (let i = 0; i < BREITE * HOEHE; i += 1) {
    if (!bitmap[i]) continue;
    d[i * 4] = HELL; d[i * 4 + 1] = HELL; d[i * 4 + 2] = HELL; d[i * 4 + 3] = 255;
  }
  return { bitmap, d };
}

const rot = (d, x, y) => d[(y * BREITE + x) * 4];

test('Die Kammerdecke wird abgedunkelt', () => {
  const { bitmap, d } = probe();
  const betroffen = daempfeInnenkanten(d, bitmap, BREITE, HOEHE, 0.82);
  assert.ok(betroffen > 0, 'es muss Kanten geben');
  assert.ok(rot(d, 30, 15) < HELL, `Decke ueber der Kammer muss dunkler sein, ist ${rot(d, 30, 15)}`);
});

test('Der Kammboden wird abgedunkelt', () => {
  const { bitmap, d } = probe();
  daempfeInnenkanten(d, bitmap, BREITE, HOEHE, 0.82);
  assert.ok(rot(d, 30, 23) < HELL, `Boden der Kammer muss dunkler sein, ist ${rot(d, 30, 23)}`);
});

test('Die Kammerwaende werden abgedunkelt', () => {
  const { bitmap, d } = probe();
  daempfeInnenkanten(d, bitmap, BREITE, HOEHE, 0.82);
  assert.ok(rot(d, 19, 19) < HELL, `linke Wand muss dunkler sein, ist ${rot(d, 19, 19)}`);
  assert.ok(rot(d, 41, 19) < HELL, `rechte Wand muss dunkler sein, ist ${rot(d, 41, 19)}`);
});

test('Tiefes Innere und die Oberflaeche bleiben unveraendert', () => {
  const { bitmap, d } = probe();
  daempfeInnenkanten(d, bitmap, BREITE, HOEHE, 0.82);
  assert.equal(rot(d, 5, 30), HELL, 'tiefes Inneres ohne Luftnachbar darf nicht dunkler werden');
  assert.equal(rot(d, 58, 30), HELL, 'tiefes Inneres rechts darf nicht dunkler werden');
  assert.equal(rot(d, 5, 10), HELL, 'die Oberflaeche selbst bleibt hell');
  assert.equal(rot(d, 30, 10), HELL, 'auch ueber der Kammer bleibt die Oberflaeche hell');
});

test('Ohne Hohlraeume aendert sich nichts', () => {
  const bitmap = new Uint8Array(BREITE * HOEHE);
  for (let y = 10; y < HOEHE; y += 1) for (let x = 0; x < BREITE; x += 1) bitmap[y * BREITE + x] = 1;
  const d = new Uint8ClampedArray(BREITE * HOEHE * 4);
  for (let i = 0; i < BREITE * HOEHE; i += 1) {
    if (!bitmap[i]) continue;
    d[i * 4] = HELL; d[i * 4 + 1] = HELL; d[i * 4 + 2] = HELL; d[i * 4 + 3] = 255;
  }
  const betroffen = daempfeInnenkanten(d, bitmap, BREITE, HOEHE, 0.82);
  assert.equal(betroffen, 0, `ohne Hohlraum darf nichts abgedunkelt werden, betroffen: ${betroffen}`);
  assert.equal(rot(d, 30, 30), HELL);
});

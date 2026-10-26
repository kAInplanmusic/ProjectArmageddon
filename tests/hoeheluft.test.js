import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelleHoehlenluft } from '../src/client/gelaendeStil.js';

/*
 * LOOK-4 Optik-Nachtrag (2026-10-25, aus dem Screenshot gefunden).
 *
 * Befund im Bild: Weil Luft im Gelände-Layer transparent ist, sah man durch
 * jeden Hohlraum den HELLEN HIMMEL — eine Kaverne wirkte wie ein Loch ins Freie.
 * Die Kanten-Abdunkelung allein half nicht, denn sie färbt nur Fels.
 *
 * Lösung: Eingeschlossene Luft (nicht vom oberen Kartenrand aus erreichbar) wird
 * dunkel gefüllt. Offener Himmel bleibt transparent — sonst wäre der ganze
 * obere Kartenbereich schwarz.
 */

const BREITE = 64;
const HOEHE = 40;

/** Flache Oberfläche bei y=10, darunter eine geschlossene Kammer (x 20..40, y 16..22). */
function probe() {
  const bitmap = new Uint8Array(BREITE * HOEHE);
  for (let y = 10; y < HOEHE; y += 1) for (let x = 0; x < BREITE; x += 1) bitmap[y * BREITE + x] = 1;
  for (let y = 16; y <= 22; y += 1) for (let x = 20; x <= 40; x += 1) bitmap[y * BREITE + x] = 0;
  const d = new Uint8ClampedArray(BREITE * HOEHE * 4);
  for (let i = 0; i < BREITE * HOEHE; i += 1) {
    if (!bitmap[i]) continue;
    d[i * 4] = 200; d[i * 4 + 1] = 200; d[i * 4 + 2] = 200; d[i * 4 + 3] = 255;
  }
  return { bitmap, d };
}

const alpha = (d, x, y) => d[(y * BREITE + x) * 4 + 3];

test('Eingeschlossene Kammerluft wird dunkel gefuellt', () => {
  const { bitmap, d } = probe();
  const gefuellt = fuelleHoehlenluft(d, bitmap, BREITE, HOEHE);
  assert.ok(gefuellt > 0, 'es muss Kammerluft gefuellt werden');
  const a = alpha(d, 30, 19);
  assert.ok(a > 0, `Kammerluft muss deckend werden (alpha=${a})`);
  const o = (19 * BREITE + 30) * 4;
  assert.ok(d[o] < 80, `Kammerluft muss dunkel sein (rot=${d[o]})`);
});

test('Offener Himmel bleibt transparent', () => {
  const { bitmap, d } = probe();
  fuelleHoehlenluft(d, bitmap, BREITE, HOEHE);
  assert.equal(alpha(d, 30, 2), 0, 'Himmel ueber der Oberflaeche darf nicht gefuellt werden');
  assert.equal(alpha(d, 5, 8), 0, 'auch seitlich oben bleibt es offen');
});

test('Fels bleibt unveraendert', () => {
  const { bitmap, d } = probe();
  const vorher = d[(30 * BREITE + 5) * 4];
  fuelleHoehlenluft(d, bitmap, BREITE, HOEHE);
  assert.equal(d[(30 * BREITE + 5) * 4], vorher, 'ein Fels-Pixel darf nicht angefasst werden');
  assert.equal(alpha(d, 5, 30), 255, 'Fels bleibt deckend');
});

test('Eine nach oben offene Spalte wird nicht gefuellt', () => {
  const { bitmap, d } = probe();
  // Schacht von der Oberflaeche in die Kammer: x 30, y 10..22
  for (let y = 10; y <= 22; y += 1) bitmap[y * BREITE + 30] = 0;
  for (let y = 10; y <= 22; y += 1) { const o = (y * BREITE + 30) * 4; d[o + 3] = 0; }
  const gefuellt = fuelleHoehlenluft(d, bitmap, BREITE, HOEHE);
  assert.equal(alpha(d, 30, 18), 0, 'Luft im Schacht haengt am Himmel und bleibt offen');
  // Wichtig: Ein Schacht macht die GANZE Kammer offen — die Luft ist verbunden.
  // Deshalb bleibt auch der Rest der Kammer transparent und es wird nichts gefuellt.
  assert.equal(alpha(d, 22, 18), 0, 'die uebrige Kammerluft haengt am Schacht und bleibt offen');
  assert.equal(gefuellt, 0, 'ohne eingeschlossene Luft darf nichts gefuellt werden');
});

/**
 * Übersichtskarte und Kamera auf der quadratischen Karte `kolossal` (1:1, 5760 × 5760 px; TODO N-40).
 * Reine Rechenteile ohne Browser: `Camera`, `zoomBevorzugt`, `uebersichtsGroesse`, `kartenZuKarte`, `sichtfenster`, `sichtbar`.
 * Das Bild selbst (Canvas, 33 Mio. Pixel) ist damit NICHT geprüft, nur die Geometrie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera, ZOOM_GRENZEN } from '../src/client/camera.js';
import { zoomBevorzugt } from '../src/client/kameraZiel.js';
import { uebersichtsGroesse, kartenZuKarte, sichtfenster, sichtbar, MAX_KANTE } from '../src/client/uebersichtskarte.js';
import { mapSizeFor } from '../src/engine/karte.js';

const K = mapSizeFor('1:1', 'kolossal');
const karte = { b: K.width, h: K.height };

test('Kamera: die ganze 5760-px-Karte passt ab 807 px Schirmhöhe ins Bild (Mindestzoom 0,14), auch auf 1080 p und 1440 p', () => {
  assert.ok(ZOOM_GRENZEN.min <= 807 / 5760 + 1e-9);
  for (const [b, h] of [[1920, 1080], [2560, 1440], [1366, 768 + 100]]) {
    const k = new Camera({ mapBreite: K.width, mapHoehe: K.height, schirmBreite: b, schirmHoehe: h });
    k.setzeAnsicht(2880, 2880, 0.01);
    assert.ok(Math.abs(k.zoom - Math.min(b / K.width, h / K.height)) < 1e-9, `${b}×${h}: Zoom ${k.zoom}`);
    assert.ok(k.sichtbareHoehe >= K.height - 1e-6, `${b}×${h}: sichtbare Höhe ${k.sichtbareHoehe}`);
  }
});

test('Kamera: auf einem Schirm unter 807 px Höhe bleibt der Übersichtszoom an der Grenze (Ausschnitt statt ganzer Karte; bekannte Grenze)', () => {
  const k = new Camera({ mapBreite: K.width, mapHoehe: K.height, schirmBreite: 800, schirmHoehe: 600 });
  k.setzeAnsicht(2880, 2880, 0.01);
  assert.equal(k.zoom, Math.max(ZOOM_GRENZEN.min, 600 / 5760));
});

test('Kamera: Zoom auf den Stand (Zoom 1) bleibt innerhalb der Karte, Rand wird geklemmt', () => {
  const k = new Camera({ mapBreite: K.width, mapHoehe: K.height, schirmBreite: 1920, schirmHoehe: 1080 });
  k.setzeAnsicht(1589, 300, 1);
  assert.ok(k.x - k.sichtbareBreite / 2 >= -1e-6 && k.x + k.sichtbareBreite / 2 <= K.width + 1e-6);
  assert.ok(k.y - k.sichtbareHoehe / 2 >= -1e-6 && k.y + k.sichtbareHoehe / 2 <= K.height + 1e-6);
  k.setzeAnsicht(K.width, K.height, 1);
  assert.ok(k.x + k.sichtbareBreite / 2 <= K.width + 1e-6 && k.y + k.sichtbareHoehe / 2 <= K.height + 1e-6);
});

test('Kameraführung: der bevorzugte Zoom (Sicht auf rund 1400 Kartenpixel) liegt über dem Übersichtszoom', () => {
  const z = zoomBevorzugt({ b: 1920, h: 1080 }, karte);
  assert.ok(z > Math.min(1920 / K.width, 1080 / K.height));
  assert.ok(z <= ZOOM_GRENZEN.max);
});

test('Übersichtskarte: quadratisch (260 × 260), automatisch sichtbar, Klick → Kartenpunkt und Sichtfenster stimmen', () => {
  const bild = uebersichtsGroesse(karte);
  assert.deepEqual(bild, { b: MAX_KANTE, h: MAX_KANTE });
  assert.equal(sichtbar('auto', karte), true);
  assert.deepEqual(kartenZuKarte(bild.b / 2, bild.h / 2, bild, karte), { x: 2880, y: 2880 });
  assert.deepEqual(kartenZuKarte(-5, 9999, bild, karte), { x: 0, y: 5760 });
  const ganz = sichtfenster({ x: 2880, y: 2880, zoom: 1080 / 5760 }, { b: 1920, h: 1080 }, karte, bild);
  assert.ok(Math.abs(ganz.h - bild.h) < 1e-6, `Sichtfenster ${ganz.h} von ${bild.h}`);
  const nah = sichtfenster({ x: 2880, y: 2880, zoom: 1 }, { b: 1920, h: 1080 }, karte, bild);
  assert.ok(nah.b < bild.b / 2 && nah.h < bild.h / 4);
});

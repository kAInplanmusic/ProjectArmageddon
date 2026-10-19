/**
 * Tests: Der sichere Bereich hält Figuren und Schilder frei vom HUD.
 *
 * Reine Rechnung, ohne Browser. Anlass: Abnahme 2026-10-15 — Schilder von
 * Figuren auf Gipfeln verschwanden unter der Kopfleiste, die Figur links saß
 * unter der Spielerliste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sichererBereich, platziereSchild, bereichInKarte, figurRechteck, ueberdecktVon,
  ueberlappen, schubNachUnten,
} from '../src/client/sichtbereich.js';
import { Camera } from '../src/client/camera.js';

const SCHIRM = { b: 1280, h: 720 };
const KOPF = { x: 12, y: 12, b: 1256, h: 60 };
const LEISTE = { x: 470, y: 606, b: 340, h: 90 };
const FEUER = { x: 1078, y: 644, b: 190, h: 64 };

test('Der sichere Bereich zieht Kopfleiste und Bedienleiste ab', () => {
  const b = sichererBereich(SCHIRM, [KOPF, LEISTE, FEUER]);
  assert.deepEqual(b, { x0: 0, y0: 72, x1: 1280, y1: 606 });
});

test('Seitliche Panels in der Fenstermitte verändern den Bereich nicht', () => {
  const links = { x: 12, y: 80, b: 220, h: 267 };
  assert.deepEqual(sichererBereich(SCHIRM, [KOPF, links]), { x0: 0, y0: 72, x1: 1280, y1: SCHIRM.h });
});

test('Unsichtbare Elemente (Größe 0) zählen nicht', () => {
  assert.deepEqual(sichererBereich(SCHIRM, [{ x: 0, y: 0, b: 0, h: 0 }]), { x0: 0, y0: 0, x1: 1280, y1: 720 });
});

test('Ein HUD, das fast die ganze Höhe füllt, ergibt das ganze Fenster statt eines leeren Bereichs', () => {
  const klein = { b: 800, h: 400 };
  const riesig = [{ x: 0, y: 0, b: 800, h: 150 }, { x: 0, y: 260, b: 800, h: 140 }];
  assert.deepEqual(sichererBereich(klein, riesig), { x0: 0, y0: 0, x1: 800, y1: 400 });
});

test('Der Bereich reagiert auf das Format (800x400 hat relativ mehr Rand)', () => {
  const b = sichererBereich({ b: 800, h: 400 }, [
    { x: 6, y: 6, b: 788, h: 44 }, { x: 330, y: 340, b: 220, h: 54 },
  ]);
  assert.equal(b.y0, 50);
  assert.equal(b.y1, 340);
});

const BEREICH = { x0: 0, y0: 72, x1: 1280, y1: 606 };

test('Schild mit Platz bleibt unverändert', () => {
  const r = platziereSchild({ x: 600, anker: 300, fuss: 400, breite: 40, s: 1 }, BEREICH);
  assert.deepEqual(r, { x: 600, anker: 300, unten: false, verschoben: false });
});

test('Schild unter der Kopfleiste klappt unter die Füße der Figur', () => {
  // Figur auf einem Gipfel: Schild läge bei y 60..78 und damit unter der Kopfleiste.
  const r = platziereSchild({ x: 1100, anker: 80, fuss: 190, breite: 40, s: 1 }, BEREICH);
  assert.equal(r.unten, true);
  assert.equal(r.verschoben, true);
  assert.equal(r.anker, 190 + 4 + 22);
  // Die Oberkante des Schilds (anker - 22) liegt unter den Füßen.
  assert.ok(r.anker - 22 >= 190);
});

test('Ohne Platz darunter wird das Schild in den Bereich geschoben', () => {
  const eng = { x0: 0, y0: 72, x1: 1280, y1: 120 };
  const r = platziereSchild({ x: 600, anker: 80, fuss: 118, breite: 40, s: 1 }, eng);
  assert.equal(r.unten, false);
  assert.equal(r.anker, 72 + 30);
});

test('Schild zu weit unten (hinter der Bedienleiste) wird nach oben geschoben', () => {
  const r = platziereSchild({ x: 600, anker: 640, fuss: 700, breite: 40, s: 1 }, BEREICH);
  assert.ok(r.anker - 2 <= BEREICH.y1);
});

test('Schild wird seitlich begrenzt', () => {
  const l = platziereSchild({ x: 5, anker: 300, fuss: 400, breite: 40, s: 1 }, BEREICH);
  assert.equal(l.x, 20);
  const rr = platziereSchild({ x: 1279, anker: 300, fuss: 400, breite: 40, s: 2 }, BEREICH);
  assert.equal(rr.x, 1280 - 40);
});

test('Ohne Grenzen (Replay, Tests) bleibt das Schild, wie es ist', () => {
  const r = platziereSchild({ x: 5, anker: -50, fuss: 40, breite: 40, s: 1 }, null);
  assert.deepEqual(r, { x: 5, anker: -50, unten: false, verschoben: false });
});

test('Schildskala wird beim Klappen berücksichtigt', () => {
  const r = platziereSchild({ x: 600, anker: 90, fuss: 200, breite: 40, s: 2 }, BEREICH);
  assert.equal(r.unten, true);
  assert.equal(r.anker, 200 + 4 + 44);
});

test('Bereich und Figuren lassen sich zwischen Karte und Bildschirm umrechnen', () => {
  const t = { skalierung: 0.5, versatzX: 100, versatzY: 20 };
  assert.deepEqual(bereichInKarte({ x0: 100, y0: 70, x1: 600, y1: 320 }, t), { x0: 0, y0: 100, x1: 1000, y1: 600 });
  const f = figurRechteck({ x: 200, y: 300 }, t, { halbBreite: 20, oben: 60, unten: 10 });
  assert.deepEqual(f, { x: 190, y: 140, b: 20, h: 35 });
});

test('Panels, die eine Figur überdecken, werden gefunden', () => {
  const panels = [{ x: 12, y: 80, b: 220, h: 267 }, { x: 300, y: 450, b: 600, h: 150 }, { x: 0, y: 0, b: 0, h: 0 }];
  const figuren = [{ x: 150, y: 300, b: 60, h: 100 }];
  assert.deepEqual(ueberdecktVon(panels, figuren), [0]);
  assert.equal(ueberlappen(panels[0], { x: 232, y: 80, b: 10, h: 10 }), false, 'Berührung ist keine Überlappung');
});

test('Schub nach unten: nur wenn Köpfe unter der Kopfleiste liegen, gedeckelt', () => {
  assert.equal(schubNachUnten(100, 72, 80), 0);
  assert.equal(schubNachUnten(40, 72, 80), 32);
  assert.equal(schubNachUnten(-100, 72, 80), 80);
  assert.equal(schubNachUnten(Infinity, 72, 80), 0);
});

test('Kamera: Ränder verschieben den Fokus nur auf scrollenden Achsen', () => {
  // Karte passt ganz hinein: Ränder ändern nichts.
  const ganz = new Camera({ mapBreite: 1280, mapHoehe: 720, schirmBreite: 1280, schirmHoehe: 720 });
  ganz.zieleAuf(640, 360, true);
  const vorher = ganz.transformation();
  ganz.setzeRand({ oben: 72, unten: 110 });
  assert.deepEqual(ganz.transformation(), vorher);

  // Gezoomt: der Fokus liegt in der Mitte des freien Bereichs.
  const nah = new Camera({ mapBreite: 3000, mapHoehe: 2000, schirmBreite: 1280, schirmHoehe: 720, zoom: 1 });
  nah.setzeRand({ oben: 72, unten: 110 });
  nah.zieleAuf(1500, 1000, true);
  const sp = nah.schirmZuKarte(640, 360 + (72 - 110) / 2);
  assert.ok(Math.abs(sp.x - 1500) < 1e-9 && Math.abs(sp.y - 1000) < 1e-9);
});

test('Kamera: am Kartenrand bleibt der freie Bereich innerhalb der Karte', () => {
  const k = new Camera({ mapBreite: 3000, mapHoehe: 2000, schirmBreite: 1280, schirmHoehe: 720, zoom: 1 });
  k.setzeRand({ oben: 72, unten: 110 });
  k.zieleAuf(1500, 5, true);
  // Oberste Bildschirmzeile zeigt Kartenzeile >= 0.
  assert.ok(k.schirmZuKarte(0, 0).y >= -1e-9);
  k.zieleAuf(1500, 1995, true);
  assert.ok(k.schirmZuKarte(0, 720).y <= 2000 + 1e-9);
});

test('Kamera: Schub rückt eine ganz sichtbare Karte nach unten, weich und nur dort', () => {
  const k = new Camera({ mapBreite: 1280, mapHoehe: 720, schirmBreite: 1280, schirmHoehe: 720 });
  k.setzeSchubZiel(40);
  for (let i = 0; i < 200; i += 1) k.schritt();
  assert.equal(k.schub, 40);
  assert.equal(k.transformation().versatzY, 40);
  k.setzeSchubZiel(-5);
  for (let i = 0; i < 200; i += 1) k.schritt();
  assert.equal(k.schub, 0);

  const nah = new Camera({ mapBreite: 3000, mapHoehe: 2000, schirmBreite: 1280, schirmHoehe: 720, zoom: 1 });
  nah.setzeSchubZiel(40);
  for (let i = 0; i < 200; i += 1) nah.schritt();
  assert.equal(nah.transformation().versatzY, 360 - nah.y, 'auf scrollender Achse wirkt kein Schub');
});

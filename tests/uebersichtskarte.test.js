/**
 * Tests: Übersichtskarte (Minimap) und Übersichtszoom für breite Karten — reine Rechnung und Verdrahtung ohne Browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { Camera, ZOOM_GRENZEN } from '../src/client/camera.js';
import { uebersichtsGroesse, kartenZuKarte, sichtfenster, sichtbar, Uebersichtskarte, AUTO_AB_BREITE, MAX_KANTE } from '../src/client/uebersichtskarte.js';
import { KameraSteuerung } from '../src/client/kameraSteuerung.js';
import { KameraRegie } from '../src/client/kameraRegie.js';

test('Größe der Übersicht: längste Kante, Seitenverhältnis der Karte', () => {
  for (const [b, h] of [[4704, 1764], [6272, 2352], [1764, 4704], [1280, 720]]) {
    const g = uebersichtsGroesse({ b, h });
    assert.equal(Math.max(g.b, g.h), MAX_KANTE);
    assert.ok(Math.abs(g.b / g.h - b / h) < 0.03, `${b}x${h}`);
  }
});

test('Klick im Bild ergibt Kartenpixel, geklemmt', () => {
  const karte = { b: 4704, h: 1764 }; const bild = uebersichtsGroesse(karte);
  assert.deepEqual(kartenZuKarte(0, 0, bild, karte), { x: 0, y: 0 });
  const m = kartenZuKarte(bild.b / 2, bild.h / 2, bild, karte);
  assert.ok(Math.abs(m.x - 2352) < 1 && Math.abs(m.y - 882) < 1);
  assert.deepEqual(kartenZuKarte(9999, 9999, bild, karte), { x: 4704, y: 1764 });
});

test('Sichtfenster liegt im Bild und zeigt den Zoom', () => {
  const karte = { b: 4704, h: 1764 }; const bild = uebersichtsGroesse(karte);
  const schirm = { b: 1920, h: 1080 };
  const f = sichtfenster({ x: 2352, y: 882, zoom: 1 }, schirm, karte, bild);
  assert.ok(Math.abs(f.b - 1920 / 4704 * bild.b) < 1e-9);
  assert.ok(Math.abs(f.x + f.b / 2 - bild.b / 2) < 1e-9);
  const ganz = sichtfenster({ x: 2352, y: 882, zoom: 0.1 }, schirm, karte, bild);
  assert.equal(Math.round(ganz.b), bild.b);
});

test('Auto: nur auf Karten ab 2800 px; die Wahl des Spielers gilt immer', () => {
  assert.equal(sichtbar('auto', { b: 1568, h: 588 }), false);
  assert.equal(sichtbar('auto', { b: AUTO_AB_BREITE, h: 1000 }), true);
  assert.equal(sichtbar('auto', { b: 4704, h: 1764 }), true);
  assert.equal(sichtbar('aus', { b: 6272, h: 2352 }), false);
  assert.equal(sichtbar('an', { b: 1280, h: 720 }), true);
});

test('Beschreibung für Screenreader nennt Teams und Sichtbereich', () => {
  const state = { entities: [{ alive: true, teamId: 0 }, { alive: true, teamId: 0 }, { alive: true, teamId: 1 }, { alive: false, teamId: 1 }] };
  const t = Uebersichtskarte.beschreibung(state, { x: 2352, y: 882, zoom: 1 }, { b: 2352, h: 900 }, { b: 4704, h: 1764 });
  assert.match(t, /Team 1: 2, Team 2: 1/);
  assert.match(t, /25 bis 75 Prozent/);
});

test('Übersichtszoom: die breiteste Karte (6272 px) passt auf einen 1920-px-Schirm ganz ins Bild', () => {
  assert.ok(ZOOM_GRENZEN.min <= 1920 / 6272);
  const k = new Camera({ mapBreite: 6272, mapHoehe: 2352, schirmBreite: 1920, schirmHoehe: 1080 });
  k.setzeAnsicht(3136, 1176, 0.01);
  assert.ok(Math.abs(k.zoom - 1920 / 6272) < 1e-9, `Zoom ${k.zoom}`);
  assert.ok(k.sichtbareBreite >= 6272 - 1e-6);
});

test('KameraSteuerung ohne DOM: Taste O/Übersichtszoom setzt die ganze Karte und gibt sie wieder frei', () => {
  const k = new Camera({ mapBreite: 4704, mapHoehe: 1764, schirmBreite: 1920, schirmHoehe: 1080 });
  k.setzeAnsicht(500, 500, 2);
  const regie = new KameraRegie();
  const hatte = 'window' in globalThis;
  if (!hatte) globalThis.window = new EventTarget();
  const s = new KameraSteuerung({ canvas: Object.assign(new EventTarget(), { setPointerCapture() {} }), kamera: () => k, regie });
  assert.ok(s.uebersicht instanceof Uebersichtskarte);
  assert.equal(s.uebersichtsZoom(), true);
  assert.ok(Math.abs(k.zoom - k.zoomGanzeKarte) < 1e-9);
  assert.equal(regie.uebersteuert, true);
  s.uebersichtsZoom();
  assert.equal(regie.uebersteuert, false);
  if (!hatte) delete globalThis.window;
});

test('Verdrahtung: main.js ruft die Übersicht je Bild über die Kamerasteuerung, nichts davon in Engine/Shared', () => {
  const main = fs.readFileSync(new URL('../src/client/main.js', import.meta.url), 'utf8');
  assert.match(main, /kameraSteuerung\.aktualisiereKnopf\(state, this\.renderer\.terrainLayer/);
  const quelle = fs.readFileSync(new URL('../src/client/uebersichtskarte.js', import.meta.url), 'utf8');
  assert.doesNotMatch(quelle, /Math\.random|Date\.now/);
  assert.doesNotMatch(quelle, /from '\.\.\/(engine|shared)/);
});

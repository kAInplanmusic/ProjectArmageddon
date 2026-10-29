/**
 * Tests für den umgebungsunabhängigen Bildvergleich (`tests/e2e/helfer/struktur-vergleich.mjs`).
 *
 * Ein Vergleich ist nur etwas wert, wenn er beides kann: das Unwichtige
 * durchlassen (Versatz um wenige Pixel, anders geglättete Kanten) UND das Wichtige
 * melden (fehlendes Element, andere Flächenfarbe, anderes Layout). Beides wird hier
 * an den abgelegten Baselines selbst gemessen, mit gezielt veränderten Kopien.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  leseBild, schreibeBild, vergleicheStruktur, GRENZEN,
} from './e2e/helfer/struktur-vergleich.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BASIS = path.join(HIER, 'e2e', 'visuell.spec.mjs-snapshots');
const dateien = fs.readdirSync(BASIS).filter(n => n.endsWith('.png')).sort();
const lade = name => leseBild(fs.readFileSync(path.join(BASIS, name)));
const kopie = bild => ({ ...bild, rgba: Uint8Array.from(bild.rgba) });

/** Verschiebt das Bild um (dx, dy) Pixel; freiwerdende Ränder bekommen die Farbe des Randpixels. */
function verschiebe(bild, dx, dy) {
  const { breite, hoehe, rgba } = bild;
  const aus = new Uint8Array(rgba.length);
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      const sx = Math.min(breite - 1, Math.max(0, x - dx));
      const sy = Math.min(hoehe - 1, Math.max(0, y - dy));
      aus.set(rgba.subarray((sy * breite + sx) * 4, (sy * breite + sx) * 4 + 4), (y * breite + x) * 4);
    }
  }
  return { breite, hoehe, rgba: aus };
}

/** Füllt ein Rechteck mit einer Farbe. */
function fuelle(bild, x0, y0, b, h, [r, g, bl]) {
  const aus = kopie(bild);
  for (let y = y0; y < Math.min(bild.hoehe, y0 + h); y += 1) {
    for (let x = x0; x < Math.min(bild.breite, x0 + b); x += 1) {
      const i = (y * bild.breite + x) * 4;
      aus.rgba[i] = r; aus.rgba[i + 1] = g; aus.rgba[i + 2] = bl;
    }
  }
  return aus;
}

test('Es gibt abgelegte Baselines, an denen gemessen wird', () => {
  assert.ok(dateien.length >= 6, `erwartet mindestens 6 Baselines, gefunden ${dateien.length}`);
});

test('PNG-Lesen und -Schreiben sind zueinander umkehrbar', () => {
  const bild = lade(dateien[0]);
  const zurueck = leseBild(schreibeBild(bild));
  assert.equal(zurueck.breite, bild.breite);
  assert.equal(zurueck.hoehe, bild.hoehe);
  assert.deepEqual(Buffer.from(zurueck.rgba), Buffer.from(bild.rgba));
  assert.throws(() => leseBild(Buffer.from('kein png, nur Text, aber lang genug fuer den Kopf')), /Kein PNG/);
});

for (const name of dateien) {
  test(`Gleich bleibt gleich: ${name}`, () => {
    const bild = lade(name);
    const urteil = vergleicheStruktur(bild, kopie(bild));
    assert.equal(urteil.ok, true, urteil.grund ?? '');
    assert.equal(urteil.kanten.fehlend + urteil.kanten.neu + urteil.farbe.fehlend + urteil.farbe.neu, 0);
  });

  test(`Unempfindlich: Versatz um 2 px und 1 px wird durchgelassen: ${name}`, () => {
    const bild = lade(name);
    for (const [dx, dy] of [[0, 2], [2, 0], [-1, 2], [3, -3]]) {
      const urteil = vergleicheStruktur(bild, verschiebe(bild, dx, dy));
      assert.equal(urteil.ok, true, `Versatz (${dx}, ${dy}): ${urteil.grund}`);
    }
  });

  test(`Empfindlich: ein Versatz um 40 px (anderes Layout) wird gemeldet: ${name}`, () => {
    const bild = lade(name);
    const urteil = vergleicheStruktur(bild, verschiebe(bild, 0, 40));
    assert.equal(urteil.ok, false, 'Eine um 40 px verschobene Seite ist eine andere Seite');
  });
}

test('Empfindlich: ein fehlendes Bedienelement wird gemeldet (Lobby 390x844, „Beitreten“-Karte)', () => {
  const bild = lade('lobby-390x844-chromium-linux.png');
  // Die zweite Lobby-Karte samt Knopf (Pixelbereich aus dem abgelegten Bild) mit der Kartenfarbe füllen.
  const i = (300 * bild.breite + 200) * 4;
  const farbe = [bild.rgba[i], bild.rgba[i + 1], bild.rgba[i + 2]];
  const ohne = fuelle(bild, 40, 280, 300, 130, farbe);
  const urteil = vergleicheStruktur(bild, ohne);
  assert.equal(urteil.ok, false, 'Eine entfernte Karte muss auffallen');
  assert.ok(urteil.kanten.fehlend > GRENZEN.kantenAbweichung, `fehlende Kanten ${(urteil.kanten.fehlend * 100).toFixed(1)} %`);
});

test('Empfindlich: ein einzelner Knopf (Lobbys laden) verschwindet', () => {
  const bild = lade('lobby-390x844-chromium-linux.png');
  const i = (60 * bild.breite + 200) * 4;
  const farbe = [bild.rgba[i], bild.rgba[i + 1], bild.rgba[i + 2]];
  const urteil = vergleicheStruktur(bild, fuelle(bild, 36, 48, 320, 44, farbe));
  assert.equal(urteil.ok, false, 'Ein fehlender Knopf ist kleiner als eine Karte und muss trotzdem auffallen');
});

test('Empfindlich: ein einzelnes Etikett und ein Chip verschwinden', () => {
  const bild = lade('lobby-390x844-chromium-linux.png');
  const farbeAn = (x, y) => { const i = (y * bild.breite + x) * 4; return [bild.rgba[i], bild.rgba[i + 1], bild.rgba[i + 2]]; };
  // „BEITRETEN“ der ersten Karte
  assert.equal(vergleicheStruktur(bild, fuelle(bild, 150, 224, 90, 24, farbeAn(100, 236))).ok, false, 'Etikett');
  // Chip „hills“
  assert.equal(vergleicheStruktur(bild, fuelle(bild, 130, 164, 80, 22, farbeAn(250, 176))).ok, false, 'Chip');
});

test('Empfindlich: eine andere Flächenfarbe wird gemeldet', () => {
  const bild = lade('hud-1280x720-chromium-linux.png');
  // Eine große Fläche rot statt der bisherigen Farbe: keine neuen Kanten, aber ein anderes Bild.
  const urteil = vergleicheStruktur(bild, fuelle(bild, 0, 0, 640, 360, [200, 30, 30]));
  assert.equal(urteil.ok, false);
});

test('Empfindlich: verschiedene Seiten sind verschieden', () => {
  const urteil = vergleicheStruktur(lade('menue-390x844-chromium-linux.png'), lade('lobby-390x844-chromium-linux.png'));
  assert.equal(urteil.ok, false);
});

test('Andere Größe ist immer verschieden, mit Begründung', () => {
  const urteil = vergleicheStruktur(lade('menue-390x844-chromium-linux.png'), lade('menue-1280x720-chromium-linux.png'));
  assert.equal(urteil.ok, false);
  assert.match(urteil.grund, /Größe 390×844 gegen 1280×720/);
});

test('Eigene Grenzen werden beachtet (strenger ist strenger)', () => {
  const bild = lade('hud-1280x720-chromium-linux.png');
  const versetzt = verschiebe(bild, 3, 3);
  assert.equal(vergleicheStruktur(bild, versetzt).ok, true);
  assert.equal(vergleicheStruktur(bild, versetzt, { kantenAbweichung: 0, farbAbweichung: 0 }).ok, false,
    'Mit Grenze 0 muss schon ein Versatz auffallen — sonst wäre die Grenze wirkungslos');
});

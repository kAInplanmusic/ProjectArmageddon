import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { CHARACTERS } from '../src/shared/config/factions.js';

/**
 * Qualität der freigestellten Porträts.
 *
 * Die Fraktionsbögen tragen ein eingebranntes Schachbrett als „Transparenz".
 * `scripts/extract_factions.py` stellt die Figuren frei. Diese Tests lesen die
 * PNG-Pixel selbst (ohne Abhängigkeit) und prüfen, was ein Schachbrettrest oder
 * ein vergessener Alphakanal sichtbar machen würde:
 *   - echter Alphakanal mit transparenten Ecken,
 *   - plausibler Anteil deckender Pixel (kein leeres Bild, kein Vollflächen-Rest),
 *   - keine großen flachen grauen Flächen, die dem Schachbrett entsprechen,
 *   - HD-Porträts quadratisch, nie größer als 512 und zu jedem Sprite vorhanden.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const SPRITES = path.join(ROOT, 'src', 'client', 'assets', 'characters');
const HD = path.join(ROOT, 'src', 'client', 'assets', 'characters-hd');

/** Liest ein 8-Bit-RGBA-PNG ohne Interlace (so schreibt Pillow). */
function lesePng(datei) {
  const puffer = fs.readFileSync(datei);
  assert.equal(puffer.toString('hex', 0, 8), '89504e470d0a1a0a', `${datei}: kein PNG`);
  const breite = puffer.readUInt32BE(16);
  const hoehe = puffer.readUInt32BE(20);
  assert.equal(puffer[24], 8, `${datei}: keine 8 Bit`);
  assert.equal(puffer[25], 6, `${datei}: kein RGBA`);
  assert.equal(puffer[28], 0, `${datei}: Interlace nicht unterstützt`);
  const teile = [];
  for (let pos = 8; pos < puffer.length;) {
    const laenge = puffer.readUInt32BE(pos);
    const typ = puffer.toString('ascii', pos + 4, pos + 8);
    if (typ === 'IDAT') teile.push(puffer.subarray(pos + 8, pos + 8 + laenge));
    pos += 12 + laenge;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const zeile = breite * 4;
  const px = Buffer.alloc(zeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    const quelle = roh.subarray(y * (zeile + 1) + 1, (y + 1) * (zeile + 1));
    for (let x = 0; x < zeile; x++) {
      const a = x >= 4 ? px[y * zeile + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * zeile + x - 4] : 0;
      let wert = quelle[x];
      if (filter === 1) wert += a;
      else if (filter === 2) wert += b;
      else if (filter === 3) wert += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        wert += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * zeile + x] = wert & 255;
    }
  }
  return { breite, hoehe, px };
}

function alphaAt(bild, x, y) {
  return bild.px[(y * bild.breite + x) * 4 + 3];
}

/** Kennzahlen eines Bildes. */
function messen(bild) {
  const { breite, hoehe, px } = bild;
  let deckend = 0;
  let teil = 0;
  let schachbrett = 0;
  for (let i = 0; i < breite * hoehe; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const a = px[i * 4 + 3];
    if (a > 250) {
      deckend++;
      // Deckend, unbunt und genau auf einem der Schachbretttöne (hell 230..255 oder
      // dunkel 185..225): Rest des Hintergrunds, der nicht freigestellt wurde.
      const unbunt = Math.max(r, g, b) - Math.min(r, g, b) <= 6;
      if (unbunt && (r >= 185 && r <= 255)) schachbrett++;
    } else if (a > 0) teil++;
  }
  return { deckend, teil, schachbrett, gesamt: breite * hoehe };
}

test('Jede Figur hat einen echten Alphakanal mit transparenten Ecken', () => {
  for (const c of CHARACTERS) {
    for (const wurzel of [SPRITES, HD]) {
      const bild = lesePng(path.join(wurzel, c.faction, c.sprite));
      for (const [x, y] of [[0, 0], [bild.breite - 1, 0], [0, bild.hoehe - 1], [bild.breite - 1, bild.hoehe - 1]]) {
        assert.equal(alphaAt(bild, x, y), 0,
          `${c.faction}/${c.sprite} (${bild.breite}px): Ecke ${x},${y} nicht transparent`);
      }
    }
  }
});

test('Anteil deckender Pixel ist plausibel und es bleibt kein Schachbrett stehen', () => {
  for (const c of CHARACTERS) {
    const bild = lesePng(path.join(HD, c.faction, c.sprite));
    const m = messen(bild);
    const anteil = (m.deckend + m.teil) / m.gesamt;
    // Schwarm (Buffer-Flow) und Erscheinungen sind lockerer, ein Schachbrettrest
    // ließe den Anteil nahe 1 steigen.
    assert.ok(anteil > 0.12 && anteil < 0.92,
      `${c.faction}/${c.sprite}: Anteil nicht-transparenter Pixel ${anteil.toFixed(2)} unplausibel`);
    // Weiche Kanten sind Ausnahme, nicht Regel: Der Großteil ist voll deckend.
    assert.ok(m.deckend > m.teil * 1.5,
      `${c.faction}/${c.sprite}: zu viel Teiltransparenz (${m.teil} von ${m.deckend + m.teil})`);
    // Unbunte, deckende Pixel im Tonbereich des Schachbretts: erlaubt sind
    // Silberrüstung und weißes Fell, aber keine großen Restflächen.
    assert.ok(m.schachbrett / m.gesamt < 0.10,
      `${c.faction}/${c.sprite}: ${(100 * m.schachbrett / m.gesamt).toFixed(1)} % deckend im Schachbrett-Grau`);
  }
});

test('HD-Porträts: quadratisch, höchstens 512 px, zu jedem Sprite vorhanden', () => {
  const sprites = new Set();
  for (const c of CHARACTERS) {
    const datei = path.join(HD, c.faction, c.sprite);
    assert.ok(fs.existsSync(datei), `HD fehlt: ${c.faction}/${c.sprite}`);
    sprites.add(`${c.faction}/${c.sprite}`);
    const kopf = fs.readFileSync(datei).subarray(0, 32);
    const b = kopf.readUInt32BE(16);
    const h = kopf.readUInt32BE(20);
    assert.equal(b, h, `${c.faction}/${c.sprite}: nicht quadratisch`);
    assert.ok(b <= 512, `${c.faction}/${c.sprite}: ${b} px, mehr als 512`);
    assert.ok(b >= 224, `${c.faction}/${c.sprite}: ${b} px, verdächtig klein`);
  }
  for (const ordner of fs.readdirSync(HD)) {
    for (const datei of fs.readdirSync(path.join(HD, ordner))) {
      assert.ok(sprites.has(`${ordner}/${datei}`), `Verwaistes HD-Bild: ${ordner}/${datei}`);
    }
  }
});

test('Die Figur füllt das Bild mit kleinem Rand und liegt mittig', () => {
  for (const c of CHARACTERS) {
    const bild = lesePng(path.join(SPRITES, c.faction, c.sprite));
    let x0 = bild.breite;
    let x1 = -1;
    let y0 = bild.hoehe;
    let y1 = -1;
    for (let y = 0; y < bild.hoehe; y++) {
      for (let x = 0; x < bild.breite; x++) {
        if (alphaAt(bild, x, y) > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const rand = Math.min(x0, y0, bild.breite - 1 - x1, bild.hoehe - 1 - y1);
    assert.ok(rand >= 1 && rand <= 24, `${c.faction}/${c.sprite}: Rand ${rand} px`);
    assert.ok(Math.max(x1 - x0, y1 - y0) >= bild.breite * 0.85,
      `${c.faction}/${c.sprite}: Figur zu klein im Bild`);
  }
});

test('HD-Porträts bleiben in Quellgröße (Stufe-2-Entscheidung: kein künstliches Hochskalieren)', () => {
  // Lanczos plus Schärfen und kein Together-Upscaler (GET /v1/models listet keinen)
  // brachten gegenüber dem Browser-Skalieren keinen sichtbaren Gewinn; die HD-Bilder
  // sind die Zellen der Fraktionsbögen (257-349 px) und werden nicht auf 512 aufgeblasen.
  for (const c of CHARACTERS) {
    const kopf = fs.readFileSync(path.join(HD, c.faction, c.sprite)).subarray(0, 32);
    const b = kopf.readUInt32BE(16);
    assert.ok(b >= 256 && b <= 360, `${c.faction}/${c.sprite}: ${b} px, keine Quellgröße der Bogenzelle`);
  }
});

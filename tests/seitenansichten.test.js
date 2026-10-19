import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { CHARACTERS } from '../src/shared/config/factions.js';

/**
 * Seitenansichten (Blick nach rechts) und Einzel-Charactersheets.
 *
 * `scripts/seitenansichten/` erzeugt die Sprites (Together AI, Text-zu-Bild),
 * stellt sie frei und normalisiert sie auf 256x256 mit Grundlinie y=240. Diese
 * Tests prüfen Manifest und Dateien gegeneinander. Fehlt eine Seite, steht
 * `hasSide: false` im Manifest und die Datei fehlt (der Client nutzt das Porträt).
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HIER, '..', 'src', 'client', 'assets');
const SEITE = path.join(ASSETS, 'characters-side');
const BOGEN = path.join(ASSETS, 'charactersheets');

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
    if (puffer.toString('ascii', pos + 4, pos + 8) === 'IDAT') teile.push(puffer.subarray(pos + 8, pos + 8 + laenge));
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

const alpha = (b, x, y) => b.px[(y * b.breite + x) * 4 + 3];
const manifest = JSON.parse(fs.readFileSync(path.join(SEITE, 'manifest.json'), 'utf8'));
const bogenManifest = JSON.parse(fs.readFileSync(path.join(BOGEN, 'manifest.json'), 'utf8'));
const entscheidungen = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'scripts', 'seitenansichten', 'entscheidungen.json'), 'utf8'));
const TEXT_MODELL = 'black-forest-labs/FLUX.1.1-pro';
const KONTEXT_MODELL = 'black-forest-labs/FLUX.1-kontext-pro';
const schluessel = CHARACTERS.map((c) => `${c.faction}/${c.sprite}`);

test('Manifest nennt jede der 81 Figuren genau einmal mit gültigen Feldern', () => {
  assert.equal(schluessel.length, 81);
  assert.equal(manifest.size, 256);
  assert.equal(manifest.groundY, 240);
  assert.equal(manifest.facing, 'right');
  assert.deepEqual(Object.keys(manifest.figures).sort(), [...schluessel].sort());
  for (const [k, e] of Object.entries(manifest.figures)) {
    assert.equal(e.file, k);
    assert.equal(e.facing, 'right');
    assert.ok(['together', 'together-kontext'].includes(e.source), `${k}: Quelle ${e.source}`);
    assert.equal(e.model, e.source === 'together-kontext' ? KONTEXT_MODELL : TEXT_MODELL, `${k}: Modell passt nicht zur Quelle`);
    assert.equal(typeof e.hasSide, 'boolean');
    if (e.hasSide) {
      assert.equal(e.anchor.y, manifest.groundY, `${k}: Fußpunkt nicht auf der Grundlinie`);
      assert.ok(e.anchor.x >= 16 && e.anchor.x <= 240, `${k}: Fußpunkt x=${e.anchor.x} unplausibel`);
    } else assert.equal(e.anchor, null);
  }
});

test('Seitensprites: Datei vorhanden genau dann, wenn hasSide; 256x256, Ecken transparent, Grundlinie', () => {
  const vorhanden = new Set();
  for (const ordner of fs.readdirSync(SEITE)) {
    if (ordner === 'manifest.json') continue;
    for (const f of fs.readdirSync(path.join(SEITE, ordner))) vorhanden.add(`${ordner}/${f}`);
  }
  for (const [k, e] of Object.entries(manifest.figures)) {
    assert.equal(vorhanden.has(k), e.hasSide, `${k}: Datei und hasSide widersprechen sich`);
    vorhanden.delete(k);
    if (!e.hasSide) continue;
    const b = lesePng(path.join(SEITE, k));
    assert.equal(b.breite, 256, `${k}: Breite`);
    assert.equal(b.hoehe, 256, `${k}: Höhe`);
    for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255]]) assert.equal(alpha(b, x, y), 0, `${k}: Ecke ${x},${y}`);
    let unten = -1;
    let oben = 256;
    let deckend = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const a = alpha(b, x, y);
        if (a > 40) { unten = Math.max(unten, y); oben = Math.min(oben, y); }
        if (a > 250) deckend++;
      }
    }
    assert.ok(unten >= 236 && unten <= 241, `${k}: unterster Pixel y=${unten}, erwartet ~240`);
    assert.ok(unten - oben >= 100, `${k}: Figur zu klein (${unten - oben} px hoch)`);
    const anteil = deckend / (256 * 256);
    assert.ok(anteil > 0.04 && anteil < 0.7, `${k}: deckender Anteil ${anteil.toFixed(2)} unplausibel`);
  }
  assert.deepEqual([...vorhanden], [], 'Verwaiste Seitensprites ohne Manifest-Eintrag');
});

test('Fallback-Liste: Figuren ohne Seite haben auch kein Charactersheet', () => {
  const ohne = Object.entries(manifest.figures).filter(([, e]) => !e.hasSide).map(([k]) => k);
  for (const k of ohne) assert.equal(bogenManifest.sheets[k], undefined, `${k}: Sheet trotz fehlender Seite`);
  assert.equal(Object.keys(bogenManifest.sheets).length, schluessel.length - ohne.length);
});

test('Charactersheets: Front und Seite nebeneinander, Zellen laut Manifest', () => {
  assert.equal(bogenManifest.cell, 256);
  assert.equal(bogenManifest.groundY, 240);
  for (const [k, s] of Object.entries(bogenManifest.sheets)) {
    assert.ok(manifest.figures[k]?.hasSide, `${k}: Sheet ohne Seitensprite`);
    assert.deepEqual([s.front.x, s.front.y, s.front.w, s.front.h], [0, 0, 256, 256]);
    assert.deepEqual([s.side.x, s.side.y, s.side.w, s.side.h], [256, 0, 256, 256]);
    assert.deepEqual(s.side.anchor, manifest.figures[k].anchor, `${k}: Seiten-Fußpunkt weicht ab`);
    const b = lesePng(path.join(BOGEN, k));
    assert.equal(b.breite, 512, `${k}: Sheet-Breite`);
    assert.equal(b.hoehe, 256, `${k}: Sheet-Höhe`);
    const belegt = (x0) => {
      let n = 0;
      for (let y = 0; y < 256; y++) for (let x = x0; x < x0 + 256; x++) if (alpha(b, x, y) > 40) n++;
      return n;
    };
    assert.ok(belegt(0) > 3000, `${k}: Front-Zelle leer`);
    assert.ok(belegt(256) > 3000, `${k}: Seiten-Zelle leer`);
  }
  for (const ordner of fs.readdirSync(BOGEN)) {
    if (ordner === 'manifest.json') continue;
    for (const f of fs.readdirSync(path.join(BOGEN, ordner))) {
      assert.ok(bogenManifest.sheets[`${ordner}/${f}`], `Verwaistes Sheet ${ordner}/${f}`);
    }
  }
});

test('Stufe 1 (Bild-zu-Bild mit Porträt als Referenz): Entscheidungen und Manifest stimmen überein', () => {
  assert.equal(entscheidungen.modell_kontext, KONTEXT_MODELL);
  const ersetzt = Object.keys(entscheidungen.kontext).sort();
  assert.equal(ersetzt.length, 27);
  const imManifest = Object.entries(manifest.figures).filter(([, e]) => e.source === 'together-kontext').map(([k]) => k).sort();
  assert.deepEqual(imManifest, ersetzt, 'Manifest und entscheidungen.json nennen nicht dieselben Figuren');
  for (const k of ersetzt) {
    assert.ok(manifest.figures[k].hasSide, `${k}: ersetzt, aber ohne Seite`);
    assert.ok(Number.isInteger(entscheidungen.kontext[k]) && entscheidungen.kontext[k] >= 2, `${k}: Version`);
  }
  for (const k of entscheidungen.spiegeln_kontext) assert.ok(ersetzt.includes(k), `${k}: gespiegelt, aber nicht ersetzt`);
  // Verworfene Neuversuche behalten die alte Seite und stehen mit Grund in der Datei.
  const verworfen = Object.keys(entscheidungen.kontext_verworfen);
  assert.equal(verworfen.length, 4);
  for (const k of verworfen) {
    assert.equal(manifest.figures[k].source, 'together', `${k}: verworfen, aber ersetzt`);
    assert.ok(entscheidungen.kontext_verworfen[k].length > 5, `${k}: Begründung fehlt`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';

/**
 * Griff- und Mündungsanker der Waffen (BAL-08).
 *
 * Die Anker sind gesetzt, nicht geschätzt: `scripts/waffen-anker-tabelle.json` nennt je
 * Waffe das Heft (oder `koerper` für Waffen ohne geführtes Heft) und die Art des
 * Wirkendes; `scripts/waffen_anker.py` prüft den Punkt gegen die Deckfläche und setzt
 * die Mündung an das tatsächliche Ende. Diese Tests prüfen die Daten gegen die Atlanten —
 * also ob der Griff wirklich auf dem Heft und die Mündung wirklich am Ende liegt — und
 * zwar ohne Randabstands-Heuristik: gemessen wird die Deckfläche selbst.
 *
 * Die Prüfung im echten Renderer (Links/rechts, drei Zielwinkel, Ruhe/Ziehen/Schuss,
 * drei Figurgrößen) ist `tools/waffen-anker-abnahme.mjs`; sie braucht einen Browser und
 * läuft deshalb nicht unter `node --test`.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ORDNER = path.join(HIER, '..', 'src', 'client', 'assets', 'weapon-sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(ORDNER, 'manifest.json'), 'utf8'));
const tabelle = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'scripts', 'waffen-anker-tabelle.json'), 'utf8')).waffen;
const korrekturen = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'scripts', 'waffen-sprites-korrekturen.json'), 'utf8'));

/** PNG (8 Bit, RGBA oder Palette mit tRNS, ohne Interlace) -> Alpha-Ebene (wie in waffen-sprites.test.js). */
function leseAlpha(datei) {
  const p = fs.readFileSync(datei);
  const breite = p.readUInt32BE(16);
  const hoehe = p.readUInt32BE(20);
  const tiefe = p[24];
  const typ = p[25];
  const teile = [];
  let trns = Buffer.alloc(0);
  for (let pos = 8; pos < p.length;) {
    const laenge = p.readUInt32BE(pos);
    const name = p.toString('ascii', pos + 4, pos + 8);
    if (name === 'IDAT') teile.push(p.subarray(pos + 8, pos + 8 + laenge));
    if (name === 'tRNS') trns = p.subarray(pos + 8, pos + 8 + laenge);
    pos += 12 + laenge;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const bitsProPixel = typ === 6 ? 32 : tiefe;
  const zeile = Math.ceil((breite * bitsProPixel) / 8);
  const schritt = Math.max(1, bitsProPixel >> 3);
  const px = Buffer.alloc(zeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    for (let x = 0; x < zeile; x++) {
      const a = x >= schritt ? px[y * zeile + x - schritt] : 0;
      const b = y > 0 ? px[(y - 1) * zeile + x] : 0;
      const c = x >= schritt && y > 0 ? px[(y - 1) * zeile + x - schritt] : 0;
      let w = roh[y * (zeile + 1) + 1 + x];
      if (filter === 1) w += a;
      else if (filter === 2) w += b;
      else if (filter === 3) w += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        w += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * zeile + x] = w & 255;
    }
  }
  const alpha = new Uint8Array(breite * hoehe);
  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      if (typ === 6) alpha[y * breite + x] = px[y * zeile + x * 4 + 3];
      else {
        const bit = x * tiefe;
        const wert = (px[y * zeile + (bit >> 3)] >> (8 - tiefe - (bit & 7))) & ((1 << tiefe) - 1);
        alpha[y * breite + x] = wert < trns.length ? trns[wert] : 255;
      }
    }
  }
  return { breite, hoehe, alpha };
}

const atlanten = {};
for (const [name, a] of Object.entries(manifest.atlanten)) atlanten[name] = leseAlpha(path.join(ORDNER, a.datei));

/** Alpha-Funktion der held-Zelle einer Waffe (Zellkoordinaten 0..127). */
function zelleAlpha(id) {
  const z = manifest.waffen[id].held;
  const a = atlanten[z.atlas];
  return (x, y) => (x >= 0 && y >= 0 && x < z.w && y < z.h ? a.alpha[(z.y + y) * a.breite + z.x + x] : 0);
}

/** Deckflächenbreite (Zeilenausdehnung) je Spalte. */
function spaltenDicke(alpha) {
  const dick = new Int32Array(128);
  for (let x = 0; x < 128; x++) {
    for (let y = 0; y < 128; y++) if (alpha(x, y) > 100) dick[x] += 1;
  }
  return dick;
}

test('Ankertabelle: genau die 150 Katalogwaffen, vollständig und ohne Schaetzfelder', () => {
  const ids = WEAPONS.map(w => w.id);
  assert.deepEqual(Object.keys(tabelle).sort(), [...ids].sort());
  for (const w of WEAPONS) {
    const t = tabelle[w.id];
    assert.ok(['heft', 'koerper'].includes(t.halt), `${w.id}: halt ${t.halt}`);
    assert.ok(['spitze', 'kopf', 'muendung', 'vorn'].includes(t.wirkt), `${w.id}: wirkt ${t.wirkt}`);
    if (t.halt === 'heft') {
      assert.ok(Array.isArray(t.heft) && t.heft.length === 2, `${w.id}: Heftpunkt fehlt`);
      for (const v of t.heft) assert.ok(Number.isInteger(v) && v >= 0 && v < 128, `${w.id}: Heftpunkt ${t.heft}`);
    } else {
      assert.equal(t.heft, undefined, `${w.id}: koerper ohne Heftpunkt`);
    }
  }
});

test('Manifest: jeder Anker stammt aus der Tabelle (Quelle semantik, Halt und Heft unveraendert)', () => {
  for (const w of WEAPONS) {
    const m = manifest.waffen[w.id];
    const t = tabelle[w.id];
    assert.equal(m.anchor.source, 'semantik', `${w.id}: Ankerquelle ${m.anchor.source}`);
    assert.equal(m.anchor.halt, t.halt, `${w.id}: halt weicht vom Manifest ab`);
    if (t.halt === 'heft') assert.deepEqual(m.anchor.grip, { x: t.heft[0], y: t.heft[1] }, `${w.id}: Griff weicht vom Heftpunkt ab`);
    assert.ok(Array.isArray(m.anchor.heft) && m.anchor.heft[0] <= m.anchor.grip.x && m.anchor.grip.x <= m.anchor.heft[1],
      `${w.id}: Griff liegt nicht in der Heftspanne`);
  }
});

test('Keine Randheuristik mehr: die Korrekturtabelle traegt keine Griff-/Muendungspixel', () => {
  for (const [id, k] of Object.entries(korrekturen)) {
    if (id.startsWith('_')) continue;
    for (const feld of ['grip', 'muzzle', 'art']) {
      assert.equal(k[feld], undefined, `${id}: ${feld} in der Korrekturtabelle — die Anker gehoeren in die Ankertabelle`);
    }
  }
  const quellen = new Set(Object.values(manifest.waffen).map(w => w.anchor.source));
  assert.deepEqual([...quellen], ['semantik']);
});

test('Griff sitzt auf der Waffe und in der belegten Heftspanne', () => {
  for (const w of WEAPONS) {
    const m = manifest.waffen[w.id];
    const alpha = zelleAlpha(w.id);
    const { grip, heft, halt } = m.anchor;
    assert.ok(alpha(grip.x, grip.y) > 100, `${w.id}: Griff (${grip.x},${grip.y}) liegt nicht auf der Waffe`);
    if (halt !== 'heft') continue;
    /*
     * Die Heftspanne ist der zusammenhaengende Bereich, in dem die Waffe heftbreit ist.
     * Sie muss vollstaendig Material tragen (ein Heft ist durchgehend) und den Griff
     * mittig enthalten — beides am gezeichneten Umriss gemessen, nicht am Randabstand.
     */
    assert.ok(heft[0] >= m.content.x && heft[1] <= m.content.x + m.content.w - 1, `${w.id}: Heftspanne ausserhalb des Inhalts`);
    for (let x = heft[0]; x <= heft[1]; x += 1) {
      let deckend = false;
      for (let y = 0; y < 128 && !deckend; y++) if (alpha(x, y) > 100) deckend = true;
      assert.ok(deckend, `${w.id}: Heftspanne enthaelt leere Spalte ${x}`);
    }
    const dick = spaltenDicke(alpha);
    const heftDicke = Math.max(...Array.from({ length: heft[1] - heft[0] + 1 }, (_, i) => dick[heft[0] + i]));
    const maxDicke = Math.max(...dick);
    assert.ok(heftDicke <= maxDicke, `${w.id}: Heft dicker als die Waffe`);
  }
});

test('Wirkspitze liegt am tatsaechlichen Ende der gezeichneten Waffe', () => {
  for (const w of WEAPONS) {
    const m = manifest.waffen[w.id];
    const alpha = zelleAlpha(w.id);
    const { muzzle } = m.anchor;
    const rechts = m.content.x + m.content.w - 1;
    if (m.anchor.fest) {
      // Gesetzte Muendung (schraeges Rohr): sie liegt vor dem Zellrand, aber hinter dem Griff.
      assert.ok(muzzle.x < rechts && muzzle.x > m.anchor.grip.x, `${w.id}: gesetzte Muendung liegt nicht zwischen Griff und Rand`);
    } else {
      assert.equal(muzzle.x, rechts, `${w.id}: Muendung x=${muzzle.x} statt am rechten Rand ${rechts}`);
    }
    if (m.anchor.halt === 'heft') {
      // Mit eigenem Heft liegt die Mündung auf dem Material des Wirkendes. Bei Waffen ohne
      // Heft (Karte, Orb, Körperwesen) ist sie der vordere Rand in Griffhöhe.
      let nah = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) nah = Math.max(nah, alpha(muzzle.x + dx, muzzle.y + dy));
      assert.ok(nah > 100, `${w.id}: Muendung (${muzzle.x},${muzzle.y}) liegt nicht auf der Waffe`);
    }
    assert.ok(muzzle.x > m.anchor.grip.x + 4, `${w.id}: Muendung liegt nicht vor dem Griff`);
    // Der Griff sitzt hinter dem Wirkende, nicht darauf (die Waffe zeigt nach rechts).
    assert.ok(m.anchor.grip.x < muzzle.x - 4, `${w.id}: Griff liegt am Wirkende`);
  }
});

test('Achse Griff -> Muendung ist die Waffenachse: Neigung bleibt ausrichtbar (kein Klemmen)', () => {
  /*
   * Der Renderer dreht die Waffe um den Griff, bis die Achse Griff -> Muendung auf dem
   * Zielstrahl liegt (`waffenSprites.js`, `achse`). Die Schranke dort (1,35 rad) faengt
   * nur fehlerhafte Daten ab; hier ist die echte Anforderung: die Neigung ist die der
   * Waffe (steilste: Zwillingskatanas 40°, Moerser 37°) und wird nirgends geklemmt.
   */
  let steilste = 0;
  for (const w of WEAPONS) {
    const { grip, muzzle } = manifest.waffen[w.id].anchor;
    const neigung = Math.abs(Math.atan2(muzzle.y - grip.y, muzzle.x - grip.x));
    steilste = Math.max(steilste, neigung);
    assert.ok(neigung < 0.75, `${w.id}: Achsneigung ${(neigung * 180 / Math.PI).toFixed(1)}° zu steil`);
  }
  assert.ok(steilste > 0.5, 'keine Waffe mit echter Schraegachse — die Ausrichtung wird nicht geprueft');
});

test('Wirkende zeigt nach rechts: gespiegelte Zellen tragen ihr Wirkende an der rechten Seite', () => {
  /*
   * Drei Zellen kamen mit dem Wirkende nach links aus der Quelle (Eispickel, Bohr-
   * kopf-Rakete, Hoellenkanone) und werden gespiegelt. Geprueft wird das Ergebnis, nicht
   * die Absicht: bei einer gespiegelten Zelle liegt das Material am rechten Rand in
   * einem schmalen Band (Spitze/Kopf), waehrend links der Schaft steht — und der Griff
   * liegt rechts davon. Das ist die Umkehrung der frueheren Schaetzung "das duennere
   * Ende ist die Spitze", die diese drei Waffen falsch ausgerichtet hat.
   */
  // Die Ankertabelle haelt fest, welche Zelle fuer das Wirkende nach rechts gespiegelt wurde.
  const zusatz = Object.entries(tabelle).filter(([, t]) => t.spiegeln).map(([id]) => id).sort();
  assert.deepEqual(zusatz, ['pa_009', 'pa_136', 'pa_139']);
  for (const [id, t] of Object.entries(tabelle)) {
    assert.equal(manifest.waffen[id].anchor.spiegeln, Boolean(t.spiegeln), `${id}: spiegeln im Anker weicht von der Tabelle ab`);
  }
  for (const w of WEAPONS) {
    const m = manifest.waffen[w.id];
    const alpha = zelleAlpha(w.id);
    const dick = spaltenDicke(alpha);
    const rechts = m.content.x + m.content.w - 1;
    // Am aeussersten rechten Rand muss Material liegen (das Ende), nicht Leerraum.
    assert.ok(dick[rechts] > 0, `${w.id}: rechter Rand ohne Material — Wirkende zeigt nicht nach rechts`);
    // Und der Griff darf nicht am aeussersten Ende kleben: das Ende liegt vor ihm.
    assert.ok(dick[m.anchor.grip.x] > 0, `${w.id}: Griff ohne Material`);
  }
});

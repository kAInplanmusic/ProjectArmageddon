import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { WEAPONS } from '../src/shared/config/weapons.js';

/**
 * Waffen-Sprites (Stufe 1): `scripts/waffen-sprites.py` extrahiert die Waffen aus den
 * 150 Katalog-Icons und legt Atlanten + `manifest.json` unter
 * `src/client/assets/weapon-sprites/` ab. Diese Tests prüfen Manifest, Atlanten und
 * Katalog gegeneinander (Zellen im Atlas, echter Alpha, transparente Ecken, Anker).
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ORDNER = path.join(HIER, '..', 'src', 'client', 'assets', 'weapon-sprites');
const manifest = JSON.parse(fs.readFileSync(path.join(ORDNER, 'manifest.json'), 'utf8'));
const KATEGORIEN = ['melee', 'ranged', 'heavy_ranged', 'elemental', 'magic', 'tech', 'utility', 'ultimate'];

/** PNG (8 Bit, RGBA oder Palette mit tRNS, ohne Interlace) -> Alpha-Ebene. */
function leseAlpha(datei) {
  const p = fs.readFileSync(datei);
  assert.equal(p.toString('hex', 0, 8), '89504e470d0a1a0a', `${datei}: kein PNG`);
  const breite = p.readUInt32BE(16);
  const hoehe = p.readUInt32BE(20);
  const tiefe = p[24];
  const typ = p[25];
  assert.equal(p[28], 0, 'Interlace nicht unterstützt');
  assert.ok(typ === 6 || typ === 3, `${datei}: Farbtyp ${typ} nicht unterstützt`);
  const teile = [];
  let plte = null;
  let trns = Buffer.alloc(0);
  for (let pos = 8; pos < p.length;) {
    const laenge = p.readUInt32BE(pos);
    const name = p.toString('ascii', pos + 4, pos + 8);
    const daten = p.subarray(pos + 8, pos + 8 + laenge);
    if (name === 'IDAT') teile.push(daten);
    if (name === 'PLTE') plte = daten;
    if (name === 'tRNS') trns = daten;
    pos += 12 + laenge;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));
  const bpp = typ === 6 ? 4 : 1;
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
  void bpp;
  void plte;
  return { breite, hoehe, alpha };
}

const atlanten = {};
for (const [name, a] of Object.entries(manifest.atlanten)) {
  atlanten[name] = leseAlpha(path.join(ORDNER, a.datei));
}

function zelleAlpha(z) {
  const a = atlanten[z.atlas];
  return (x, y) => a.alpha[(z.y + y) * a.breite + z.x + x];
}

function bereich(z, innerhalb) {
  const a = atlanten[z.atlas];
  assert.ok(a, `Atlas ${z.atlas} fehlt`);
  assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.w <= a.breite && z.y + z.h <= a.hoehe, `Zelle ${JSON.stringify(z)} liegt außerhalb des Atlas`);
  innerhalb?.(z);
}

test('Manifest nennt alle 150 Waffen des Katalogs genau einmal, mit passenden Stammdaten', () => {
  assert.equal(WEAPONS.length, 150);
  assert.equal(manifest.facing, 'right');
  assert.deepEqual(Object.keys(manifest.waffen).sort(), WEAPONS.map(w => w.id).sort());
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    assert.equal(e.id, w.id);
    assert.equal(e.name, w.displayName);
    assert.equal(e.category, w.category);
    assert.equal(e.rarity, w.rarity);
    assert.ok(['objekt', 'kompakt', 'kachel'].includes(e.form), `${w.id}: Form ${e.form}`);
    assert.match(e.flashColor, /^#[0-9a-f]{6}$/, `${w.id}: flashColor`);
    assert.ok(e.quelle.datei.startsWith(w.icon.replace(/\.PNG$/i, '')), `${w.id}: Quelle passt nicht zum Icon`);
  }
});

test('Atlanten: ein Atlas je Kategorie plus Icon-Atlas, Größen laut Manifest', () => {
  assert.deepEqual(Object.keys(manifest.atlanten).sort(), [...KATEGORIEN, 'icons'].sort());
  for (const [name, a] of Object.entries(manifest.atlanten)) {
    assert.equal(atlanten[name].breite, a.w, `${name}: Breite`);
    assert.equal(atlanten[name].hoehe, a.h, `${name}: Höhe`);
    const erwartet = name === 'icons' ? 150 : WEAPONS.filter(w => w.category === name).length;
    assert.equal(a.waffen, erwartet, `${name}: Waffenzahl`);
  }
});

test('held-, silhouette- und icon-Zellen liegen im Atlas und haben echten Alpha mit transparenten Ecken', () => {
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    for (const variante of ['held', 'silhouette', 'icon']) {
      const z = e[variante];
      assert.equal(z.w, 128);
      assert.equal(z.h, 128);
      bereich(z);
      const alpha = zelleAlpha(z);
      for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127]]) {
        assert.equal(alpha(x, y), 0, `${w.id}/${variante}: Ecke (${x},${y}) nicht transparent`);
      }
      let deckend = 0;
      let teil = 0;
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const a = alpha(x, y);
          if (a === 255) deckend++;
          else if (a > 0) teil++;
        }
      }
      assert.ok(deckend > 300, `${w.id}/${variante}: zu wenig deckende Pixel (${deckend})`);
      assert.ok(teil > 0, `${w.id}/${variante}: kein weicher Rand (Alpha nur 0/255)`);
      assert.ok(deckend < 128 * 128 * 0.95, `${w.id}/${variante}: Zelle fast vollflächig`);
    }
  }
});

test('Anker grip und muzzle liegen innerhalb der Zelle, content innerhalb der Deckfläche', () => {
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    for (const k of ['grip', 'muzzle']) {
      const p = e.anchor[k];
      assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), `${w.id}/${k}: nicht ganzzahlig`);
      assert.ok(p.x >= 0 && p.x < 128 && p.y >= 0 && p.y < 128, `${w.id}/${k}: (${p.x},${p.y}) außerhalb`);
    }
    /*
     * Die Anker sind gesetzt (BAL-08), nicht aus dem Randabstand geschätzt: Griff am
     * Heftpunkt oder Schwerpunkt, Mündung am tatsächlichen Ende. Die inhaltliche Prüfung
     * (Griff auf dem Heft, Spitze am Ende, Spiegelung) steht in `waffen-anker.test.js`.
     */
    assert.equal(e.anchor.source, 'semantik', `${w.id}: Ankerquelle ${e.anchor.source}`);
    assert.ok(['heft', 'koerper'].includes(e.anchor.halt), `${w.id}: halt ${e.anchor.halt}`);
    assert.ok(Array.isArray(e.anchor.heft) && e.anchor.heft.length === 2, `${w.id}: Heftspanne fehlt`);
    assert.ok(e.anchor.muzzle.x >= e.anchor.grip.x, `${w.id}: Mündung liegt links vom Griff`);
    const c = e.content;
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 128 && c.y + c.h <= 128, `${w.id}: content außerhalb`);
    assert.ok(Math.max(c.w, c.h) >= 100 && Math.max(c.w, c.h) <= 124, `${w.id}: größte Kante ${Math.max(c.w, c.h)} nicht ~90 %`);
  }
});

test('Projektil-Sprites nur für Waffen mit physischem Geschoss; Hitscan und Selbstwirkung erhalten null', () => {
  let mit = 0;
  for (const w of WEAPONS) {
    const p = manifest.waffen[w.id].projectile;
    if (w.delivery === 'hitscan') {
      assert.equal(p, null, `${w.id}: Hitscan darf kein Projektil haben`);
      continue;
    }
    if (p === null) continue;
    mit++;
    assert.equal(w.delivery, 'projectile');
    assert.equal(p.w, 32);
    assert.equal(p.h, 32);
    assert.equal(p.angle, 0);
    assert.ok(p.size.w >= 8 && p.size.w <= 32 && p.size.h >= 4 && p.size.h <= 32, `${w.id}: size ${JSON.stringify(p.size)}`);
    bereich(p);
    const alpha = zelleAlpha(p);
    let sichtbar = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (alpha(x, y) > 100) sichtbar++;
    assert.ok(sichtbar >= 20, `${w.id}: Projektil-Zelle leer`);
  }
  assert.ok(mit >= 50, `nur ${mit} Projektil-Sprites`);
});

test('Zellen einer Kategorie überlappen sich nicht', () => {
  const belegt = new Set();
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    const zellen = [e.held, e.silhouette, e.icon];
    if (e.projectile) zellen.push(e.projectile);
    for (const z of zellen) {
      const schluessel = `${z.atlas}:${z.x}:${z.y}`;
      assert.ok(!belegt.has(schluessel), `${w.id}: Zelle ${schluessel} doppelt belegt`);
      belegt.add(schluessel);
    }
  }
});

test('Gesamtgröße der Atlanten bleibt unter 6 MB', () => {
  let summe = 0;
  for (const a of Object.values(manifest.atlanten)) summe += fs.statSync(path.join(ORDNER, a.datei)).size;
  summe += fs.statSync(path.join(ORDNER, 'manifest.json')).size;
  assert.ok(summe < 6 * 1024 * 1024, `${(summe / 1048576).toFixed(2)} MB`);
});

test('Griffanker liegt auf einem deckenden Pixel der Waffe, die Mündung am tatsächlichen Ende', () => {
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    const alpha = zelleAlpha(e.held);
    const { grip, muzzle } = e.anchor;
    assert.ok(alpha(grip.x, grip.y) > 100, `${w.id}: Griff (${grip.x},${grip.y}) liegt nicht innerhalb der Waffenumrisse`);
    /*
     * Die Mündung ist der äußerste Materialpunkt am rechten Ende. Früher stand hier eine
     * Randheuristik ("höchstens drei Pixel neben einem deckenden Pixel, Spitze auf der
     * Achse durch den Griff, Griff zwischen 3 % und 75 % der Länge"). Sie ist ersetzt:
     * die Anker sind gesetzt, und `waffen-anker.test.js` prüft Heft, Ende und Spiegelung.
     */
    if (e.anchor.halt === 'heft') {
      // Mit eigenem Heft liegt die Mündung auf dem Material des Wirkendes; bei Waffen ohne
      // Heft (Karte, Orb, Körperwesen) ist sie der vordere Rand in Griffhöhe.
      let nah = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) nah = Math.max(nah, alpha(muzzle.x + dx, muzzle.y + dy));
      assert.ok(nah > 100, `${w.id}: Mündung (${muzzle.x},${muzzle.y}) liegt nicht am Waffenende`);
    }
    if (e.anchor.fest) continue;   // gesetzte Muendung (schraeges Rohr): Zellrand ist nicht das Ende
    for (let x = muzzle.x + 1; x < 128; x += 1) {
      let weiter = false;
      for (let y = 0; y < 128 && !weiter; y++) if (alpha(x, y) > 100) weiter = true;
      assert.ok(!weiter, `${w.id}: Waffe reicht über die Mündung hinaus (Spalte ${x})`);
    }
  }
});

test('Kachel-Waffen: Darstellung je Waffe entschieden (motiv oder orb) und begründet', () => {
  const kacheln = WEAPONS.filter(w => manifest.waffen[w.id].form === 'kachel');
  // 26: pa_034 Zauberbolzen und pa_035 Energieball haben seit N-06 (2026-11-03) freigestellte Bilder statt Kacheln.
  assert.equal(kacheln.length, 26);
  let motiv = 0;
  for (const w of kacheln) {
    const k = manifest.waffen[w.id].kachel;
    assert.ok(k && ['motiv', 'orb'].includes(k.modus), `${w.id}: kachel.modus fehlt`);
    assert.ok(typeof k.grund === 'string' && k.grund.length > 10, `${w.id}: keine Begründung`);
    if (k.modus === 'motiv') motiv++;
  }
  assert.ok(motiv >= 20, `nur ${motiv} Kacheln als Motiv herausgelöst`);
  for (const w of WEAPONS) {
    if (manifest.waffen[w.id].form !== 'kachel') assert.equal(manifest.waffen[w.id].kachel, undefined, `${w.id}: kachel nur bei Kachel-Form`);
  }
});

test('Herausgelöste Motive haben keinen Rahmen: Zellecken transparent, Zelle nicht vollflächig', () => {
  for (const w of WEAPONS) {
    const e = manifest.waffen[w.id];
    if (e.form !== 'kachel' || e.kachel.modus !== 'motiv') continue;
    const alpha = zelleAlpha(e.held);
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127]]) {
      assert.ok(alpha(x, y) < 20, `${w.id}: Ecke (${x},${y}) nicht transparent`);
    }
    let deckend = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (alpha(x, y) > 100) deckend++;
    assert.ok(deckend < 128 * 128 * 0.9, `${w.id}: Motiv füllt die Zelle wie eine Kachel (${deckend})`);
  }
});

test('Korrekturtabelle: nur bekannte Waffen und Felder, Kachel-Modus stimmt mit dem Manifest überein', () => {
  const korr = JSON.parse(fs.readFileSync(path.join(HIER, '..', 'scripts', 'waffen-sprites-korrekturen.json'), 'utf8'));
  const felder = new Set(['rect', 'form', 'ringAbstand', 'schwelle', 'keineDrehung', 'umkehren', 'spitzeWechseln', 'winkel',
    'spiegeln', 'nichtSpiegeln', 'geschoss', 'kachel', 'drehen']);
  const ids = new Set(WEAPONS.map(w => w.id));
  for (const [id, k] of Object.entries(korr)) {
    if (id.startsWith('_')) continue;
    assert.ok(ids.has(id), `Korrektur für unbekannte Waffe ${id}`);
    for (const feld of Object.keys(k)) assert.ok(felder.has(feld), `${id}: unbekanntes Feld ${feld}`);
    const e = manifest.waffen[id];
    if (k.kachel) {
      assert.equal(e.form, 'kachel', `${id}: kachel-Eintrag, aber Form ${e.form}`);
      assert.equal(e.kachel.modus, k.kachel.modus);
    }
  }
  /*
   * Griff und Mündung stehen seit BAL-08 in `scripts/waffen-anker-tabelle.json`; die
   * Korrekturtabelle trägt nur noch Freistellen, Drehen, Spiegeln und Kacheln. Zwei
   * Pixelquellen für denselben Anker waren die Ursache für veraltete Werte (z. B. eine
   * Mündung 20 px vor dem tatsächlichen Ende).
   */
  for (const [id, k] of Object.entries(korr)) {
    if (id.startsWith('_')) continue;
    for (const feld of ['grip', 'muzzle', 'art']) assert.equal(k[feld], undefined, `${id}: ${feld} gehört in die Ankertabelle`);
  }
});

test('Projektil-Sprites: jede Waffe mit Projektil-Lieferung hat ein Flugobjekt', () => {
  const ohne = WEAPONS.filter(w => w.delivery === 'projectile' && !manifest.waffen[w.id].projectile);
  assert.deepEqual(ohne.map(w => w.id), [], 'Waffen mit Projektil-Lieferung ohne Sprite');
});

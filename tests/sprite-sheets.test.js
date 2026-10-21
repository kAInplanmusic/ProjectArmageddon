import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CHARACTERS } from '../src/shared/config/factions.js';

const WURZEL = path.join(import.meta.dirname, '..', 'src', 'client', 'assets', 'sprite-sheets');
const manifest = JSON.parse(fs.readFileSync(path.join(WURZEL, 'manifest.json'), 'utf8'));
const eintraege = Object.entries(manifest.figuren);

/** Breite und Höhe eines WebP aus dem Kopf (VP8, VP8L, VP8X). */
function webpMass(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const art = buf.toString('ascii', 12, 16);
  if (art === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (art === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

test('Manifest: alle 81 Figuren mit je zwei Sheets, Dateien vorhanden', () => {
  assert.equal(eintraege.length, 81);
  assert.equal(manifest.zelle, 256);
  assert.equal(manifest.spalten * manifest.zeilen, 8);
  for (const [, e] of eintraege) {
    assert.ok(fs.existsSync(path.join(WURZEL, e.walk)), e.walk);
    assert.ok(fs.existsSync(path.join(WURZEL, e.aktion)), e.aktion);
  }
});

test('Manifest: jede Figur der Fraktionen hat einen Eintrag', () => {
  for (const c of CHARACTERS) {
    if (!c.sprite) continue;
    assert.ok(manifest.figuren[`${c.faction}/${c.sprite.replace(/\.png$/, '')}`], c.id);
  }
});

test('Sheets: 1024 x 512 (4 x 2 Zellen à 256 px)', () => {
  for (const [, e] of eintraege) {
    for (const datei of [e.walk, e.aktion]) {
      assert.deepEqual(webpMass(fs.readFileSync(path.join(WURZEL, datei))), [1024, 512], datei);
    }
  }
});

test('Klassifikation: Rollen plausibel, ohne Doppelbelegung', () => {
  const zaehler = { idle: 0, hocke: 0, luft: 0, treffer: 0, tod: 0 };
  for (const [key, e] of eintraege) {
    const r = e.rollen;
    assert.ok(r && typeof r === 'object', key);
    const belegt = [];
    for (const [rolle, wert] of Object.entries(r)) {
      assert.ok(rolle in zaehler, `${key}: unbekannte Rolle ${rolle}`);
      const zellen = rolle === 'idle' ? wert : [wert];
      if (rolle === 'idle') assert.equal(wert.length, 2, key);
      for (const z of zellen) {
        assert.ok(Number.isInteger(z) && z >= 0 && z < 8, `${key}: Zelle ${z}`);
        belegt.push(z);
      }
      zaehler[rolle] += 1;
    }
    assert.equal(new Set(belegt).size, belegt.length, `${key}: Zelle doppelt belegt`);
    if (r.idle) assert.notEqual(r.idle[0], r.idle[1], key);
    if (e.gehen) {
      assert.equal(e.gehen.length, 8, key);
      assert.ok(e.gehen.every(i => Number.isInteger(i) && i >= 0 && i < 8), key);
      assert.ok(e.gehenOk >= 6 && e.gehenOk <= 8, `${key}: gehenOk`);
    }
  }
  // Die Heuristik trifft bei den meisten Figuren (der Rest fällt auf die Prozedur zurück).
  assert.ok(zaehler.tod >= 70, `tod ${zaehler.tod}`);
  assert.ok(zaehler.idle >= 70 && zaehler.luft >= 60 && zaehler.treffer >= 60, JSON.stringify(zaehler));
  assert.ok(eintraege.filter(([, e]) => e.gehen).length >= 75);
});

test('Klassifikation: Niedergestreckt liegt in Zelle 7 (Leserichtung der Vorlage), Idle in 0/1', () => {
  const mitTod7 = eintraege.filter(([, e]) => e.rollen.tod === 7).length;
  assert.ok(mitTod7 >= 70, `tod=7: ${mitTod7}`);
  const idle01 = eintraege.filter(([, e]) => e.rollen.idle?.[0] === 0 && e.rollen.idle?.[1] === 1).length;
  assert.ok(idle01 >= 55, `idle 0/1: ${idle01}`);
});

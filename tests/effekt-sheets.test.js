/**
 * Sprite-Atlanten der Effekte: Raster, Dateien, Grenzen, Verhalten ohne Bild (reine Anzeige).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  SheetEffekte, SHEETS, LEUCHT_KOMETEN, MAX_SHEET_EFFEKTE, frameRechteck, dauerBilder,
} from '../src/client/effektSheets.js';
import { FeuerOptik } from '../src/client/feuerOptik.js';
import { MAX_PARTIKEL } from '../src/client/effects.js';

const ORDNER = resolve(import.meta.dirname, '../src/client/assets/effekt-sheets');

function fakeCtx() {
  const aufrufe = [];
  return {
    aufrufe,
    save() {}, restore() {}, translate() {}, rotate() {},
    drawImage(...a) { aufrufe.push(a); },
  };
}

function effekte(urls = { explosion: 'e', glut: 'g', feuerring: 'f', leuchtgeschosse: 'l' }) {
  const e = new SheetEffekte({ bildBauer: () => ({ naturalWidth: 2048, naturalHeight: 2048 }) });
  e.setzeUrls(urls);
  e.vorladen();
  for (const eintrag of e.bilder.values()) eintrag.bereit = true;
  return e;
}

test('Dateien der Atlanten sind klein und vorhanden', () => {
  for (const d of ['explosion', 'glut', 'feuerring', 'leuchtgeschosse', 'feuerball', 'pilzwolke', 'muendung']) {
    const pfad = join(ORDNER, `${d}.webp`);
    assert.ok(existsSync(pfad), `${d}.webp fehlt`);
    assert.ok(statSync(pfad).size < 600_000, `${d}.webp zu groß`);
  }
  for (const s of Object.values(SHEETS)) assert.ok(existsSync(join(ORDNER, s.datei)));
});

test('frameRechteck liegt im Raster und bleibt im Bild', () => {
  for (const art of Object.keys(SHEETS)) {
    const s = SHEETS[art];
    for (let i = -2; i < s.frames.length + 3; i += 1) {
      const r = frameRechteck(art, i, 2048, 2048);
      assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.sw <= 2048.001 && r.sy + r.sh <= 2048.001, `${art} ${i}`);
    }
    assert.ok(dauerBilder(art) > 20);
  }
  assert.equal(frameRechteck('gibtsnicht', 0, 10, 10), null);
  assert.equal(frameRechteck('explosion', 0, 0, 0), null);
  assert.deepEqual(frameRechteck('explosion', 0, 2048, 2048), { sx: 256, sy: 0, sw: 256, sh: 256 });
});

test('Kometen-Rechtecke liegen im Bogen (490×446)', () => {
  for (const k of Object.values(LEUCHT_KOMETEN)) assert.ok(k.x + k.w <= 490 && k.y + k.h <= 446);
});

test('Ohne Bild oder bei reduzierter Bewegung startet nichts; es wirft nichts', () => {
  const leer = new SheetEffekte({ bildBauer: () => null });
  leer.setzeUrls({ explosion: 'x' });
  leer.vorladen();
  assert.equal(leer.einschlag(10, 10, 40), false);
  assert.doesNotThrow(() => { leer.fortschreiben(); leer.zeichne(fakeCtx()); });
  assert.equal(leer.zeichneFeuerring(fakeCtx(), 1, 1, 20, 3), false);
  assert.equal(leer.zeichneKomet(fakeCtx(), 'rot', 1, 1, 0, 30), false);
  const e = effekte();
  e.reduziert = true;
  assert.equal(e.einschlag(10, 10, 40), false);
  assert.equal(e.liste.length, 0);
});

test('Bildfolge läuft ab und räumt sich auf; große Einschläge haben Nachglühen', () => {
  const e = effekte();
  assert.equal(e.einschlag(100, 100, 50), true);
  assert.equal(e.liste.length, 2);
  const ctx = fakeCtx();
  e.zeichne(ctx);
  assert.equal(ctx.aufrufe.length, 1, 'verzögertes Nachglühen noch unsichtbar');
  for (let i = 0; i < dauerBilder('glut') + 30; i += 1) e.fortschreiben();
  assert.equal(e.liste.length, 0);
});

test('Höchstens MAX_SHEET_EFFEKTE zugleich, und das bleibt unter der Teilchengrenze', () => {
  assert.ok(MAX_SHEET_EFFEKTE <= MAX_PARTIKEL);
  const e = effekte();
  for (let i = 0; i < 100; i += 1) e.starte('explosion', i, i, 80);
  assert.equal(e.liste.length, MAX_SHEET_EFFEKTE);
  assert.ok(e.verworfen > 0);
});

test('FeuerOptik zeichnet mit Atlas höchstens MAX_RINGE Flammenringe und läuft ohne Atlas wie zuvor', () => {
  const ctxBasis = () => {
    const c = fakeCtx();
    for (const m of ['fillRect', 'beginPath', 'arc', 'fill']) c[m] = () => {};
    return c;
  };
  const f = new FeuerOptik();
  f.setzeKarte({ spalten: 100 }, 800, 600);
  for (let i = 0; i < 80; i += 1) f.flammen.set(i, 1);
  assert.doesNotThrow(() => f.zeichne(ctxBasis()));
  f.ringe = effekte();
  const ctx = ctxBasis();
  f.zeichne(ctx);
  const ringe = ctx.aufrufe.length;
  assert.ok(ringe > 0 && ringe <= 6, `${ringe} Ringe`);
});

test('Einschlag wählt nach Radius: kleiner Feuerball, Bildfolge dazwischen, Pilzwolke', () => {
  const alle = { explosion: 'e', glut: 'g', feuerring: 'f', leuchtgeschosse: 'l', feuerball: 'b', pilzwolke: 'p' };
  let e = effekte(alle);
  assert.equal(e.einschlag(10, 10, 14), true);
  assert.deepEqual(e.liste.map(q => q.art), ['feuerball']);
  e = effekte(alle);
  e.einschlag(10, 10, 50);
  assert.deepEqual(e.liste.map(q => q.art), ['explosion', 'glut']);
  e = effekte(alle);
  e.einschlag(10, 10, 100);
  assert.deepEqual(e.liste.map(q => q.art), ['pilzwolke']);
  // Ohne die neuen Bilder bleibt es bei der bisherigen Bildfolge.
  e = effekte();
  e.einschlag(10, 10, 100);
  assert.equal(e.liste[0].art, 'explosion');
});

test('Die Pilzwolke steht mit dem Fuß am Einschlagpunkt (Versatz nach oben)', () => {
  const e = effekte({ explosion: 'e', glut: 'g', feuerring: 'f', leuchtgeschosse: 'l', pilzwolke: 'p' });
  e.starte('pilzwolke', 100, 200, 100);
  e.fortschreiben();
  const ctx = fakeCtx();
  e.zeichne(ctx);
  const a = ctx.aufrufe[0];
  assert.equal(a[6], 200 - 50 - SHEETS.pilzwolke.versatzY * 100);
});

test('Mündungsfeuer: gedreht an die Mündung, Bild folgt dem Leben, Variante je Figur; ohne Bild oder bei reduzierter Bewegung nichts', () => {
  const e = effekte({ explosion: 'e', glut: 'g', feuerring: 'f', leuchtgeschosse: 'l', muendung: 'm' });
  const ctx = fakeCtx();
  const gedreht = [];
  ctx.rotate = w => gedreht.push(w);
  ctx.translate = () => {};
  assert.equal(e.zeichneMuendung(ctx, 10, 20, Math.PI / 4, 1, 7, 1), true);
  assert.equal(gedreht[0], -Math.PI / 4);
  const erstes = ctx.aufrufe[0];
  assert.equal(erstes[1], 0, 'volles Leben: erstes Bild (Blitz)');
  e.zeichneMuendung(ctx, 10, 20, 0, 0.1, 7, 1);
  assert.equal(ctx.aufrufe[1][1], 3 * (2048 / 4), 'fast verbraucht: letztes Bild');
  assert.equal(ctx.aufrufe[1][2], (7 % SHEETS.muendung.zeilen) * (2048 / SHEETS.muendung.zeilen), 'Variante 7 → Zeile 2');
  e.reduziert = true;
  assert.equal(e.zeichneMuendung(ctx, 0, 0, 0, 1, 0, 1), false);
  assert.equal(effekte().zeichneMuendung(ctx, 0, 0, 0, 1, 0, 1), false, 'ohne geladenes Bild');
});

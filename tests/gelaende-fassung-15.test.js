/**
 * Geländefassung 15 (TODO 2.3): Durchgangstor `shared/kartenTor.pruefeDurchgaenge`.
 *
 * Geprüft wird: Versionsmarke; das Tor an einer gebauten Karte (Raum hinter einem Spalt: zu schmal → abgelehnt, breit genug → ok;
 * ein Keil unter einem Überhang zählt nicht); bestandene Karten bleiben Bit für Bit die der Fassung 14; der Fund (Menü-Seed 3,
 * 1321 px abgeschnittener Boden) baut in 15 eine andere Karte ohne den Mangel. Die Schwelle selbst ist gemessen
 * (`scripts/messung-kartenqualitaet.mjs`), nicht Gegenstand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GELAENDE_DURCHGANG, GELAENDE_RUND, GELAENDE_STANDARD, normalisiereGelaende } from '../src/shared/config/gelaende.js';
import { pruefeDurchgaenge, TOR_LAUF_MAX } from '../src/shared/kartenTor.js';
import { neuesMatch } from '../scripts/bot-partien.mjs';

test('Marke: 15 ist gültig (Standard 19), 14 bleibt gültig', () => {
  assert.equal(GELAENDE_DURCHGANG, 15);
  assert.equal(GELAENDE_STANDARD, GELAENDE_DURCHGANG + 4, 'Standard ist 19 (Zonengewichte)');
  assert.equal(normalisiereGelaende(15), 15);
  assert.equal(normalisiereGelaende(14), GELAENDE_RUND);
});

/**
 * Gebaute Karte 800 × 400: Boden bei y = 380, eine Decke (y 200 bis 240) über der rechten Hälfte; die Figuren stehen links.
 * Unter der Decke liegt eine Halle (y 240 bis 380). Ihr einziger Zugang ist ein senkrechter Spalt von `spalt` px Breite
 * durch die Decke; links ist die Halle durch eine Wand geschlossen.
 */
function halle(spalt) {
  const w = 800; const h = 400;
  const b = new Uint8Array(w * h);
  const fest = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b[y * w + x] = 1; };
  fest(0, 380, w, h); // Boden
  fest(380, 200, w, 240); // Decke rechts
  fest(380, 240, 400, 380); // Wand links der Halle
  for (let y = 200; y < 240; y++) for (let x = 600; x < 600 + spalt; x++) b[y * w + x] = 0; // Spalt
  return { b, w, h, starts: [{ x: 100, y: 369 }, { x: 250, y: 369 }] };
}

test('Tor: Halle hinter einem 6 px schmalen Spalt wird abgelehnt, hinter 40 px nicht', () => {
  const eng = halle(6);
  const r = pruefeDurchgaenge(eng.b, eng.w, eng.h, eng.starts);
  assert.equal(r.ok, false);
  assert.ok(r.lauf >= TOR_LAUF_MAX, `Lauf ${r.lauf}`);
  assert.match(r.grund, /dünner ist als eine Figur/);
  const weit = halle(40);
  assert.equal(pruefeDurchgaenge(weit.b, weit.w, weit.h, weit.starts).ok, true);
});

test('Tor: ohne Decke (offenes Feld) und mit einem kleinen Keil unter einem Überhang besteht die Karte', () => {
  const w = 600; const h = 300; const b = new Uint8Array(w * h);
  for (let y = 280; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = 1;
  const starts = [{ x: 100, y: 269 }, { x: 500, y: 269 }];
  assert.equal(pruefeDurchgaenge(b, w, h, starts).ok, true);
  // Überhang: eine Platte 14 px über dem Boden, 60 px breit (Keil, den keine Figur betritt).
  for (let y = 260; y < 266; y++) for (let x = 300; x < 360; x++) b[y * w + x] = 1;
  const r = pruefeDurchgaenge(b, w, h, starts);
  assert.equal(r.ok, true, `Lauf ${r.lauf}`);
});

const kartenHash = m => createHash('sha1').update(m.bitmap).digest('hex').slice(0, 12);
const karte = (seed, gelaende) => { const m = neuesMatch(seed, 4, { teams: 2, proTeam: 3, extra: { gelaende } }); m.start(); return m; };

test('Bestandene Karten sind in 15 Bit für Bit die der Fassung 14', () => {
  for (const seed of [1, 2, 4, 5, 6, 7, 8, 9]) {
    assert.equal(kartenHash(karte(seed, GELAENDE_DURCHGANG)), kartenHash(karte(seed, GELAENDE_RUND)), `Seed ${seed}`);
  }
});

test('Fund Seed 3: Fassung 14 hat den abgeschnittenen Boden, 15 zieht neu und besteht', () => {
  const alt = karte(3, GELAENDE_RUND);
  const neu = karte(3, GELAENDE_DURCHGANG);
  const starts = m => m.getState().entities.filter(e => e.teamId !== undefined).map(e => ({ x: e.x, y: e.y }));
  assert.equal(pruefeDurchgaenge(alt.bitmap, alt.width, alt.height, starts(alt)).ok, false, 'Fassung 14: Mangel');
  assert.notEqual(kartenHash(neu), kartenHash(alt));
  assert.equal(pruefeDurchgaenge(neu.bitmap, neu.width, neu.height, starts(neu)).ok, true, 'Fassung 15: ohne Mangel');
});

test('Rand: Land unter offenem Himmel dicht am oberen Kartenrand wird abgelehnt, Höhlendecke und genug Kopfhöhe nicht', async () => {
  const { landAmOberenRand } = await import('../src/shared/terrainGen3.js');
  const w = 400; const h = 200;
  const mitPlateau = (oben, breite) => {
    const b = new Uint8Array(w * h);
    for (let y = 150; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = 1;
    for (let y = oben; y < 150; y++) for (let x = 100; x < 100 + breite; x++) b[y * w + x] = 1;
    return b;
  };
  assert.match(landAmOberenRand(mitPlateau(20, 40), w, h)?.grund ?? '', /oberen Kartenrand/, 'Plateau 20 px unter dem Rand');
  assert.equal(landAmOberenRand(mitPlateau(20, 10), w, h), null, 'schmale Spitze (10 px) ist kein Stand');
  assert.equal(landAmOberenRand(mitPlateau(60, 40), w, h), null, '60 px Kopfhöhe reichen');
  const hoehle = mitPlateau(20, 40);
  for (let x = 0; x < w; x++) hoehle[x] = 1; // feste Decke (oberste Zeile)
  assert.equal(landAmOberenRand(hoehle, w, h), null, 'Höhle mit Decke');
});

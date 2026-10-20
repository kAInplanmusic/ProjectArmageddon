import assert from 'node:assert/strict';
import test from 'node:test';
import { Zerstoerung } from '../src/engine/zerstoerung.js';
import { CollisionMask } from '../src/engine/terrain/collisionMask.js';
import { applyLogEntryToTerrain } from '../src/client/terrainPreview.js';
import {
  ZERSTOERUNG_STOFF, ZERSTOERUNG_HANG, ZERSTOERUNG_STANDARD, normalisiereZerstoerung, HANG_STEILHEIT,
} from '../src/shared/config/zerstoerung.js';
import { STOFF, stoffByKey } from '../src/shared/config/stoffe.js';

/**
 * Hangrutsch (Zerstörung Fassung 6): Sand, Schnee und Asche setzen sich nach einem Einschlag,
 * Fels, Metall, Grundgestein und Erde bleiben stehen. Fassung 5 kennt ihn nicht.
 */

const B = 900;
const H = 700;
const ZELLE = 8;

function zackenBoden() {
  const bitmap = new Uint8Array(B * H);
  for (let x = 0; x < B; x++) {
    const oben = 400 - (Math.floor(x / 6) % 2 === 0 ? 12 : 0);
    for (let y = oben; y < H; y++) bitmap[y * B + x] = 1;
  }
  return bitmap;
}

function karteAusStoff(id) {
  const spalten = Math.ceil(B / ZELLE);
  const zeilen = Math.ceil(H / ZELLE);
  return { feld: new Uint8Array(spalten * zeilen).fill(id), spalten, zeilen, zelle: ZELLE, breite: B, hoehe: H, geschuetzt: null };
}

function stubWelt() {
  return { isActive: () => false, getEntitiesBySignature: () => [], getComponent: () => 0, setComponent() {}, getSystem: () => null };
}

function lauf(stoffKey, fassung, bitmap = zackenBoden()) {
  const maske = CollisionMask.fromBitmap(bitmap, B, H);
  const ereignisse = [];
  const z = new Zerstoerung({
    terrain: maske, world: stubWelt(), events: { emit: (type, payload) => ereignisse.push({ type, payload }) },
    turrets: new Map(), fassung, stoffe: karteAusStoff(stoffByKey(stoffKey).id),
  });
  z.krater(450, 380, 16, 100, 'sprengung');
  const nachKrater = zaehle(maske);
  for (let t = 0; t < 80; t++) z.schritt();
  return { maske, z, ereignisse, nachKrater, bitmap };
}

function zaehle(maske) {
  let n = 0;
  for (let x = 0; x < B; x++) for (let y = 0; y < H; y++) if (maske.isSolid(x, y)) n += 1;
  return n;
}

const rutsche = e => e.filter(x => x.type === 'terrain_slumped');

test('Fassung 6 ist die Standardfassung und wird erkannt', () => {
  assert.equal(ZERSTOERUNG_STANDARD, 7);
  assert.equal(normalisiereZerstoerung(ZERSTOERUNG_HANG), ZERSTOERUNG_HANG);
  assert.equal(normalisiereZerstoerung(ZERSTOERUNG_STOFF), ZERSTOERUNG_STOFF);
  assert.deepEqual(Object.keys(HANG_STEILHEIT).sort(), ['asche', 'sand', 'schnee']);
});

for (const key of ['sand', 'schnee', 'asche']) {
  test(`Hangrutsch: ${key} rutscht nach, Masse bleibt, Client-Nachbau zellengleich, kein Beben`, () => {
    const { maske, z, ereignisse, nachKrater, bitmap } = lauf(key, ZERSTOERUNG_HANG);
    const r = rutsche(ereignisse);
    assert.ok(r.length >= 1, 'kein Rutsch');
    assert.ok(r[0].payload.zuege.length >= 4 && r[0].payload.zuege.length % 4 === 0);
    assert.equal(ereignisse.filter(e => e.type === 'terrain_quake').length, 0);
    assert.equal(zaehle(maske), nachKrater, 'Zellen wandern nur');
    const terrain = { bitmap: bitmap.slice(), width: B, height: H, mask: CollisionMask.fromBitmap(bitmap, B, H) };
    for (const eintrag of maske.craterLog) applyLogEntryToTerrain(terrain, eintrag);
    let abw = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) if (Boolean(terrain.bitmap[y * B + x]) !== maske.isSolid(x, y)) abw += 1;
    assert.equal(abw, 0);
    assert.equal(z.faellt, 0);
  });
}

for (const key of ['fels', 'metall', 'grundgestein', 'erde', 'obsidian']) {
  test(`Hangrutsch: ${key} bleibt stehen`, () => {
    const { ereignisse } = lauf(key, ZERSTOERUNG_HANG);
    assert.equal(rutsche(ereignisse).length, 0);
  });
}

test('Fassung 5 kennt keinen Hangrutsch, auch nicht auf Sand', () => {
  assert.equal(rutsche(lauf('sand', ZERSTOERUNG_STOFF).ereignisse).length, 0);
});

test('Hangrutsch ist deterministisch', () => {
  const a = lauf('sand', ZERSTOERUNG_HANG).maske.craterLog;
  const b = lauf('sand', ZERSTOERUNG_HANG).maske.craterLog;
  assert.deepEqual(a, b);
  assert.equal(STOFF.SAND, stoffByKey('sand').id);
});

test('Pflanzen auf gerutschten Zellen brechen ab, andere bleiben', async () => {
  const { entfernePflanzenAufRutsch } = await import('../src/client/pflanzen.js');
  const liste = [{ x: 100, y: 200 }, { x: 140, y: 200 }, { x: 101, y: 260 }];
  const weg = [];
  assert.equal(entfernePflanzenAufRutsch(liste, [100, 199, 101, 205], weg), true);
  assert.deepEqual(liste, [{ x: 140, y: 200 }, { x: 101, y: 260 }]);
  assert.equal(weg.length, 1);
  assert.equal(entfernePflanzenAufRutsch(liste, [], null), false);
});

/**
 * Online-Synchronisation von Einschlägen und Terrainereignissen.
 *
 * Belegt vier Dinge:
 *  1. `klassifiziereEinschlag`: Wasser, Land, Rand.
 *  2. Lokal (echtes `WaterField` des Matches) und online (Wasserlinie aus dem Seed, wie der
 *     Client sie nachbaut) liefern für denselben Zustand dieselbe Klassifikation.
 *  3. Die Engine trägt das Material im Ereignis `explosion`.
 *  4. Lokal und online lösen aus denselben Ereignissen dieselben Anzeigen und Klänge aus;
 *     jedes Online-Ereignis wirkt genau einmal (Dedup), auch bei wiederholter Zustellung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  klassifiziereEinschlag, wasserAusLinie, materialDesBioms, materialAusEreignis, WASSER_ZELLE, EINSCHLAG_SONDE,
} from '../src/shared/einschlag.js';
import { MatchController, WATER_SCALE } from '../src/engine/match.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { verarbeiteLokal, verarbeiteOnline, EreignisDedup } from '../src/client/ereignisse.js';

/** Kleine Welt: Boden ab y=100, ein Hügel (fest) bei x 40..59 ab y=60; Wasserlinie y=80. */
function mini() {
  const fest = (x, y) => y >= 100 || (x >= 40 && x < 60 && y >= 60);
  return { terrain: { isSolid: fest }, linie: 80 };
}

test('WASSER_ZELLE ist die Zellgröße der Engine', () => {
  assert.equal(WASSER_ZELLE, WATER_SCALE);
});

test('klassifiziereEinschlag: Wasser, Land und Rand', () => {
  const { terrain, linie } = mini();
  const wasser = wasserAusLinie(terrain, linie);
  // Wasser: im See (über dem Grund, unter der Linie) und auf dem Seegrund (Sonde darüber).
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 90), 'wasser');
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 100), 'wasser');
  // Land: der Hügel über der Wasserlinie, trockener Himmel.
  assert.equal(klassifiziereEinschlag(terrain, wasser, 50, 60), 'erde');
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 20), 'erde');
  // Rand: der Hügelfuß liegt unter der Wasserlinie, aber im Fels (fest) — kein Wasser im Fels,
  // die Sonde darüber trifft den Hügel, nicht den See.
  assert.equal(klassifiziereEinschlag(terrain, wasser, 50, 90), 'erde');
  // Rand: genau auf der Wasserlinie über dem Grund ist es Wasser, eine Sondenlänge darüber noch nicht.
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 80), 'wasser');
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 80 - EINSCHLAG_SONDE - 1), 'erde');
  // Außerhalb der Karte (kein Feld dort) und ungültige Werte werfen nicht.
  assert.equal(klassifiziereEinschlag(terrain, wasser, -50, 90), 'erde');
  assert.equal(klassifiziereEinschlag(terrain, wasser, NaN, undefined), 'erde');
  assert.equal(klassifiziereEinschlag(null, null, 5, 5), 'erde');
  // Fels folgt dem Biom, Wasser schlägt Fels.
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 20, { biomId: 'alpine' }), 'fels');
  assert.equal(klassifiziereEinschlag(terrain, wasser, 10, 90, { biomId: 'alpine' }), 'wasser');
  assert.equal(materialDesBioms('caverns'), 'fels');
  assert.equal(materialAusEreignis({ material: 'wasser' }), 'wasser');
  assert.equal(materialAusEreignis({ material: 'lava' }), null);
  assert.equal(materialAusEreignis({}), null);
});

for (const kartentyp of [null, 'autonom']) {
  test(`Lokal (echtes Wasserfeld) und online (Wasserlinie aus Seed) klassifizieren gleich — ${kartentyp ?? 'Gelände-Preset'}`, () => {
    const seed = 1;
    const match = new MatchController({
      seed, teams: 2, playersPerTeam: 1, preset: 'hills', kartentyp, turnDurationMs: 1_000_000,
    });
    match.start();
    const client = buildTerrainForSeed(seed, 'hills', 'landscape', kartentyp, { gelaende: match.gelaende });
    assert.equal(client.width, match.width);
    const lokal = (x, y) => klassifiziereEinschlag(match.terrain, match.water, x, y, { biomId: match.biomId });
    const online = (x, y) => klassifiziereEinschlag(client.mask, wasserAusLinie(client.mask, client.waterLevel), x, y, { biomId: match.biomId });

    let wasser = 0;
    let land = 0;
    for (let x = 3; x < match.width; x += 37) {
      for (let y = 3; y < match.height; y += 41) {
        const a = lokal(x, y);
        assert.equal(online(x, y), a, `Punkt ${x},${y}`);
        if (a === 'wasser') wasser += 1; else land += 1;
      }
    }
    assert.ok(wasser > 0 && land > 0, `Die Probe muss beides treffen (Wasser ${wasser}, Land ${land})`);
  });
}

test('Die Engine trägt das Material im Ereignis explosion', () => {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  const spieler = match.getState().entities[0];
  match.world.setComponent(spieler.entityId, 'Position', 'x', 200);
  match.world.setComponent(spieler.entityId, 'Position', 'y', match.surfaceYAt(200) - 12);
  match.inventory.register(spieler.entityId, ['pa_002']);
  match.inventory.selectWeapon(spieler.entityId, 'pa_002');
  assert.equal(match.fire(spieler.entityId, Math.PI / 4, 100, 'pa_002').ok, true);
  const gesammelt = [];
  for (let i = 0; i < 600 && match.activeProjectileCount > 0; i += 1) {
    match.step();
    gesammelt.push(...match.consumeEvents());
  }
  const explosion = gesammelt.find(e => e.type === 'explosion');
  assert.ok(explosion, 'Vorbedingung: ein Einschlag');
  assert.ok(['wasser', 'fels', 'erde'].includes(explosion.payload.material), `Material ${explosion.payload.material}`);
});

/** Serverfelder, die nur die Leitung kennt (Art, Runde, Takt), zählen für den Vergleich nicht. */
const ohneLeitung = (key, wert) => (key === 't' || key === 'round' || key === 'tk' ? undefined : wert);

/** Kontext, der alle Wirkungen mitschreibt. */
function spion(art) {
  const log = [];
  const k = {
    renderer: new Proxy({}, { get: (_, name) => (...a) => log.push(['renderer', String(name), JSON.stringify(a, ohneLeitung)]) }),
    sound: { verarbeite: e => { log.push(['sound', e.type, e.material ?? null]); return true; } },
    karte: art === 'online' ? new Proxy({}, { get: (_, name) => (...a) => log.push(['karte', String(name), JSON.stringify(a, ohneLeitung)]) }) : null,
    hud: { log() {} },
    material: () => 'erde',
    figurNah: () => false,
    nameOf: () => 'P',
    findEntity: () => null,
    shotPredictor: { resolve() {} },
    drawHitscanBeam() {},
    logSpecialEffect() {},
    showGuentherWheel() {},
    showEndScreen() {},
    fernzustand: { status: () => 'playing', setzeStatus() {}, setzeSieger() {}, setzeEinschnitt() {} },
    match: art === 'online' ? undefined : { players: [] },
  };
  return { k, log };
}

const RUNS = [100, 50, 60, 101, 50, 60];
const FOLGE = [
  ['explosion', { x: 120, y: 340, radius: 30, material: 'wasser' }],
  ['terrain_detached', { id: 7, runs: RUNS }],
  ['terrain_settled', { id: 7, dy: 12, runs: RUNS }],
  ['terrain_removed', { runs: RUNS, art: 'bruch' }],
  ['terrain_crumble', { x: 100, y: 55, teile: [], staerke: 0.5 }],
];

test('Lokal und online lösen aus denselben Ereignissen dieselbe Anzeige und denselben Klang aus', () => {
  const lokal = spion('lokal');
  const online = spion('online');
  for (const [typ, n] of FOLGE) {
    verarbeiteLokal(lokal.k, { type: typ, payload: n });
    verarbeiteOnline(online.k, { t: typ, ...n });
  }
  const ohneKarte = zeilen => zeilen.filter(z => z[0] !== 'karte');
  assert.deepEqual(ohneKarte(online.log), ohneKarte(lokal.log));
  const klaenge = lokal.log.filter(z => z[0] === 'sound');
  assert.deepEqual(klaenge, [
    ['sound', 'explosion', 'wasser'], ['sound', 'truemmer', null], ['sound', 'insel_gelandet', null],
  ], 'Einsturz und Einschlag klingen genau einmal, mit dem Material aus dem Ereignis');
  assert.ok(lokal.log.some(z => z[1] === 'starteInsel') && lokal.log.some(z => z[1] === 'landeInsel'));
});

test('Online wirkt jedes Ereignis genau einmal, auch bei wiederholter Zustellung', () => {
  const { k, log } = spion('online');
  k.dedup = new EreignisDedup(8);
  const nachrichten = [
    { t: 'explosion', x: 10, y: 20, radius: 30, material: 'erde', tk: 500, projectile: 3 },
    { t: 'terrain_detached', id: 1, runs: RUNS, tk: 500 },
    { t: 'terrain_settled', id: 1, dy: 5, runs: RUNS, tk: 560 },
  ];
  const klaenge = () => log.filter(z => z[0] === 'sound').length;
  for (const m of nachrichten) verarbeiteOnline(k, m);
  assert.equal(klaenge(), 3);
  // Wiederholung (Wiederverbindung, Nachlieferung): keine zusätzliche Wirkung.
  for (const m of nachrichten) verarbeiteOnline(k, m);
  assert.equal(klaenge(), 3, 'zweite Zustellung bleibt stumm');
  // Zwei verschiedene Einschläge im selben Takt am selben Ort (zwei Geschosse) zählen beide.
  verarbeiteOnline(k, { ...nachrichten[0], projectile: 4 });
  assert.equal(klaenge(), 4);
  // Anderer Takt, gleicher Ort: ein neuer Einschlag.
  verarbeiteOnline(k, { ...nachrichten[0], tk: 501 });
  assert.equal(klaenge(), 5);
  // Ohne Takt (älterer Server) wird nie unterdrückt: lieber doppelt als gar nicht.
  const ohne = { t: 'explosion', x: 1, y: 2, radius: 30 };
  verarbeiteOnline(k, ohne);
  verarbeiteOnline(k, ohne);
  assert.equal(klaenge(), 7);
  // Das Gedächtnis ist begrenzt und lässt sich zurücksetzen (neue Sitzung, Takte zählen von vorn).
  k.dedup.zuruecksetzen();
  verarbeiteOnline(k, nachrichten[0]);
  assert.equal(klaenge(), 8);
});

test('Ein Einschlag ohne Materialfeld wird aus dem bekannten Zustand abgeleitet', () => {
  const { k, log } = spion('online');
  k.material = () => 'wasser';
  verarbeiteOnline(k, { t: 'explosion', x: 1, y: 2, radius: 30 });
  assert.deepEqual(log.filter(z => z[0] === 'sound'), [['sound', 'explosion', 'wasser']]);
});

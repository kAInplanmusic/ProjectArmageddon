/**
 * Gelände-Fassung 8 („Klar“, TODO N-29 und UI-8): je Biom ein Leitstoff und eine Kontrastader, begehbare Ruinen auf den
 * Bauteilkarten, Start nur auf einer großen Landmasse.
 *
 * Geprüft wird (1) die Marke, (2) die Rezepte (eine Ader, Kristall und Grau-Fels nur als Leitstoff), (3) die Fehlerfälle aus
 * `check:biome` und `check-erreichbarkeit` in der neuen Fassung und (4) dass Fassung 7 Bit für Bit gleich bleibt: Die Goldwerte
 * stammen aus einer Messung auf `main` VOR der Fassung 8 (2026-11-03; Zustandshash nach 240 Ticks, Stoffhash, Replay über 2400 Ticks).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { stoffHash } from '../src/shared/stoffkarte.js';
import {
  GELAENDE_BIOME_20, GELAENDE_KLAR, GELAENDE_STANDARD, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';
import { REZEPTE_KLAR } from '../src/shared/config/stoff-rezepte-klar.js';
import { REZEPTE_MATERIAL } from '../src/shared/config/stoff-rezepte-material.js';
import { rezeptFuer } from '../src/shared/config/stoff-rezepte.js';
import { stoffByKey } from '../src/shared/config/stoffe.js';
import { WET_LEVEL } from '../src/shared/config/water.js';
import { WAFFEN_WIND } from '../src/shared/config/waffen-fassung.js';

test('Marke: Fassung 8 ist gültig, 7 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_KLAR, 8);
  // Seit Fassung 9 (`gelaende-fassung-9.test.js`, kein Start im Schacht) ist der Standard höher; Fassung 8 bleibt gültig.
  assert.ok(GELAENDE_STANDARD >= GELAENDE_KLAR);
  assert.equal(normalisiereGelaende(GELAENDE_BIOME_20), GELAENDE_BIOME_20);
  assert.equal(normalisiereGelaende(8), 8);
  assert.equal(normalisiereGelaende(10), GELAENDE_STANDARD);
});

/** Wo Kristall-Violett oder Grau-Fels der Leitstoff ist (N-29). */
const KRISTALL_ERLAUBT = new Set(['kristallhoehle', 'schwebinseln', 'burg', 'kristallwald', 'kristallarchipel', 'dimensionsriss']);
const FELS_ERLAUBT = new Set(['alpine', 'caverns', 'planet_stein']);

test('Rezepte der Fassung 8: ein Leitstoff, genau eine Kontrastader, Kristall und Grau-Fels nur als Leitmaterial', () => {
  for (const [id, r] of Object.entries(REZEPTE_KLAR)) {
    assert.equal(r.adern.length, 1, `${id}: genau eine Ader`);
    const stoffe = [...r.deck.map(([s]) => s), r.kern, r.adern[0].stoff, ...(r.platten ? [r.platten.stoff] : [])];
    for (const s of stoffe) assert.ok(stoffByKey(s), `${id}: Stoff ${s} unbekannt`);
    assert.notEqual(r.adern[0].stoff, r.kern, `${id}: die Ader hebt sich vom Kern ab`);
    if (!KRISTALL_ERLAUBT.has(id)) for (const s of stoffe) assert.ok(!/kristall/.test(s) || s === 'leuchtkristall' || s === 'zeitkristall' || s === 'klareiskristall', `${id}: ${s} ist nicht Leitmaterial`);
    if (!FELS_ERLAUBT.has(id)) for (const s of stoffe) assert.notEqual(s, 'fels', `${id}: Grau-Fels ist nicht Leitmaterial`);
  }
  for (const id of Object.keys(REZEPTE_MATERIAL)) {
    assert.equal(rezeptFuer(id, GELAENDE_BIOME_20), REZEPTE_MATERIAL[id], `${id}: Fassung 7 unverändert`);
    assert.equal(rezeptFuer(id, GELAENDE_KLAR), REZEPTE_KLAR[id], `${id}: Fassung 8 hat ein klares Rezept`);
  }
});

const START = (seed, biom, teams, ppt, gelaende) => {
  const m = new MatchController({ seed, teams, playersPerTeam: ppt, kartentyp: 'autonom', biom, maxRounds: 2, gelaende, zerstoerung: 5 });
  m.start();
  return m;
};

// [seed, biom, teams, playersPerTeam, Zustandshash nach 240 Ticks, Stoffhash, Erreichbarkeit] – gemessen vor Fassung 8.
const GOLD_7 = [
  [4242, 'vulkan', 2, 2, '944e6ef2', 1301965849, true], [4242, 'schlackeschmiede', 2, 2, '944e6ef2', 2482557536, true],
  [4242, 'kristallhoehle', 2, 2, '944e6ef2', 353714489, true], [4242, 'klassisch', 2, 2, '944e6ef2', 3835963664, true],
  [4242, 'planet', 2, 2, '9240bf10', 989170906, true], [1224883, 'schlackeschmiede', 2, 2, 'b235894f', 3558510847, true],
  [4, 'eiswueste', 2, 1, 'fdc2e647', 1586655795, false], [69, 'kosmos', 2, 2, '4bf936f6', 3260596403, false],
  [107, 'klassisch', 4, 2, '19c5f0e1', 850207227, false], [240, 'klassisch', 2, 1, 'b0f452f', 2752554806, false],
];

test('Fassung 7 bleibt Bit für Bit gleich (Goldwerte von vor Fassung 8, auch die alten UI-8-Fehlerfälle)', () => {
  for (const [seed, biom, teams, ppt, hash, stoff, ok] of GOLD_7) {
    const m = START(seed, biom, teams, ppt, GELAENDE_BIOME_20);
    for (let i = 0; i < 240; i += 1) { m.step(); m.consumeEvents(); }
    const name = `${seed} ${biom} ${teams}x${ppt}`;
    assert.equal(m.stateHash(), hash, `${name}: Zustandshash`);
    assert.equal(stoffHash(m.stoffkarte), stoff, `${name}: Stoffhash`);
    assert.equal(m.erreichbarkeit?.ok, ok, `${name}: Erreichbarkeit`);
  }
});

test('UI-8: Die Fälle mit karte_unerreichbar starten in Fassung 8 erreichbar', () => {
  for (const [seed, biom, teams, ppt] of [[4, 'eiswueste', 2, 1], [69, 'kosmos', 2, 2], [69, 'kosmos', 4, 2], [107, 'klassisch', 4, 2], [240, 'klassisch', 2, 1]]) {
    const m = START(seed, biom, teams, ppt, GELAENDE_KLAR);
    const ereignisse = m.consumeEvents().map((e) => e.type ?? e.name);
    assert.equal(m.erreichbarkeit?.ok, true, `${seed} ${biom} ${teams}x${ppt}: ${m.erreichbarkeit?.grund}`);
    assert.ok(!ereignisse.includes('karte_unerreichbar'), `${seed} ${biom}: kein karte_unerreichbar`);
  }
});

/** Wie `check:biome`: Anteil der trockenen Kistenplätze, die zu Fuß (Stufe ≤ 10 px, Fall beliebig) von einem Startplatz erreichbar sind. */
function kistenAnteil(m) {
  const B = m.width;
  const o = new Int32Array(B);
  const trocken = new Uint8Array(B);
  for (let x = 0; x < B; x += 1) {
    const y = m.surfaceYAt(x);
    o[x] = y;
    trocken[x] = y > 0 && y < m.height && m.waterLevelAt(x, y - 14) < WET_LEVEL ? 1 : 0;
  }
  const erreicht = new Uint8Array(B);
  const stapel = [];
  for (const e of m.getState().entities ?? []) {
    if (!e.alive || e.type === 'crate') continue;
    const x = Math.max(0, Math.min(B - 1, Math.round(e.x)));
    if (trocken[x] && !erreicht[x]) { erreicht[x] = 1; stapel.push(x); }
  }
  while (stapel.length) {
    const x = stapel.pop();
    for (const nx of [x - 1, x + 1]) {
      if (nx < 0 || nx >= B || erreicht[nx] || !trocken[nx] || o[x] - o[nx] > 10) continue;
      erreicht[nx] = 1;
      stapel.push(nx);
    }
  }
  let t = 0;
  let r = 0;
  for (let i = 0; i < 24; i += 1) {
    const x = Math.round(B * (0.08 + 0.84 * (i + 0.5) / 24));
    if (!trocken[x]) continue;
    t += 1;
    if (erreicht[x]) r += 1;
  }
  return t ? r / t : 1;
}

test('check:biome: Die Ruinenstadt (Seed 1224883 Schlackeschmiede, 951031 Pilzwald, 1080350 Vulkan) ist in Fassung 8 zu Fuß durchquerbar', () => {
  for (const [seed, biom] of [[1224883, 'schlackeschmiede'], [951031, 'pilzwald'], [1080350, 'vulkan']]) {
    assert.ok(kistenAnteil(START(seed, biom, 2, 2, GELAENDE_BIOME_20)) < 0.5, `${seed} ${biom}: Fassung 7 bleibt wie gemessen`);
    const anteil = kistenAnteil(START(seed, biom, 2, 2, GELAENDE_KLAR));
    assert.ok(anteil >= 0.5, `${seed} ${biom}: nur ${(anteil * 100).toFixed(0)} % der Kistenplätze erreichbar`);
  }
});

function aufzeichnenUndAbspielen(extra) {
  const kopf = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 };
  const live = new MatchController({ ...kopf, ...extra });
  live.start();
  const rec = new ReplayRecorder({ ...kopf, ...extra, turnDurationMs: live.turnDurationMs, kit: live.kit, schaden: live.schaden, zerstoerung: live.zerstoerung, waffen: live.waffen, kisten: live.kisten });
  let schuesse = 0;
  for (let tick = 0; tick < 2400; tick += 1) {
    if (live.activeProjectileCount === 0 && tick % 120 === 0) {
      const id = live.activePlayerId;
      const winkel = 0.5 + (schuesse % 9) * 0.15;
      const kraft = 40 + ((schuesse * 13) % 50);
      const waffe = live.inventory.getActiveWeaponId(id);
      if (live.fire(id, winkel, kraft, waffe).ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
      schuesse += 1;
    }
    live.step();
    live.consumeEvents();
  }
  rec.finalize(live.world.tickCount);
  const json = rec.serialize();
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(json));
  while (!spieler.finished) spieler.advance?.() ?? spieler.step?.();
  return { live: live.stateHash(), replay: spieler.match.stateHash(), kopf: JSON.parse(json).config, sonder: live.sonderbiom };
}

test('Alter Replay (Marke 7): Kopf behält die 7, Wiedergabe endet im Goldwert von vor Fassung 8', () => {
  const gold = [
    [{ gelaende: 7, waffen: WAFFEN_WIND }, '4913d98d', null],
    [{ gelaende: 7, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'vulkan' }, 'c49352ec', 'vulkan'],
    [{ gelaende: 7, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'schlackeschmiede' }, '3ad77510', 'schlackeschmiede'],
    [{ gelaende: 7, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'planet' }, 'bf3659a9', 'planet_stein'],
  ];
  for (const [extra, hash, sonder] of gold) {
    const r = aufzeichnenUndAbspielen(extra);
    assert.equal(r.kopf.gelaende, 7, 'die Marke wird nicht auf 8 angehoben');
    assert.equal(r.sonder, sonder);
    assert.equal(r.live, hash, `${JSON.stringify(extra)}: Live-Hash`);
    assert.equal(r.replay, hash, `${JSON.stringify(extra)}: Wiedergabe-Hash`);
  }
});

test('Neuer Replay (Marke 8): Kopf trägt die 8, Wiedergabe endet im Live-Hash', () => {
  for (const biom of ['schlackeschmiede', 'riff']) {
    const r = aufzeichnenUndAbspielen({ gelaende: GELAENDE_KLAR, kartentyp: 'autonom', biom });
    assert.equal(r.kopf.gelaende, GELAENDE_KLAR, biom);
    assert.equal(r.replay, r.live, `${biom}: Wiedergabe gegen live`);
  }
});

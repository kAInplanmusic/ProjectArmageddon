/**
 * Gelände-Fassung 9 („ohne Schacht“): Pilzwald Seed 2092081 setzte eine Figur in einen Schacht ohne Ausweg (bekannt seit
 * Fassung 7, auch in 8).
 *
 * Ursache (zwei Stellen): (1) `terrainKomposition.ruine` schnitt das oberste Fenster einer hohen Ruine über oder durch die
 * Krone — es blieb ein 24 px breiter, rund 40 px tiefer Schacht in der Mauerkrone. (2) `karteStart.trockenerStartX` prüfte
 * für „begehbar“ nur Spalten ±12 px neben der Figur (in diesem Schacht genau die Luft an den Rändern) und den Hang über ±16 px
 * (Krone gegen Krone): Der Schacht galt als guter Startplatz. Ab Fassung 9 bleibt jedes Fenster unter der Krone, und ein
 * Startplatz braucht einen zu Fuß begehbaren Abschnitt von `MIN_START_ABSCHNITT` px.
 *
 * Fassung 8 bleibt Bit für Bit gleich: Die Goldwerte stammen aus einer Messung auf `main` VOR der Fassung 9 (2026-11-04,
 * Stand 5ece2a4; Zustandshash nach 240 Ticks, Stoffhash, Replay über 2400 Ticks).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { trockenerStartX, MIN_START_ABSCHNITT } from '../src/engine/karteStart.js';
import { stoffHash } from '../src/shared/stoffkarte.js';
import { WAFFEN_WIND } from '../src/shared/config/waffen-fassung.js';
import {
  GELAENDE_KLAR, GELAENDE_OHNE_SCHACHT, GELAENDE_STANDARD, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';

test('Marke: Fassung 9 ist gültig (und nicht mehr der Standard seit 10), 8 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_OHNE_SCHACHT, 9);
  assert.ok(GELAENDE_STANDARD >= GELAENDE_OHNE_SCHACHT);
  assert.equal(normalisiereGelaende(GELAENDE_KLAR), GELAENDE_KLAR);
  assert.equal(normalisiereGelaende(9), 9);
  assert.equal(normalisiereGelaende(10), 10);
  assert.equal(normalisiereGelaende(11), GELAENDE_STANDARD);
});

const START = (seed, biom, teams, ppt, gelaende) => {
  const m = new MatchController({ seed, teams, playersPerTeam: ppt, kartentyp: 'autonom', biom, maxRounds: 2, gelaende, zerstoerung: 5 });
  m.start();
  m.consumeEvents();
  return m;
};

/** Zu Fuß begehbarer Abschnitt um x (Oberfläche, Aufstieg ≤ 10 px je Spalte wie `check:biome`) und die Wände an seinen Enden. */
function abschnitt(m, x0) {
  const o = x => m.surfaceYAt(x);
  let lo = x0;
  let hi = x0;
  while (lo > 0 && o(lo) - o(lo - 1) <= 10) lo -= 1;
  while (hi < m.width - 1 && o(hi) - o(hi + 1) <= 10) hi += 1;
  return { breite: hi - lo + 1, wandL: lo > 0 ? o(lo) - o(lo - 1) : 0, wandR: hi < m.width - 1 ? o(hi) - o(hi + 1) : 0 };
}

/** Figuren in einer Grube: begehbarer Abschnitt unter 120 px, an beiden Enden mehr als 20 px Wand. */
function inGrube(m) {
  return (m.getState().entities ?? [])
    .filter(e => e.alive && e.type !== 'crate')
    .map(e => ({ x: Math.round(e.x), ...abschnitt(m, Math.round(e.x)) }))
    .filter(a => a.breite < 120 && a.wandL > 20 && a.wandR > 20);
}

test('Pilzwald Seed 2092081: Fassung 8 startet eine Figur im Schacht (reproduziert), Fassung 9 keine', () => {
  for (const [teams, ppt] of [[8, 4], [8, 5]]) {
    const alt = inGrube(START(2092081, 'pilzwald', teams, ppt, GELAENDE_KLAR));
    assert.equal(alt.length, 1, `${teams}x${ppt}: Fassung 8 wie gemessen`);
    assert.equal(alt[0].x, 2003);
    assert.equal(alt[0].breite, 25, 'der Schacht ist ein Ruinenfenster (24 px)');
  }
  for (const [teams, ppt] of [[8, 4], [8, 5], [2, 2], [4, 2], [2, 3], [6, 2]]) {
    assert.deepEqual(inGrube(START(2092081, 'pilzwald', teams, ppt, GELAENDE_OHNE_SCHACHT)), [], `${teams}x${ppt}: Fassung 9`);
  }
});

test('Ruine: Das Fenster unter der Krone bleibt in Fassung 9 geschlossen (kein Schacht in der Mauerkrone)', () => {
  const alt = START(2092081, 'pilzwald', 2, 2, GELAENDE_KLAR);
  const neu = START(2092081, 'pilzwald', 2, 2, GELAENDE_OHNE_SCHACHT);
  // Fassung 8: Sprung von rund 40 px in den Schacht bei x 1991..2015.
  assert.ok(alt.surfaceYAt(2003) - alt.surfaceYAt(1985) > 30, 'Fassung 8: Schacht in der Krone');
  assert.ok(Math.abs(neu.surfaceYAt(2003) - neu.surfaceYAt(1985)) <= 10, 'Fassung 9: Krone geschlossen');
});

/**
 * Ebene mit einem senkrechten Schacht um `mitte` (± `halb` px, Tiefe `tiefe`): Oberfläche und Festigkeit passen zueinander.
 * Vorgabe wie gemessen: Schacht 1991..2015 um die Figur bei 2003, also ±12 px, 40 px tief.
 */
function ebeneMitSchacht(gelaende, mitte, halb = 12, tiefe = 40) {
  const boden = x => (Math.abs(x - mitte) <= halb ? 700 + tiefe : 700);
  return {
    width: 2560, height: 1440, kartentyp: 'autonom', gelaende,
    surfaceYAt: x => boden(Math.round(x)),
    waterLevelAt: () => 0,
    terrain: { isSolid: (x, y) => y >= boden(Math.round(x)) },
  };
}

test('Startplatz: Fassung 8 nimmt den Schacht als begehbar, Fassung 9 sucht einen Platz mit begehbarem Abschnitt', () => {
  assert.equal(trockenerStartX(ebeneMitSchacht(GELAENDE_KLAR, 1000), 1000), 1000, 'Fassung 8 wie gemessen');
  const x = trockenerStartX(ebeneMitSchacht(GELAENDE_OHNE_SCHACHT, 1000), 1000);
  assert.ok(Math.abs(x - 1000) > 12 + 7, `Fassung 9: ${x} liegt außerhalb des Schachts`);
  const m = ebeneMitSchacht(GELAENDE_OHNE_SCHACHT, 1000);
  assert.ok(abschnitt(m, x).breite >= MIN_START_ABSCHNITT);
  // Eine breite Grube (200 px) ist kein Schacht: Dort darf gestartet werden.
  assert.equal(trockenerStartX(ebeneMitSchacht(GELAENDE_OHNE_SCHACHT, 1000, 100, 40), 1000), 1000);
});

// [seed, biom, teams, playersPerTeam, Zustandshash nach 240 Ticks, Stoffhash, Erreichbarkeit] – gemessen vor Fassung 9.
const GOLD_8 = [
  [2092081, 'pilzwald', 8, 4, 'e17f2f58', 2618477637, true], [2092081, 'pilzwald', 2, 2, '5007b86e', 2618477637, true],
  [951031, 'pilzwald', 2, 2, '1e08fab1', 4273070715, true], [1224883, 'schlackeschmiede', 2, 2, '363ce00b', 735403796, true],
  [1080350, 'vulkan', 2, 2, '747c3c3', 45284989, true], [4242, 'vulkan', 2, 2, '6a6087a1', 1679635000, true],
  [4242, 'klassisch', 2, 2, '6a6087a1', 1417144833, true], [4242, 'planet', 2, 2, '9240bf10', 1042602460, true],
  [69, 'kosmos', 4, 2, 'f6753a57', 2134658865, true], [107, 'klassisch', 4, 2, '6c425b43', 3661348001, true],
  [1696517, 'schwebinseln', 2, 2, '45aaaf66', 216200866, true],
];

test('Fassung 8 bleibt Bit für Bit gleich (Goldwerte von vor Fassung 9)', () => {
  for (const [seed, biom, teams, ppt, hash, stoff, ok] of GOLD_8) {
    const m = new MatchController({ seed, teams, playersPerTeam: ppt, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: GELAENDE_KLAR, zerstoerung: 5 });
    m.start();
    for (let i = 0; i < 240; i += 1) { m.step(); m.consumeEvents(); }
    const name = `${seed} ${biom} ${teams}x${ppt}`;
    assert.equal(m.stateHash(), hash, `${name}: Zustandshash`);
    assert.equal(stoffHash(m.stoffkarte), stoff, `${name}: Stoffhash`);
    assert.equal(m.erreichbarkeit?.ok, ok, `${name}: Erreichbarkeit`);
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
  return { live: live.stateHash(), replay: spieler.match.stateHash(), kopf: JSON.parse(json).config };
}

test('Alter Replay (Marke 8): Kopf behält die 8, Wiedergabe endet im Goldwert von vor Fassung 9', () => {
  const gold = [
    [{ gelaende: 8, waffen: WAFFEN_WIND }, '4913d98d'],
    [{ gelaende: 8, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'pilzwald' }, '8750e9f2'],
    [{ gelaende: 8, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'schlackeschmiede' }, '5f83b9d5'],
    [{ gelaende: 8, waffen: WAFFEN_WIND, kartentyp: 'autonom', biom: 'vulkan' }, 'a2d88c39'],
  ];
  for (const [extra, hash] of gold) {
    const r = aufzeichnenUndAbspielen(extra);
    assert.equal(r.kopf.gelaende, 8, 'die Marke wird nicht auf 9 angehoben');
    assert.equal(r.live, hash, `${JSON.stringify(extra)}: Live-Hash`);
    assert.equal(r.replay, hash, `${JSON.stringify(extra)}: Wiedergabe-Hash`);
  }
});

test('Neuer Replay: Kopf trägt die Standardmarke (>= 9), Wiedergabe endet im Live-Hash', () => {
  for (const biom of ['pilzwald', 'schlackeschmiede']) {
    const r = aufzeichnenUndAbspielen({ kartentyp: 'autonom', biom });
    assert.equal(r.kopf.gelaende, GELAENDE_STANDARD, biom);
    assert.equal(r.replay, r.live, `${biom}: Wiedergabe gegen live`);
  }
});

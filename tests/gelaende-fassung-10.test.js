/**
 * Gelände-Fassung 10 („weit“): Mehrzonen-Karten für breite Formate (ab 2800 px Breite).
 *
 * Belegt wird: (1) die Marke, (2) Karten unter 2800 px bleiben Bit für Bit die der Fassung 9, (3) Zonenzahl und Determinismus,
 * (4) Spielbarkeit mit 8 und mehr Figuren über mehrere Seeds (feste Wurfweite 939 px statt Proportion), (5) das Drahtformat
 * (Int16, Faktor 4: höchstens 8191,75 px) trägt die größte Karte, (6) die Kistenverteilung wächst nur auf breiten Karten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { SeededRandom } from '../src/shared/prng.js';
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { zonenZahl, ZONEN_AB_BREITE, ZONEN_BREITE } from '../src/shared/terrainKomposition.js';
import { pruefeErreichbarkeit } from '../src/shared/erreichbarkeit.js';
import { LootSystem } from '../src/engine/systems/lootSystem.js';
import { MAP_SIZES, MAP_GROESSEN } from '../src/engine/karte.js';
import {
  GELAENDE_OHNE_SCHACHT, GELAENDE_WEIT, GELAENDE_STANDARD, GELAENDE_WEIT_AB_BREITE, normalisiereGelaende,
} from '../src/shared/config/gelaende.js';

const hash = (bitmap) => {
  let h = 2166136261;
  for (let i = 0; i < bitmap.length; i += 7) h = Math.imul(h ^ bitmap[i], 16777619) >>> 0;
  return h;
};
const karte = (seed, width, height, fassung) => erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width, height, fassung, stoffe: false });

test('Marke: Fassung 10 ist gültig und der Standard, 9 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_WEIT, 10);
  assert.ok(GELAENDE_STANDARD >= GELAENDE_WEIT); // seit Fassung 11 höher (`gelaende-fassung-11.test.js`)
  assert.equal(normalisiereGelaende(GELAENDE_OHNE_SCHACHT), 9);
  assert.equal(normalisiereGelaende(10), 10);
  assert.equal(normalisiereGelaende(10), 10);
  assert.equal(normalisiereGelaende(15), GELAENDE_STANDARD);
  assert.equal(ZONEN_AB_BREITE, GELAENDE_WEIT_AB_BREITE);
});

test('Zonenzahl: n = round(Breite / 2000), mindestens 2', () => {
  assert.equal(ZONEN_BREITE, 2000);
  assert.equal(zonenZahl(2800), 2);
  assert.equal(zonenZahl(4704), 2);
  assert.equal(zonenZahl(5120), 3);
  assert.equal(zonenZahl(6272), 3);
});

test('Karten unter 2800 px sind in Fassung 10 bitgleich zu Fassung 9', () => {
  for (const [w, h] of [[2560, 1440], [1280, 720], [1568, 588], [2216, 1662]]) {
    assert.ok(w < GELAENDE_WEIT_AB_BREITE);
    for (const seed of [1, 2, 3]) {
      const a = karte(seed, w, h, GELAENDE_OHNE_SCHACHT);
      const b = karte(seed, w, h, GELAENDE_WEIT);
      assert.equal(hash(a.bitmap), hash(b.bitmap), `${w}×${h} Seed ${seed}`);
      assert.equal(a.wasserY, b.wasserY);
      assert.equal(a.kartenart, b.kartenart);
    }
  }
});

test('Breite Karte: deterministisch je Seed, verschieden zwischen Seeds, Zonen tragen eigene Arten', () => {
  const a = karte(1, 4704, 1764, GELAENDE_WEIT);
  const b = karte(1, 4704, 1764, GELAENDE_WEIT);
  assert.equal(hash(a.bitmap), hash(b.bitmap));
  assert.equal(a.wasserY, b.wasserY);
  assert.notEqual(hash(a.bitmap), hash(karte(2, 4704, 1764, GELAENDE_WEIT).bitmap));
  // Dieselbe Breite in Fassung 9 ist eine ganz andere Karte (Einzelart).
  assert.notEqual(hash(a.bitmap), hash(karte(1, 4704, 1764, GELAENDE_OHNE_SCHACHT).bitmap));
  assert.ok(a.bauteile, 'Bauteilstatistik vorhanden');
});

test('Breite Karte: Matchstart über mehrere Seeds und 8 bis 10 Figuren, alle erreichbar mit fester Wurfweite 939 px', () => {
  const FIXE_WURFWEITE = 939;
  for (const [seed, teams, proTeam, format, groesse] of [
    [1, 2, 4, '24:9', 'gross'], [2, 2, 5, '24:9', 'gross'], [3, 4, 2, '24:9', 'gross'], [4, 2, 5, '24:9', 'riesig'],
    [5, 3, 3, '24:9', 'riesig'], [6, 2, 4, '16:9', 'gross'],
  ]) {
    const m = new MatchController({ seed, teams, playersPerTeam: proTeam, kartentyp: 'autonom', maxRounds: 2, format, groesse, zerstoerung: 5, gelaende: GELAENDE_WEIT });
    m.start();
    assert.ok(m.width >= GELAENDE_WEIT_AB_BREITE, `${format}/${groesse}: breit`);
    assert.equal(m.gelaende, GELAENDE_WEIT);
    const figuren = (m.getState().entities ?? []).filter((e) => e.alive && e.type !== 'crate').map((e) => ({ x: e.x, y: e.y, teamId: e.teamId }));
    assert.ok(figuren.length >= 8, `${seed}: mindestens 8 Figuren (${figuren.length})`);
    assert.equal(m.erreichbarkeit?.ok, true, `${seed} ${format}/${groesse}: Engine-Prüfung (${m.erreichbarkeit?.grund})`);
    const urteil = pruefeErreichbarkeit({ bitmap: m.bitmap, width: m.width, height: m.height, figuren, wurfweite: FIXE_WURFWEITE });
    assert.equal(urteil.ok, true, `${seed} ${format}/${groesse}: ${urteil.grund} bei 939 px`);
  }
});

test('Drahtformat: Int16 mit Faktor 4 trägt jede Kartenmaß der Tabelle (höchstens 8191,75 px)', () => {
  const GRENZE = 32767 / 4;
  for (const [format, stufen] of Object.entries(MAP_SIZES)) {
    for (const stufe of MAP_GROESSEN) {
      const { width, height } = stufen[stufe];
      assert.ok(width <= GRENZE && height <= GRENZE, `${format}/${stufe}: ${width}×${height}`);
    }
  }
  const breitest = Math.max(...Object.values(MAP_SIZES).flatMap((s) => MAP_GROESSEN.map((g) => s[g].width)));
  assert.equal(breitest, 6272);
  // Die breiteste Karte baut und liegt innerhalb der Grenze (Oberfläche je Spalte, Wasserlinie).
  const k = karte(5, 6272, 2352, GELAENDE_WEIT);
  assert.equal(k.bitmap.length, 6272 * 2352);
  assert.ok(k.wasserY * 4 <= 32767);
  assert.equal(k.zonen?.length ?? zonenZahl(6272), 3);
});

test('Kisten: nur breite Karten bekommen mehr Kisten (Faktor Breite/2560), alle auf Land über der Wasserlinie', () => {
  const m = new MatchController({ seed: 3, teams: 2, playersPerTeam: 4, kartentyp: 'autonom', maxRounds: 2, format: '24:9', groesse: 'gross', zerstoerung: 5 });
  m.start();
  const loot = new LootSystem({ rng: new SeededRandom(1) });
  const wirf = (weit, runden = 40) => {
    let summe = 0;
    let tief = 0;
    const orte = [];
    for (let r = 0; r < runden; r += 1) {
      const ids = loot.spawnRoundCrates(m.world, { rng: new SeededRandom(500 + r), width: m.width, height: m.height, surfaceYFor: (x) => m.surfaceYAt(x), ...(weit ? { weit: true } : {}) });
      for (const id of ids) {
        const x = m.world.getComponent(id, 'Position', 'x');
        const y = m.world.getComponent(id, 'Position', 'y');
        orte.push([Math.round(x), Math.round(y)]);
        if (y > m.height * 0.86) tief += 1;
        m.world.removeEntity(id);
      }
      summe += ids.length;
    }
    return { summe, tief, orte };
  };
  const alt = wirf(false);
  const altNoch = wirf(false);
  assert.deepEqual(alt.orte, altNoch.orte, 'ohne `weit` unverändert und deterministisch');
  const neu = wirf(true);
  assert.deepEqual(neu.orte, wirf(true).orte, 'mit `weit` deterministisch');
  assert.ok(neu.summe > alt.summe * 1.5, `mehr Kisten auf breiter Karte: ${neu.summe} gegen ${alt.summe}`);
  assert.equal(neu.tief, 0, 'keine Kiste unter der Wasserlinie');
  assert.ok(neu.orte.every(([x]) => x >= m.width * 0.08 - 1 && x <= m.width * 0.92 + 1), 'innerhalb der Ränder');
});

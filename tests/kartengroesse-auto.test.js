/**
 * „Größe: automatisch“ (TODO 2.12b, Entscheidung 2026-11-28): Die Spielerzahl gibt den Bereich vor
 * (2 klein–mittel, 3 mittel–groß, 4 groß, 5 groß–riesig, 6 riesig), der Zufall verändert das Ergebnis um −25 % bis +50 %.
 * Die festen Stufen bleiben unverändert; online schickt der Server die gerechneten Maße mit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_SIZES, MAP_GROESSE_AUTO, GROESSE_NACH_SPIELERN, AUTO_FAKTOR, AUTO_MAX_PIXEL, kartenMasseFuer, normalisiereGroesse,
} from '../src/engine/karte.js';
import { MatchController } from '../src/engine/match.js';
import { terrainQuelleFuer, buildTerrainForSeed } from '../src/client/terrainPreview.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);

test('Je Spielerzahl liegen alle Maße im Bereich (Stufe × 0,75 bis Stufe × 1,5, gedeckelt), gerastert auf 32 px', () => {
  for (const format of ['24:9', '16:9', '1:1', '9:24']) {
    const seite = MAP_SIZES[format];
    for (const [n, [von, bis]] of Object.entries(GROESSE_NACH_SPIELERN)) {
      const flaechen = [];
      for (const seed of SEEDS) {
        const m = kartenMasseFuer(Number(n), format, seed);
        assert.equal(m.width % 32, 0); assert.equal(m.height % 32, 0);
        const flaeche = m.width * m.height;
        assert.ok(flaeche <= AUTO_MAX_PIXEL, `${format}/${n}: ${flaeche} über der iOS-Grenze`);
        const min = seite[von].width * seite[von].height * AUTO_FAKTOR.min * (format === '1:1' ? AUTO_FAKTOR.min : 1);
        const max = seite[bis].width * seite[bis].height * AUTO_FAKTOR.max * (format === '1:1' ? AUTO_FAKTOR.max : 1);
        assert.ok(flaeche >= min * 0.9 && flaeche <= max, `${format}/${n}: ${m.width}×${m.height} außerhalb ${min}–${max}`);
        flaechen.push(flaeche);
      }
      assert.ok(new Set(flaechen).size > 20, `${format}/${n}: der Zufall streut`);
    }
  }
});

test('Mehr Spieler = im Mittel größere Karte; 7 und mehr wie 6, 1 wie 2', () => {
  const mittel = n => SEEDS.reduce((s, seed) => { const m = kartenMasseFuer(n, '24:9', seed); return s + m.width * m.height; }, 0) / SEEDS.length;
  for (let n = 2; n < 6; n += 1) assert.ok(mittel(n + 1) > mittel(n), `${n + 1} Spieler größer als ${n}`);
  assert.deepEqual(kartenMasseFuer(9, '24:9', 77), kartenMasseFuer(6, '24:9', 77));
  assert.deepEqual(kartenMasseFuer(1, '24:9', 77), kartenMasseFuer(2, '24:9', 77));
});

test('Deterministisch aus dem Seed; der Motor nimmt die Maße, feste Stufen bleiben bitgleich', () => {
  assert.equal(normalisiereGroesse(MAP_GROESSE_AUTO), MAP_GROESSE_AUTO);
  assert.deepEqual(kartenMasseFuer(3, '24:9', 42), kartenMasseFuer(3, '24:9', 42));
  const m = new MatchController({ seed: 42, teams: 3, playersPerTeam: 1, groesse: MAP_GROESSE_AUTO, format: '24:9' });
  const soll = kartenMasseFuer(3, '24:9', 42);
  assert.equal(m.width, soll.width); assert.equal(m.height, soll.height);
  const fest = new MatchController({ seed: 42, teams: 3, playersPerTeam: 1, groesse: 'gross', format: '24:9' });
  assert.equal(fest.width, MAP_SIZES['24:9'].gross.width);
  assert.equal(fest.kartenAuto, null);
});

test('Online: mit den Maßen des Servers baut der Client dieselbe Karte wie der Motor', () => {
  const m = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, groesse: MAP_GROESSE_AUTO, format: '24:9', kartentyp: 'autonom' });
  m.start();
  const quelle = terrainQuelleFuer({ seed: 99, kartentyp: 'autonom', mapFormat: '24:9', mapSize: MAP_GROESSE_AUTO, mapWidth: m.width, mapHeight: m.height, gelaende: m.gelaende, biom: m.sonderbiom ?? m.biomWahl, kartenart: m.kartenart, zerstoerung: m.zerstoerung });
  const t = buildTerrainForSeed(99, 'hills', 'landscape', 'autonom', quelle);
  assert.equal(t.mask.width, m.width); assert.equal(t.mask.height, m.height);
});

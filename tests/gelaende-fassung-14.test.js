/**
 * Gelände-Fassung 14 („rund“, TODO N-40): Planet, runde Höhle, schwebende Insel auf dem Format 1:1, Stufe `kolossal` (33,18 Mio. Pixel).
 *
 * Belegt wird: (1) die Marke und die Kartenart-Normalisierung, (2) Fassung 6 bis 13 bleiben Bit für Bit gleich (80 Goldwerte, gemessen mit dem
 * unveränderten Code aus `git archive HEAD` vor Fassung 14; die volle Gegenprobe über 504 Karten steht im Commit-Text), Fassung 14 baut auf allen
 * Formaten ohne runde Wahl wie 13, (3) Kartenmaße: `kolossal` 1:1 = 5760² ≥ 33 Mio. px und unter dem Drahtlimit 8191,75, andere Formate unverändert,
 * (4) die runden Karten: Stand zusammenhängend und zu Fuß in drei Tempi in beide Richtungen begehbar, Spawn-Fairness (Teams 2×3, 3×2, 2×4), Figuren
 * auf dem Boden im Stand, keine `karte_unerreichbar`, (5) Determinismus, (6) die Stufe `kolossal` im echten Match.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { SeededRandom } from '../src/shared/prng.js';
import { MAP_SIZES, mapSizeFor, normalisiereGroesse, MAP_GROESSE_KOLOSSAL, MAP_SIZES_KOLOSSAL, MAP_FORMATS } from '../src/engine/karte.js';
import { getTurnDurationForSize } from '../src/engine/systems/turnSystem.js';
import {
  GELAENDE_FORM, GELAENDE_RUND, GELAENDE_STANDARD, KARTENARTEN, KARTENARTEN_RUND, normalisiereGelaende, normalisiereKartenart, loeseGelaende,
} from '../src/shared/config/gelaende.js';
import { messeRundeKarte } from '../tools/rund-messung.mjs';

const fnv = (a) => { let h = 2166136261; for (let i = 0; i < a.length; i += 1) h = Math.imul(h ^ a[i], 16777619) >>> 0; return h; };
const karte = (seed, w, h, fassung, kartenart = null, biom = null) => erzeugeAutonomeKarte({ rng: new SeededRandom(seed), width: w, height: h, fassung, stoffe: true, kartenart, biom });

/** Schlüssel `f<Fassung>|<Format>|<Stufe>|<Seed>|<Art>` → [Hash der Maske, Wasserlinie, Kartenart, Versuche]; gemessen am Stand vor Fassung 14. */
const GOLD = {
  'f10|16:9|klein|11|null': [3139860675, 701, null, 1],
  'f10|16:9|klein|3|hoehle': [1924159592, 677, 'hoehle', 1],
  'f10|16:9|klein|3|insel': [2985259538, 576, 'insel', 1],
  'f10|16:9|klein|3|null': [1867878923, 684, 'pyramide', 1],
  'f10|1:1|klein|11|null': [3461455732, 926, null, 1],
  'f10|1:1|klein|3|hoehle': [383317943, 902, 'hoehle', 1],
  'f10|1:1|klein|3|insel': [3101866536, 768, 'insel', 1],
  'f10|1:1|klein|3|null': [761994237, 912, 'pyramide', 1],
  'f10|1:1|mittel|11|null': [2022149783, 1829, null, 1],
  'f10|1:1|mittel|3|hoehle': [2800280158, 1805, 'hoehle', 1],
  'f10|1:1|mittel|3|insel': [1899121070, 1536, 'insel', 1],
  'f10|1:1|mittel|3|null': [380657163, 1824, 'pyramide', 1],
  'f10|24:9|weit|11|null': [1222696694, 1406, null, 1],
  'f10|24:9|weit|3|hoehle': [2772315174, 1264, 'hoehle', 2],
  'f10|24:9|weit|3|insel': [1558867120, 1264, 'insel', 6],
  'f10|24:9|weit|3|null': [961110156, 1264, 'schlucht', 4],
  'f12|16:9|klein|11|null': [3139860675, 701, null, 1],
  'f12|16:9|klein|3|hoehle': [1924159592, 677, 'hoehle', 1],
  'f12|16:9|klein|3|insel': [2985259538, 576, 'insel', 1],
  'f12|16:9|klein|3|null': [1867878923, 684, 'pyramide', 1],
  'f12|1:1|klein|11|null': [3461455732, 926, null, 1],
  'f12|1:1|klein|3|hoehle': [383317943, 902, 'hoehle', 1],
  'f12|1:1|klein|3|insel': [3101866536, 768, 'insel', 1],
  'f12|1:1|klein|3|null': [761994237, 912, 'pyramide', 1],
  'f12|1:1|mittel|11|null': [2022149783, 1829, null, 1],
  'f12|1:1|mittel|3|hoehle': [2800280158, 1805, 'hoehle', 1],
  'f12|1:1|mittel|3|insel': [1899121070, 1536, 'insel', 1],
  'f12|1:1|mittel|3|null': [380657163, 1824, 'pyramide', 1],
  'f12|24:9|weit|11|null': [1222696694, 1406, null, 1],
  'f12|24:9|weit|3|hoehle': [3979362087, 1264, 'hoehle', 1],
  'f12|24:9|weit|3|insel': [4118646418, 1264, 'insel', 1],
  'f12|24:9|weit|3|null': [1477287739, 1264, 'hoehle', 1],
  'f13|16:9|klein|11|null': [3139860675, 701, null, 1],
  'f13|16:9|klein|3|hoehle': [3703266715, 677, 'hoehle', 1],
  'f13|16:9|klein|3|insel': [715332474, 576, 'insel', 1],
  'f13|16:9|klein|3|null': [4134381003, 684, 'pyramide', 1],
  'f13|1:1|klein|11|null': [3461455732, 926, null, 1],
  'f13|1:1|klein|3|hoehle': [1771579486, 902, 'hoehle', 1],
  'f13|1:1|klein|3|insel': [2142581025, 768, 'insel', 1],
  'f13|1:1|klein|3|null': [880540232, 912, 'pyramide', 1],
  'f13|1:1|mittel|11|null': [2022149783, 1829, null, 1],
  'f13|1:1|mittel|3|hoehle': [2204745789, 1805, 'hoehle', 1],
  'f13|1:1|mittel|3|insel': [265963266, 1536, 'insel', 1],
  'f13|1:1|mittel|3|null': [3228001962, 1824, 'pyramide', 1],
  'f13|24:9|weit|11|null': [1222696694, 1406, null, 1],
  'f13|24:9|weit|3|hoehle': [3319098514, 1264, 'hoehle', 1],
  'f13|24:9|weit|3|insel': [779125131, 1264, 'insel', 1],
  'f13|24:9|weit|3|null': [1330225278, 1264, 'hoehle', 1],
  'f6|16:9|klein|11|null': [3139860675, 701, null, 1],
  'f6|16:9|klein|3|hoehle': [1924159592, 677, 'hoehle', 1],
  'f6|16:9|klein|3|insel': [516838557, 576, 'insel', 1],
  'f6|16:9|klein|3|null': [1867878923, 684, 'pyramide', 1],
  'f6|1:1|klein|11|null': [3461455732, 926, null, 1],
  'f6|1:1|klein|3|hoehle': [383317943, 902, 'hoehle', 1],
  'f6|1:1|klein|3|insel': [4055528742, 768, 'insel', 6],
  'f6|1:1|klein|3|null': [761994237, 912, 'pyramide', 1],
  'f6|1:1|mittel|11|null': [2022149783, 1829, null, 1],
  'f6|1:1|mittel|3|hoehle': [2800280158, 1805, 'hoehle', 1],
  'f6|1:1|mittel|3|insel': [848154881, 1536, 'insel', 2],
  'f6|1:1|mittel|3|null': [380657163, 1824, 'pyramide', 1],
  'f6|24:9|weit|11|null': [1222696694, 1406, null, 1],
  'f6|24:9|weit|3|hoehle': [1923933808, 1382, 'hoehle', 1],
  'f6|24:9|weit|3|insel': [3823489349, 1176, 'insel', 1],
  'f6|24:9|weit|3|null': [2624413562, 1397, 'pyramide', 1],
  'f9|16:9|klein|11|null': [3139860675, 701, null, 1],
  'f9|16:9|klein|3|hoehle': [1924159592, 677, 'hoehle', 1],
  'f9|16:9|klein|3|insel': [2985259538, 576, 'insel', 1],
  'f9|16:9|klein|3|null': [1867878923, 684, 'pyramide', 1],
  'f9|1:1|klein|11|null': [3461455732, 926, null, 1],
  'f9|1:1|klein|3|hoehle': [383317943, 902, 'hoehle', 1],
  'f9|1:1|klein|3|insel': [3101866536, 768, 'insel', 1],
  'f9|1:1|klein|3|null': [761994237, 912, 'pyramide', 1],
  'f9|1:1|mittel|11|null': [2022149783, 1829, null, 1],
  'f9|1:1|mittel|3|hoehle': [2800280158, 1805, 'hoehle', 1],
  'f9|1:1|mittel|3|insel': [1899121070, 1536, 'insel', 1],
  'f9|1:1|mittel|3|null': [380657163, 1824, 'pyramide', 1],
  'f9|24:9|weit|11|null': [1222696694, 1406, null, 1],
  'f9|24:9|weit|3|hoehle': [1923933808, 1382, 'hoehle', 1],
  'f9|24:9|weit|3|insel': [1305320278, 1176, 'insel', 1],
  'f9|24:9|weit|3|null': [2624413562, 1397, 'pyramide', 1],
};

test('Marke: Fassung 14 ist gültig und der Standard; 13 bleibt gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_RUND, 14);
  assert.equal(GELAENDE_STANDARD, GELAENDE_RUND);
  assert.equal(normalisiereGelaende(13), GELAENDE_FORM);
  assert.equal(normalisiereGelaende(14), 14);
  assert.equal(normalisiereGelaende(15), GELAENDE_STANDARD);
});

test('Kartenarten: die drei runden erst ab 14; KARTENARTEN bleibt unverändert (der Seed-Zug teilt durch ihre Länge)', () => {
  assert.deepEqual([...KARTENARTEN_RUND], ['rundPlanet', 'rundeHoehle', 'schwebendeInsel']);
  assert.equal(KARTENARTEN.length, 11);
  for (const art of KARTENARTEN_RUND) {
    assert.equal(normalisiereKartenart(art, 14), art);
    assert.equal(normalisiereKartenart(art, 13), null, `${art} in Fassung 13`);
    assert.equal(normalisiereKartenart(art, 6), null);
    assert.equal(loeseGelaende(14, null, 5, art).kartenart, art);
    assert.equal(loeseGelaende(13, null, 5, art).kartenart, null);
  }
  assert.equal(normalisiereKartenart('insel', 14), 'insel');
});

test('Alt-Fassungen 6 bis 13 bleiben Bit für Bit gleich (Goldwerte vor Fassung 14)', () => {
  for (const [schluessel, soll] of Object.entries(GOLD)) {
    const [f, format, stufe, seed, art] = schluessel.split('|');
    const { width, height } = MAP_SIZES[format][stufe];
    const k = karte(Number(seed), width, height, Number(f.slice(1)), art === 'null' ? null : art, Number(seed) === 11 ? 'planet_lava' : null);
    assert.deepEqual([fnv(k.bitmap), k.wasserY, k.kartenart ?? null, k.versuche], soll, schluessel);
  }
});

test('Fassung 14 ohne runde Wahl baut wie 13: alle Formate außer 1:1 und 1:1 mit gewählter alter Art', () => {
  for (const [format, stufe] of [['16:9', 'klein'], ['24:9', 'weit'], ['4:3', 'klein'], ['9:16', 'klein']]) {
    const { width, height } = MAP_SIZES[format][stufe];
    for (const seed of [3, 11]) {
      const a = karte(seed, width, height, 13);
      const b = karte(seed, width, height, 14);
      assert.equal(fnv(b.bitmap), fnv(a.bitmap), `${format}/${stufe} Seed ${seed}`);
      assert.equal(b.wasserY, a.wasserY);
    }
  }
  const { width, height } = MAP_SIZES['1:1'].klein;
  for (const art of KARTENARTEN) assert.equal(fnv(karte(3, width, height, 14, art).bitmap), fnv(karte(3, width, height, 13, art).bitmap), `1:1 ${art}`);
});

test('1:1 ohne Wahl: der Seed zieht aus vierzehn Arten, runde kommen vor, alle gezogenen Karten sind gültig', () => {
  const { width, height } = MAP_SIZES['1:1'].klein;
  const gezogen = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const k = karte(seed, width, height, 14);
    gezogen.add(k.kartenart);
    assert.ok(!k.warnung, `Seed ${seed}: ${k.warnung}`);
  }
  for (const art of KARTENARTEN_RUND) assert.ok(gezogen.has(art), `${art} in 60 Seeds nie gezogen: ${[...gezogen]}`);
});

test('Kartenmaße: kolossal 1:1 = 5760², mindestens 33 Mio. px, unter dem Drahtlimit; alle anderen Formate wie riesig; Menü-Stufen unberührt', () => {
  assert.equal(MAP_GROESSE_KOLOSSAL, 'kolossal');
  assert.deepEqual(MAP_SIZES_KOLOSSAL['1:1'], { width: 5760, height: 5760 });
  const m = mapSizeFor('1:1', 'kolossal');
  assert.ok(m.width * m.height >= 33_000_000, `${m.width * m.height}`);
  assert.ok(m.width <= 32767 / 4 && m.height <= 32767 / 4);
  for (const format of MAP_FORMATS) {
    if (format !== '1:1') assert.deepEqual(mapSizeFor(format, 'kolossal'), MAP_SIZES[format].riesig, format);
  }
  assert.equal(normalisiereGroesse('kolossal'), 'kolossal');
  assert.equal(normalisiereGroesse('gigantisch'), 'mittel');
  assert.deepEqual(mapSizeFor('1:1', 'riesig'), { width: 3840, height: 3840 });
  assert.equal(getTurnDurationForSize('kolossal'), getTurnDurationForSize('riesig'));
});

test('Runde Karten bei 960 und 1920 px: gültig, Stand breit genug und zu Fuß begehbar (3 Tempi, hin und zurück), Spawn-Fairness', () => {
  for (const seite of [960, 1920]) {
    for (const art of KARTENARTEN_RUND) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = messeRundeKarte({ art, seite, seed, teams: 2, pro: 3 });
        const wo = `${art} ${seite} Seed ${seed}`;
        assert.equal(r.kartenart, art, wo);
        assert.ok(r.standBreite >= 0.25 * seite, `${wo}: Stand ${r.standBreite} px`);
        assert.ok(r.standHin, `${wo}: Stand nicht begehbar`);
        assert.ok(r.imStand && r.aufBoden, `${wo}: Figuren nicht auf dem Stand (imStand ${r.imStand}, aufBoden ${r.aufBoden})`);
        assert.equal(r.erreichbar, true, `${wo}: karte_unerreichbar`);
        // Gemessen 2026-11-12 (Planet/Höhle/Insel, 1920, Seeds 1 bis 8): größtes Verhältnis der Team-Mittel 1,17.
        assert.ok(r.fairness <= 1.3, `${wo}: Fairness ${r.fairness.toFixed(2)}`);
      }
    }
  }
});

test('Spawn-Fairness mit 3×2 und 2×4 Figuren (1920 px, drei Arten, Seeds 1 bis 3)', () => {
  for (const art of KARTENARTEN_RUND) {
    for (const seed of [1, 2, 3]) {
      for (const [teams, pro] of [[3, 2], [2, 4]]) {
        const r = messeRundeKarte({ art, seite: 1920, seed, teams, pro, wege: false });
        const wo = `${art} Seed ${seed} ${teams}×${pro}`;
        assert.ok(r.imStand && r.aufBoden, wo);
        assert.equal(r.erreichbar, true, wo);
        assert.ok(r.fairness <= 1.4, `${wo}: Fairness ${r.fairness.toFixed(2)}`);
      }
    }
  }
});

test('Determinismus: derselbe Seed gibt dieselbe runde Karte; zwei Seeds unterscheiden sich', () => {
  for (const art of KARTENARTEN_RUND) {
    const a = karte(7, 960, 960, 14, art);
    const b = karte(7, 960, 960, 14, art);
    const c = karte(8, 960, 960, 14, art);
    assert.equal(fnv(a.bitmap), fnv(b.bitmap), art);
    assert.notEqual(fnv(a.bitmap), fnv(c.bitmap), art);
    assert.deepEqual(a.charakter.rund, b.charakter.rund);
  }
});

test('Runde Karten auf einem anderen Format (16:9 klein, 3:4 klein): gültig, Stand vorhanden', () => {
  for (const [format, stufe] of [['16:9', 'klein'], ['3:4', 'klein']]) {
    const { width, height } = MAP_SIZES[format][stufe];
    for (const art of KARTENARTEN_RUND) {
      const k = karte(2, width, height, 14, art);
      assert.equal(k.kartenart, art);
      assert.ok(!k.warnung, `${format} ${art}: ${k.warnung}`);
      assert.ok(k.charakter.rund.stand[1] - k.charakter.rund.stand[0] >= 0.25 * Math.min(width, height));
    }
  }
});

test('kolossal im echten Match: 5760², ≥ 33 Mio. px, jede der drei Arten startet spielbar', () => {
  for (const art of KARTENARTEN_RUND) {
    const r = messeRundeKarte({ art, seite: 5760, seed: 3, teams: 2, pro: 3 });
    assert.equal(r.flaeche, 5760 * 5760, art);
    assert.ok(r.flaeche >= 33_000_000);
    assert.equal(r.kartenart, art);
    assert.ok(r.standHin, `${art}: Stand nicht begehbar`);
    assert.ok(r.imStand && r.aufBoden, `${art}: Figuren`);
    assert.equal(r.erreichbar, true, art);
    assert.ok(r.fairness <= 1.3, `${art}: Fairness ${r.fairness.toFixed(2)}`);
  }
});

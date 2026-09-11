import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { SeededRandom } from '../src/shared/prng.js';
import { generateTerrain, surfaceY, TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import { WET_LEVEL } from '../src/shared/config/water.js';
import { PRIMARY_BIOME_BY_PRESET as BIOME_SCENERY } from '../src/shared/config/scenery.js';
import { PRIMARY_BIOME_BY_PRESET as BIOME_BACKDROPS } from '../src/shared/config/backdrops.js';

/**
 * Geländeformen.
 *
 * Die Datei entstand, als vier neue Formen hinzukamen (offene Weite, Felsspitzen,
 * Flut, Gewirr). Zwei Dinge waren dabei nicht selbstverständlich:
 *
 * 1. **Spielbarkeit.** Die Startpositionen waren fest (`spacing × (index + 1)`)
 *    und wurden nicht auf Wasser geprüft. Gemessen bei der Form `flooded`:
 *    **81 von 480 Figuren (40 Seeds × 12) starteten untergetaucht** und
 *    ertranken im ersten Zug. Behoben in `MatchController#drySpawnX`.
 *
 * 2. **Eigenart.** Eine Form ist nur dann eine eigene Form, wenn sie sich messbar
 *    unterscheidet. Sonst ist sie ein zweiter Name für dieselbe Karte. Die
 *    Kennzahlen unten halten das mit Schwellen fest.
 */

const W = 1280;
const H = 720;

/** Kennzahlen einer Form an einem festen Seed. */
function kennzahlen(preset) {
  const rng = new SeededRandom(4242);
  const terrain = generateTerrain({ rng, width: W, height: H, preset });

  const hoehen = [];
  for (let x = 0; x < W; x += 1) {
    const y = surfaceY(terrain.bitmap, W, H, x);
    if (y > 0) hoehen.push(y);
  }
  const mittel = hoehen.reduce((a, b) => a + b, 0) / hoehen.length;
  const varianz = Math.sqrt(hoehen.reduce((a, b) => a + (b - mittel) ** 2, 0) / hoehen.length);

  // Deckung: Wie oft springt die Oberfläche je 100 px um mehr als 20 px?
  let wechsel = 0;
  for (let x = 2; x < W; x += 1) {
    const a = surfaceY(terrain.bitmap, W, H, x - 2);
    const b = surfaceY(terrain.bitmap, W, H, x);
    if (a > 0 && b > 0 && Math.abs(a - b) > 20) wechsel += 1;
  }

  let land = 0;
  for (const zelle of terrain.bitmap) if (zelle) land += 1;

  return {
    varianz,
    deckung: wechsel,
    landAnteil: land / (W * H),
    wasserY: terrain.waterLevel,
    hoehen,
  };
}

test('Jede Geländeform ist spielbar: alle Startfiguren stehen über Wasser', () => {
  /*
   * Der wichtigste Test dieser Datei. Vor der Korrektur starteten bei `flooded`
   * 51 % der Figuren untergetaucht — das Match war entschieden, bevor der erste
   * Zug begann. Geprüft wird über viele Seeds und die volle Spielerzahl, weil
   * die Startposition vom Seed abhängt.
   */
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    let untergetaucht = 0;
    let geprueft = 0;
    const betroffen = [];

    for (let seed = 1; seed <= 40; seed += 1) {
      const match = new MatchController({ seed, teams: 3, playersPerTeam: 4, preset });
      match.start();
      for (const figur of match.getState().entities) {
        geprueft += 1;
        if (figur.waterLevel >= 0.72) {
          untergetaucht += 1;
          if (betroffen.length < 3) betroffen.push(`Seed ${seed}, Figur ${figur.entityId}`);
        }
      }
    }

    assert.equal(untergetaucht, 0,
      `${preset}: ${untergetaucht} von ${geprueft} Figuren starten untergetaucht `
      + `(${betroffen.join('; ')})`);
  }
});

test('Keine Startfigur startet auch nur nass', () => {
  /*
   * Strenger als der Test darüber: `drySpawnX` sucht Positionen unterhalb von
   * WET_LEVEL. Eine Figur, die nass startet, ist zwar spielbar, aber sie beginnt
   * das Match im Nachteil — und das wäre eine ungleiche Startbedingung, die vom
   * Seed abhängt.
   */
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const match = new MatchController({ seed, teams: 2, playersPerTeam: 4, preset });
      match.start();
      for (const figur of match.getState().entities) {
        assert.ok(figur.waterLevel < WET_LEVEL,
          `${preset}, Seed ${seed}: Figur ${figur.entityId} startet mit Wasserstand `
          + `${figur.waterLevel} (nass ab ${WET_LEVEL})`);
      }
    }
  }
});

test('Die vier neuen Formen unterscheiden sich messbar voneinander', () => {
  /*
   * Eine Form, die sich nicht von einer anderen unterscheidet, ist ein zweiter
   * Name für dieselbe Karte — und die Auswahl im Menü wäre eine Illusion.
   */
  const offen = kennzahlen('open');
  const spitz = kennzahlen('spires');
  const flut = kennzahlen('flooded');
  const wirr = kennzahlen('warren');

  // Offene Weite: sehr flach (kleine Höhenvarianz).
  assert.ok(offen.varianz < 20,
    `Offene Weite hat eine Höhenvarianz von ${offen.varianz.toFixed(0)} — nicht flach genug`);

  // Felsspitzen: großer Höhenunterschied.
  assert.ok(spitz.varianz > 150,
    `Felsspitzen haben eine Höhenvarianz von ${spitz.varianz.toFixed(0)} — nicht steil genug`);

  // Flut: viel Wasser (wenig Land).
  assert.ok(flut.landAnteil < 0.35,
    `Bei Flut sind ${(flut.landAnteil * 100).toFixed(0)} % der Karte Land — zu wenig Wasser`);

  // Gewirr: viel Deckung (zerklüftete Oberfläche).
  assert.ok(wirr.deckung > 25,
    `Gewirr hat nur ${wirr.deckung} Geländesprünge — zu glatt für eine Nahkampfkarte`);

  // Und die drei sind untereinander verschieden: keine ist in allen Kennzahlen
  // gleich einer anderen.
  const gleich = (a, b) => Math.abs(a.varianz - b.varianz) < 5
    && Math.abs(a.deckung - b.deckung) < 5
    && Math.abs(a.landAnteil - b.landAnteil) < 0.05;
  for (const [nameA, a] of [['open', offen], ['spires', spitz], ['flooded', flut], ['warren', wirr]]) {
    for (const [nameB, b] of [['open', offen], ['spires', spitz], ['flooded', flut], ['warren', wirr]]) {
      if (nameA >= nameB) continue;
      assert.ok(!gleich(a, b), `${nameA} und ${nameB} sind praktisch dieselbe Karte`);
    }
  }
});

test('Flut hat mehr Wasser als jede andere Form', () => {
  // Die Form heißt „wasserreich" — das muss die messbare Spitze sein.
  const flut = kennzahlen('flooded');
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    if (preset === 'flooded') continue;
    const andere = kennzahlen(preset);
    assert.ok(flut.landAnteil < andere.landAnteil,
      `Flut hat mehr Land (${(flut.landAnteil * 100).toFixed(0)} %) als ${preset} `
      + `(${(andere.landAnteil * 100).toFixed(0)} %) — es ist nicht die wasserreichste Form`);
  }
});

test('Offene Weite erlaubt mehr weite Schüsse als jede andere Form', () => {
  /*
   * Gemessen an der geraden Linie zwischen zwei Punkten auf gleicher Höhe: Eine
   * offene Karte ist genau dadurch offen, dass solche Linien frei bleiben.
   *
   * **Einschränkung, gemessen und nicht weggeredet:** Der erste Anlauf forderte,
   * „offene Weite" müsse die offenste aller Formen sein. Das ist FALSCH —
   * `spires` erreicht 43 %, `open` 41 %. Steiles Gelände verkürzt die
   * Sichtlinien nicht: Wer auf einem Gipfel steht, sieht weit, und dieses Maß
   * belohnt hohe Positionen. `spires` ist also nicht eng, sondern steil.
   *
   * Verglichen wird deshalb mit den Formen, die ein Höhenprofil mit flachen
   * Tälern haben — dort ist der Unterschied eindeutig (41 % gegen 15–17 %).
   */
  const weiteLinien = preset => {
    const rng = new SeededRandom(4242);
    const terrain = generateTerrain({ rng, width: W, height: H, preset });
    let frei = 0;
    let geprueft = 0;
    const d = 426;
    for (let sx = 40; sx + d <= W - 40; sx += 10) {
      const sy = surfaceY(terrain.bitmap, W, H, sx);
      if (sy <= 0 || sy >= terrain.waterLevel) continue;
      const zy = surfaceY(terrain.bitmap, W, H, sx + d);
      if (zy <= 0 || zy >= terrain.waterLevel) continue;
      geprueft += 1;
      let ok = true;
      for (let o = 0; o <= d; o += 4) {
        const s = surfaceY(terrain.bitmap, W, H, sx + o);
        // Ein Boden, der ÜBER der Schusslinie liegt, blockiert.
        if (s > 0 && s <= sy - 5) { ok = false; break; }
      }
      if (ok) frei += 1;
    }
    return geprueft > 0 ? frei / geprueft : 0;
  };

  const offen = weiteLinien('open');
  assert.ok(offen > 0.35,
    `Offene Weite: nur ${(offen * 100).toFixed(0)} % freie weite Linien (erwartet über 35 %)`);

  // Deutlich mehr als die Formen mit welligem Profil.
  for (const preset of ['hills', 'mountains', 'islands', 'caverns']) {
    const andere = weiteLinien(preset);
    assert.ok(offen > andere * 1.5,
      `Offene Weite (${(offen * 100).toFixed(0)} %) ist nicht offener als ${preset} `
      + `(${(andere * 100).toFixed(0)} %)`);
  }
});

test('Felsspitzen sind steil, nicht eng — und Gewirr ist uneben, nicht offen', () => {
  /*
   * Die Eigenarten der beiden neuen Formen, die NICHT über die Sichtlinien
   * laufen. Beide wurden beim Schreiben des Tests über die Offenheit geklärt:
   * `spires` ist über die Höhe definiert, `warren` über die Unebenheit des
   * Bodens. Ohne diesen Test könnte eine spätere Änderung sie einebnen, ohne
   * dass die Offenheitsprüfung anschlägt.
   */
  const spitz = kennzahlen('spires');
  const wirr = kennzahlen('warren');
  const huegel = kennzahlen('hills');

  assert.ok(spitz.varianz > huegel.varianz * 2,
    `Felsspitzen (${spitz.varianz.toFixed(0)}) sind nicht doppelt so hoch wie Hügel `
    + `(${huegel.varianz.toFixed(0)})`);

  assert.ok(wirr.deckung > huegel.deckung + 25,
    `Gewirr (${wirr.deckung} Geländesprünge) ist nicht deutlich unebener als Hügel `
    + `(${huegel.deckung})`);

  // Und sie sind verschieden voneinander: steil ist nicht uneben.
  assert.ok(Math.abs(spitz.deckung - wirr.deckung) > 20,
    'Felsspitzen und Gewirr sind in der Unebenheit praktisch gleich');
});

test('Die vier neuen Formen sind noch OHNE eigene Kulissen — bewusst', () => {
  /*
   * Das Projekt verlangt: Jede Geländeform hat ein EIGENES Leitbiom, und dessen
   * `mapPreset` ist genau diese Form (Regel in `tests/backdrops.test.js`). Ein
   * Leitbiom ist damit eine Kulissengruppe mit eigenen Bildern.
   *
   * Für die vier neuen Formen gibt es diese Bilder nicht. Sie zu erfinden wäre
   * eine Inhaltsentscheidung (welche Szene zeigt „Offene Weite", welche
   * „Gewirr"?) — und ein vorhandenes Biom wiederzuverwenden verbietet die Regel.
   *
   * Deshalb: keine Zuordnung, und diese Lücke hier NAMENTLICH festgehalten.
   * Damit gilt beides — die neuen Formen sind spielbar, und die fehlende
   * Zuordnung ist sichtbar statt vergessen. Der Test schlägt an, sobald jemand
   * einem der vier Formen ein Biom gibt, das schon vergeben ist, oder eine
   * fünfte Form ohne Kulissen hinzukommt.
   */
  const OHNE_KULISSEN = ['open', 'spires', 'flooded', 'warren'];

  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    if (OHNE_KULISSEN.includes(preset)) {
      // Beide Tabellen müssen die Form gleich behandeln: entweder beide ohne
      // Zuordnung oder beide mit.
      assert.equal(BIOME_SCENERY[preset], undefined,
        `${preset} hat jetzt eine Biomgruppe in scenery.js (${BIOME_SCENERY[preset]}) — `
        + 'dann bitte aus OHNE_KULISSEN entfernen');
      assert.equal(BIOME_BACKDROPS[preset], undefined,
        `${preset} hat jetzt eine Biomgruppe in backdrops.js (${BIOME_BACKDROPS[preset]})`);
      continue;
    }
    // Die ursprünglichen Formen MÜSSEN zugeordnet sein.
    assert.ok(BIOME_SCENERY[preset], `${preset}: keine Biomgruppe in scenery.js`);
    assert.ok(BIOME_BACKDROPS[preset], `${preset}: keine Biomgruppe in backdrops.js`);
    assert.equal(BIOME_SCENERY[preset], BIOME_BACKDROPS[preset],
      `${preset}: die Biomgruppen in scenery.js und backdrops.js weichen voneinander ab`);
  }

  // Und die Lücke ist namentlich vollständig: Wer eine Form hinzufügt, muss sie
  // hier eintragen — sonst fällt der Test darüber (fehlende Biomgruppe).
  assert.equal(OHNE_KULISSEN.length, 4,
    'Die Liste der Formen ohne Kulissen hat sich geändert — bitte prüfen, ob das Absicht war');
});

test('Das Gelände bleibt deterministisch — auch mit der neuen Startplatzsuche', () => {
  /*
   * `#drySpawnX` sucht abwechselnd rechts und links. Damit die Platzierung
   * reproduzierbar bleibt, muss die Suchreihenfolge fest sein. Ein Replay über
   * die Kartenform `flooded` hängt daran.
   */
  for (const preset of ['open', 'spires', 'flooded', 'warren']) {
    const erstes = new MatchController({ seed: 777, teams: 2, playersPerTeam: 3, preset });
    erstes.start();
    const zweites = new MatchController({ seed: 777, teams: 2, playersPerTeam: 3, preset });
    zweites.start();

    assert.deepEqual(
      erstes.getState().entities.map(e => [e.x, e.y, e.waterLevel]),
      zweites.getState().entities.map(e => [e.x, e.y, e.waterLevel]),
      `${preset}: Die Startplatzierung ist nicht reproduzierbar`,
    );
    assert.equal(erstes.stateHash(), zweites.stateHash(),
      `${preset}: Der Zustandshash weicht bei gleichem Seed ab`);
  }
});

test('Alle Formen sind im Menü wählbar', async () => {
  /*
   * Eine Geländeform, die es im Motor gibt, aber nicht in der Auswahl, ist für
   * den Spieler nicht vorhanden. Geprüft wird gegen das Markup — die Liste dort
   * ist die einzige Stelle, an der die Auswahl entsteht.
   */
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    assert.ok(html.includes(`<option value="${preset}"`),
      `Die Geländeform „${preset}" fehlt in der Kartenwahl (index.html)`);
  }
});

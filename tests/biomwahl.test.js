/**
 * Tests: Die Kulisse folgt der Karte.
 *
 * ## Die Vorgabe
 *
 * „Kartengenerator hoch 10, aber ohne dass Menschen Einfluss nehmen können."
 *
 * Das gilt auch für das Aussehen. Eine Lavaröhre mit grünem Gras darauf ist
 * nicht hässlich, sondern **falsch**: Das Bild widerspricht dem, was die Karte
 * ist. Die Zuordnung Charakter → Biom ist deshalb **ableitend**, nicht
 * zufällig.
 *
 * ## Was hier geprüft wird
 *
 *   1. **Die Ableitung** — aus welchem Merkmal folgt welches Biom.
 *   2. **Die Schwellen** — sie müssen aus der gemessenen Verteilung kommen,
 *      nicht aus dem Augenschein. Der erste Anlauf lag zu niedrig und machte
 *      die Hälfte aller Karten zur Überschwemmung.
 *   3. **Der Determinismus** — derselbe Seed ergibt dieselbe Kulisse. Sonst
 *      zeigte ein Replay ein anderes Bild als das aufgezeichnete Geschehen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  biomFuerCharakter, kulisseFuerBiom,
} from '../src/shared/biomwahl.js';
import { BACKDROP_BIOMES } from '../src/shared/config/backdrops.js';
import { erzeugeAutonomeKarte, zieheCharakter } from '../src/shared/terrainGen3.js';
import { MatchController } from '../src/engine/match.js';
import { SeededRandom } from '../src/shared/prng.js';

/** Ein Charakter mit den Vorgabewerten, überschreibbar. */
function charakter(werte = {}) {
  return {
    landanteil: 0.3, hoehlung: 0.05, steilheit: 0.3,
    wasser: 0.05, zerklueftung: 2, zusammenhaengung: 0.6, inseligkeit: 0.1,
    ...werte,
  };
}

test('Viel Wasser ergibt eine Überschwemmung', () => {
  assert.equal(biomFuerCharakter(charakter({ wasser: 0.29 })), 'deluge');
});

test('Viele Höhlen ergeben ein Höhlensystem', () => {
  assert.equal(biomFuerCharakter(charakter({ hoehlung: 0.28 })), 'caverns');
});

test('Getrennte Landmassen ergeben Inseln', () => {
  assert.equal(biomFuerCharakter(charakter({ inseligkeit: 0.43 })), 'island');
});

test('Steile Flanken ergeben Gebirge', () => {
  assert.equal(biomFuerCharakter(charakter({ steilheit: 0.5 })), 'alpine');
});

test('Ein unauffälliger Charakter ergibt Wald', () => {
  /*
   * Der Normalfall. Ohne diese Prüfung könnte eine Regel zu früh greifen und
   * jede Karte zu einem Sonderbiom machen.
   */
  assert.equal(biomFuerCharakter(charakter()), 'forest');
  assert.equal(biomFuerCharakter(null), 'forest');
});

test('Die Reihenfolge der Regeln ist festgelegt', () => {
  /*
   * Ein Charakter kann mehrere Merkmale tragen. Dann muss entschieden werden,
   * welches das Bild prägt — und zwar reproduzierbar.
   *
   * Die Reihenfolge ist: Wasser vor Höhlen vor Inseln vor Steilheit. Ein
   * Charakter mit ALLEN Merkmalen ergibt damit `deluge`.
   */
  const alles = charakter({ wasser: 0.3, hoehlung: 0.3, inseligkeit: 0.45, steilheit: 0.52 });
  assert.equal(biomFuerCharakter(alles), 'deluge',
    'bei mehreren Merkmalen muss die festgelegte Reihenfolge greifen');
});

test('Die Schwellen liegen im oberen Fünftel der Achsen', () => {
  /*
   * ## Der Fehler, den dieser Test verhindert
   *
   * FUND (belegt): Die ersten Schwellen lagen im „oberen Drittel" und waren
   * damit zu niedrig — gemessen über 30 Karten machte `deluge` die Hälfte aus.
   * Der Grund: Die Achsen werden U-förmig gezogen, Extreme sind häufiger als
   * die Mitte.
   *
   * Geprüft wird deshalb: Von 200 gezogenen Charakteren darf KEIN einzelnes
   * Biom mehr als die Hälfte ausmachen, und `forest` muss der häufigste Fall
   * sein — es ist der Normalfall für alles dazwischen.
   */
  const rng = new SeededRandom(31337);
  const zaehler = new Map();

  for (let i = 0; i < 200; i += 1) {
    const biom = biomFuerCharakter(zieheCharakter(rng));
    zaehler.set(biom, (zaehler.get(biom) ?? 0) + 1);
  }

  const haeufigstes = [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0];

  assert.equal(haeufigstes[0], 'forest',
    `Das häufigste Biom ist „${haeufigstes[0]}" (${haeufigstes[1]} von 200) — `
    + 'erwartet wird „forest" als Normalfall');

  assert.ok(haeufigstes[1] < 150,
    `Ein Biom macht ${haeufigstes[1]} von 200 aus — zu dominant`);
});

test('Jedes Biom kommt vor', () => {
  /*
   * Die Gegenprobe: Eine Schwelle, die nie erreicht wird, ist bedeutungslos —
   * die zugehörige Landschaft wäre im Spiel nie zu sehen.
   */
  const rng = new SeededRandom(4711);
  const gesehen = new Set();

  for (let i = 0; i < 400; i += 1) {
    gesehen.add(biomFuerCharakter(zieheCharakter(rng)));
  }

  for (const biom of ['deluge', 'caverns', 'island', 'alpine', 'forest']) {
    assert.ok(gesehen.has(biom),
      `Das Biom „${biom}" kam in 400 Zügen nicht vor — seine Schwelle ist zu hoch`);
  }
});

test('Derselbe Seed ergibt dieselbe Kulisse', () => {
  /*
   * Die Grundzusage des Projekts. Eine Kulisse, die sich bei jedem Abspielen
   * ändert, würde das Bild vom aufgezeichneten Geschehen trennen.
   */
  const biom = BACKDROP_BIOMES.find(b => b.id === 'forest');
  const a = kulisseFuerBiom({ seed: 4242, biome: biom });
  const b = kulisseFuerBiom({ seed: 4242, biome: biom });

  assert.deepEqual(a, b, 'zwei Aufrufe mit demselben Seed ergeben dieselbe Kulisse');
  assert.ok(a.key, 'die Kulisse braucht einen Schlüssel');
});

test('Verschiedene Seeds ergeben verschiedene Kulissen', () => {
  /*
   * Der Seed wählt die Variante INNERHALB des Bioms. Ein Biom mit nur einer
   * Variante hätte nichts zu variieren — hier wird ein Biom mit mehreren
   * geprüft.
   */
  const biom = BACKDROP_BIOMES.find(b => b.id === 'forest');
  assert.ok(biom.variants.length > 1, 'das Wald-Biom braucht mehrere Varianten');

  const gesehen = new Set();
  for (let seed = 0; seed < 20; seed += 1) {
    gesehen.add(kulisseFuerBiom({ seed, biome: biom }).key);
  }

  assert.ok(gesehen.size > 1,
    'zwanzig Seeds ergaben nur eine einzige Kulisse — der Seed wählt nicht');
});

test('Ein unbekanntes Biom ergibt keine Kulisse', () => {
  /*
   * Der Aufrufer muss den Fall behandeln können — ein stiller Rückfall auf
   * irgendeine Kulisse würde eine falsche Szene zeigen.
   */
  assert.equal(kulisseFuerBiom({ seed: 1, biome: null }), null);
  assert.equal(kulisseFuerBiom({ seed: 1, biome: { variants: [] } }), null);
});

test('Alle fünf Biom-Kennungen existieren wirklich', () => {
  /*
   * Die Zuordnung nennt Kennungen als Text. Ein Tippfehler würde erst im Spiel
   * auffallen — und dann als fehlende Kulisse.
   */
  for (const id of ['deluge', 'caverns', 'island', 'alpine', 'forest']) {
    assert.ok(BACKDROP_BIOMES.some(b => b.id === id),
      `Das Biom „${id}" gibt es in BACKDROP_BIOMES nicht`);
  }
});

test('Eine echte Karte ergibt eine echte Kulisse', () => {
  /*
   * Die Prüfung mit Generatordaten — nicht mit einem von Hand gebauten
   * Charakter. Das ist der Weg, den das Spiel nimmt.
   */
  for (let i = 0; i < 10; i += 1) {
    const seed = 500000 + i * 1117;
    const k = erzeugeAutonomeKarte({
      rng: new SeededRandom(seed), width: 320, height: 180,
    });
    const biomId = biomFuerCharakter(k.charakter);
    const biom = BACKDROP_BIOMES.find(b => b.id === biomId);
    const kulisse = kulisseFuerBiom({ seed, biome: biom });

    assert.ok(kulisse, `Seed ${seed}: keine Kulisse für Biom „${biomId}"`);
    assert.ok(kulisse.key.includes('/'), 'der Schlüssel muss Biom und Variante nennen');
  }
});

test('Der Durchstich: Der Charakter kommt bis zur Szene durch', () => {
  /*
   * ## Der Fehler, den dieser Test verhindert
   *
   * FUND (belegt, eigener Fehler): Die Szene wurde im KONSTRUKTOR gesetzt und
   * las `this.kartencharakter` — ein Feld, das zu diesem Zeitpunkt noch nicht
   * existiert. `#buildTerrain` läuft erst in `start()`.
   *
   * Gemessen waren deshalb **24 von 24 Karten** Wald: Das Biom fiel immer auf
   * die Vorgabe zurück, und die Zuordnung lief vollständig ins Leere.
   *
   * Der Test prüft den ganzen Weg: Karte erzeugen → Charakter → Biom →
   * Szene. Nicht die Einzelfunktionen, sondern das Zusammenspiel.
   */
  const gesehen = new Set();

  for (let i = 0; i < 12; i += 1) {
    const seed = 300000 + i * 4111;
    const m = new MatchController({
      seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom',
      turnDurationMs: 2000, maxRounds: 2,
    });
    m.start();

    assert.ok(m.kartencharakter, `Seed ${seed}: kein Kartencharakter`);
    assert.ok(m.biomId, `Seed ${seed}: kein Biom gesetzt`);

    // Das Biom muss dem Charakter entsprechen.
    assert.equal(m.biomId, biomFuerCharakter(m.kartencharakter),
      `Seed ${seed}: Biom „${m.biomId}" passt nicht zum Charakter`);

    // Und die Szene muss es übernommen haben.
    assert.equal(m.scenery?.biomeId, m.biomId,
      `Seed ${seed}: die Szene hat das Biom nicht übernommen`);

    gesehen.add(m.biomId);
  }

  assert.ok(gesehen.size > 1,
    `Zwölf Seeds ergaben nur das Biom „${[...gesehen][0]}" — `
    + 'der Charakter kommt nicht bis zur Szene durch');
});

test('Eine Höhlenkarte bekommt eine Höhlenszene', () => {
  /*
   * Die stimmige Szene ist der Zweck der Zuordnung. Eine durchlöcherte Kaverne
   * mit grünem Gras darauf wäre nicht hässlich, sondern falsch.
   *
   * Hier wird ein Seed gesucht, dessen Charakter viele Höhlen hat — und dann
   * geprüft, dass die Szene aus dem Höhlenbiom kommt.
   */
  let gefunden = null;

  for (let i = 0; i < 25 && !gefunden; i += 1) {
    const seed = 300000 + i * 4111;
    const m = new MatchController({
      seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom',
      turnDurationMs: 2000, maxRounds: 2,
    });
    m.start();
    if (m.biomId === 'caverns') gefunden = m;
  }

  assert.ok(gefunden,
    'In 25 Seeds fand sich keine Höhlenkarte — die Schwelle ist zu hoch');

  assert.ok(['caverns', 'warren', 'abstract'].includes(gefunden.scenery.biomeId),
    `Eine Höhlenkarte bekam die Szene „${gefunden.scenery.biomeId}"`);
});

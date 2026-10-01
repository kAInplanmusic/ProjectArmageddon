/**
 * Tests: `#spawnPlayers()` und `#buildTerrain()` sind reine Delegatoren.
 *
 * ## Der Auftrag, den diese Datei festhält (W1-4c/4d)
 *
 * Zwei Rümpfe des Motors standen noch in `MatchController`: das Aufstellen der
 * Figuren (96 Zeilen) und der Geländebau (95 Zeilen). Beide griffen in private
 * Felder und waren nur über ein laufendes Match prüfbar. Sie liegen jetzt als
 * **reine Funktionen** in `engine/spawnManager.js` (`erzeugeSpieler`) und
 * `engine/terrainBuilder.js` (`baueTerrain`) — dasselbe Muster wie
 * `stateSnapshot.js` (W1-4a) und `shooting.js` (W1-4b): Der Match baut eine
 * **Quelle** und reicht sie hinein.
 *
 * Geprüft werden fünf Zusagen:
 *
 *   1. **Kein `this`** in beiden Modulen — sonst wären sie verkappte Methoden.
 *   2. **Die Delegatoren** — `#spawnPlayers()` und `#buildTerrain()` rufen die
 *      ausgelagerten Funktionen und enthalten die alte Rechnung nicht mehr.
 *   3. **EIN Rückgabepfad** in `terrainBuilder` — der erste Entwurf gab aus
 *      jedem Generator-Zweig ein eigenes Objekt zurück (dreimal derselbe Aufbau).
 *   4. **Keine zweite Kollisionsmaske** — `terrainBuilder` liefert die Bitmap,
 *      `match.js` baut die Maske. Zweimal `CollisionMask.fromBitmap` über
 *      dieselben Daten wäre eine zweite Wahrheit über die Kollision.
 *   5. **Die Arrays bleiben beim Match** — `erzeugeSpieler` LIEFERT die
 *      Spieler-Einträge, es schiebt sie nicht selbst in `#players`/`#turnOrder`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MatchController } from '../src/engine/match.js';
import { erzeugeSpieler } from '../src/engine/spawnManager.js';
import { baueTerrain } from '../src/engine/terrainBuilder.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { CLASS_IDS, ARCHETYPE_IDS, resolveLoadout } from '../src/shared/config/classes.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');

function quelle(datei) {
  return readFileSync(resolve(WURZEL, datei), 'utf8');
}

test('spawnManager.js enthält kein `this`', () => {
  /*
   * DIE Kernzusage der Auslagerung. Eine Funktion, die über `this` an eine
   * Instanz gebunden ist, ist keine reine Funktion — sie wäre nur eine Methode
   * an einem anderen Ort.
   */
  const code = ohneKommentare(quelle('src/engine/spawnManager.js'));
  const treffer = code.match(/\bthis\b/g) ?? [];

  assert.deepEqual(treffer, [],
    `spawnManager.js greift ${treffer.length}-mal auf \`this\` zu — der Aufbau muss `
    + 'über die Quelle (Parameter) laufen, nicht über die Instanz');
});

test('terrainBuilder.js enthält kein `this`', () => {
  const code = ohneKommentare(quelle('src/engine/terrainBuilder.js'));
  const treffer = code.match(/\bthis\b/g) ?? [];

  assert.deepEqual(treffer, [],
    `terrainBuilder.js greift ${treffer.length}-mal auf \`this\` zu — der Geländebau `
    + 'muss über die Quelle (Parameter) laufen, nicht über die Instanz');
});

test('#spawnPlayers() ist ein reiner Delegator', () => {
  /*
   * Gemessen wird an der METHODE, nicht an der ganzen Datei: Der Rumpf
   * zwischen `#spawnPlayers()` und der schließenden Klammer darf nur noch den
   * einen Aufruf und die zwei Übernahmen enthalten.
   *
   * Die alte Rechnung (`combatProfile`, `addComponent`, `getClassLoadout`) darf
   * dort NICHT mehr vorkommen — sonst wäre der Rumpf nur halb draußen.
   */
  const code = ohneKommentare(quelle('src/engine/match.js'));
  const rumpf = /#spawnPlayers\(\)\s*\{([\s\S]*?)\n {2}}/.exec(code);

  assert.ok(rumpf, 'die Methode #spawnPlayers() wurde nicht gefunden');
  const inhalt = rumpf[1];

  assert.match(inhalt, /erzeugeSpieler\(this\.#spawnQuelle\(\)\)/,
    `#spawnPlayers() ruft erzeugeSpieler nicht über #spawnQuelle(): ${inhalt}`);

  for (const alt of ['combatProfile', 'addComponent', 'getClassLoadout', 'resolveLoadout']) {
    assert.ok(!inhalt.includes(alt),
      `\`${alt}\` steht noch im Rumpf von #spawnPlayers() — die Rechnung ist nicht ausgezogen`);
  }
});

test('#buildTerrain() ist ein reiner Delegator', () => {
  const code = ohneKommentare(quelle('src/engine/match.js'));
  const rumpf = /#buildTerrain\(\)\s*\{([\s\S]*?)\n {2}}/.exec(code);

  assert.ok(rumpf, 'die Methode #buildTerrain() wurde nicht gefunden');
  const inhalt = rumpf[1];

  assert.match(inhalt, /baueTerrain\(\{/,
    `#buildTerrain() ruft baueTerrain nicht auf: ${inhalt}`);

  // Die drei Generatoren gehören in den Builder, nicht mehr in den Motor.
  for (const generator of ['erzeugeKarte', 'erzeugeAutonomeKarte', 'generateTerrain']) {
    assert.ok(!inhalt.includes(generator),
      `\`${generator}\` steht noch im Rumpf von #buildTerrain() — der Generator lief nicht aus`);
  }
});

test('terrainBuilder liefert die Bitmap — die Kollisionsmaske baut das Match', () => {
  /*
   * FUND (belegt, eigener Fehler beim Umbau): Der erste Entwurf baute in
   * `baueTerrain` eine `CollisionMask` und in `match.js` gleich noch eine aus
   * derselben Bitmap. Dieselben Daten zweimal ausgewertet, zwei Wahrheiten
   * darüber, was die Kollision trägt.
   *
   * Der Strukturtest ist die Gegenprobe: `terrainBuilder` darf `CollisionMask`
   * nicht einmal NENNEN, `match.js` muss es tun (dort ist der Produktivpfad).
   */
  const builder = ohneKommentare(quelle('src/engine/terrainBuilder.js'));
  assert.ok(!builder.includes('CollisionMask'),
    'terrainBuilder baut die Kollisionsmaske — sie gehört dem Motor (match.js)');

  const match = ohneKommentare(quelle('src/engine/match.js'));
  assert.match(match, /CollisionMask\.fromBitmap\(/,
    'match.js muss die Kollisionsmaske aus der gelieferten Bitmap bauen');
});

test('terrainBuilder hat genau EINEN Rückgabepfad für das Ergebnis', () => {
  /*
   * FUND (belegt, eigener Fehler beim Umbau): Die erste Fassung gab aus jedem
   * der drei Generator-Zweige ein eigenes Objekt zurück — dreimal derselbe
   * Aufbau, und nur ein Zweig trug Charakter/Kennzahlen/Material. Wer ein Feld
   * hinzufügte, musste es an drei Stellen tun.
   *
   * Gemessen wird die ANZAHL der Objekt-Rückgaben IM RUMPF VON `baueTerrain` —
   * nicht in der ganzen Datei: `baueServices` und der Schadens-Modifikator
   * geben ebenfalls Objekte zurück, und das ist richtig so. Eine zweite
   * Ergebnis-Rückgabe in `baueTerrain` lässt den Test fallen, egal welche
   * Felder sie hat.
   */
  const code = ohneKommentare(quelle('src/engine/terrainBuilder.js'));
  const rumpf = /export function baueTerrain\(quelle\)\s*\{([\s\S]*?)\n}/.exec(code);
  assert.ok(rumpf, 'baueTerrain() wurde nicht gefunden');

  const ergebnisRueckgaben = rumpf[1].match(/return\s*\{/g) ?? [];
  assert.equal(ergebnisRueckgaben.length, 1,
    `baueTerrain hat ${ergebnisRueckgaben.length} Ergebnis-Rückgaben — der Aufbau `
    + 'des Ergebnisses muss an EINER Stelle stehen (die Zweige setzen nur ihre '
    + 'Besonderheiten)');
});

test('erzeugeSpieler fasst die Klassen-Arrays nicht an und liefert sie zurück', () => {
  /*
   * Der Unterschied zu `#spawnPlayers()` als Methode: Die reine Funktion kennt
   * `#players`/`#turnOrder` nicht. Sie gibt die Einträge ZURÜCK; der Delegator
   * übernimmt sie. Sonst hätte die Auslagerung nur die Schreibzugriffe
   * verschoben, statt die Kopplung zu lösen.
   */
  const code = ohneKommentare(quelle('src/engine/spawnManager.js'));

  assert.ok(!code.includes('turnOrder'),
    'erzeugeSpieler nennt `turnOrder` — die Zugfolge leitet der Delegator ab');
  assert.ok(!/\.players\s*(\.push|\[)/.test(code),
    'erzeugeSpieler schreibt selbst in die Spielerliste — sie muss die Einträge zurückgeben');

  // Und die Gegenprobe am echten Aufruf: eine schlichte Attrappe genügt.
  let naechsteId = 0;
  const attrappe = {
    teams: 2,
    playersPerTeam: 2,
    width: 1280,
    height: 720,
    drySpawnX: x => x,
    surfaceYAt: () => 600,
    sidegrades: [],
    loadouts: [],
    baseHealth: 100,
    resolveLoadout,
    world: {
      // Eigener Zähler, NICHT `angelegt.length`: Die Attrappe legt je Entity
      // acht Komponenten an — aus der Listenlänge würde 1, 10, 19, 28.
      createEntity: () => {
        naechsteId += 1;
        return naechsteId;
      },
      addComponent: () => {},
    },
    inventory: { register: () => {} },
  };

  const eintraege = erzeugeSpieler(attrappe);

  assert.ok(Array.isArray(eintraege), 'erzeugeSpieler muss ein Array zurückgeben');
  assert.equal(eintraege.length, 4, '2 Teams × 2 Spieler = 4 Einträge');
  for (const eintrag of eintraege) {
    assert.ok(Number.isInteger(eintrag.entityId), 'jeder Eintrag braucht eine Entity-Kennung');
    assert.ok(Number.isInteger(eintrag.teamId), 'jeder Eintrag braucht ein Team');
    assert.ok(Number.isInteger(eintrag.classId), 'jeder Eintrag braucht eine Klasse');
    assert.ok(Number.isInteger(eintrag.archetypeId), 'jeder Eintrag braucht einen Archetyp');
    assert.equal(eintrag.alive, true, 'frisch aufgestellte Figuren leben');
  }
  // Die Kennungen sind stabil vergeben (Determinismus der Aufstellung).
  assert.deepEqual(eintraege.map(e => e.entityId), [1, 2, 3, 4]);
});

test('baueTerrain läuft mit einer schlichten Quelle — ohne Match', () => {
  /*
   * Die Gegenprobe zur Struktur: Der Geländebau braucht kein MatchController.
   * Die Quelle trägt den Seed-Manager und die Services, sonst nichts.
   */
  const seedManager = new MatchSeedManager(4242);
  const ergebnis = baueTerrain({
    seedManager,
    width: 1280,
    height: 720,
    kartentyp: null,
    preset: 'hills',
    events: { emit: () => {} },
    statuses: { armorOf: () => 0, absorbWithShield: () => ({ absorbed: 0, rest: 0 }) },
    handleProjectileImpact: () => {},
    world: {},
  });

  assert.ok(ergebnis.bitmap instanceof Uint8Array, 'die Bitmap muss ein Uint8Array sein');
  assert.ok(ergebnis.bitmap.length > 0, 'die Bitmap darf nicht leer sein');
  assert.ok(Number.isFinite(ergebnis.waterBaseY), 'der Wasserstand muss eine Zahl sein');
  assert.equal(ergebnis.material, null, 'das 1D-Gelände hat kein Materialfeld');
  assert.equal(ergebnis.kartencharakter, null, 'ohne autonomen Generator kein Charakter');
  assert.equal(typeof ergebnis.services.damageModifier, 'function',
    'der Schadens-Modifikator muss mitgeliefert werden');
  assert.equal(typeof ergebnis.services.onProjectileImpact, 'function',
    'der Einschlag-Haken muss mitgeliefert werden');
});

test('Der Match stellt weiterhin über die delegierte Funktion auf', () => {
  /*
   * Die Gegenprobe am echten Motor — dieselbe Haltung wie in
   * `tests/shooting.test.js`: Die Auslagerung darf den Verlauf nicht ändern.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills',
    turnDurationMs: 1_000_000,
  });
  match.start();

  assert.equal(match.players.length, 4, '2 Teams × 2 Spieler müssen aufgestellt sein');

  for (const eintrag of match.players) {
    const x = match.world.getComponent(eintrag.entityId, 'Position', 'x');
    const y = match.world.getComponent(eintrag.entityId, 'Position', 'y');
    assert.ok(Number.isFinite(x) && Number.isFinite(y),
      `Figur ${eintrag.entityId} hat keine Position`);
    const health = match.world.getComponent(eintrag.entityId, 'Health', 'current');
    assert.ok(health > 0, `Figur ${eintrag.entityId} startet ohne Leben`);
    // Die Klasse kommt aus der Konfiguration — beide Kennungen müssen im
    // gültigen Bereich liegen (CLASS_IDS/ARCHETYPE_IDS).
    assert.ok(eintrag.classId >= 0 && eintrag.classId < CLASS_IDS.length,
      `unbekannte Klasse ${eintrag.classId}`);
    assert.ok(eintrag.archetypeId >= 0 && eintrag.archetypeId < ARCHETYPE_IDS.length,
      `unbekannter Archetyp ${eintrag.archetypeId}`);
  }

  /*
   * Die Zugfolge über die ÖFFENTLICHE Schnittstelle prüfen.
   *
   * `#turnOrder` ist privat und hat keinen Getter — der Zustand auch nicht
   * (er trägt nur `activePlayerId`). Gemessen wird deshalb die WIRKUNG:
   * Nach einem Zugwechsel muss ein ANDERER aufgestellter Spieler am Zug sein.
   * Wäre die Zugfolge leer geblieben, zeigte `activePlayerId` ins Leere.
   */
  const ersterSpieler = match.activePlayerId;
  assert.ok(match.players.some(e => e.entityId === ersterSpieler),
    'der aktive Spieler muss eine aufgestellte Figur sein');

  match.endTurn();
  const zweiterSpieler = match.activePlayerId;
  assert.notEqual(zweiterSpieler, ersterSpieler,
    'nach dem Zugende muss ein anderer Spieler am Zug sein — die Zugfolge ist leer');
  assert.ok(match.players.some(e => e.entityId === zweiterSpieler),
    'auch der zweite Aktive muss eine aufgestellte Figur sein');
});

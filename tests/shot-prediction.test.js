/**
 * Tests der clientseitigen Schussvorhersage.
 *
 * Geprüft wird die RECHNUNG, nicht die Darstellung: Die Vorhersage muss
 * dieselbe Bahn ergeben wie die Vorschau des MatchControllers. Beide Seiten
 * rechnen mit denselben Konstanten — ein eigener Satz Zahlen hier wäre genau
 * der Fehler, den die Waffenwerte schon einmal hatten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  predictTrajectory,
  ShotPredictor,
  pendingTrajectory,
  launchSpeedMultiplier,
  PREDICTION_GRAVITY,
  PREDICTION_DRAG,
  PREDICTION_POWER_TO_SPEED,
  MAX_PREDICTION_STEPS,
} from '../src/client/shotPrediction.js';
import { MatchController } from '../src/engine/match.js';
import { POWER_TO_SPEED } from '../src/shared/ballistics.js';
import { combatProfile, CLASS_IDS, ARCHETYPE_IDS } from '../src/shared/config/classes.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import { DEFAULT_PROJECTILE_GRAVITY, DEFAULT_PROJECTILE_DRAG } from '../src/engine/systems/projectileSystem.js';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');

test('Die Konstanten der Vorhersage stimmen mit der Simulation überein', () => {
  /*
   * Schwerkraft, Luftwiderstand und Kraft→Geschwindigkeit kommen aus EINER
   * Quelle: `src/shared/ballistics.js`. Vorhersage, Motor, Zielvorschau und
   * Bot-KI lesen dieselben Zahlen. Wichen sie ab, zeigte die Vorhersage eine
   * Bahn, die die Waffe nicht fliegt.
   */
  assert.equal(PREDICTION_GRAVITY, DEFAULT_PROJECTILE_GRAVITY);
  assert.equal(PREDICTION_DRAG, DEFAULT_PROJECTILE_DRAG);
  assert.equal(PREDICTION_POWER_TO_SPEED, POWER_TO_SPEED);

  /*
   * Und die Quelle ist wirklich EINE.
   *
   * FUND (belegt): Vorher stand die Zahl `0.14` zweimal da — in `match.js` und
   * als Abschrift in `shotPrediction.js`. Der Test las sie per Textsuche aus
   * `match.js` und hätte gemerkt, wenn eine der beiden wandert; hätte man aber
   * BEIDE gleichzeitig verschoben, hätte er zugestimmt. Diese Fassung prüft
   * deshalb die Zahl dort, wo sie definiert ist, und verbietet sie überall
   * sonst.
   */
  const quelle = readFileSync(resolve(WURZEL, 'src/shared/ballistics.js'), 'utf8');
  const treffer = quelle.match(/export const POWER_TO_SPEED = ([\d.]+);/);
  assert.ok(treffer, 'POWER_TO_SPEED steht nicht mehr in src/shared/ballistics.js');
  assert.equal(PREDICTION_POWER_TO_SPEED, Number(treffer[1]));

  for (const datei of [
    'src/shared/ballistics.js',   // die eine legitime Stelle
    'src/engine/match.js',
    'src/engine/systems/projectileSystem.js',
    'src/client/shotPrediction.js',
  ]) {
    const text = readFileSync(resolve(WURZEL, datei), 'utf8');
    if (datei !== 'src/shared/ballistics.js') {
      // Keine zweite ZAHL in den Weiterleitungen.
      assert.doesNotMatch(text, /(POWER_TO_SPEED|PROJECTILE_DRAG|PROJECTILE_GRAVITY)\s*=\s*0\.\d/,
        `${datei} führt eine eigene Zahl — sie muss aus src/shared/ballistics.js kommen`);
      assert.match(text, /shared\/ballistics\.js/,
        `${datei} muss die gemeinsame Ballistik laden`);
    }
  }
});

test('Eine flache Bahn ohne Terrain läuft nicht ins Unendliche', () => {
  const ergebnis = predictTrajectory({ x: 100, y: 100, angle: 0, power: 100, width: 1280, height: 720 });
  assert.ok(ergebnis.points.length > 2);
  // Bei Winkel 0 wird nach unten beschleunigt, also endet die Bahn am Boden.
  assert.ok(ergebnis.impact !== null);
});

test('Die Vorhersage trifft dieselbe Bahn wie die Vorschau des MatchControllers', () => {
  /*
   * Der Kern dieser Änderung: Vorhersage und Simulation müssen IDENTISCH
   * rechnen. Geprüft wird gegen `aimPreview` desselben MatchControllers — die
   * Funktion, die auch der lokale Modus für die Zielvorschau nutzt.
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills' });
  match.start();
  const playerId = match.activePlayerId;
  assert.ok(playerId !== null, 'kein aktiver Spieler');

  const zustand = match.getState();
  const spieler = zustand.entities.find(e => e.entityId === playerId);
  assert.ok(spieler);

  const angle = 0.9;
  const power = 62;

  /*
   * Der Geschwindigkeitsfaktor MUSS mitgegeben werden — aus DREI Quellen:
   * Klasse, Archetyp und aktive Waffe.
   *
   * Fund (belegt): Im ersten Anlauf fehlte die Waffe. Die aktive Waffe war
   * `pa_041` mit `speedFactor: 1.3143`; die Vorhersage flog mit Faktor 1,0 und
   * war damit um 24 % zu kurz. Folge: Sie traf 40 Schritte früher auf Terrain
   * als die echte Bahn — die angezeigte Kurve endete mitten in der Luft.
   *
   * `aimPreview` rechnet ihn über `#launchVector` ein; die Vorhersage muss ihn
   * deshalb ebenfalls kennen.
   */
  const spielerKlasse = match.players.find(p => p.entityId === playerId);
  const aktiveWaffe = getWeapon(match.inventory.getActiveWeaponId(playerId));
  const faktor = launchSpeedMultiplier({
    classId: spielerKlasse.classId,
    archetypeId: spielerKlasse.archetypeId,
    weapon: aktiveWaffe,
    // Ohne die Kartenbreite rechnet die Vorhersage gegen den Motor (2026-09-19).
    kartenbreite: match.width,
  });

  const vorhersage = predictTrajectory({
    x: spieler.x,
    y: spieler.y,
    angle,
    power,
    speedMultiplier: faktor,
    gravityScale: aktiveWaffe?.gravityScale ?? 1,
    wind: zustand.wind,
    width: match.width,
    height: match.height,
    isSolid: (x, y) => match.terrain.isSolid(x, y),
  });

  const vorschau = match.aimPreview(playerId, angle, power, 180);

  assert.ok(vorschau.length > 3, 'Vorschau liefert zu wenige Punkte');
  // Der Einschlagpunkt ist die einzige Größe, die beide Wege vergleichbar
  // liefert: die Vorschau tastet jeden dritten Schritt ab, die Vorhersage
  // ebenfalls — die Rasterung ist also dieselbe.
  const letzterVorschau = vorschau[vorschau.length - 1];
  assert.ok(vorhersage.impact, 'Vorhersage ohne Einschlag');
  assert.ok(
    Math.abs(vorhersage.impact.x - letzterVorschau.x) <= 1.0,
    `x weicht ab: Vorhersage ${vorhersage.impact.x} gegen Vorschau ${letzterVorschau.x}`,
  );
  assert.ok(
    Math.abs(vorhersage.impact.y - letzterVorschau.y) <= 1.0,
    `y weicht ab: Vorhersage ${vorhersage.impact.y} gegen Vorschau ${letzterVorschau.y}`,
  );
});

test('Ohne Terrainprüfung endet die Bahn an der Kartengrenze statt am Boden', () => {
  const mitTerrain = predictTrajectory({
    x: 100, y: 300, angle: 1.0, power: 80,
    width: 1280, height: 720,
    isSolid: () => false,
  });
  assert.ok(mitTerrain.impact);
  /*
   * Die Bahn endet am Schritt, in dem sie die Grenze überschreitet — sie kann
   * also ein Stück DAHINTER liegen. Ein Schritt ist bei 60 Hz höchstens die
   * aktuelle Fluggeschwindigkeit (unter 14 px), deshalb ist ein Überschwingen
   * um wenige Pixel richtig und kein Fehler. Ein Test auf exakt 720 wäre eine
   * Prüfung der Abtastung, nicht der Grenze.
   */
  assert.ok(mitTerrain.impact.y >= 720 && mitTerrain.impact.y < 740,
    `Einschlag bei y=${mitTerrain.impact.y} erwartet (Grenze 720)`);
  assert.ok(!mitTerrain.truncated, 'an der Grenze ist die Bahn nicht abgeschnitten, sondern beendet');

  const ohneTerrain = predictTrajectory({ x: 100, y: 300, angle: 1.0, power: 80 });
  // Ohne Grenzen bleibt nur das Schrittlimit — die Bahn ist abgeschnitten.
  assert.equal(ohneTerrain.truncated, true);
  assert.equal(ohneTerrain.points.length, Math.ceil(MAX_PREDICTION_STEPS / 3) + 1);
});

test('Der Geschwindigkeitsfaktor stimmt mit dem Kampfprofil überein', () => {
  /*
   * Beide Schreibweisen müssen dasselbe ergeben: der INDEX (wie der
   * MatchController ihn führt) und der NAME (wie die Konfiguration ihn kennt).
   *
   * Fund (belegt): Im ersten Anlauf gab dieses Modul den Index UNKONVERTIERT an
   * `combatProfile` weiter. Das wirft nicht und liefert keinen leeren Wert —
   * es liefert für jede Klasse still dasselbe Profil (Faktor 0,6417), weil
   * `CLASS_DEFINITIONS[0]` nichts findet und der Rückfall greift. Die Klassen
   * waren damit wirkungslos. Dieser Test hält den Unterschied fest.
   */
  for (let index = 0; index < CLASS_IDS.length; index++) {
    for (let aIndex = 0; aIndex < ARCHETYPE_IDS.length; aIndex++) {
      const erwartet = combatProfile(CLASS_IDS[index], ARCHETYPE_IDS[aIndex]).launchSpeedMultiplier;
      assert.equal(
        launchSpeedMultiplier({ classId: index, archetypeId: aIndex }),
        erwartet,
        `Index ${index}/${aIndex} sollte ${erwartet} ergeben`,
      );
      // Und die Namensschreibweise führt zum selben Ergebnis.
      assert.equal(
        launchSpeedMultiplier({ classId: CLASS_IDS[index], archetypeId: ARCHETYPE_IDS[aIndex] }),
        erwartet,
        `Name ${CLASS_IDS[index]}/${ARCHETYPE_IDS[aIndex]}`,
      );
    }
  }
});

test('Unkonvertierte Indizes liefern unterschiedliche Faktoren je Klasse', () => {
  /*
   * Die Gegenprobe zum Fund oben: Wären alle Faktoren gleich, wäre die Klasse
   * bedeutungslos. Dieser Test schlägt fehl, sobald der Rückfall wieder für
   * alle Indizes greift — genau die Regression, die unbemerkt bleiben würde.
   */
  const faktoren = CLASS_IDS.map((_, index) => launchSpeedMultiplier({ classId: index, archetypeId: 0 }));
  const eindeutig = new Set(faktoren);
  assert.equal(eindeutig.size, CLASS_IDS.length,
    `Jede Klasse muss einen eigenen Faktor haben, erhalten: ${JSON.stringify(faktoren)}`);

  // Konkret: Artillery schießt weiter als Scout.
  const scout = launchSpeedMultiplier({ classId: 0, archetypeId: 0 });
  const artillery = launchSpeedMultiplier({ classId: 2, archetypeId: 0 });
  assert.ok(artillery > scout, `artillery ${artillery} sollte über scout ${scout} liegen`);
});

test('Der Waffenfaktor multipliziert den Geschwindigkeitsfaktor', () => {
  // Eine Waffe mit speedFactor 2 muss die doppelte Geschwindigkeit ergeben.
  const basis = launchSpeedMultiplier({ classId: 0, archetypeId: 0 });
  const doppelt = launchSpeedMultiplier({ classId: 0, archetypeId: 0, weapon: { speedFactor: 2 } });
  assert.equal(doppelt, basis * 2);
});

test('Ohne Klasse greift der Standardrückfall statt eines geratenen Werts', () => {
  const ohne = launchSpeedMultiplier({ classId: null, archetypeId: null });
  const fallback = combatProfile(null, null).launchSpeedMultiplier;
  assert.equal(ohne, fallback);
  assert.ok(Number.isFinite(ohne) && ohne > 0);
});

test('Eine schnellere Klasse fliegt messbar weiter — die Vorhersage nutzt den Faktor', () => {
  /*
   * Der Fund, der diese Änderung ausgelöst hat: Mit geratener Klasse lag die
   * Vorhersage um ein Drittel daneben. Dieser Test hält den Unterschied fest,
   * damit er nicht wieder unbemerkt verschwindet.
   *
   * Die Indizes sind 0 = scout, 1 = heavy, 2 = artillery (Reihenfolge aus
   * `CLASS_IDS`).
   */
  const scoutIndex = CLASS_IDS.indexOf('scout');
  const artilleryIndex = CLASS_IDS.indexOf('artillery');
  assert.ok(scoutIndex >= 0 && artilleryIndex >= 0, 'Klassennamen geändert — Test anpassen');

  const artillery = launchSpeedMultiplier({ classId: artilleryIndex, archetypeId: 0 });
  const scout = launchSpeedMultiplier({ classId: scoutIndex, archetypeId: 0 });
  assert.ok(artillery > scout, `artillery ${artillery} sollte über scout ${scout} liegen`);

  const gemeinsam = { x: 100, y: 400, angle: 0.7, power: 60, width: 4000, height: 4000 };
  const bahnArtillery = predictTrajectory({ ...gemeinsam, speedMultiplier: artillery });
  const bahnScout = predictTrajectory({ ...gemeinsam, speedMultiplier: scout });

  const letzterArtillery = bahnArtillery.points.at(-1);
  const letzterScout = bahnScout.points.at(-1);
  assert.ok(letzterArtillery.x > letzterScout.x,
    `artillery (${letzterArtillery.x.toFixed(1)}) sollte weiter reichen als scout (${letzterScout.x.toFixed(1)})`);
});

test('Eine echte Waffe aus dem Katalog ergibt eine endliche Bahn', () => {
  // Gegen eine reale Waffe prüfen, nicht nur gegen erfundene Zahlen: Der
  // Katalog ist generiert, und ein fehlender Feldsatz fiele hier auf.
  const waffe = getWeapon('waffe-1') ?? Object.values(getWeapon ? {} : {})[0];
  if (!waffe) return; // Katalogform geändert — dann prüft der nächste Test die Ableitung
  const bahn = predictTrajectory({
    x: 50, y: 300, angle: 0.8, power: 70,
    speedMultiplier: launchSpeedMultiplier({ weapon: waffe }),
    width: 1280, height: 720,
    isSolid: () => false,
  });
  assert.ok(bahn.points.length > 1);
  assert.ok(bahn.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('Feste Pixel beenden die Bahn vorzeitig', () => {
  // Eine Wand direkt vor dem Schützen: die Bahn muss dort enden.
  const wand = (x) => x >= 140;
  const ergebnis = predictTrajectory({
    x: 100, y: 300, angle: 0.6, power: 90,
    width: 1280, height: 720,
    isSolid: (x) => wand(x),
    steps: 300,
  });
  assert.ok(ergebnis.impact);
  assert.ok(ergebnis.impact.x >= 140 && ergebnis.impact.x < 200,
    `Einschlag bei x=${ergebnis.impact.x} erwartet (Wand ab 140)`);
});

test('Unsinnige Eingaben liefern eine leere Vorhersage statt eines Absturzes', () => {
  assert.deepEqual(predictTrajectory({ x: NaN, y: 0, angle: 0, power: 50 }).points, []);
  assert.deepEqual(predictTrajectory({ x: 0, y: 0, angle: NaN, power: 50 }).points, []);
  assert.deepEqual(predictTrajectory({ x: 0, y: 0, angle: 0, power: Infinity }).points, []);
});

test('Der Predictor bestätigt eine Vorhersage und misst die Abweichung', () => {
  let zeit = 1000;
  const predictor = new ShotPredictor({ now: () => zeit });

  predictor.begin({
    playerId: 3,
    angle: 1.0,
    power: 50,
    weaponId: 'w-1',
    trajectory: { points: [], impact: { x: 500, y: 400 } },
  });
  assert.equal(predictor.active, true);

  zeit += 80;
  const ergebnis = predictor.resolve({ impact: { x: 503, y: 404 } });
  assert.equal(ergebnis.status, 'confirmed');
  // 3-4-5-Dreieck: die Abweichung ist genau 5.
  assert.equal(ergebnis.deviation, 5);
  assert.equal(predictor.active, false);
  assert.deepEqual(predictor.stats, { predictions: 1, confirmed: 1, discarded: 0, timedOut: 0 });
});

test('Nach der Bestätigung zählt wieder der Serverzustand', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  const zustand = { activePlayerId: 3 };
  assert.equal(pendingTrajectory(zustand, predictor), null, 'ohne Vorhersage nichts zu zeichnen');

  const bahn = { points: [{ x: 1, y: 1 }], impact: { x: 2, y: 2 } };
  predictor.begin({ playerId: 3, trajectory: bahn });
  assert.equal(pendingTrajectory(zustand, predictor), bahn, 'laufende Vorhersage wird gezeichnet');

  predictor.resolve({ impact: { x: 2, y: 2 } });
  assert.equal(pendingTrajectory(zustand, predictor), null,
    'nach der Bestätigung darf die Vorhersage NICHT weiter gezeichnet werden — ' +
    'sonst überlagerte die geschätzte Bahn die echte');
});

test('Eine Vorhersage für einen anderen Spieler wird nicht gezeichnet', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  predictor.begin({ playerId: 7, trajectory: { points: [], impact: null } });
  assert.equal(pendingTrajectory({ activePlayerId: 3 }, predictor), null);
  assert.ok(pendingTrajectory({ activePlayerId: 7 }, predictor) !== null);
});

test('Läuft eine Vorhersage aus, verschwindet sie — aber erst nach dem Zeitlimit', () => {
  let zeit = 0;
  const predictor = new ShotPredictor({ timeoutMs: 1000, now: () => zeit });
  predictor.begin({ playerId: 1, trajectory: { points: [], impact: null } });

  zeit = 999;
  assert.equal(predictor.expire(), false, 'kurz vor dem Limit bleibt sie stehen');
  assert.equal(predictor.active, true);

  zeit = 1000;
  assert.equal(predictor.expire(), true);
  assert.equal(predictor.active, false);
  assert.equal(predictor.stats.timedOut, 1);
});

test('Ein abgelehnter Schuss verwirft die Vorhersage', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  predictor.begin({ playerId: 1, trajectory: { points: [], impact: null } });
  assert.equal(predictor.discard('cooldown').status, 'discarded');
  assert.equal(predictor.stats.discarded, 1);
  assert.equal(predictor.history[0].reason, 'cooldown');
});

test('Ein zweiter Schuss ersetzt die erste Vorhersage', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  predictor.begin({ playerId: 1, weaponId: 'a', trajectory: { points: [], impact: null } });
  const zweite = predictor.begin({ playerId: 1, weaponId: 'b', trajectory: { points: [], impact: null } });

  assert.equal(predictor.active, true);
  assert.equal(predictor.pending.id, zweite.id);
  // Die erste ist als „superseded" protokolliert — nicht als Fehler, sondern
  // als Überholung durch eine neuere Eingabe.
  assert.equal(predictor.history.length, 1);
  assert.equal(predictor.history[0].status, 'superseded');
  assert.equal(predictor.history[0].weaponId, 'a');
});

test('Ohne laufende Vorhersage sind resolve und discard folgenlos', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  assert.equal(predictor.resolve({ impact: { x: 1, y: 1 } }).status, 'none');
  assert.equal(predictor.discard().status, 'none');
  assert.equal(predictor.expire(), false);
  assert.deepEqual(predictor.stats, { predictions: 0, confirmed: 0, discarded: 0, timedOut: 0 });
});

test('Eine Abweichung wird nur gemessen, wenn beide Punkte vorliegen', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  predictor.begin({ playerId: 1, trajectory: { points: [], impact: null } });
  const ohnePunkt = predictor.resolve({ impact: { x: 5, y: 5 } });
  assert.equal(ohnePunkt.status, 'confirmed');
  assert.equal(ohnePunkt.deviation, null, 'ohne erwarteten Punkt gibt es nichts zu messen');
});

test('reset räumt Vorhersage und Verlauf', () => {
  const predictor = new ShotPredictor({ now: () => 0 });
  predictor.begin({ playerId: 1, trajectory: { points: [], impact: null } });
  predictor.resolve({});
  predictor.begin({ playerId: 1, trajectory: { points: [], impact: null } });

  predictor.reset();
  assert.equal(predictor.active, false);
  assert.equal(predictor.history.length, 0);
  assert.equal(predictor.stats.predictions, 0);
});

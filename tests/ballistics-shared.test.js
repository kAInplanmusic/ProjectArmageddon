/**
 * Tests: Client-Vorhersage, Motor und Bot rechnen DENSELBEN Schritt.
 *
 * ## Der Befund, der zu dieser Datei führte
 *
 * Der Integrationsschritt eines Geschosses (Gravitation, Wind, Drag, Position)
 * stand an mehreren Stellen: im `ProjectileSystem` (der Motor), in
 * `MatchController.aimPreview`, in der clientseitigen Vorhersage und im
 * Geschütz-Pfad. Genau das nennt die Recherche (`docs/recherche/npc-ki.md`,
 * Punkt 4.1) als ersten und wichtigsten Fehler: „Physik in eine einzige
 * geteilte Funktion auslagern, die sowohl Spiel als auch KI benutzt."
 *
 * Ein Kommentar kann Übereinstimmung behaupten — diese Tests können es messen.
 *
 * ## Wie gemessen wird
 *
 * Nicht die Bahn selbst, sondern ihre **Drei-Tick-Schritte** werden verglichen:
 * Der Motor startet das Geschoss an der MÜNDUNG (`#findMuzzle`, 5 px über der
 * Figur), die Vorhersage an der Figur. Ein Vergleich der absoluten Positionen
 * würde also einen bekannten, richtigen Versatz messen. Die Differenz zweier
 * Positionen im Abstand von drei Ticks enthält diesen Versatz nicht mehr — und
 * sie enthält JEDE Abweichung in Gravitation, Wind, Drag oder Reihenfolge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECTILE_DRAG,
  PROJECTILE_GRAVITY,
  integrateStep,
  raycastSegment,
  simulateFlight,
} from '../src/shared/ballistics.js';
import { predictTrajectory, launchSpeedMultiplier } from '../src/client/shotPrediction.js';
import { MatchController } from '../src/engine/match.js';
import { getWeapon, WEAPONS } from '../src/shared/config/weapons.js';

/**
 * Feuert einen echten Schuss und protokolliert die Position des Geschosses
 * je Tick.
 *
 * @returns {{spur:{x:number,y:number}[], waffe:object, spieler:object, faktor:number, spurWinde:number}}
 */
function geschossSpur({ seed = 4242, angle = 0.9, power = 60 } = {}) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 10_000_000,
  });
  match.start();

  const playerId = match.activePlayerId;
  const spieler = match.players.find(entry => entry.entityId === playerId);
  /*
   * Eine Waffe, die WIRKLICH als einfaches Projektil fliegt:
   *  - kein Anflug von oben oder von der Seite (`strikeStyle`),
   *  - kein Zünder (der die Granate am Boden liegen lässt statt zu fliegen),
   *  - kein Abpraller (der die Bahn im Motor spiegelt — die Vorhersage kennt
   *    das nicht, sie endet beim ersten Aufprall).
   *
   * Sonst verglichen wir zwei verschiedene Vorgänge und nicht zwei
   * Implementierungen desselben.
   */
  const einfacheWaffe = (eintrag) => eintrag
    && eintrag.delivery === 'projectile'
    && (eintrag.strikeStyle ?? 'self') === 'self'
    && (eintrag.fuseTicks ?? 0) === 0
    && (eintrag.bounces ?? 0) === 0;
  const waffe = match.inventory.getWeapons(playerId)
    .map(getWeapon)
    .find(einfacheWaffe)
    ?? WEAPONS.find(einfacheWaffe);
  assert.ok(waffe, 'keine einfache Projektilwaffe gefunden');

  const faktor = launchSpeedMultiplier({
    classId: spieler.classId,
    archetypeId: spieler.archetypeId,
    sidegradeId: spieler.sidegradeId,
    weapon: waffe,
  });

  const schuss = match.fire(playerId, angle, power, waffe.id);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);

  const spur = [];
  const { world } = match;
  for (let tick = 0; tick < 240; tick += 1) {
    if (!world.isActive(schuss.projectileId)) break;
    match.step();
    if (!world.isActive(schuss.projectileId)) break;
    spur.push({
      x: world.getComponent(schuss.projectileId, 'Position', 'x'),
      y: world.getComponent(schuss.projectileId, 'Position', 'y'),
    });
  }
  match.consumeEvents();

  return {
    spur,
    waffe,
    faktor,
    spieler,
    windAnfang: match.getState().wind,
    match,
    start: { x: match.world.getComponent(playerId, 'Position', 'x'), y: match.world.getComponent(playerId, 'Position', 'y') },
  };
}

/**
 * Die größte Abweichung zwischen zwei Bahnen, gemessen in Drei-Tick-Schritten.
 *
 * ## Die Indizes sind der ganze Trick — und die erste Fassung hatte sie falsch
 *
 * `points[0]` ist der START (vor dem ersten Tick), `points[k]` für k ≥ 1 die
 * Position nach `3·(k−1)+1` Ticks (abgetastet wird jeder dritte Schritt).
 * `spur[i]` ist die Position nach `i+1` Ticks.
 *
 * Der zu `points[k+1] − points[k]` gehörende Motorabschnitt ist deshalb
 * `spur[3k] − spur[3(k−1)]` — DREI Ticks. Die erste Fassung verglich
 * `spur[3k+2] − spur[3k]`, also nur zwei Ticks, und meldete daraufhin 7 px
 * Abweichung, wo keine war. Genau diese Art Fehler soll der Test finden — hier
 * steckte er im Test selbst.
 */
function schrittAbweichung(echteSpur, punkte) {
  let groesste = 0;
  const anzahl = Math.min(Math.floor((echteSpur.length - 1) / 3), punkte.length - 2);
  for (let k = 1; k <= anzahl; k += 1) {
    const ex = echteSpur[3 * k].x - echteSpur[3 * (k - 1)].x;
    const ey = echteSpur[3 * k].y - echteSpur[3 * (k - 1)].y;
    const px = punkte[k + 1].x - punkte[k].x;
    const py = punkte[k + 1].y - punkte[k].y;
    groesste = Math.max(groesste, Math.abs(ex - px), Math.abs(ey - py));
  }
  return { groesste, anzahl };
}

/*
 * Die Schwelle.
 *
 * 0,01 px ist bewusst NICHT „möglichst klein" gewählt: Der Motor legt die
 * Position eines Geschosses in einem `Float32Array` ab
 * (`ComponentStore.registerComponent('Position', { x: 'Float32Array', … })`),
 * die Vorhersage rechnet in Float64. Gemessen beträgt der Unterschied deshalb
 * rund 1e-5 px — das ist die Bit-Breite des Speichers, nicht eine andere
 * Physik.
 *
 * Die Schwelle liegt 1000× darunter, was ein Tick breit ist (bei Kraft 100
 * rund 14 px), und 36× über der Rundung — die Gegenprobe unten zeigt, dass sie
 * einen um 0,001 geänderten Luftwiderstand sicher erkennt.
 */
const SCHRITTSCHWELLE_PX = 0.01;

test('Motor und Client-Vorhersage liefern denselben Schritt', () => {
  const { spur, waffe, faktor, start, windAnfang, match } = geschossSpur();
  assert.ok(spur.length > 30, `zu wenige Messpunkte: ${spur.length}`);

  const vorhersage = predictTrajectory({
    x: start.x,
    y: start.y,
    angle: 0.9,
    power: 60,
    speedMultiplier: faktor,
    gravityScale: waffe.gravityScale ?? 1,
    wind: windAnfang,
    width: match.width,
    height: match.height,
    isSolid: (x, y) => match.terrain.isSolid(x, y),
  });

  const { groesste, anzahl } = schrittAbweichung(spur, vorhersage.points);
  assert.ok(anzahl >= 10, `zu wenige vergleichbare Schritte: ${anzahl}`);
  assert.ok(groesste < SCHRITTSCHWELLE_PX,
    `Motor und Vorhersage laufen auseinander: größte Abweichung ${groesste} px über ${anzahl} Drei-Tick-Schritte`);
  console.log(`  gemessen: ${anzahl} Drei-Tick-Schritte, größte Abweichung ${groesste.toExponential(2)} px`);
});

test('GEGENPROBE: die Messung erkennt eine geänderte Konstante', () => {
  /*
   * Ein Test, der immer besteht, ist keine Prüfung. Diese Gegenprobe zeigt,
   * dass die Messung oben tatsächlich anschlägt: Mit einem um 0,001
   * veränderten Luftwiderstand (oder einer geänderten Reihenfolge im Schritt)
   * verlässt die Vorhersage die Bahn des Motors — und die Abweichung ist
   * deutlich größer als die Schwelle von 1e-9 px.
   */
  const { spur, waffe, faktor, start, windAnfang, match } = geschossSpur();

  const falscheBahn = simulateFlight({
    x: start.x,
    y: start.y,
    angle: 0.9,
    power: 60,
    speedMultiplier: faktor,
    gravityScale: waffe.gravityScale ?? 1,
    wind: windAnfang,
    drag: PROJECTILE_DRAG - 0.001,
    steps: 300,
    sampleEvery: 3,
    isSolid: (x, y) => match.terrain.isSolid(x, y),
    bounds: { minX: 0, maxX: match.width, minY: 0, maxY: match.height },
  });

  const { groesste } = schrittAbweichung(spur, falscheBahn.points);
  assert.ok(groesste > SCHRITTSCHWELLE_PX,
    `Die Messung ist blind: selbst ein geänderter Drag fällt nicht auf (${groesste} px)`);
  console.log(`  Gegenprobe: Drag −0,001 ergibt ${groesste.toFixed(3)} px Abweichung — die Messung greift.`);
});

test('Der gemeinsame Schritt hat genau eine Reihenfolge', () => {
  /*
   * Die Reihenfolge ist Teil der Regel: erst Gravitation und Wind auf die
   * GESCHWINDIGKEIT, dann der Drag auf BEIDE Achsen. Diese Erwartung ist von
   * Hand ausgeschrieben — sie ist die Gegenprobe zur Formel im Modul.
   */
  const vx = 5;
  const vy = -3;
  const gravity = PROJECTILE_GRAVITY;
  const wind = 0.02;
  const erwartet = {
    vy: (vy + gravity) * PROJECTILE_DRAG,
    vx: (vx + wind) * PROJECTILE_DRAG,
  };
  assert.deepEqual(integrateStep({ vx, vy, gravity, wind }), erwartet);

  // Beide Achsen werden gedraggt — der „nur vx"-Fehler des Geschütz-Pfads.
  const gebremst = integrateStep({ vx: 10, vy: 0, gravity: 0, wind: 0 });
  assert.ok(gebremst.vx < 10, 'die x-Achse muss gebremst werden');
  const fallend = integrateStep({ vx: 0, vy: 0, gravity: 1, wind: 0 });
  assert.ok(fallend.vy > 0, 'die y-Achse wird von der Gravitation gezogen');
  assert.ok(fallend.vy < 1, 'und ebenfalls gebremst');

  // Ein nicht gesetzter Waffenfaktor (0 oder undefined) bedeutet Faktor 1.
  assert.deepEqual(
    integrateStep({ vx: 1, vy: 1, wind: 0.5, windFactor: 0 }),
    integrateStep({ vx: 1, vy: 1, wind: 0.5, windFactor: undefined }),
  );
});

test('Der gemeinsame Strahl tastet feiner ab als ein Tick breit ist', () => {
  /*
   * Ein Geschoss legt bei Kraft 100 bis zu 20 px je Tick zurück. Eine
   * Terrainwand von einem Pixel Dicke mitten in dieser Strecke MUSS den Strahl
   * beenden — sonst tunnelt der Schuss in der Vorhersage durch und trifft in
   * Wirklichkeit nicht (oder umgekehrt).
   */
  const wandTreffer = raycastSegment(0, 0, 30, 0, {
    isSolid: (x, y) => x >= 17 && x <= 17 && y >= -1 && y <= 1,
  });
  assert.ok(wandTreffer, 'der Strahl hat die 1-px-Wand übersehen');
  assert.equal(Math.floor(wandTreffer.x), 17);
  assert.equal(wandTreffer.terrain, true);

  // Ein Figuren-Trefferfeld schlägt Terrain an DERSELBEN Stelle: je Abtastpunkt
  // gilt erst die Einheit, dann die Wand (wie im `ProjectileSystem`).
  const einheit = raycastSegment(0, 0, 30, 0, {
    isSolid: (x) => x >= 5,
    hitTest: (x, y) => (Math.abs(x - 5) <= 1 && Math.abs(y) <= 1 ? { entityId: 7 } : null),
  });
  assert.deepEqual(einheit.hit, { entityId: 7 });

  // Ohne Figur an derselben Stelle gewinnt die Wand.
  const nurWand = raycastSegment(0, 0, 30, 0, { isSolid: (x) => x >= 5 });
  assert.equal(nurWand.hit, null);
  assert.equal(nurWand.terrain, true);

  assert.equal(raycastSegment(0, 0, 30, 0, { isSolid: () => false }), null,
    'ein freier Strahl liefert null');
});

/**
 * Tests: Der Bot trifft, ist deterministisch und wird mit höherem Skill besser.
 *
 * ## Warum diese Datei so misst, wie sie misst
 *
 * Der alte Bot war eine `atan2`-Schätzung mit Zufallsstreuung. Ein Test, der
 * nur „es kommt ein Schuss heraus" prüft, bestünde auch damit — und würde
 * nichts über die Qualität sagen. Diese Tests messen deshalb:
 *
 *  1. **Genauigkeit** gegen ein ZIEL AN BEKANNTER STELLE, nachgerechnet mit
 *     einer unabhängigen Vorwärtssimulation (die Konstanten kommen aus den
 *     geteilten Modulen, die Schleife steht hier von Hand — sonst prüfte der
 *     Test den Solver mit dem Solver).
 *  2. **Determinismus**: gleicher Seed → identische Schussfolge, anderer Seed →
 *     andere.
 *  3. **Monotonie**: höherer Skill → messbar kleinere Fehlabstände und höhere
 *     Trefferquote. Die Zahlen werden AUSGEGEBEN, nicht behauptet.
 *  4. **Menschlichkeit**: ~3 % Aussetzer, und keine selbstverschuldeten
 *     Treffer auf eigene Einheiten.
 *
 * ## Warum der Skill hier 1.0 NICHT „perfekt" bedeutet
 *
 * Bei Skill 1 ist die reguläre Streuung 0 — der Solver trifft dann genau. Die
 * Aussetzer (3 %) bleiben aber bestehen: Menschen vertippen sich auch, wenn sie
 * gut sind. Ein Bot, der auf höchster Stufe nie danebenschießt, ist kein guter
 * Gegner, sondern ein Roboter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { BotController } from '../src/server/bot.js';
import { SeededRandom } from '../src/shared/prng.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import {
  PLAYER_HALF_HEIGHT,
  PLAYER_HALF_WIDTH,
} from '../src/engine/systems/projectileSystem.js';

const PRESET = 'hills';
/* Die Zugzeit wird nie erreicht: Der Zug endet, wenn das Geschoss gelandet ist. */
const ZUGZEIT_MS = 10_000_000;

function neuerMatch(seed, { playersPerTeam = 2 } = {}) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam, preset: PRESET, turnDurationMs: ZUGZEIT_MS, maxRounds: 40,
  });
  match.start();
  match.consumeEvents();
  return match;
}

/**
 * Unabhängiger Nachbau des Motorwegs.
 *
 * Die Konstanten sind die geteilten — die Schleife, die Abtastung und die
 * Trefferfelder stehen hier bewusst von Hand. Ein Test, der `simulateFlight`
 * aufruft, prüfte den Solver mit sich selbst.
 *
 * @returns {{x:number,y:number,hit:{entityId:number,teamId:number}|null}|null}
 */
function unabhaengigerSchuss(match, spielerId, angle, power) {
  const spieler = match.players.find(entry => entry.entityId === spielerId);
  const waffe = getWeapon(match.inventory.getActiveWeaponId(spielerId));
  const speed = power * 0.14 * launchSpeedMultiplier({
    classId: spieler.classId,
    archetypeId: spieler.archetypeId,
    sidegradeId: spieler.sidegradeId,
    weapon: waffe,
  });
  const muendung = match.launchOrigin(spielerId, angle);
  let x = muendung.x;
  let y = muendung.y;
  let vx = Math.cos(angle) * speed;
  let vy = -Math.sin(angle) * speed;
  const gravitation = 0.32 * (waffe?.gravityScale ?? 1);
  const wind = match.getState().wind;
  const einheiten = match.getState().entities.filter(entry => entry.alive && entry.entityId !== spielerId);

  for (let tick = 0; tick < 600; tick += 1) {
    vy += gravitation;
    vx += wind;
    vx *= 0.995;
    vy *= 0.995;
    const zx = x + vx;
    const zy = y + vy;
    const strecke = Math.max(Math.abs(zx - x), Math.abs(zy - y));
    const abtastungen = Math.max(1, Math.ceil(strecke));
    for (let s = 1; s <= abtastungen; s += 1) {
      const t = s / abtastungen;
      const sx = x + (zx - x) * t;
      const sy = y + (zy - y) * t;
      for (const einheit of einheiten) {
        if (Math.abs(sx - einheit.x) <= PLAYER_HALF_WIDTH && Math.abs(sy - einheit.y) <= PLAYER_HALF_HEIGHT) {
          return { x: sx, y: sy, hit: { entityId: einheit.entityId, teamId: einheit.teamId } };
        }
      }
      if (match.terrain.isSolid(Math.floor(sx), Math.floor(sy))) return { x: sx, y: sy, hit: null };
    }
    x = zx;
    y = zy;
  }
  return null;
}

/** Abstand des Einschlags zum nächsten Gegner (0, wenn eine Einheit getroffen wird). */
function fehlabstand(match, spielerId, angle, power) {
  const einschlag = unabhaengigerSchuss(match, spielerId, angle, power);
  if (!einschlag) return { abstand: Infinity, eigener: false, gegner: false };
  const ich = match.players.find(entry => entry.entityId === spielerId);
  const andere = match.getState().entities.filter(entry => entry.alive && entry.entityId !== spielerId);
  if (einschlag.hit) {
    const eigener = einschlag.hit.teamId === ich.teamId;
    return { abstand: 0, eigener, gegner: !eigener };
  }
  const abstand = Math.min(
    ...andere.filter(entry => entry.teamId !== ich.teamId)
      .map(entry => Math.hypot(einschlag.x - entry.x, einschlag.y - entry.y)),
  );
  return { abstand, eigener: false, gegner: false };
}

/** Lässt den Zug auslaufen: das Geschoss landet, dann wechselt der Zug. */
function zugBeenden(match, spielerId, maxTicks = 1200) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (match.status !== 'playing') break;
    match.step();
    if (match.activePlayerId !== spielerId) break;
  }
  if (match.status === 'playing' && match.activePlayerId === spielerId) match.endTurn();
  match.consumeEvents();
}

/**
 * Spielt Bot-Züge und misst jeden Schuss.
 *
 * @returns {{schuesse:Array, treffer:number, mittlererAbstand:number, slips:number, eigene:number}}
 */
function spieleZuege({ seed, skill, turns = 8, rng = null }) {
  const match = neuerMatch(seed);
  const bot = new BotController({ rng: rng ?? new SeededRandom(seed), skill });
  const schuesse = [];

  for (let zug = 0; zug < turns && match.status === 'playing'; zug += 1) {
    const spielerId = match.activePlayerId;
    if (spielerId === null || !match.isPlayerAlive(spielerId)) { match.endTurn(); continue; }
    const schuss = bot.chooseShot(match, spielerId);
    if (!schuss) { match.endTurn(); continue; }

    const plan = bot.stats.lastPlan;
    const gemessen = fehlabstand(match, spielerId, schuss.angle, schuss.power);
    schuesse.push({
      playerId: spielerId,
      angle: schuss.angle,
      power: schuss.power,
      slip: plan.slip,
      planError: plan.error,
      distance: plan.distance,
      impact: plan.impact,
      steps: plan.steps,
      endedBy: plan.endedBy,
      lifetime: plan.lifetime,
      abstand: gemessen.abstand,
      eigener: gemessen.eigener,
      gegner: gemessen.gegner,
    });

    match.fire(spielerId, schuss.angle, schuss.power);
    zugBeenden(match, spielerId);
  }

  const treffer = schuesse.filter(eintrag => eintrag.gegner).length;
  const mitAbstand = schuesse.filter(eintrag => Number.isFinite(eintrag.abstand));
  return {
    match,
    schuesse,
    treffer,
    trefferquote: schuesse.length > 0 ? treffer / schuesse.length : 0,
    mittlererAbstand: mitAbstand.length > 0
      ? mitAbstand.reduce((summe, eintrag) => summe + eintrag.abstand, 0) / mitAbstand.length
      : Infinity,
    slips: schuesse.filter(eintrag => eintrag.slip !== 0).length,
    eigene: schuesse.filter(eintrag => eintrag.eigener).length,
  };
}

/* ------------------------------------------------------------- Genauigkeit */

test('Der Solver trifft ein bekanntes Ziel auf dem echten Terrain', () => {
  /*
   * Das Ziel wird an eine BEKANNTE Stelle gesetzt: auf den Boden, in einer
   * Entfernung, die aus der gemessenen Reichweite abgeleitet ist (60 % davon).
   * Die Reichweite wird selbst gemessen — ein Schuss mit voller Kraft und 45°.
   *
   * Gemessen wird der Einschlag mit der unabhängigen Simulation oben.
   */
  const gemessen = [];
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    const match = neuerMatch(seed);
    const spielerId = match.activePlayerId;
    const ich = match.getState().entities.find(entry => entry.entityId === spielerId);
    const ziel = match.getState().entities.find(entry => entry.teamId !== ich.teamId);

    const weit = unabhaengigerSchuss(match, spielerId, Math.PI / 4, 100);
    const reichweite = weit ? Math.abs(weit.x - ich.x) : 200;
    const richtung = ziel.x >= ich.x ? 1 : -1;
    const zielX = Math.round(Math.min(match.width - 20, Math.max(20, ich.x + richtung * Math.max(80, reichweite * 0.6))));
    const zielY = match.surfaceYAt(zielX) - PLAYER_HALF_HEIGHT - 2;
    match.world.setComponent(ziel.entityId, 'Position', 'x', zielX);
    match.world.setComponent(ziel.entityId, 'Position', 'y', zielY);

    const bot = new BotController({ rng: new SeededRandom(seed), skill: 1 });
    const schuss = bot.chooseShot(match, spielerId);
    assert.ok(schuss, `Seed ${seed}: der Bot hat keinen Schuss gewählt`);

    const einschlag = unabhaengigerSchuss(match, spielerId, schuss.angle, schuss.power);
    assert.ok(einschlag, `Seed ${seed}: die Bahn endet im Nichts`);
    const abstand = einschlag.hit
      ? 0
      : Math.hypot(einschlag.x - zielX, einschlag.y - zielY);
    gemessen.push({ seed, entfernung: Math.abs(zielX - ich.x), abstand, slip: bot.stats.lastPlan.slip });
  }

  const ohneAussetzer = gemessen.filter(eintrag => eintrag.slip === 0);
  assert.ok(ohneAussetzer.length >= 5,
    `zu wenige Schüsse ohne Aussetzer gemessen: ${JSON.stringify(gemessen)}`);

  const groesster = Math.max(...ohneAussetzer.map(eintrag => eintrag.abstand));
  const mittel = ohneAussetzer.reduce((summe, eintrag) => summe + eintrag.abstand, 0) / ohneAussetzer.length;
  console.log(`  gemessen über ${ohneAussetzer.length} Ziele (Skill 1): mittlerer Fehler `
    + `${mittel.toFixed(3)} px, größter ${groesster.toFixed(3)} px`);
  for (const eintrag of gemessen) {
    console.log(`    Seed ${eintrag.seed}: Ziel in ${eintrag.entfernung} px, Fehler ${eintrag.abstand.toFixed(3)} px`
      + `${eintrag.slip !== 0 ? ' (Aussetzer, nicht gewertet)' : ''}`);
  }

  /*
   * Die Schwelle: 3 px.
   *
   * Begründung: Das Trefferfeld einer Figur ist ±7 px breit und ±10 px hoch
   * (`PLAYER_HALF_WIDTH/HEIGHT`) — ein Schuss, der innerhalb von 3 px am
   * Zielpunkt einschlägt, trifft damit sicher. Ein Tick ist bei Kraft 100 rund
   * 14 px breit; die Tick-Diskretisierung wäre also ein Fehler von bis zu 14 px
   * (der „Bodensatz" der Recherche, Punkt 1.5). 3 px liegt deutlich darunter —
   * genau das ist das Ziel der Interpolation.
   */
  assert.ok(groesster < 3,
    `Der Solver trifft nicht genau genug: größter Fehler ${groesster} px (erlaubt 3 px). `
    + `Gemessen: ${JSON.stringify(gemessen)}`);
});

test('Die Verfeinerung ist besser als das grobe Raster', () => {
  /*
   * Der Unterschied, den die Verfeinerung macht: Ein Schuss mit dem Winkel des
   * Grobrasters (rund 4,7° Abstand) liegt weit daneben, der verfeinerte Plan
   * trifft. Ohne diese Prüfung könnte die Verfeinerung wirkungslos sein, ohne
   * dass es auffällt.
   */
  const match = neuerMatch(11);
  const spielerId = match.activePlayerId;
  const ich = match.getState().entities.find(entry => entry.entityId === spielerId);
  const ziel = match.getState().entities.find(entry => entry.teamId !== ich.teamId);
  const zielX = Math.round(ich.x + (ziel.x >= ich.x ? 1 : -1) * 200);
  const zielY = match.surfaceYAt(zielX) - PLAYER_HALF_HEIGHT - 2;
  match.world.setComponent(ziel.entityId, 'Position', 'x', zielX);
  match.world.setComponent(ziel.entityId, 'Position', 'y', zielY);

  const bot = new BotController({ rng: new SeededRandom(11), skill: 1 });
  const schuss = bot.chooseShot(match, spielerId);

  const fehler = (angle, power) => {
    const einschlag = unabhaengigerSchuss(match, spielerId, angle, power);
    if (!einschlag) return Infinity;
    if (einschlag.hit && einschlag.hit.teamId !== ich.teamId) return 0;
    return Math.hypot(einschlag.x - zielX, einschlag.y - zielY);
  };

  const verfeinert = fehler(schuss.angle, schuss.power);
  // Das Grobraster des Solvers ist 80° / 17 Schritte breit = 4,7°.
  const grob = Math.min(
    fehler(schuss.angle + 4.7 * Math.PI / 180, schuss.power),
    fehler(schuss.angle - 4.7 * Math.PI / 180, schuss.power),
    fehler(Math.PI / 4, schuss.power),
  );

  console.log(`  verfeinert ${verfeinert.toFixed(2)} px gegen Grobraster ${grob.toFixed(2)} px`);
  assert.ok(verfeinert < 3, `der verfeinerte Plan liegt ${verfeinert} px daneben`);
  assert.ok(grob > verfeinert + 1,
    `das Grobraster war nicht schlechter (${grob} gegen ${verfeinert}) — die Verfeinerung wirkt nicht`);
});

test('Die geplante Flugzeit passt in die Lebensdauer des Geschosses', () => {
  /*
   * FUND (belegt, gemessen): Der Solver plante Schüsse, deren Geschoss mitten
   * im Flug verfiel. Gemessen an Seed 1000, Zug 3: Der Plan sah einen Treffer
   * nach 83 Ticks, das Geschoss lebte 72 Ticks (`projectile_expired` bei
   * (1061, 374) — 118 px über dem Ziel). Der Schuss traf nie, die Rechnung
   * meldete trotzdem „Treffer".
   *
   * Behebung: Die Vorwärtssimulation läuft nur so viele Schritte, wie das
   * Geschoss lebt (`MatchController.projectileLifetime`). Dieser Test hält
   * fest, dass die geplante Flugzeit hineinpasst — mit einer festen
   * Schrittgrenze (etwa 600) fällt er.
   */
  const laeufe = [5, 55, 555, 5555].map(seed => spieleZuege({ seed, skill: 1.0, turns: 10 }));
  const schuesse = laeufe.flatMap(lauf => lauf.schuesse);
  const mitEinschlag = schuesse.filter(eintrag =>
    eintrag.impact !== null && Number.isFinite(eintrag.steps) && Number.isFinite(eintrag.lifetime));
  assert.ok(mitEinschlag.length >= 10,
    `zu wenige Schüsse mit geplantem Einschlag: ${mitEinschlag.length}`);

  const zuLang = mitEinschlag.filter(eintrag => eintrag.steps > eintrag.lifetime);
  const groessteFlugzeit = Math.max(...mitEinschlag.map(eintrag => eintrag.steps));
  console.log(`  ${mitEinschlag.length} Pläne mit Einschlag, größte Flugzeit ${groessteFlugzeit} Ticks `
    + `(kürzeste Lebensdauer ${Math.min(...mitEinschlag.map(eintrag => eintrag.lifetime))})`);
  assert.deepEqual(zuLang.map(eintrag => ({
    steps: eintrag.steps, lifetime: eintrag.lifetime, error: eintrag.planError,
  })), [], 'Pläne fliegen länger als das Geschoss lebt');
});

/* ------------------------------------------------------------ Determinismus */

test('Gleicher Seed ergibt dieselbe Schussfolge — anderer Seed eine andere', () => {
  const a = spieleZuege({ seed: 4711, skill: 0.7, turns: 10 });
  const b = spieleZuege({ seed: 4711, skill: 0.7, turns: 10 });
  const c = spieleZuege({ seed: 4712, skill: 0.7, turns: 10 });

  const reihe = (ergebnis) => ergebnis.schuesse.map(entry =>
    `${entry.playerId}:${entry.angle.toFixed(12)}/${entry.power.toFixed(12)}`);

  assert.ok(a.schuesse.length >= 5, `zu wenige Schüsse: ${a.schuesse.length}`);
  assert.deepEqual(reihe(b), reihe(a),
    'gleicher Seed, andere Schussfolge — der Bot ist nicht deterministisch');
  assert.notDeepEqual(reihe(c), reihe(a),
    'verschiedene Seeds ergeben dieselbe Schussfolge — die Streuung hängt nicht am Seed');
  console.log(`  ${a.schuesse.length} Schüsse, identisch bei gleichem Seed, `
    + `${reihe(c).filter((wert, i) => wert !== reihe(a)[i]).length} abweichend bei anderem Seed`);
});

/* --------------------------------------------------------------- Monotonie */

test('Höherer Skill trifft messbar besser', () => {
  /*
   * Die Kernaussage des Schwierigkeitsgrads. Gemessen über vier Seeds und je
   * acht Züge pro Stufe; die Zahlen stehen im Protokoll, die Behauptung folgt
   * der Messung — nicht umgekehrt.
   */
  const seeds = [101, 202, 303, 404];
  const stufen = [1.0, 0.7, 0.4];
  const gemessen = stufen.map(skill => {
    const laeufe = seeds.map(seed => spieleZuege({ seed, skill, turns: 8 }));
    const schuesse = laeufe.flatMap(lauf => lauf.schuesse);
    const treffer = laeufe.reduce((summe, lauf) => summe + lauf.treffer, 0);
    const abstaende = schuesse.filter(entry => Number.isFinite(entry.abstand)).map(entry => entry.abstand);
    return {
      skill,
      schuesse: schuesse.length,
      trefferquote: schuesse.length > 0 ? treffer / schuesse.length : 0,
      mittlererAbstand: abstaende.length > 0
        ? abstaende.reduce((summe, wert) => summe + wert, 0) / abstaende.length
        : Infinity,
    };
  });

  for (const stufe of gemessen) {
    console.log(`  Skill ${stufe.skill.toFixed(2)}: ${stufe.schuesse} Schüsse, `
      + `Trefferquote ${(stufe.trefferquote * 100).toFixed(1)} %, `
      + `mittlerer Fehlabstand ${stufe.mittlererAbstand.toFixed(1)} px`);
  }

  for (let i = 1; i < gemessen.length; i += 1) {
    const besser = gemessen[i - 1];
    const schlechter = gemessen[i];
    assert.ok(besser.trefferquote > schlechter.trefferquote,
      `Skill ${besser.skill} (${besser.trefferquote.toFixed(3)}) trifft nicht besser als `
      + `Skill ${schlechter.skill} (${schlechter.trefferquote.toFixed(3)})`);
    assert.ok(besser.mittlererAbstand < schlechter.mittlererAbstand,
      `Skill ${besser.skill} (${besser.mittlererAbstand.toFixed(1)} px) liegt nicht näher am Ziel als `
      + `Skill ${schlechter.skill} (${schlechter.mittlererAbstand.toFixed(1)} px)`);
  }
});

/* ----------------------------------------------------------- Menschlichkeit */

test('Rund 3 % der Schüsse sind Aussetzer — auf jeder Skill-Stufe', () => {
  /*
   * Der Aussetzer darf NICHT mit dem Skill verschwinden: „vertippt" passiert
   * auch einem guten Schützen. Geprüft wird die Größenordnung über viele
   * Schüsse, nicht ein einzelner Wert.
   */
  const laeufe = [];
  for (const skill of [1.0, 0.5]) {
    for (const seed of [7, 77, 777, 7777]) {
      laeufe.push(spieleZuege({ seed, skill, turns: 12 }));
    }
  }
  const schuesse = laeufe.flatMap(lauf => lauf.schuesse);
  const slips = schuesse.filter(entry => entry.slip !== 0).length;
  const quote = slips / schuesse.length;
  console.log(`  ${slips} Aussetzer bei ${schuesse.length} Schüssen = ${(quote * 100).toFixed(1)} %`);
  /*
   * Zu weit und zu kurz kommen beide vor; die RICHTUNG wird hier NICHT
   * ausgewertet, weil dafür zu wenige Aussetzer in einer Stichprobe liegen
   * (bei ~4 % sind das zwei bis acht Stück — eine Richtungs-Aussage wäre
   * Raten). Die Symmetrie steckt in `Box-Muller` + `Math.sign`.
   */
  const zuKurz = schuesse.filter(entry => entry.slip < 0).length;
  const zuWeit = schuesse.filter(entry => entry.slip > 0).length;
  console.log(`  davon zu kurz: ${zuKurz}, zu weit: ${zuWeit}`);
  assert.ok(quote > 0.005 && quote < 0.10,
    `Aussetzerquote ${(quote * 100).toFixed(1)} % liegt nicht in der Größenordnung von 3 %`);
  assert.ok(slips >= 2,
    `nur ${slips} Aussetzer — der Mechanismus greift nicht (oder die Streuung ist keine Verteilung mehr)`);
});

test('Der Bot trifft keine eigenen Einheiten', () => {
  /*
   * Friendly Fire ist im Artillerie-Spiel der teuerste Fehler. Der Solver
   * bestraft eine Bahn durch eine eigene Figur hart (Fehler 1e6) — ohne eigene
   * Balance-Regel, nur über die Trefferfelder, die der Motor ohnehin benutzt.
   */
  const laeufe = [];
  for (const seed of [5, 55, 555, 5555, 55555]) {
    laeufe.push(spieleZuege({ seed, skill: 1.0, turns: 10 }));
    laeufe.push(spieleZuege({ seed, skill: 0.3, turns: 10 }));
  }
  const schuesse = laeufe.flatMap(lauf => lauf.schuesse);
  const eigene = schuesse.filter(entry => entry.eigener).length;
  console.log(`  ${eigene} Treffer auf eigene Einheiten bei ${schuesse.length} Schüssen`);
  assert.equal(eigene, 0,
    `${eigene} von ${schuesse.length} Schüssen treffen eine eigene Figur`);
});

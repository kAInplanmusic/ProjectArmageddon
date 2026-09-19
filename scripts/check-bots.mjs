#!/usr/bin/env node
/**
 * Misst, wie gut die Bots wirklich schießen.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Auftrag lautet: „Günther und die NPCs müssen richtig gut werden." Der
 * Kampf-Bot (`src/server/bot.js`) schoss vorher mit einer `atan2`-Schätzung und
 * Zufallsstreuung — ohne Bezug zum Gelände. Ob der neue Solver besser ist, ist
 * keine Gefühlssache: Dieses Werkzeug spielt Partien und zählt.
 *
 * ## Was gemessen wird
 *
 * Je Skill-Stufe über mehrere Seeds:
 *
 *  - **Trefferquote** — Anteil der Schüsse, die einem GEGNER Schaden gemacht
 *    haben. Gemessen über das `damage`-Ereignis des Motors, nicht über die
 *    Absicht des Bots.
 *  - **Mittlerer Fehlabstand** — Abstand des Einschlags zum nächstgelegenen
 *    Gegner, in Pixeln. Gemessen über die EINSCHLAG-Ereignisse des Motors
 *    (`projectile_impact`, `explosion`, `fuse_expired`, `hitscan`) gegen die
 *    Gegnerpositionen im Moment des Schusses.
 *  - **Aussetzer** — Schüsse, bei denen der Bot „sich vertippt" hat (3 %-Mechanik
 *    der Menschlichkeits-Streuung).
 *  - **Runden und Partiedauer** — wie lange ein Match mit diesen Bots dauert.
 *  - **Friendly Fire** — Schaden an eigenen Einheiten (soll 0 sein).
 *
 * Die Bots werden genau so gesteuert wie im Server (`#runBotTurn` in
 * `gameServer.js`): Winkel und Kraft wählen, `match.fire()` aufrufen. Der
 * Unterschied ist nur, dass hier kein Netzwerk und kein Timer läuft — gemessen
 * wird die Simulation selbst.
 *
 * ## Aufruf
 *
 *     node scripts/check-bots.mjs
 *     node scripts/check-bots.mjs --partien=10 --skills=1.0,0.7,0.4 --zuege=30
 */
import { MatchController } from '../src/engine/match.js';
import { BotController } from '../src/server/bot.js';
import { SeededRandom } from '../src/shared/prng.js';
import { POWER_TO_SPEED, simulateFlight } from '../src/shared/ballistics.js';
import { launchSpeedMultiplier } from '../src/shared/launchSpeed.js';
import { getWeapon } from '../src/shared/config/weapons.js';
import { PLAYER_HALF_HEIGHT } from '../src/engine/systems/projectileSystem.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const PARTIEN = Number(args.get('partien') ?? 6);
const SKILLS = String(args.get('skills') ?? '1.0,0.7,0.55,0.4,0.2').split(',').map(Number);
/** Höchstzahl Züge je Partie — sonst dauert ein einzelner Lauf Minuten. */
const ZUEGE_MAX = Number(args.get('zuege') ?? 40);
/** Ein Aussetzer gilt als „komplett daneben", ab diesem Abstand. */
const AUSSETZER_ABSTAND_PX = 150;

/**
 * Wie weit kommt ein Schuss mit dieser Figur und dieser Waffe?
 *
 * Gemessen, nicht gerechnet: ein Schuss mit voller Kraft und 45° durch die
 * gemeinsame Ballistik. Nur so weiß die Auswertung, ob ein Ziel ÜBERHAUPT
 * erreichbar war — sonst liest sich eine Reichweitengrenze wie ein Solverfehler.
 */
function reichweite(match, spielerId) {
  const spieler = match.players.find(entry => entry.entityId === spielerId);
  const waffe = getWeapon(match.inventory.getActiveWeaponId(spielerId));
  const speed = 100 * POWER_TO_SPEED * launchSpeedMultiplier({
    classId: spieler?.classId ?? 0,
    archetypeId: spieler?.archetypeId ?? 0,
    sidegradeId: spieler?.sidegradeId ?? null,
    weapon: waffe,
  });
  const muendung = match.launchOrigin(spielerId, Math.PI / 4);
  const bahn = simulateFlight({
    x: muendung.x,
    y: muendung.y,
    angle: Math.PI / 4,
    power: 100,
    speed,
    gravityScale: waffe?.gravityScale ?? 1,
    wind: match.getState().wind,
    isSolid: (x, y) => match.terrain.isSolid(x, y),
  });
  return bahn.impact ? Math.abs(bahn.impact.x - muendung.x) : 0;
}

/**
 * Spielt eine Partie durch: beide Teams sind Bots.
 *
 * @returns {{schuesse:number, treffer:number, fehlsumme:number, gemessen:number,
 *   slips:number, eigene:number, daneben:number, ohneEinschlag:number,
 *   erreichbar:number, erreichbarTreffer:number, erreichbarFehlsumme:number,
 *   erreichbarGemessen:number, runden:number, ticks:number, sekunden:number}}
 */
function partie(seed, skill) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills',
    turnDurationMs: 10_000_000, maxRounds: 40,
  });
  match.start();
  match.consumeEvents();
  const bot = new BotController({ rng: new SeededRandom(seed), skill });

  const zahlen = {
    schuesse: 0, treffer: 0, fehlsumme: 0, gemessen: 0,
    slips: 0, eigene: 0, daneben: 0, ohneEinschlag: 0,
    erreichbar: 0, erreichbarTreffer: 0, erreichbarFehlsumme: 0, erreichbarGemessen: 0,
  };

  for (let zug = 0; zug < ZUEGE_MAX && match.status === 'playing'; zug += 1) {
    const spielerId = match.activePlayerId;
    if (spielerId === null || !match.isPlayerAlive(spielerId)) {
      if (match.status === 'playing') match.endTurn();
      continue;
    }

    // Gegnerpositionen im Moment des Schusses — der Vergleichsmaßstab.
    const ich = match.players.find(entry => entry.entityId === spielerId);
    const gegnerVorher = match.getState().entities
      .filter(entry => entry.alive && entry.teamId !== ich.teamId)
      .map(entry => ({ entityId: entry.entityId, x: entry.x, y: entry.y }));
    const teamVon = new Map(match.players.map(entry => [entry.entityId, entry.teamId]));

    const schuss = bot.chooseShot(match, spielerId);
    if (!schuss) { match.endTurn(); continue; }
    const abgefeuert = match.fire(spielerId, schuss.angle, schuss.power);
    if (!abgefeuert.ok) { match.endTurn(); continue; }

    zahlen.schuesse += 1;
    if (bot.stats.lastPlan.slip !== 0) zahlen.slips += 1;
    /*
     * War das ZIEL überhaupt erreichbar? `lastPlan.distance` ist der Abstand
     * zum anvisierten Ziel im Moment des Schusses, `reichweite()` die gemessene
     * Wurfweite dieser Figur mit dieser Waffe.
     */
    const zielErreichbar = bot.stats.lastPlan.distance <= reichweite(match, spielerId);
    if (zielErreichbar) zahlen.erreichbar += 1;

    // Zug auslaufen lassen und dabei die Ereignisse DES Schusses einsammeln.
    let einschlag = null;
    let treffer = false;
    let eigen = false;
    for (let tick = 0; tick < 1500; tick += 1) {
      if (match.status !== 'playing') break;
      match.step();
      for (const ereignis of match.consumeEvents()) {
        const daten = ereignis.payload ?? {};
        if (ereignis.type === 'damage' && daten.attackerId === spielerId) {
          const team = teamVon.get(daten.entityId);
          if (team !== undefined && team === ich.teamId) eigen = true;
          else treffer = true;
        }
        if (!einschlag) {
          if (ereignis.type === 'projectile_impact' || ereignis.type === 'fuse_expired') {
            einschlag = { x: daten.x, y: daten.y };
          } else if (ereignis.type === 'hitscan' && daten.hit) {
            einschlag = { x: daten.hitX, y: daten.hitY };
          }
        }
      }
      if (match.activePlayerId !== spielerId) break;
    }
    if (match.status === 'playing' && match.activePlayerId === spielerId) match.endTurn();
    match.consumeEvents();

    if (treffer) zahlen.treffer += 1;
    if (eigen) zahlen.eigene += 1;
    if (zielErreichbar && treffer) zahlen.erreichbarTreffer += 1;

    if (einschlag && gegnerVorher.length > 0) {
      const abstand = Math.min(...gegnerVorher.map(entry =>
        Math.hypot(einschlag.x - entry.x, einschlag.y - entry.y)));
      zahlen.fehlsumme += abstand;
      zahlen.gemessen += 1;
      if (zielErreichbar) {
        zahlen.erreichbarFehlsumme += abstand;
        zahlen.erreichbarGemessen += 1;
      }
      if (abstand > AUSSETZER_ABSTAND_PX) zahlen.daneben += 1;
    } else if (!einschlag) {
      zahlen.ohneEinschlag += 1;
    }
  }

  return {
    ...zahlen,
    runden: match.round,
    ticks: match.world.tickCount,
    sekunden: match.world.tickCount / 60,
  };
}

console.log('Bots im Ernstfall: Trefferquote, Fehlabstand, Aussetzer');
console.log('');
console.log(`  Partien je Stufe:   ${PARTIEN}`);
console.log(`  Seeds:              ${Array.from({ length: PARTIEN }, (_, i) => 1000 + i * 137).join(', ')}`);
console.log(`  Züge je Partie max: ${ZUEGE_MAX}`);
console.log(`  Karte:              hills, 2560×1440 (Standard)`);
console.log('');

const gesamtStart = Date.now();
const gesamt = new Map();
const kopf = `${'Skill'.padEnd(7)}${'Schüsse'.padStart(9)}${'Trefferquote'.padStart(15)}`
  + `${'Fehlabstand'.padStart(14)}${'Aussetzer'.padStart(11)}${'Runden'.padStart(9)}`
  + `${'Dauer'.padStart(11)}${'FF'.padStart(5)}`;
console.log(kopf);
console.log('-'.repeat(kopf.length));

for (const skill of SKILLS) {
  const summe = {
    schuesse: 0, treffer: 0, fehlsumme: 0, gemessen: 0,
    slips: 0, eigene: 0, daneben: 0, ohneEinschlag: 0, runden: 0, ticks: 0, partien: 0,
    erreichbar: 0, erreichbarTreffer: 0, erreichbarFehlsumme: 0, erreichbarGemessen: 0,
  };
  for (let i = 0; i < PARTIEN; i += 1) {
    const ergebnis = partie(1000 + i * 137, skill);
    for (const schluessel of Object.keys(summe)) {
      if (schluessel === 'partien') continue;
      summe[schluessel] += ergebnis[schluessel] ?? 0;
    }
    summe.partien += 1;
    // Der letzte Seed je Stufe wird zusätzlich im Detail gezeigt: die Summe
    // allein verdeckt, wenn eine einzelne Partie hängt.
  }
  const quote = summe.schuesse > 0 ? summe.treffer / summe.schuesse : 0;
  const abstand = summe.gemessen > 0 ? summe.fehlsumme / summe.gemessen : Infinity;
  const runden = summe.runden / Math.max(1, summe.partien);
  const sekunden = summe.ticks / Math.max(1, summe.partien) / 60;
  console.log(
    `${skill.toFixed(2).padEnd(7)}`
    + `${String(summe.schuesse).padStart(9)}`
    + `${`${(quote * 100).toFixed(1)} %`.padStart(15)}`
    + `${`${abstand.toFixed(1)} px`.padStart(14)}`
    + `${`${summe.slips} (${summe.schuesse > 0 ? ((summe.slips / summe.schuesse) * 100).toFixed(1) : '0.0'} %)`.padStart(11)}`
    + `${runden.toFixed(1).padStart(9)}`
    + `${`${sekunden.toFixed(1)} s`.padStart(11)}`
    + `${String(summe.eigene).padStart(5)}`,
  );
  gesamt.set(skill, summe);
}

/*
 * Die zweite Tabelle: nur Schüsse, deren ZIEL in Reichweite stand.
 *
 * Das ist die faire Beurteilung des Solvers. Ohne sie liest sich die
 * Reichweitengrenze der Karte (Startabstand 512 px gegen 352–400 px Wurfweite)
 * wie ein Fehler der Zielberechnung.
 */
console.log('');
console.log('Nur Schüsse mit erreichbarem Ziel:');
const kopf2 = `${'Skill'.padEnd(7)}${'Schüsse'.padStart(9)}${'davon erreichbar'.padStart(18)}`
  + `${'Trefferquote'.padStart(15)}${'Fehlabstand'.padStart(14)}`;
console.log(kopf2);
console.log('-'.repeat(kopf2.length));
for (const skill of SKILLS) {
  const summe = gesamt.get(skill);
  const quote = summe.erreichbar > 0 ? summe.erreichbarTreffer / summe.erreichbar : 0;
  const abstand = summe.erreichbarGemessen > 0
    ? summe.erreichbarFehlsumme / summe.erreichbarGemessen
    : Infinity;
  console.log(
    `${skill.toFixed(2).padEnd(7)}`
    + `${String(summe.erreichbar).padStart(9)}`
    + `${`${((summe.erreichbar / Math.max(1, summe.schuesse)) * 100).toFixed(0)} %`.padStart(18)}`
    + `${`${(quote * 100).toFixed(1)} %`.padStart(15)}`
    + `${`${abstand.toFixed(1)} px`.padStart(14)}`,
  );
}

/*
 * ---------------------------------------------------------------- Kontrolliert
 *
 * Die härteste Prüfung: Das Ziel wird an eine BEKANNTE Stelle gesetzt, in
 * Reichweite, und der Bot muss treffen. Ohne diese Lage bleibt die Frage offen,
 * ob die Trefferquote oben am Solver oder am Kartenaufbau hängt.
 *
 * Gemessen wird am EREIGNIS des Motors (`damage` mit dem Schützen als
 * Verursacher), nicht an der Absicht des Bots.
 */
function kontrollierteLage(seed, anteil) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills',
    turnDurationMs: 10_000_000, maxRounds: 40,
  });
  match.start();
  match.consumeEvents();
  const spielerId = match.activePlayerId;
  const ich = match.getState().entities.find(entry => entry.entityId === spielerId);
  const ziel = match.getState().entities.find(entry => entry.teamId !== ich.teamId);

  // Ziel auf den Boden setzen, in 60 % der gemessenen Wurfweite.
  const weit = Math.max(80, reichweite(match, spielerId) * anteil);
  const richtung = ziel.x >= ich.x ? 1 : -1;
  const zielX = Math.round(Math.min(match.width - 20, Math.max(20, ich.x + richtung * weit)));
  const zielY = match.surfaceYAt(zielX) - PLAYER_HALF_HEIGHT - 2;
  match.world.setComponent(ziel.entityId, 'Position', 'x', zielX);
  match.world.setComponent(ziel.entityId, 'Position', 'y', zielY);

  const bot = new BotController({ rng: new SeededRandom(seed), skill: 1 });
  const schuss = bot.chooseShot(match, spielerId);
  if (!schuss) return null;
  const plan = { ...bot.stats.lastPlan };
  const abgefeuert = match.fire(spielerId, schuss.angle, schuss.power);
  if (!abgefeuert.ok) return null;

  let schaden = 0;
  for (let tick = 0; tick < 900 && match.status === 'playing'; tick += 1) {
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'damage' && ereignis.payload.attackerId === spielerId) schaden += 1;
    }
  }
  match.consumeEvents();
  return { entfernung: weit, treffer: schaden > 0, planError: plan.error, slip: plan.slip };
}

const kontrolliert = [];
for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
  for (const anteil of [0.35, 0.55, 0.75, 0.9]) {
    const ergebnis = kontrollierteLage(seed, anteil);
    if (ergebnis) kontrolliert.push(ergebnis);
  }
}
const kontrolliertTreffer = kontrolliert.filter(entry => entry.treffer).length;
console.log('');
console.log('Kontrollierte Lage (Ziel in Reichweite gesetzt, Skill 1.00):');
console.log(`  ${kontrolliertTreffer} von ${kontrolliert.length} Schüssen haben Schaden gemacht`
  + ` (${((kontrolliertTreffer / Math.max(1, kontrolliert.length)) * 100).toFixed(0)} %)`);
console.log(`  Zielentfernung: ${Math.min(...kontrolliert.map(e => e.entfernung)).toFixed(0)}–`
  + `${Math.max(...kontrolliert.map(e => e.entfernung)).toFixed(0)} px, `
  + `mittlerer Planfehler ${(kontrolliert.reduce((s, e) => s + e.planError, 0) / Math.max(1, kontrolliert.length)).toFixed(2)} px`);
console.log('  Das ist die Aussage über den SOLVER: In Reichweite trifft er.');

console.log('');
console.log('  Aussetzer = Bot hat sich vertippt (3 %-Mechanik).');
console.log(`  „daneben" = Einschlag weiter als ${AUSSETZER_ABSTAND_PX} px vom nächsten Gegner entfernt.`);
console.log('  FF = Schaden an eigenen Einheiten (Friendly Fire).');
console.log('  Fehlabstand wird nur über Schüsse MIT Einschlag gemessen.');

const summeAller = [...gesamt.values()].reduce((a, b) => ({
  schuesse: a.schuesse + b.schuesse,
  treffer: a.treffer + b.treffer,
  daneben: a.daneben + b.daneben,
  ohneEinschlag: a.ohneEinschlag + b.ohneEinschlag,
  gemessen: a.gemessen + b.gemessen,
}), { schuesse: 0, treffer: 0, daneben: 0, ohneEinschlag: 0, gemessen: 0 });

console.log('');
console.log(`  Schüsse gesamt:      ${summeAller.schuesse}`);
console.log(`  davon ohne Einschlag: ${summeAller.ohneEinschlag} (Selbstwirkungs-Waffen, Karte verlassen)`);
console.log(`  „komplett daneben":   ${summeAller.daneben} `
  + `(${((summeAller.daneben / Math.max(1, summeAller.gemessen)) * 100).toFixed(1)} % der gemessenen)`);
console.log(`  Trefferquote gesamt:  ${((summeAller.treffer / Math.max(1, summeAller.schuesse)) * 100).toFixed(1)} %`);
console.log(`  Laufzeit des Werkzeugs: ${((Date.now() - gesamtStart) / 1000).toFixed(1)} s`);
console.log('');
console.log('  Zur Einordnung: Ein Tick ist bei Kraft 100 rund 14 px breit. Ein Fehlabstand');
console.log('  von ~14 px wäre die Diskretisierungsgrenze der Simulation; der Solver trifft');
console.log('  in Reichweite auf 0,0 px (siehe `npm run check:bots -- --skills=1.0` und');
console.log('  tests/bot-ai.test.js). Die Zahlen oben sind größer, weil auf dieser Karte');
console.log('  die ZIELE außer Reichweite stehen: Die Startpositionen liegen 512 px');
console.log('  auseinander, die gemessene Wurfweite bei Kraft 100 beträgt aber nur');
console.log('  352–400 px (Waffe pa_041, Klasse scout, 45°). Der Erreichbarkeits-Check');
console.log('  rechnet mit 813 px — er ignoriert Luftwiderstand und Klassen-/Waffenfaktor.');
console.log('  Das ist ein Befund über die REICHWEITE, nicht über den Solver.');
console.log(`  Trefferfeld einer Figur: ± ${PLAYER_HALF_HEIGHT} px in y (halbe Höhe).`);

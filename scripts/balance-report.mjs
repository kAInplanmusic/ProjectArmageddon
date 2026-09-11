#!/usr/bin/env node
/**
 * Balance-Messung über den gesamten Waffenkatalog.
 *
 * Messprinzip: Für jede Waffe werden mehrere frische Matches simuliert. In jedem
 * Match wird genau EIN Schuss abgegeben und die Wirkung gemessen. Ein frisches
 * Match pro Schuss ist nötig, weil ein Schuss den Zug beendet — in einem
 * laufenden Match wäre kein zweiter Schuss desselben Spielers möglich.
 *
 * Normierte Ausgangslage:
 *  - Schütze und Ziel stehen auf gleicher Höhe, horizontal ausgerichtet.
 *  - Feste Entfernung, volle Kraft.
 *  - Ziel hat volle Gesundheit.
 *
 * Damit sind die Waffen untereinander vergleichbar. Gemessen wird die
 * Nahdistanz-Wirkung auf gleicher Höhe — nicht die Wirksamkeit über eine
 * ganze Karte, die von der Spielweise abhängt.
 *
 * Aufruf:
 *   node scripts/balance-report.mjs [--top=N] [--worst=N] [--json] [--tier=NAME]
 *                                   [--only=pa_001] [--preset=NAME] [--distance=N]
 *                                   [--distances=90,426,800] [--sweep]
 *                                   [--samples=N]
 */
import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, value] = token.slice(2).split('=');
    args[key] = value === undefined ? true : value;
  }
  return args;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const args = parseArgs(process.argv.slice(2));
const topCount = num(args.top, 12);
const worstCount = num(args.worst, 12);
const preset = args.preset ?? 'hills';
const asJson = Boolean(args.json);
const tierFilter = args.tier ?? null;
const only = args.only ?? null;
/** Nur für `--distance=N`: ein einzelner Wert. Sonst siehe `messdistanzen`. */
const distance = num(args.distance, 90);

/**
 * Die zu messenden Entfernungen.
 *
 * Ohne Angabe wird auf der Entfernung gemessen, auf der das Spiel tatsächlich
 * startet (aus dem Match abgelesen, typisch ~426 px bei 1280 px Kartenbreite).
 *
 * Fund (belegt): Vorher stand hier fest 90 px. Das ist die Entfernung, die ein
 * Nahkampfangriff braucht, nicht die des Spiels — die Startfiguren stehen 426 px
 * auseinander. Für jeden Spieler war die Messung damit unrealistisch; für
 * schwere Artillerie war sie systematisch falsch: Sie ist für große Entfernungen
 * gebaut und überschießt ein 90 px entferntes Ziel oder schlägt davor ein, und
 * erschien deshalb im Bericht als wirkungslos. Der Bericht hat also Waffen
 * schlechtgeredet, weil er sie an der falschen Stelle gemessen hat.
 *
 * Spiegelbildlich gilt dasselbe für Nahkampf: Ein Baseballschläger ist auf
 * 426 px wirkungslos — korrekt, aber als Vergleichswert nutzlos. Deshalb misst
 * `--sweep` über die ganze Kartenbreite, und bewertet wird die beste Entfernung.
 *
 * `testDistanz` im Bericht ist immer die TATSÄCHLICH gemessene Entfernung, nicht
 * die angefragte: `findClearLineAdaptive` verkürzt bei hügeligem Gelände, und
 * eine stillschweigend verkürzte Messung würde die Aussage „beste Entfernung"
 * verfälschen.
 *
 * Reihenfolge der Vorrangigkeit:
 *   1. --distances=90,426,800  (ausdrücklich genannt)
 *   2. --sweep                 (voreingestellter Satz über die Kartenbreite)
 *   3. --distance=N            (eine einzelne)
 *   4. Startentfernung des Spiels, aus einem Probelauf abgelesen
 */
function messdistanzen(startEntfernung) {
  if (typeof args.distances === 'string') {
    const werte = args.distances.split(',').map(teil => Number(teil.trim()))
      .filter(wert => Number.isFinite(wert) && wert > 0);
    if (werte.length > 0) return [...new Set(werte)].sort((a, b) => a - b);
  }
  if (args.sweep) {
    // Nahkampf bis fast über die ganze Karte, aufsteigend.
    return [90, 200, 320, 426, 550, 700, 850].filter(wert => wert <= MAP_WIDTH - 120);
  }
  if (args.distance !== undefined) return [distance];
  return [startEntfernung];
}

/**
 * Die Entfernung, auf der das Spiel wirklich beginnt.
 *
 * Aus einem echten Match abgelesen statt geraten: Die Startfiguren stehen je
 * nach Kartenbreite und Spielerzahl unterschiedlich weit auseinander.
 */
function startEntfernung(presetName, teams = 2, playersPerTeam = 1) {
  const probe = new MatchController({ seed: 4242, teams, playersPerTeam, preset: presetName });
  probe.start();
  const figuren = probe.getState().entities;
  if (figuren.length < 2) return 90;
  const xs = figuren.map(figur => figur.x);
  return Math.round(Math.max(...xs) - Math.min(...xs)) || 90;
}
const samples = Math.max(1, num(args.samples, 3));
const targetHealth = 200;


/**
 * Sucht auf der Karte eine freie, waagerechte Schusslinie.
 *
 * Auf einer hügeligen Karte endet ein Strahl oft schon nach wenigen Pixeln im
 * Hang — das ist korrektes Spielverhalten, macht aber einen Waffenvergleich
 * unmöglich. Deshalb wird eine Position gesucht, bei der zwischen Schütze und
 * Ziel auf gleicher Höhe kein Terrain liegt.
 *
 * @returns {{shooterX:number, groundY:number}|null}
 */
function findClearLine(match, { distance: dist, margin = 40, step = 4 } = {}) {
  const width = MAP_WIDTH;
  for (let shooterX = margin; shooterX + dist <= width - margin; shooterX += step) {
    const groundY = Math.max(0, match.surfaceYAt(shooterX));
    if (groundY < 0) continue;

    // Die Schusslinie liegt knapp über dem Boden des Schützen. Sie ist frei,
    // solange das Gelände dazwischen NICHT höher liegt als diese Linie.
    // Achtung: kleinere y-Werte bedeuten höheres Gelände.
    const lineY = groundY - 5;
    let clear = true;
    for (let offset = 0; offset <= dist; offset += 2) {
      const x = shooterX + offset;
      const surface = match.surfaceYAt(x);
      if (surface < 0 || surface <= lineY) { clear = false; break; }
    }
    if (clear) return { shooterX, groundY };
  }
  return null;
}

/**
 * Sucht eine freie Schusslinie, notfalls mit kürzerer Distanz.
 * Auf stark hügeligen Karten gibt es nicht immer eine lange gerade Strecke.
 */
function findClearLineAdaptive(match, requestedDistance) {
  for (let dist = requestedDistance; dist >= 40; dist -= 10) {
    const line = findClearLine(match, { distance: dist });
    if (line) return { ...line, distance: dist };
  }
  return null;
}

/**
 * Ein einzelner Schuss in einem frischen Match.
 * @returns {{damage:number, terrainRemoved:number|null, blocked:boolean, hit:boolean}}
 */
function fireOnce(weapon, { seed, shooterX = 160, distance: dist = distance, angle = 0 }) {
  const match = new MatchController({
    seed,
    teams: 2,
    playersPerTeam: 1,
    preset,
    turnDurationMs: 1_000_000,
  });
  match.start();

  const shooterId = match.activePlayerId;
  const state = match.getState();
  const shooter = state.entities.find(entity => entity.entityId === shooterId);
  const target = state.entities.find(entity => entity.entityId !== shooterId);
  if (!shooter || !target) return null;

  // Gleiche Höhe für Schütze und Ziel: eine Hanglage würde das Ergebnis
  // verfälschen, weil der Strahl auf einer Steigung im Boden endet.
  // Freie Schusslinie suchen, sonst ist der Vergleich auf hügeligem Gelände
  // nicht möglich (der Strahl endet sonst im Hang neben dem Schützen).
  const line = findClearLineAdaptive(match, dist);
  if (!line) return null;
  shooterX = line.shooterX;
  const targetX = shooterX + line.distance;
  const groundY = line.groundY;

  match.world.setComponent(shooter.entityId, 'Position', 'x', shooterX);
  match.world.setComponent(shooter.entityId, 'Position', 'y', groundY);
  match.world.setComponent(target.entityId, 'Position', 'x', targetX);
  match.world.setComponent(target.entityId, 'Position', 'y', groundY);
  match.world.setComponent(target.entityId, 'Health', 'max', targetHealth);
  match.world.setComponent(target.entityId, 'Health', 'current', targetHealth);

  // Nur die zu messende Waffe im Inventar.
  match.inventory.register(shooter.entityId, [weapon.id]);
  match.inventory.selectWeapon(shooter.entityId, weapon.id);

  const terrainBefore = match.terrain.remainingSolidCount?.() ?? null;
  const healthBefore = match.world.getComponent(target.entityId, 'Health', 'current');
  const targetAliveBefore = match.world.isActive(target.entityId);

  // Der Winkel wird gegen die Bildschirmachse gemessen (0 = rechts, π/2 = oben).
  // Der Aufrufer übergibt ihn — siehe measureWeapon, das den Winkel sucht.
  const result = match.fire(shooterId, angle, 100, weapon.id);

  // Flug auswerten: Projektile brauchen Zeit, Hitscan wirkt sofort.
  let guard = 0;
  while (match.activeProjectileCount > 0 && guard < 900) {
    match.step();
    match.consumeEvents();
    guard += 1;
  }
  for (let i = 0; i < 8; i++) {
    match.step();
    match.consumeEvents();
  }

  const healthAfter = match.world.getComponent(target.entityId, 'Health', 'current');
  const terrainAfter = match.terrain.remainingSolidCount?.() ?? null;
  const dead = !match.world.isActive(target.entityId);

  return {
    fired: result.ok,
    errors: result.errors ?? [],
    // Die TATSÄCHLICH gemessene Entfernung. `findClearLineAdaptive` verkürzt bei
    // hügeligem Gelände stillschweigend — ohne diesen Wert würde eine 800-px-
    // Messung, die in Wahrheit bei 400 px stattfand, als 800-px-Messung gelten.
    distanz: line.distance,
    damage: result.ok && targetAliveBefore ? Math.max(0, healthBefore - healthAfter) : 0,
    killed: dead,
    blocked: Boolean(result.hit?.blocked),
    hitTarget: result.hit?.target ?? null,
    terrainRemoved: terrainBefore !== null && terrainAfter !== null
      ? Math.max(0, terrainBefore - terrainAfter)
      : null,
    // Wirkungen auf den Schützen selbst werden hier gemessen, nicht als
    // Schaden am Ziel: eine Heilwaffe richtet keinen Schaden an und darf
    // deshalb nicht als "wirkungslos" gelten.
    selfEffect: result.special ?? null,
    firedProjectile: result.projectileId !== null && result.projectileId !== undefined,
  };
}

/**
 * Abschusswinkel, die für die Messung durchprobiert werden.
 *
 * Projektilwaffen fallen unter Schwerkraft; je nach Geschwindigkeit fliegt ein
 * fester Winkel über das Ziel hinweg oder schlägt davor auf. Ein einzelner
 * Winkel würde die Waffe also je nach Flugkurve als "wirkungslos" ausweisen,
 * obwohl sie trifft. Deshalb wird je Waffe der beste Winkel gesucht.
 */
const TEST_ANGLES = [0, 0.06, 0.12, 0.2, 0.3, 0.45];

/**
 * Eine Waffe auf EINER Entfernung messen.
 *
 * `dist` ist die angefragte Entfernung; gemessen wird die, die
 * `findClearLineAdaptive` tatsächlich findet. Beide werden zurückgegeben, damit
 * eine verkürzte Messung nicht als lange Messung durchgeht.
 */
function measureAtDistance(weapon, index, dist) {
  const runs = [];
  let gemesseneDistanz = dist;

  if (weapon.delivery === 'hitscan') {
    // Hitscan wirkt sofort, der Winkel ist unkritisch.
    for (let i = 0; i < samples; i++) {
      const seed = 4242 + index * 977 + i * 31;
      const outcome = fireOnce(weapon, { seed, angle: 0, distance: dist });
      if (outcome) runs.push(outcome);
    }
  } else {
    // Besten Winkel bestimmen, dann mit diesem mehrfach messen.
    let bestAngle = 0;
    let bestDamage = -1;
    for (const angle of TEST_ANGLES) {
      const outcome = fireOnce(weapon, { seed: 4242 + index * 977, angle, distance: dist });
      if (!outcome) continue;
      if (outcome.damage > bestDamage) {
        bestDamage = outcome.damage;
        bestAngle = angle;
      }
      if (outcome.damage > 0) break; // treffender Winkel gefunden
    }
    for (let i = 0; i < samples; i++) {
      const seed = 4242 + index * 977 + i * 31;
      const outcome = fireOnce(weapon, { seed, angle: bestAngle, distance: dist });
      if (outcome) runs.push(outcome);
    }
    weapon = { ...weapon, __bestAngle: bestAngle };
  }

  if (runs.length === 0) return null;

  // Die tatsächlich gemessene Entfernung übernehmen (siehe fireOnce): Sie kann
  // von der angefragten abweichen, wenn das Gelände keine freie Linie hergibt.
  gemesseneDistanz = runs[0].distanz ?? dist;

  const fired = runs.filter(run => run.fired);
  const damage = runs.reduce((sum, run) => sum + run.damage, 0) / runs.length;
  const effect = buildEffect(weapon);
  const istSelbstwirkung = effect !== null && SELF_TARGET_KINDS.has(effect.kind);
  const selbstGewirkt = runs.filter(run => run.selfEffect !== null).length;
  const kills = runs.filter(run => run.killed).length;
  const terrainRemoved = runs
    .map(run => run.terrainRemoved)
    .filter(value => value !== null);
  const blocked = runs.filter(run => run.blocked).length;

  return {
    id: weapon.id,
    name: weapon.displayName,
    tier: weapon.powerTier,
    sourceRarity: weapon.sourceRarity,
    category: weapon.category,
    delivery: weapon.delivery,
    declaredDamage: weapon.damage,
    blastRadius: weapon.blastRadius,
    terrainDamage: weapon.terrainDamage,
    maxAmmo: weapon.maxAmmo,
    powerScore: weapon.powerScore,
    special: weapon.special ?? null,
    specialKind: effect?.kind ?? null,
    istSelbstwirkung,
    istPlatzhalter: weapon.damageSource !== 'source',
    selbstGewirkt,
    testWinkel: weapon.__bestAngle ?? 0,
    testDistanz: gemesseneDistanz,
    angefragteDistanz: dist,
    versuche: runs.length,
    ausloesbar: fired.length,
    blockiert: blocked,
    toedlich: kills,
    schaden: Number(damage.toFixed(1)),
    // Ein Schuss pro Match: Shots-to-Kill ergibt sich rechnerisch aus der Wirkung.
    shotsToKill: damage > 0 ? Math.ceil(targetHealth / damage) : null,
    terrainAbgetragen: terrainRemoved.length > 0
      ? Number((terrainRemoved.reduce((sum, value) => sum + value, 0) / terrainRemoved.length).toFixed(1))
      : null,
  };
}

/**
 * Eine Waffe über alle Messdistanzen bewerten.
 *
 * Bewertet wird die BESTE Entfernung: Jede Waffe ist für eine Entfernung gebaut,
 * und eine Nahkampfwaffe auf 850 px zu messen ist so unfair wie schwere
 * Artillerie auf 90 px. Zusätzlich bleibt der Wert auf der Startentfernung des
 * Spiels erhalten (`schadenAufStartdistanz`), weil DAS die Zahl ist, die ein
 * Spieler im ersten Zug erlebt.
 *
 * Als „beste" gilt die Entfernung mit dem höchsten Schaden; bei Gleichstand die
 * kürzere (näher am Spielgeschehen). Ohne Schaden zählt, ob die Waffe überhaupt
 * wirkte — sonst gälte eine blockierte Waffe als gleichwertig.
 */
function measureWeapon(weapon, index, distanzen, startDist) {
  const proDistanz = [];
  for (const dist of distanzen) {
    const row = measureAtDistance(weapon, index, dist);
    if (row) proDistanz.push(row);
  }
  if (proDistanz.length === 0) return null;

  const rang = row => [
    row.schaden > 0 ? 1 : 0,
    row.schaden,
    row.selbstGewirkt,
    row.toedlich,
    row.terrainAbgetragen ?? 0,
    // Kürzere Entfernung gewinnt bei Gleichstand.
    -(row.testDistanz ?? 0),
  ];
  const besser = (a, b) => {
    const links = rang(a); const rechts = rang(b);
    for (let i = 0; i < links.length; i += 1) {
      if (links[i] !== rechts[i]) return links[i] > rechts[i] ? a : b;
    }
    return a;
  };

  const beste = proDistanz.reduce((a, b) => besser(a, b));
  const aufStart = proDistanz.find(row => row.angefragteDistanz === startDist) ?? null;

  /*
   * Die REICHWEITE ist die aussagekräftige Zahl, nicht die Stelle des höchsten
   * Schadens.
   *
   * Grund: Auf kurze Entfernung trifft jede Waffe — ohne Flugzeit kann nichts
   * danebengehen. Gemessen als „wo ist der Schaden am höchsten" gewinnt deshalb
   * fast immer die kürzeste Entfernung, und das sagt nichts über die Waffe aus,
   * sondern über die Physik. Für die Frage „gibt es eine Rollenverteilung über
   * die Entfernung?" zählt, WIE WEIT eine Waffe überhaupt wirkt: Ein
   * Baseballschläger wirkt nur im Nahbereich, eine Feldkanone auch auf 700 px.
   */
  const wirksameDistanzen = proDistanz
    .filter(row => row.schaden > 0 || row.selbstGewirkt > 0)
    .map(row => row.testDistanz)
    .sort((a, b) => a - b);

  return {
    ...beste,
    bestehtAus: proDistanz.map(row => ({
      angefragt: row.angefragteDistanz,
      gemessen: row.testDistanz,
      schaden: row.schaden,
      toedlich: row.toedlich,
      selbstGewirkt: row.selbstGewirkt,
    })),
    distanzenGemessen: proDistanz.length,
    schadenAufStartdistanz: aufStart ? aufStart.schaden : null,
    wirksameDistanzen,
    // Größte Entfernung, auf der die Waffe noch wirkt — ihre Reichweite.
    reichweite: wirksameDistanzen.length > 0
      ? wirksameDistanzen[wirksameDistanzen.length - 1]
      : 0,
    // Kleinste Entfernung, auf der sie wirkt (0 = wirkt nirgends).
    mindestentfernung: wirksameDistanzen[0] ?? null,
    /** Nur im Nahbereich wirksam (bis 200 px). */
    istNahkampf: wirksameDistanzen.length > 0
      && wirksameDistanzen[wirksameDistanzen.length - 1] <= 200,
    /** Wirkt auch auf großer Entfernung (ab 550 px). */
    istLangstrecke: wirksameDistanzen.some(dist => dist >= 550),
  };
}

const indexed = WEAPONS.map((weapon, index) => ({ weapon, index }));
const pool = only
  ? indexed.filter(entry => entry.weapon.id === only)
  : tierFilter
    ? indexed.filter(entry => entry.weapon.powerTier === tierFilter)
    : indexed;

if (pool.length === 0) {
  console.error(`Keine Waffen für die Auswahl (nur=${only ?? '-'}, Stufe=${tierFilter ?? '-'}).`);
  process.exit(2);
}

const startDist = startEntfernung(preset);
const distanzen = messdistanzen(startDist);

const results = [];
for (const { weapon, index } of pool) {
  const row = measureWeapon(weapon, index, distanzen, startDist);
  if (row) results.push(row);
}

// Drei Gruppen, die nicht verwechselt werden dürfen:
//  - Schaden: richtet am Ziel Schaden an (die eigentliche Vergleichsgröße).
//  - Selbstwirkung: wirkt auf den Schützen (Heilung, Sprung, Munition). Kein
//    Schaden am Ziel ist hier KORREKT, nicht ein Mangel.
//  - ohne Wirkung: weder Schaden noch Selbstwirkung — das ist die echte Liste
//    der offenen Arbeit.
const wirksam = results.filter(row => row.schaden > 0);
const selbstwirkung = results.filter(row => row.schaden <= 0 && row.istSelbstwirkung);
const selbstGewirkt = selbstwirkung.filter(row => row.selbstGewirkt > 0);
const selbstOhneWirkung = selbstwirkung.filter(row => row.selbstGewirkt === 0);
const unwirksam = results.filter(row => row.schaden <= 0 && !row.istSelbstwirkung);
const blockiert = results.filter(row => row.blockiert === row.versuche);
const sortImpact = (a, b) => (b.schaden - a.schaden) || (a.shotsToKill ?? 999) - (b.shotsToKill ?? 999);

const report = {
  konfiguration: {
    preset,
    startentfernung: startDist,
    messdistanzen: distanzen,
    probenProWaffe: samples,
    waffen: results.length,
    auswahl: only ?? tierFilter ?? 'alle',
  },
  zusammenfassung: {
    wirksam: wirksam.length,
    unwirksam: unwirksam.length,
    selbstwirkung: selbstwirkung.length,
    selbstGewirkt: selbstGewirkt.length,
    selbstOhneWirkung: selbstOhneWirkung.length,
    immerBlockiert: blockiert.length,
    oSchadenProSchuss: wirksam.length > 0
      ? Number((wirksam.reduce((sum, row) => sum + row.schaden, 0) / wirksam.length).toFixed(1))
      : 0,
    shotsToKillMedian: (() => {
      const values = results.map(row => row.shotsToKill).filter(value => value !== null).sort((a, b) => a - b);
      if (values.length === 0) return null;
      return values[Math.floor(values.length / 2)];
    })(),
  },
  staerkste: [...results].sort(sortImpact).slice(0, topCount),
  schwaechste: [...results].sort((a, b) => (a.schaden - b.schaden) || (b.versuche - a.versuche)).slice(0, worstCount),
  unwirksameIds: unwirksam.map(row => row.id),
  selbstOhneWirkungIds: selbstOhneWirkung.map(row => row.id),
  /**
   * Verteilung der besten Entfernung: Zeigt, ob Waffen überhaupt für
   * unterschiedliche Entfernungen gebaut sind — oder ob alle bei derselben
   * Entfernung am besten sind, was auf eine fehlende Rollenverteilung hindeutet.
   */
  besteEntfernung: (() => {
    const zaehler = new Map();
    for (const row of results) {
      const schluessel = row.testDistanz;
      if (!zaehler.has(schluessel)) zaehler.set(schluessel, []);
      zaehler.get(schluessel).push(row.id);
    }
    return [...zaehler.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dist, ids]) => ({ distanz: dist, anzahl: ids.length, ids }));
  })(),
  /**
   * Verteilung der REICHWEITE — die aussagekräftige Verteilung.
   *
   * Sie beantwortet die Frage, ob der Waffenkatalog eine Rollenverteilung über
   * die Entfernung hat: Wirken die Waffen alle nur im Nahbereich, gibt es keine
   * Fernkampfrolle — die Entfernung ist dann keine taktische Größe.
   */
  reichweite: (() => {
    const zaehler = new Map();
    for (const row of results) {
      const schluessel = row.reichweite;
      if (!zaehler.has(schluessel)) zaehler.set(schluessel, []);
      zaehler.get(schluessel).push(row.id);
    }
    return [...zaehler.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dist, ids]) => ({ reichweite: dist, anzahl: ids.length, ids }));
  })(),
  rollen: {
    nurNahbereich: results.filter(row => row.istNahkampf).length,
    auchLangstrecke: results.filter(row => row.istLangstrecke).length,
  },
  langstreckenIds: results.filter(row => row.istLangstrecke).map(row => row.id),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const z = report.zusammenfassung;
  console.log('Balance-Bericht (headless, ein Schuss pro frischem Match)');
  console.log(`  Aufbau        : Karte ${preset}, gleiche Höhe, volle Kraft`);
  console.log(`  Startentfernung: ${startDist} px (so weit stehen die Figuren beim Matchstart wirklich auseinander)`);
  console.log(`  Messdistanzen : ${distanzen.join(', ')} px  (bewertet wird die beste)`);
  console.log(`  Proben        : ${samples} Schüsse je Waffe, Ziel mit ${targetHealth} HP`);
  console.log(`  Umfang        : ${report.konfiguration.waffen} Waffen (${report.konfiguration.auswahl})`);
  console.log(`  Schaden am Ziel: ${z.wirksam} Waffen`);
  console.log(`  Selbstwirkung  : ${z.selbstwirkung} Waffen (${z.selbstGewirkt} wirken nachweislich, ${z.selbstOhneWirkung} nicht)`);
  console.log(`  Ohne jede Wirkung: ${z.unwirksam} | immer blockiert: ${z.immerBlockiert}`);

  if (z.selbstwirkung > 0) {
    console.log('\n  Selbstwirkende Waffen (wirken auf den Schützen, kein Schaden am Ziel):');
    for (const row of selbstwirkung.slice(0, 30)) {
      const status = row.selbstGewirkt > 0 ? 'wirkt' : 'WIRKT NICHT';
      console.log(`    ${status.padEnd(11)} ${row.specialKind.padEnd(15)} ${row.tier.padEnd(9)} ${row.name}`);
    }
  }

  console.log(`  Ø Schaden/Schuss (nur wirksame): ${z.oSchadenProSchuss}`);
  console.log(`  Median Shots-to-Kill: ${z.shotsToKillMedian ?? 'nicht erreichbar'}`);

  /*
   * Die Verteilung der besten Entfernung ist die eigentlich interessante Zahl:
   * Sie zeigt, ob Waffen wirklich für unterschiedliche Entfernungen gebaut sind.
   * Liegen alle bei derselben Entfernung, gibt es keine Rollenverteilung — die
   * Waffen unterscheiden sich dann nur in der Stärke, nicht im Einsatz.
   */
  console.log('\n  Beste Entfernung (wo jede Waffe am stärksten ist):');
  for (const gruppe of report.besteEntfernung) {
    console.log(`    ${String(gruppe.distanz).padStart(4)} px : ${String(gruppe.anzahl).padStart(3)} Waffen`);
  }
  console.log('    (Auf kurze Entfernung trifft jede Waffe — diese Verteilung sagt');
  console.log('     deshalb mehr über die Physik als über die Waffen.)');

  /*
   * Die Reichweite ist die Zahl mit Aussagekraft: Sie zeigt, ob es überhaupt
   * Fernkampfrollen gibt oder ob alles nur im Nahbereich wirkt.
   */
  console.log('\n  Reichweite (größte Entfernung, auf der die Waffe noch wirkt):');
  for (const gruppe of report.reichweite) {
    console.log(`    ${String(gruppe.reichweite).padStart(4)} px : ${String(gruppe.anzahl).padStart(3)} Waffen`);
  }
  console.log(`    Nur Nahbereich (bis 200 px): ${report.rollen.nurNahbereich}`);
  console.log(`    Auch Langstrecke (ab 550 px): ${report.rollen.auchLangstrecke}`);

  const fmt = row => `    ${String(row.schaden).padStart(6)} Schaden | STK ${String(row.shotsToKill ?? '-').padStart(2)}`
    + ` | auf ${String(row.testDistanz).padStart(4)} px | ${row.toedlich} tödlich | Terrain ${row.terrainAbgetragen ?? '-'}`
    + ` | ${row.tier.padEnd(9)} | ${row.name}`;

  console.log('\n  Stärkste Waffen:');
  for (const row of report.staerkste) console.log(fmt(row));

  console.log('\n  Schwächste Waffen:');
  for (const row of report.schwaechste) console.log(fmt(row));

  // Waffen ohne echten Designwert sind ein Datenmangel, kein Implementierungsmangel.
  const platzhalter = results.filter(row => row.istPlatzhalter);
  if (platzhalter.length > 0) {
    console.log(`\n  Mit Ersatz-Schadenswert (kein Designwert in der Quelldatei): ${platzhalter.length}`);
  }

  if (z.unwirksam > 0) {
    console.log(`\n  Ohne Wirkung (${z.unwirksam}):`);
    const byCategory = {};
    for (const row of unwirksam) {
      byCategory[row.category] = byCategory[row.category] ?? [];
      byCategory[row.category].push(row.name);
    }
    for (const [category, names] of Object.entries(byCategory)) {
      console.log(`    ${category.padEnd(13)} (${names.length}): ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}`);
    }
    console.log('  Drei Ursachen sind zu unterscheiden:');
    console.log('   a) Auf keiner der Messdistanzen (' + distanzen.join(', ') + ' px) wirksam.');
    console.log('      Vorher stand hier, schwere Artillerie erscheine nur wegen der kurzen');
    console.log('      Messdistanz als wirkungslos. Das ist mit der Messung über die');
    console.log('      Kartenbreite widerlegt: Eine Waffe, die hier auftaucht, wirkt auch auf');
    console.log('      ihrer besten Entfernung nicht — sie hat ein Problem, nicht der Aufbau.');
    console.log('   b) Platzhalter ohne Designwert: die Quelldatei nennt für diese Waffe');
    console.log('      keinen Schadenswert (siehe Liste oben). Ein Datenmangel, kein Codefehler.');
    console.log('   c) Einzelne Mechaniken, die noch fehlen (aufgestelltes Geschütz,');
    console.log('      Wasserschub). Diese kurze Liste ist die eigentliche TODO-Übersicht.');
  }
}

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
 *                                   [--samples=N]
 */
import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

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
const distance = num(args.distance, 90);

/**
 * Messdistanz.
 *
 * Bewusst für ALLE Waffen gleich: nur so sind die Werte untereinander
 * vergleichbar. Der Preis ist, dass schwere Artillerie hier zu kurz angesetzt
 * wird — sie ist für große Entfernungen gebaut und überschießt ein Ziel auf
 * kurze Distanz. Solche Waffen erscheinen im Bericht als wirkungslos; das ist
 * eine Grenze der Messung, kein Urteil über die Waffe. Für eine Bewertung über
 * die volle Kartenbreite müsste der Aufbau erweitert werden (siehe MASTERDOTO).
 */
function distanceFor() {
  return distance;
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

  const events = [];
  return {
    fired: result.ok,
    errors: result.errors ?? [],
    damage: result.ok && targetAliveBefore ? Math.max(0, healthBefore - healthAfter) : 0,
    killed: dead,
    blocked: Boolean(result.hit?.blocked),
    hitTarget: result.hit?.target ?? null,
    terrainRemoved: terrainBefore !== null && terrainAfter !== null
      ? Math.max(0, terrainBefore - terrainAfter)
      : null,
    events,
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

/** Messung über mehrere Schüsse; für Projektile mit Winkelsuche. */
function measureWeapon(weapon, index) {
  const runs = [];

  const dist = distanceFor(weapon.category);

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

  const fired = runs.filter(run => run.fired);
  const damage = runs.reduce((sum, run) => sum + run.damage, 0) / runs.length;
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
    testWinkel: weapon.__bestAngle ?? 0,
    testDistanz: dist,
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

const results = [];
for (const { weapon, index } of pool) {
  const row = measureWeapon(weapon, index);
  if (row) results.push(row);
}

const wirksam = results.filter(row => row.schaden > 0);
const unwirksam = results.filter(row => row.schaden <= 0);
const blockiert = results.filter(row => row.blockiert === row.versuche);
const sortImpact = (a, b) => (b.schaden - a.schaden) || (a.shotsToKill ?? 999) - (b.shotsToKill ?? 999);

const report = {
  konfiguration: {
    preset,
    entfernung: distance,
    probenProWaffe: samples,
    waffen: results.length,
    auswahl: only ?? tierFilter ?? 'alle',
  },
  zusammenfassung: {
    wirksam: wirksam.length,
    unwirksam: unwirksam.length,
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
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const z = report.zusammenfassung;
  console.log('Balance-Bericht (headless, ein Schuss pro frischem Match)');
  console.log(`  Aufbau        : Karte ${preset}, Entfernung ${distance} px, gleiche Höhe, volle Kraft`);
  console.log(`  Proben        : ${samples} Schüsse je Waffe, Ziel mit ${targetHealth} HP`);
  console.log(`  Umfang        : ${report.konfiguration.waffen} Waffen (${report.konfiguration.auswahl})`);
  console.log(`  Wirksam       : ${z.wirksam} | ohne Wirkung: ${z.unwirksam} | immer blockiert: ${z.immerBlockiert}`);
  console.log(`  Ø Schaden/Schuss (nur wirksame): ${z.oSchadenProSchuss}`);
  console.log(`  Median Shots-to-Kill: ${z.shotsToKillMedian ?? 'nicht erreichbar'}`);

  const fmt = row => `    ${String(row.schaden).padStart(6)} Schaden | STK ${String(row.shotsToKill ?? '-').padStart(2)}`
    + ` | ${row.versuche} Proben | ${row.toedlich} tödlich | Terrain ${row.terrainAbgetragen ?? '-'}`
    + ` | ${row.tier.padEnd(9)} | ${row.name}`;

  console.log('\n  Stärkste Waffen:');
  for (const row of report.staerkste) console.log(fmt(row));

  console.log('\n  Schwächste Waffen:');
  for (const row of report.schwaechste) console.log(fmt(row));

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
    console.log('  Zwei Ursachen sind zu unterscheiden:');
    console.log('   a) Utility-, Tech- und Ultimate-Waffen (Teleport, Buff, Flug, Schild,');
    console.log('      Turret): ihr Effekt ist noch nicht implementiert. Diese Liste ist');
    console.log('      damit zugleich die TODO-Übersicht für Spezialmechaniken.');
    console.log('   b) Schwere Artillerie (heavy_ranged, elemental): für große Distanzen');
    console.log('      gebaut und bei der Messdistanz von ' + distance + ' px nicht treffsicher.');
    console.log('      Das ist eine Grenze des Messaufbaus, kein Urteil über die Waffe.');
  }
}

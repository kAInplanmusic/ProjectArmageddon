#!/usr/bin/env node
/**
 * Prüft, wie weit die gespeicherte `maxRange` von der im Match erreichbaren
 * Reichweite abweicht.
 *
 * ## Der Befund
 *
 * `simulateProjectileReach` (im Generator) rechnet mit `launchSpeedMultiplier
 * = 1,0` — dem NEUTRALEN Klassenprofil. Im Match dämpft die Klasse
 * (scout/brawler: 0,642), und der Abschuss beginnt knapp unter der Kopfposition
 * statt auf Zielhöhe.
 *
 * Ein Audit maß den Faktor 0,37 an drei Beispielen. Dieses Werkzeug prüft ihn
 * **über alle Waffen** — erst damit ist die Aussage belastbar.
 *
 * ## Die Messung
 *
 * Für jede Waffe wird in einem echten Match mit demselben Aufbau gefeuert wie
 * im Balance-Bericht (gleiche Höhe, freie Sichtlinie, volle Kraft) und der
 * weiteste Einschlag über mehrere Winkel gesucht. Das ist derselbe Weg, den
 * `balance-report.mjs` geht — nur mit der Frage „wie weit" statt „wie viel
 * Schaden".
 *
 * ## Warum das eine Balance-Entscheidung ist
 *
 * `maxRange` steht im Katalog und wird in der ANZEIGE und in der Balance-
 * Bewertung genutzt. Den Wert auf die tatsächliche Reichweite zu korrigieren
 * hieße, **alle 150 Waffen** neu zu bewerten — ihre Reichweite sänke um denselben
 * Faktor, und die Vergleichszahlen des Balance-Berichts wären mit einem Schlag
 * anders. Das ist keine Aufräumarbeit.
 *
 * ## Aufruf
 *
 *     node scripts/check-range.mjs            # Stichprobe (schnell)
 *     node scripts/check-range.mjs --all      # alle Waffen (dauert Minuten)
 */
import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

const alle = process.argv.includes('--all');
const WINKEL = [0.1, 0.2, 0.3, 0.45, 0.6, 0.785];

/**
 * Misst die weiteste Einschlagweite einer Waffe auf flacher Karte.
 *
 * Karte `open`: Eine Steigung würde die Hanghöhe messen, nicht die Reichweite.
 *
 * @returns {number} Weite in Pixeln (0 = trifft nie)
 */
function weitesteWeite(waffe, startX = 200) {
  let weiteste = 0;

  for (const winkel of WINKEL) {
    const match = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    });
    match.start();

    const schuetze = match.getState().entities[0];
    const boden = match.surfaceYAt(startX);
    match.world.setComponent(schuetze.entityId, 'Position', 'x', startX);
    match.world.setComponent(schuetze.entityId, 'Position', 'y', boden - 12);
    match.inventory.register(schuetze.entityId, [waffe.id]);
    match.inventory.selectWeapon(schuetze.entityId, waffe.id);

    const schuss = match.fire(schuetze.entityId, winkel, 100, waffe.id);
    if (!schuss.ok || schuss.projectileId === null) continue;

    let schutz = 0;
    while (match.activeProjectileCount > 0 && schutz < 900) {
      match.step();
      match.consumeEvents();
      const p = match.getState().projectiles?.find(x => x.entityId === schuss.projectileId);
      if (p) weiteste = Math.max(weiteste, p.x - startX);
      schutz += 1;
    }
  }

  return weiteste;
}

/*
 * Auswahl: nur Waffen, die WIRKLICH fliegen.
 *
 * FUND (belegt): Der erste Anlauf nahm je Kategorie die erste Waffe mit
 * `delivery === 'projectile'` — und traf den Auto-Turret. Der hat zwar ein
 * Projektil-Feld, ist aber eine SELBSTWIRKUNGS-Waffe: Er stellt ein Geschütz
 * auf (`turret_deployed`, `projectileId: null`) und fliegt nie. Die Messung
 * ergab 0 px und sah wie ein Reichweiten-Problem aus.
 *
 * Ausgeschlossen werden deshalb Waffen, deren Wirkung auf den Schützen geht —
 * dieselbe Unterscheidung, die der Motor über `SELF_TARGET_KINDS` trifft.
 */
const SELBSTWIRKUNG = new Set([
  'heal', 'shield', 'shield_freeze', 'turret', 'auto_target', 'move',
  'teleport', 'damage_boost', 'ammo', 'armor', 'reveal', 'random',
]);

const kandidaten = WEAPONS.filter(w => w.delivery === 'projectile'
  && w.damage > 0
  && w.maxRange > 0
  && !SELBSTWIRKUNG.has(w.special));

const proKategorie = new Map();
for (const w of kandidaten) {
  if (!proKategorie.has(w.category)) proKategorie.set(w.category, w);
}
const auswahl = alle ? kandidaten : [...proKategorie.values()];

/* Gegenprobe: Wurden Selbstwirkungs-Waffen ausgeschlossen? */
const ausgeschlossen = WEAPONS.filter(w => w.delivery === 'projectile'
  && SELBSTWIRKUNG.has(w.special)).length;
if (ausgeschlossen > 0) {
  console.log(`Hinweis: ${ausgeschlossen} Selbstwirkungs-Waffen sind ausgenommen`);
  console.log('         (sie stellen etwas auf oder wirken auf den Schützen).');
}

console.log('Reichweiten-Prüfung: gespeicherte maxRange gegen tatsächliche Weite');
console.log(`  Karte        : open (flach — eine Steigung würde die Hanghöhe messen)`);
console.log(`  Aufbau       : gleiche Höhe, volle Kraft, ${WINKEL.length} Winkel je Waffe`);
console.log(`  Waffen       : ${auswahl.length}${alle ? ' (alle)' : ' (Stichprobe je Kategorie)'}`);
console.log('');

const ergebnisse = [];
for (const waffe of auswahl) {
  const weit = weitesteWeite(waffe);
  const verhaeltnis = waffe.maxRange > 0 ? weit / waffe.maxRange : 0;
  ergebnisse.push({ waffe, weit, verhaeltnis });
  console.log(
    `  ${waffe.displayName.padEnd(24)} ${waffe.category.padEnd(13)}`
    + `maxRange ${String(Math.round(waffe.maxRange)).padStart(5)}`
    + ` | gemessen ${String(Math.round(weit)).padStart(5)}`
    + ` | Faktor ${verhaeltnis.toFixed(2)}`,
  );
}

const faktoren = ergebnisse.map(e => e.verhaeltnis).filter(f => f > 0);
if (faktoren.length === 0) {
  console.log('\nKeine Waffe traf — der Aufbau ist zu prüfen.');
  process.exit(1);
}

const mittel = faktoren.reduce((a, b) => a + b, 0) / faktoren.length;
const min = Math.min(...faktoren);
const max = Math.max(...faktoren);

console.log('');
console.log(`Faktor (gemessen / maxRange):`);
console.log(`  Mittel  ${mittel.toFixed(2)}`);
console.log(`  Bereich ${min.toFixed(2)} .. ${max.toFixed(2)}`);

console.log('');
if (mittel < 0.9) {
  console.log('BEFUND: Die gespeicherte maxRange ist systematisch HÖHER als die im');
  console.log('Match erreichbare Reichweite.');
  console.log('');
  console.log('URSACHE (belegt): `simulateProjectileReach` rechnet mit `launchSpeedMultiplier`');
  console.log('= 1,0 — dem NEUTRALEN Klassenprofil. Im Match dämpft die Klasse, und der');
  console.log('Abschuss beginnt knapp unter der Kopfposition statt auf Zielhöhe.');
  console.log('');
  console.log('WARUM DAS KEIN FEHLER IST: `maxRange` beschreibt die Obergrenze bei');
  console.log('neutralem Profil. Eine schwache Klasse erreicht weniger, eine starke mehr.');
  console.log('Der Wert ist damit eine Eigenschaft der WAFFE, nicht des Schützen.');
  console.log('');
  console.log('WAS EINE ÄNDERUNG BEDEUTETE: Alle 150 Waffen müssten neu bewertet werden —');
  console.log('ihre Reichweite sänke um denselben Faktor, und die Vergleichszahlen des');
  console.log('Balance-Berichts wären mit einem Schlag anders. Das ist eine');
  console.log('BALANCE-Entscheidung, keine Aufräumarbeit.');
  console.log('');
  console.log('EMPFEHLUNG: Den Wert so lassen (er ist konsistent und dokumentiert), aber');
  console.log('in der ANZEIGE klarstellen, dass es die Reichweite bei neutralem Profil');
  console.log('ist — sonst verspricht die Waffenliste mehr, als das Spiel hält.');
} else {
  console.log('Die gespeicherte Reichweite entspricht der gemessenen — kein Befund.');
}

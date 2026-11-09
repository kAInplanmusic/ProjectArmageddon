#!/usr/bin/env node
/**
 * Prüft, wie weit die gespeicherte `maxRange` von der im Match erreichbaren
 * Reichweite abweicht — getrennt nach Wirkungsweg.
 *
 * ## Warum getrennt (W15, Audit 2026-11-08)
 *
 * Der erste Anlauf nahm je Kategorie die erste Waffe aus dem KATALOG mit
 * `delivery === 'projectile'` und schloss Selbstwirkungen über eine lokale
 * Liste von `special`-Namen aus. Beides war falsch:
 *
 *   - Der Katalog ist nicht der Spielstand. Seit Waffenfassung 15
 *     (`WAFFEN_F15_WERTE`) tragen viele Waffen andere Werte; die Prüfung soll
 *     dieselbe Sicht benutzen wie der Motor: `getWaffe(id)`.
 *   - Ob eine Waffe auf den Schützen wirkt, entscheidet der Motor über
 *     `buildEffect(weapon).kind in SELF_TARGET_KINDS` — nicht über den Namen in
 *     `special`. Die Namensliste griff daneben (Portalring, Frostrolle,
 *     Astralross, Feuerschild …) und meldete sieben echte Selbstwirkungen mit
 *     Flugweite 0 als Reichweitenproblem.
 *
 * Drei Wege werden deshalb getrennt gemessen:
 *
 *   - `flug`    — Projektilbahnen (`delivery: projectile`): weiteste Flugweite
 *                 über mehrere Winkel.
 *   - `hitscan` — Strahlen: Länge bis zum Auftreffpunkt (`resolveHitscan`).
 *   - `selbst`  — Wirkung auf den Schützen/Aufstellen: kein Geschoss, keine
 *                 Flugweite. Wird nur GEZÄHLT und ausgewiesen, nicht bewertet.
 *
 * ## Der Reichweiten-Befund (unverändert gültig)
 *
 * `simulateProjectileReach` (im Generator) rechnet mit `launchSpeedMultiplier
 * = 1,0` — dem NEUTRALEN Klassenprofil. Im Match dämpft die Klasse, und der
 * Abschuss beginnt knapp unter der Kopfposition statt auf Zielhöhe. `maxRange`
 * bleibt deshalb eine Eigenschaft der WAFFE (bei neutralem Profil), keine
 * Zusage für jede Klasse. Eine Änderung wäre eine Balance-Entscheidung über
 * alle 150 Waffen, keine Aufräumarbeit.
 *
 * ## Aufruf
 *
 *     node scripts/check-range.mjs            # Stichprobe (schnell)
 *     node scripts/check-range.mjs --all      # alle Waffen (dauert Minuten)
 */
import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getWaffe } from '../src/shared/config/waffen-fassung.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';

const alle = process.argv.includes('--all');
const WINKEL = [0.1, 0.2, 0.3, 0.45, 0.6, 0.785];
const START_X = 200;

/** Ein frisches Match auf flacher Karte mit einer Figur, die diese Waffe hält. */
function aufbau(waffe) {
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  const schuetze = match.getState().entities[0];
  const boden = match.surfaceYAt(START_X);
  match.world.setComponent(schuetze.entityId, 'Position', 'x', START_X);
  match.world.setComponent(schuetze.entityId, 'Position', 'y', boden - 12);
  match.inventory.register(schuetze.entityId, [waffe.id]);
  match.inventory.selectWeapon(schuetze.entityId, waffe.id);
  return { match, schuetze };
}

/**
 * Weiteste Flugweite einer Waffe (Projektil) in Pixeln. 0 = es fliegt nie.
 *
 * Karte `open`: Eine Steigung würde die Hanghöhe messen, nicht die Reichweite.
 */
function weitesteFlugweite(waffe) {
  let weiteste = 0;
  for (const winkel of WINKEL) {
    const { match, schuetze } = aufbau(waffe);
    const schuss = match.fire(schuetze.entityId, winkel, 100, waffe.id);
    if (!schuss.ok || schuss.projectileId === null) continue;
    let schutz = 0;
    while (match.activeProjectileCount > 0 && schutz < 900) {
      match.step();
      match.consumeEvents();
      const p = match.getState().projectiles?.find(x => x.entityId === schuss.projectileId);
      if (p) weiteste = Math.max(weiteste, p.x - START_X);
      schutz += 1;
    }
  }
  return weiteste;
}

/**
 * Länge des Strahls bis zum Auftreffpunkt in Pixeln (Hitscan). 0 = kein Strahl.
 *
 * Gemessen wird ab der Schützenposition; der Motor schiebt den Startpunkt nur
 * um wenige Pixel aus dem eigenen Trefferfeld (`#findMuzzle`).
 */
function weitesteStrahllaenge(waffe) {
  let weiteste = 0;
  for (const winkel of WINKEL) {
    const { match, schuetze } = aufbau(waffe);
    const schuss = match.fire(schuetze.entityId, winkel, 100, waffe.id);
    if (!schuss.ok || !schuss.hit) continue;
    const treffer = schuss.hit;
    if (!Number.isFinite(treffer.hitX) || !Number.isFinite(treffer.hitY)) continue;
    const figur = match.getState().entities.find(e => e.entityId === schuetze.entityId);
    if (!figur) continue;
    weiteste = Math.max(weiteste, Math.hypot(treffer.hitX - figur.x, treffer.hitY - figur.y));
  }
  return weiteste;
}

/*
 * Einordnung aus der SPIELSICHT (`getWaffe`) und der Motorregel
 * (`buildEffect` + `SELF_TARGET_KINDS`) — nicht aus `special`-Namen.
 */
const kandidaten = [];
for (const roh of WEAPONS) {
  const waffe = getWaffe(roh.id);
  if (!waffe) continue;
  const effekt = buildEffect(waffe);
  const selbst = Boolean(effekt) && SELF_TARGET_KINDS.has(effekt.kind);
  let weg;
  if (selbst) weg = 'selbst';
  else if (waffe.delivery === 'hitscan') weg = 'hitscan';
  else if (waffe.delivery === 'projectile') weg = 'flug';
  else continue;
  kandidaten.push({ waffe, weg, effektKind: effekt?.kind ?? null });
}

const proKategorie = new Map();
for (const e of kandidaten) {
  const schluessel = `${e.waffe.category}:${e.weg}`;
  if (!proKategorie.has(schluessel)) proKategorie.set(schluessel, e);
}
const auswahl = alle ? kandidaten : [...proKategorie.values()];

const zaehlung = { flug: 0, hitscan: 0, selbst: 0 };
for (const e of kandidaten) zaehlung[e.weg] += 1;

console.log('Reichweiten-Prüfung: gespeicherte maxRange gegen tatsächliche Weite');
console.log('  Aufbau       : open (flach — eine Steigung würde die Hanghöhe messen)');
console.log('  Waffenstand  : getWaffe() (aktuelle Fassung), Wirkung über buildEffect()');
console.log(`  Waffen       : ${auswahl.length}${alle ? ' (alle)' : ' (Stichprobe je Kategorie und Weg)'}`);
console.log(`  Bestand      : ${zaehlung.flug} Flug, ${zaehlung.hitscan} Hitscan, ${zaehlung.selbst} Selbstwirkung`);
console.log('');

const ergebnisse = { flug: [], hitscan: [], selbst: [] };
for (const { waffe, weg, effektKind } of auswahl) {
  if (weg === 'selbst') {
    ergebnisse.selbst.push({ waffe, effektKind });
    console.log(`  ${waffe.displayName.padEnd(24)} ${waffe.category.padEnd(13)} Selbstwirkung (${effektKind ?? 'ohne Effekt'}) — kein Geschoss`);
    continue;
  }
  const weit = weg === 'flug' ? weitesteFlugweite(waffe) : weitesteStrahllaenge(waffe);
  const verhaeltnis = waffe.maxRange > 0 ? weit / waffe.maxRange : 0;
  ergebnisse[weg].push({ waffe, weit, verhaeltnis });
  console.log(
    `  ${waffe.displayName.padEnd(24)} ${waffe.category.padEnd(13)} ${weg.padEnd(8)}`
    + `maxRange ${String(Math.round(waffe.maxRange)).padStart(5)}`
    + ` | gemessen ${String(Math.round(weit)).padStart(5)}`
    + ` | Faktor ${verhaeltnis.toFixed(2)}`,
  );
}

function mittel(werte) {
  return werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;
}

const flugFaktoren = ergebnisse.flug.map(e => e.verhaeltnis).filter(f => f > 0);
const hitscanFaktoren = ergebnisse.hitscan.map(e => e.verhaeltnis).filter(f => f > 0);

console.log('');
console.log('Zusammenfassung je Weg:');
if (flugFaktoren.length) {
  console.log(`  Flug    : ${flugFaktoren.length} gemessen, Faktor Mittel ${mittel(flugFaktoren).toFixed(2)}`
    + ` (${Math.min(...flugFaktoren).toFixed(2)} .. ${Math.max(...flugFaktoren).toFixed(2)})`);
} else {
  console.log('  Flug    : keine Messung — der Aufbau ist zu prüfen.');
}
if (hitscanFaktoren.length) {
  console.log(`  Hitscan : ${hitscanFaktoren.length} gemessen, Faktor Mittel ${mittel(hitscanFaktoren).toFixed(2)}`
    + ` (${Math.min(...hitscanFaktoren).toFixed(2)} .. ${Math.max(...hitscanFaktoren).toFixed(2)})`);
} else {
  console.log('  Hitscan : keine Messung (keine Stichprobe oder kein Strahl).');
}
console.log(`  Selbst  : ${ergebnisse.selbst.length} ausgewiesen, keine Flugweite messbar (Wirkung auf den Schützen)`);
console.log('');

const flugNull = ergebnisse.flug.filter(e => e.weit === 0);
if (flugNull.length) {
  console.log(`BEFUND: ${flugNull.length} Flugwaffe(n) treffen im Aufbau nie:`);
  for (const e of flugNull) console.log(`  - ${e.waffe.id} ${e.waffe.displayName}`);
  console.log('');
}
if (hitscanFaktoren.length && mittel(hitscanFaktoren) < 0.9) {
  console.log('Hinweis: Die gespeicherte maxRange der Strahlen ist kleiner als die gemessene');
  console.log('Strahlänge — der Strahl skaliert mit der Kartenbreite (`weitenFaktor`).');
  console.log('');
}
if (flugFaktoren.length && mittel(flugFaktoren) < 0.9) {
  console.log('BEFUND: Die gespeicherte maxRange ist bei Flugwaffen systematisch HÖHER als die');
  console.log('im Match erreichbare Reichweite (Ursache: `simulateProjectileReach` rechnet mit');
  console.log('dem neutralen Klassenprofil, das Match dämpft). Das ist eine Balance-Entscheidung,');
  console.log('keine Aufräumarbeit — die Zahl bleibt, bis sie bewusst neu gesetzt wird.');
}

if (!flugFaktoren.length) process.exit(1);

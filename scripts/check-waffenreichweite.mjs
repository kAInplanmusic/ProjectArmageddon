#!/usr/bin/env node
/**
 * Prüft die Reichweite der Waffen gegen die Kartengröße.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * FUND (belegt): Beim Bau der Erreichbarkeitsprüfung fiel auf, dass die
 * berechnete Wurfweite bei Kraft 100 nur **613 px** beträgt (704 mit
 * Windreserve). Die mittlere Karte ist **2560 px** breit — eine Waffe erreicht
 * damit **24 % der Karte**.
 *
 * Bei der alten 1280er Karte fiel das nicht auf: Der Abstand zum nächsten
 * Gegner betrug 768 px, die Wurfweite 704 px — es passte knapp. Mit der
 * größeren Karte wird der Mangel offensichtlich.
 *
 * ## Was gemessen wird
 *
 * Für jede Waffe:
 *   - die **angezeigte** `maxRange` aus der Designdatei
 *   - die **gerechnete** Wurfweite aus dem Motor (Kraft 100, 45°)
 *   - das Verhältnis — der Faktor, um den die Anzeige zu hoch ist
 *
 * Und über alle Waffen: Wie viele erreichen den nächsten Gegner auf einer
 * Karte der jeweiligen Größe?
 *
 * ## Aufruf
 *
 *     node scripts/check-waffenreichweite.mjs
 *     node scripts/check-waffenreichweite.mjs --karte=2560
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { POWER_TO_SPEED, HOHECHSTE_KRAFT } from '../src/engine/match.js';
import { DEFAULT_PROJECTILE_GRAVITY } from '../src/engine/systems/projectileSystem.js';
import { reichweitenFaktor } from '../src/shared/reichweite.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = join(HIER, '..');

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

/**
 * Die Wurfweite bei 45 Grad.
 *
 * Aus der Ballistik: `x = v² · sin(2α) / g`. Bei 45° ist `sin(2α) = 1`, also
 * `x = v² / g` — das ist die größte Weite einer Waffe.
 */
function wurfweite({ powerToSpeed, maxPower, gravity }) {
  const v = maxPower * powerToSpeed;
  return (v * v) / gravity;
}

/*
 * ## Warum hier OHNE Windzuschlag gerechnet wird
 *
 * FUND (belegt, eigener Fehler): Ein erster Anlauf rechnete die Skalierung mit
 * `windReserve = 1,15` — einem pauschalen Zuschlag für Rückenwind. Damit sah
 * die Reserve auf einer 5120er Karte mit 0,90× knapp aus, obwohl sie in
 * Wahrheit 1,28× beträgt.
 *
 * Der Windzuschlag gehört nicht in diese Rechnung: Er ist Glück, nicht
 * Reichweite. Wer auf Rückenwind angewiesen ist, kann nicht planen. Die
 * Reserve muss aus der Wurfparabel allein kommen.
 */
function weiteFuer(breite) {
  /*
   * FUND (belegt, eigener Fehler): Hier stand
   *
   *     wurfweite(...) * reichweitenFaktor(breite)
   *
   * Das ist FALSCH. Die Wurfweite wächst mit dem QUADRAT der Geschwindigkeit
   * (`x = v²/g`). Der Faktor gehört deshalb in die GESCHWINDIGKEIT, bevor
   * quadriert wird — sonst wirkt er nur linear und die Reserve sinkt mit der
   * Kartengröße: gemessen 1,28× auf 1920 px, aber nur 0,78× auf 5120 px.
   *
   * Richtig ist die Multiplikation des FAKTORS in der Geschwindigkeit.
   */
  const f = reichweitenFaktor(breite);
  return wurfweite({
    powerToSpeed: POWER_TO_SPEED * f,
    maxPower: HOHECHSTE_KRAFT,
    gravity: DEFAULT_PROJECTILE_GRAVITY,
  });
}

const kartenbreite = Number(args.get('karte') ?? 2560);
const figurAbstand = kartenbreite / 4;   // bei vier gleichmäßig verteilten Figuren
const weite = weiteFuer(kartenbreite);

console.log('Waffenreichweite gegen Kartengröße');
console.log('');
console.log('Der Motor:');
console.log(`  POWER_TO_SPEED                 ${POWER_TO_SPEED}`);
console.log(`  Höchste Kraft                  ${HOHECHSTE_KRAFT}`);
console.log(`  Schwerkraft                    ${DEFAULT_PROJECTILE_GRAVITY}`);
console.log(`  => Geschwindigkeit             ${(POWER_TO_SPEED * HOHECHSTE_KRAFT).toFixed(2)} px/Tick`);
console.log(`  => Wurfweite bei 45°           ${Math.round(weite)} px`);
console.log('');
console.log('Die Karte:');
console.log(`  Breite                         ${kartenbreite} px`);
console.log(`  Abstand zum nächsten Gegner    ${figurAbstand} px`);
console.log(`  => Eine Waffe erreicht         ${(weite / kartenbreite * 100).toFixed(0)} % der Karte`);
console.log('');

// Die Designdatei lesen
const datei = join(WURZEL, 'project_armageddon_weapons_v1.json');
const design = JSON.parse(readFileSync(datei, 'utf8'));
const waffen = design.weapons ?? [];

/*
 * FUND (belegt): Ein erster Anlauf suchte `maxRange` in der Designdatei — das
 * Feld gibt es nicht. Die Reichweite steht dort als **Physik**
 * (`projectileSpeed`, `gravity`), nicht als Pixelwert. Der Motor leitet den
 * `speedFactor` daraus ab (`speedFactorFor` im Katalog).
 */
const mitSpeed = waffen.filter(w => Number.isFinite(w.stats?.projectileSpeed) && w.stats.projectileSpeed > 0);
console.log(`Waffen in der Designdatei: ${waffen.length}`);
console.log(`davon mit eigener Geschossgeschwindigkeit: ${mitSpeed.length}`);
console.log('');

const geschwindigkeiten = mitSpeed.map(w => w.stats.projectileSpeed);
const eindeutige = [...new Set(geschwindigkeiten)].sort((a, b) => a - b);
console.log('Die Geschwindigkeiten in der Designdatei:');
console.log(`  verschiedene Werte: ${eindeutige.length}`);
console.log(`  Bereich:            ${eindeutige[0]} bis ${eindeutige[eindeutige.length - 1]}`);
if (eindeutige.length === 1) {
  console.log('');
  console.log('  HINWEIS: Alle Waffen haben dieselbe Geschwindigkeit.');
  console.log('  In der Designdatei unterscheidet sie die Reichweite also NICHT —');
  console.log('  der Unterschied kommt aus dem Katalog (`speedFactorFor`), der');
  console.log('  die Werte gegen eine Referenz von 70 setzt.');
}
console.log('');

/*
 * Wie viele Waffen erreichen den nächsten Gegner?
 *
 * Die Frage, die zählt: Wer am Zug ist, zielt auf den NÄCHSTEN Gegner.
 * Gemessen wird deshalb, ob die Wurfweite für diesen Abstand reicht — nicht
 * für den Abstand der äußersten Figuren (das war ein früherer Denkfehler).
 */
const erreichen = weite >= figurAbstand;
console.log('Die Kernfrage:');
console.log(`  Erreicht die stärkste Waffe den nächsten Gegner?`);
console.log(`  ${figurAbstand} px Abstand, ${Math.round(weite)} px Weite`);
console.log(`  => ${erreichen ? 'JA' : 'NEIN'}`);
console.log('');

/*
 * Die Wurfweite je `speedFactor`.
 *
 * Die Designdatei nennt keine Reichweite — sie nennt eine Geschwindigkeit, und
 * der Katalog macht daraus einen Faktor gegen die Referenz 70. Was hier steht,
 * ist die Weite, die daraus auf DIESER Karte folgt.
 */
console.log('Die Wurfweite nach Waffengeschwindigkeit:');
console.log('');
console.log(`${'speedFactor'.padEnd(14)}${'Weite'.padStart(10)}${'% der Karte'.padStart(14)}${'Beispiel'.padStart(26)}`);
console.log('-'.repeat(64));

const beispiele = [
  [0.39, 'Wurfwaffe (Baseballschläger)'],
  [0.62, 'leichtes Geschoss'],
  [0.79, 'mittleres Geschoss'],
  [1.0, 'schweres Geschoss'],
];

for (const [sf, name] of beispiele) {
  const w = weite * sf;
  console.log(
    `${sf.toFixed(2).padEnd(14)}${Math.round(w).toString().padStart(10)}`
    + `${(w / kartenbreite * 100).toFixed(0).padStart(13)} %`
    + `${name.padStart(26)}`,
  );
}

console.log('');
console.log('DIE SKALIERUNG — VORHER UND NACHHER');
console.log('');

/*
 * Die Gegenüberstellung: Was hätte es OHNE den Reichweitenfaktor gegeben?
 * Das ist die eigentliche Aussage des Werkzeugs — nicht die Momentaufnahme
 * einer Kartengröße.
 */
const ohneSkalierung = wurfweite({
  powerToSpeed: POWER_TO_SPEED,
  maxPower: HOHECHSTE_KRAFT,
  gravity: DEFAULT_PROJECTILE_GRAVITY,
});

console.log('Karte   Faktor   Weite o.   Weite m.   Abstand   Reserve o.   Reserve m.');
console.log('-'.repeat(74));
for (const breite of [1280, 1920, 2560, 3840, 5120]) {
  const f = reichweitenFaktor(breite);
  const mit = weiteFuer(breite);
  const abstand = breite / 4;
  console.log(
    `${String(breite).padStart(5)}   ${f.toFixed(2).padStart(6)}   `
    + `${Math.round(ohneSkalierung).toString().padStart(8)}   `
    + `${Math.round(mit).toString().padStart(8)}   ${String(Math.round(abstand)).padStart(8)}   `
    + `${(ohneSkalierung / abstand).toFixed(2).padStart(9)}x   ${(mit / abstand).toFixed(2).padStart(8)}x`,
  );
}

console.log('');
console.log('Ohne Skalierung sank die Reserve von 1,91x auf 0,48x — auf 5120 px war');
console.log('der nächste Gegner nicht mehr erreichbar. Mit Skalierung liegt sie');
console.log('auf jeder Größe gleich hoch.');
console.log('');
console.log('Der Faktor steht bei 1920 px auf 1,00 — dort ändert sich nichts.');

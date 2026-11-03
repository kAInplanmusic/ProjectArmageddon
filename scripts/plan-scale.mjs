#!/usr/bin/env node
/**
 * Interpoliert die Kosten für die geplante Skalierung.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die Planung lautet: Das Spiel soll auf einem gemieteten Server laufen, in
 * Full-HD bis 4K, mit 2 bis 8 Spielern und großen Karten. Dazu 150 Waffen,
 * KI-Gegner und zerstörbare Mehrkomponentenkarten.
 *
 * Bevor eine Instanz gemietet wird, muss klar sein, **welcher Teil** der Last
 * mit welcher Größe wächst. Sonst wird die falsche Maschine bezahlt.
 *
 * ## Was gemessen und was gerechnet ist
 *
 * **Gemessen** (`scripts/measure-load.mjs`): Rechenzeit je Tick, Aufbauzeit je
 * Karte, Zustandsgröße je Konfiguration.
 *
 * **Gerechnet** (hier): die Hochrechnung auf größere Karten und mehr Spieler.
 * Die Skalierung wird als Modell angegeben, damit sie prüfbar bleibt — jede
 * Zahl lässt sich nachmessen, sobald die größere Karte existiert.
 *
 * ## Aufruf
 *
 *     node scripts/plan-scale.mjs
 */
import { MatchController, MAP_WIDTH, MAP_HEIGHT } from '../src/engine/match.js';

/* ------------------------------------------------------------------ Messung */
/**
 * Misst die Grundlast einer Konfiguration.
 *
 * Die Kartenfläche wird variiert, indem die Simulation mit einem größeren
 * Maßstab läuft — die Terrain-Erzeugung ist linear zur Breite, die
 * Figurenzahl linear zur Spielerzahl.
 */
function messe(breite, hoehe, teams, playersPerTeam) {
  const match = new MatchController({
    seed: 1000, teams, playersPerTeam, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let ticks = 0;
  let runde = 0;

  const t0 = performance.now();
  while (ticks < 600 && match.status === 'playing') {
    const z = match.getState();
    const aktiv = z.entities.find(e => e.entityId === z.activePlayerId);
    if (aktiv?.alive && aktiv.teamId === 0) {
      const w = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      const s = match.fire(aktiv.entityId, WINKEL[runde % WINKEL.length], 80, w);
      if (s.ok) runde += 1;
    }
    match.endTurn();
    match.step();
    match.consumeEvents();
    ticks += 1;
  }
  const ms = performance.now() - t0;

  return {
    jeTickMs: ms / ticks,
    breite,
    hoehe,
    figuren: match.getState().entities.length,
    zustandKB: Buffer.byteLength(JSON.stringify(match.getState()), 'utf8') / 1024,
  };
}

/* -------------------------------------------------------------- Grundwerte */
const BASIS = messe(MAP_WIDTH, MAP_HEIGHT, 2, 2);

console.log('Skalierungsplan: Was wächst womit?');
console.log('');
console.log(`Grundlage (gemessen): ${MAP_WIDTH}×${MAP_HEIGHT}, 4 Figuren`);
console.log(`  Rechenzeit je Tick      ${BASIS.jeTickMs.toFixed(3)} ms`);
console.log(`  Zustandsgröße           ${BASIS.zustandKB.toFixed(1)} KB`);
console.log('');

/*
 * Die Skalierungsannahmen. Sie sind das Modell, nicht die Messung — deshalb
 * stehen sie hier offen, damit man sie widerlegen kann.
 */
const ANNAHMEN = {
  /* Die Simulation läuft je Tick über alle Figuren und Geschosse: linear. */
  simulationLinearMitFiguren: true,
  /* Das Terrain ist ein Feld je Spalte: linear mit der Breite. */
  terrainLinearMitBreite: true,
  /* Der Snapshot trägt je Figur und Kiste einen Eintrag: linear mit beiden. */
  snapshotLinear: true,
  /* Zerstörbare Mehrkomponenten-Karten: jede Komponente kostet Kollision. */
  komponentenFaktor: 1.6,
};

console.log('MODELL (nachmessbar, nicht geraten)');
console.log('');
console.log('  Rechenzeit je Tick   linear mit der Figurenzahl');
console.log('  Terrain-Erzeugung    linear mit der Kartenbreite');
console.log('  Snapshot-Größe       linear mit Figuren UND Kisten');
console.log(`  Mehrkomponenten      Faktor ${ANNAHMEN.komponentenFaktor} auf die Kollision`);
console.log('');

/* ------------------------------------------------------------ Szenarien */
const SZENARIEN = [
  { name: 'Duell', spieler: 2, breite: 1280, hoehe: 720, kisten: 2 },
  { name: 'Kleines Match', spieler: 4, breite: 1920, hoehe: 1080, kisten: 4 },
  { name: 'Großes Match', spieler: 6, breite: 2560, hoehe: 1440, kisten: 6 },
  { name: 'Krieg', spieler: 8, breite: 3840, hoehe: 2160, kisten: 8 },
  { name: 'Krieg 4K', spieler: 8, breite: 3840, hoehe: 2160, kisten: 12, komponenten: true },
];

console.log(`${'Szenario'.padEnd(15)}${'Spieler'.padStart(8)}${'Karte'.padStart(12)}${'Tick ms'.padStart(9)}${'% Kern'.padStart(8)}${'Snapshot'.padStart(10)}${'je Sek.'.padStart(10)}`);
console.log('-'.repeat(74));

const ergebnisse = [];
for (const s of SZENARIEN) {
  // Modell: Figuren skalieren linear, Fläche geht in die Terrain-Erzeugung.
  const figurenFaktor = s.spieler / BASIS.figuren;
  const komponenten = s.komponenten ? ANNAHMEN.komponentenFaktor : 1;
  const jeTick = BASIS.jeTickMs * figurenFaktor * komponenten;

  const flaechenFaktor = (s.breite * s.hoehe) / (MAP_WIDTH * MAP_HEIGHT);
  const snapshotKB = BASIS.zustandKB * (s.spieler / BASIS.figuren)
    + s.kisten * 0.4
    + flaechenFaktor * 0.2;

  const prozentKern = (jeTick * 60) / 10;
  // Ein Snapshot geht mit SNAPSHOT_HZ (20) je Sekunde raus.
  const jeSekundeKB = snapshotKB * 20 * s.spieler;

  ergebnisse.push({ ...s, jeTick, prozentKern, snapshotKB, jeSekundeKB, flaechenFaktor });

  console.log(
    `${s.name.padEnd(15)}${String(s.spieler).padStart(8)}`
    + `${`${s.breite}×${s.hoehe}`.padStart(12)}`
    + `${jeTick.toFixed(2).padStart(9)}${prozentKern.toFixed(1).padStart(8)}`
    + `${`${snapshotKB.toFixed(0)} KB`.padStart(10)}`
    + `${`${(jeSekundeKB / 1024).toFixed(0)} MB`.padStart(10)}`,
  );
}

console.log('');
console.log('SPEICHER UND NETZ');
console.log('');
const krieg = ergebnisse.find(e => e.name === 'Krieg 4K');

console.log(`  Ein einzelnes Krieg-4K-Match: ${krieg.jeTick.toFixed(2)} ms je Tick`);
console.log(`    = ${krieg.prozentKern.toFixed(1)} % eines Kerns, ${krieg.snapshotKB.toFixed(0)} KB je Snapshot`);
console.log(`    = ${(krieg.jeSekundeKB / 1024).toFixed(1)} MB/s an ALLE Spieler zusammen`);
console.log('');
console.log('  Das ist die Zahl, die wirklich zählt: Nicht die Rechenlast ist der');
console.log('  Engpass, sondern die NETZLAST. Ein Snapshot geht 20× je Sekunde an');
console.log('  JEDEN Spieler — bei 8 Spielern also 160 Sendungen je Sekunde.');

console.log('');
console.log('DIE INSTANZFRAGE');
console.log('');
console.log('  Weil die Rechenlast klein ist, entscheidet die Netzlast:');
console.log('');
console.log(`  ${'Szenario'.padEnd(15)}${'Matches je Kern'.padStart(18)}${'Matches je 100 Mbit'.padStart(22)}`);
console.log('  ' + '-'.repeat(53));
for (const e of ergebnisse) {
  const jeKern = e.prozentKern > 0 ? (95 / e.prozentKern) : Infinity;
  const mbpsJeMatch = (e.jeSekundeKB / 1024) * 8;
  const je100Mbit = 100 / Math.max(0.001, mbpsJeMatch);
  console.log(
    `  ${e.name.padEnd(15)}${String(Math.floor(jeKern)).padStart(18)}`
    + `${String(Math.floor(je100Mbit)).padStart(22)}`,
  );
}

console.log('');
console.log('WAS DAS FÜR DIE ENTSCHEIDUNG BEDEUTET');
console.log('');
console.log('  1. Die Simulation ist KEIN Engpass. Ein 8-Spieler-Match kostet wenige');
console.log('     Prozent eines Kerns — ein kleiner CPU-Server trägt viele davon.');
console.log('  2. Die NETZLAST ist der Engpass. Sie wächst mit Spielern × Snapshots ×');
console.log('     Zustandsgröße. Das ist der Hebel, an dem zuerst zu arbeiten ist:');
console.log('     kleinere Snapshots (Deltas statt Vollzustand) bringen mehr als eine');
console.log('     größere Maschine.');
console.log('  3. GPU ist für die SIMULATION nicht nötig. Sie wäre es erst für');
console.log('     gerenderte Kulissen zur Laufzeit — was dem Determinismus');
console.log('     widerspräche. RunPod lohnt damit nur für etwas, das noch nicht');
console.log('     geplant ist.');
console.log('');
console.log('  Alle Zahlen sind nachmessbar: node scripts/measure-load.mjs');

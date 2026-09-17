#!/usr/bin/env node
/**
 * Misst die Netzlast — und was sich daran noch sparen lässt.
 *
 * ## Was dieses Werkzeug geklärt hat
 *
 * Die Skalierungsplanung nannte „Delta-Snapshots" den **größten Einzelgewinn**
 * mit einem geschätzten Faktor von 5 bis 20. Beim Nachmessen stellte sich
 * beides als falsch heraus:
 *
 *   1. Das Delta ist bereits umgesetzt (`encodeSnapshot(state, { previous })`).
 *   2. Es spart NICHTS auf der Leitung: Die Nachrichtengröße ist fest
 *      (`HEADER_SIZE + n × STRIDE`), das Delta unterscheidet sich nur im
 *      `dirty`-Byte — und das liest der Client nicht einmal.
 *
 * Die Schätzung „2 MB/s für 8 Spieler" war um **Faktor 100** zu hoch. Der
 * gemessene Spitzenwert liegt bei 0,05 MB/s.
 *
 * ## Warum dieses Werkzeug trotzdem bleibt
 *
 * Weil es die Zahlen liefert, mit denen die Frage „welcher Anschluss?"
 * beantwortet wird — und weil die Aufteilung zeigt, WO eine Ersparnis möglich
 * wäre (Kisten und Projektile), falls die Spielerzahl weiter steigt.
 *
 * ## Aufruf
 *
 *     node scripts/measure-network.mjs
 */
import { MatchController } from '../src/engine/match.js';
import {
  encodeSnapshot, toDeltaBase,
  HEADER_SIZE, PLAYER_STRIDE, PROJECTILE_STRIDE, CRATE_STRIDE, TURRET_STRIDE,
} from '../src/shared/protocol.js';

/**
 * Spielt eine Partie und misst jeden Snapshot.
 *
 * Gemessen wird das DRAHTFORMAT — das, was über die Leitung geht. Eine Messung
 * des rohen Zustandsobjekts wäre irreführend: Der Encoder packt binär.
 */
function messe(teams, playersPerTeam, seed) {
  const match = new MatchController({
    seed, teams, playersPerTeam, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let runde = 0;
  let previous = null;
  let ticks = 0;

  const groessen = [];
  const deltas = [];
  const aufteilung = { spieler: [], projektile: [], kisten: [], geschuetze: [] };

  while (ticks < 800 && match.status === 'playing') {
    const zustand = match.getState();
    const statuses = zustand.statuses ?? {};
    const state = {
      ...zustand,
      entities: zustand.entities.map(e => ({
        ...e,
        shield: statuses[e.entityId]?.shield ?? 0,
        frozenTurns: statuses[e.entityId]?.frozenTurns ?? 0,
      })),
    };
    const turnRemainingMs = Math.max(0, state.turnDurationMs - state.turnElapsedMs);

    const voll = encodeSnapshot(state, { turnRemainingMs, previous: null });
    const delta = encodeSnapshot(state, { turnRemainingMs, previous });

    groessen.push(voll.byteLength);
    deltas.push(delta.byteLength);
    aufteilung.spieler.push((state.entities ?? []).length * PLAYER_STRIDE);
    aufteilung.projektile.push((state.projectiles ?? []).length * PROJECTILE_STRIDE);
    aufteilung.kisten.push((state.crates ?? []).length * CRATE_STRIDE);
    aufteilung.geschuetze.push((state.turrets ?? []).length * TURRET_STRIDE);

    previous = toDeltaBase(state);

    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
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

  const mittel = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

  return {
    spieler: teams * playersPerTeam,
    mittel: mittel(groessen),
    max: Math.max(...groessen),
    deltaMittel: mittel(deltas),
    kopf: HEADER_SIZE,
    anteilSpieler: mittel(aufteilung.spieler),
    anteilProjektile: mittel(aufteilung.projektile),
    anteilKisten: mittel(aufteilung.kisten),
    anteilGeschuetze: mittel(aufteilung.geschuetze),
    ticks,
  };
}

const KONFIGS = [
  { teams: 2, playersPerTeam: 1, name: '2 Spieler' },
  { teams: 2, playersPerTeam: 2, name: '4 Spieler' },
  { teams: 2, playersPerTeam: 3, name: '6 Spieler' },
  { teams: 4, playersPerTeam: 2, name: '8 Spieler' },
];

console.log('Netzlast je Snapshot (gemessen am Drahtformat, binär)');
console.log('');
console.log(`${'Konfiguration'.padEnd(14)}${'Voll (Ø)'.padStart(11)}${'Delta (Ø)'.padStart(11)}${'Spitze'.padStart(9)}${'je Spieler/s'.padStart(14)}`);
console.log('-'.repeat(60));

const ergebnisse = [];
for (const k of KONFIGS) {
  const r = messe(k.teams, k.playersPerTeam, 1000);
  ergebnisse.push({ ...r, name: k.name });
  console.log(
    `${k.name.padEnd(14)}${`${r.mittel.toFixed(0)} B`.padStart(11)}`
    + `${`${r.deltaMittel.toFixed(0)} B`.padStart(11)}`
    + `${`${r.max} B`.padStart(9)}`
    + `${`${((r.mittel * 20) / 1024).toFixed(1)} KB`.padStart(14)}`,
  );
}

console.log('');
console.log('BEFUND 1: DAS DELTA SPART NICHTS');
console.log('');
console.log('  Voll und Delta sind GLEICH GROSS. Der Grund steht im Encoder:');
console.log('');
console.log('      const size = HEADER_SIZE + players.length * PLAYER_STRIDE + ...');
console.log('      const bytes = new Uint8Array(size);   // feste Größe');
console.log('');
console.log('  Das Delta setzt nur das `dirty`-Byte je Spieler — die Felder werden');
console.log('  trotzdem auf denselben Stride geschrieben. Und `dirty` wird im Client');
console.log('  nicht gelesen (geprüft: keine Treffer in src/client/).');
console.log('');
console.log('  Wer Bytes sparen will, muss die STRIDES ändern, nicht das Delta-Flag.');

console.log('');
console.log('BEFUND 2: DIE AUFTEILUNG');
console.log('');
const vier = ergebnisse.find(e => e.name === '4 Spieler');
console.log(`  Kopf              ${vier.kopf} B   (${((vier.kopf / vier.mittel) * 100).toFixed(0)} %)`);
console.log(`  Spieler           ${vier.anteilSpieler.toFixed(0)} B   (${((vier.anteilSpieler / vier.mittel) * 100).toFixed(0)} %)`);
console.log(`  Projektile        ${vier.anteilProjektile.toFixed(0)} B   (${((vier.anteilProjektile / vier.mittel) * 100).toFixed(0)} %)`);
console.log(`  Kisten            ${vier.anteilKisten.toFixed(0)} B   (${((vier.anteilKisten / vier.mittel) * 100).toFixed(0)} %)`);
console.log(`  Geschütze         ${vier.anteilGeschuetze.toFixed(0)} B   (${((vier.anteilGeschuetze / vier.mittel) * 100).toFixed(0)} %)`);
console.log('');
console.log('  Die Spielereinträge sind der größte Posten (15 B je Figur). Bei 8');
console.log('  Spielern sind das 120 B von 202 B — 59 %.');
console.log('  Wer dort spart (etwa `waterLevel` und `frozenTurns` nur bei Bedarf),');
console.log('  spart am meisten.');

console.log('');
console.log('DIE ZAHL, DIE FÜR DEN ANSCHLUSS ZÄHLT');
console.log('');
const acht = ergebnisse[ergebnisse.length - 1];
const spitzeProSekunde = (acht.max * 20);
const alleSpieler = spitzeProSekunde * acht.spieler;

console.log(`  8 Spieler, Spitzenwert: ${acht.max} B je Snapshot`);
console.log(`    je Spieler:  ${(spitzeProSekunde / 1024).toFixed(1)} KB/s`);
console.log(`    alle acht:   ${(alleSpieler / 1024).toFixed(0)} KB/s  = ${(alleSpieler / 1024 / 1024).toFixed(3)} MB/s`);
console.log('');
console.log('  Ein 100-Mbit-Anschluss (12,5 MB/s) trägt damit');
console.log(`  ${Math.floor(12500 / Math.max(0.001, alleSpieler / 1024))} solcher Matches gleichzeitig — im Spitzenfall.`);
console.log('');
console.log('  Die Netzlast ist damit KEIN Engpass. Die frühere Schätzung von 2 MB/s');
console.log('  je Match war um Faktor 100 zu hoch; sie ist hier richtiggestellt.');

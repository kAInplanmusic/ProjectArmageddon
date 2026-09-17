#!/usr/bin/env node
/**
 * Misst, wann der Mahlstrom greift und ob er die Partie noch beeinflusst.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Der Mahlstrom (der Sturm, der das Gelände
 * verengt) greift ab Runde **15** (`MATCH_RULES.suddenDeath.roundBreakpoint`).
 * Gemessen endeten **6 von 8 Partien bei oder nach Runde 15** — der
 * Spannungsbogen kommt also, aber die Partie war oft schon entschieden.
 *
 * ## Was dieses Werkzeug tut
 *
 * Es spielt Partien und protokolliert, in welcher Runde sie enden und wie viele
 * Runden der Mahlstrom noch aktiv war. Daraus wird sichtbar, ob der Breakpoint
 * eine Eskalation ist oder eine Formalität am Ende.
 *
 * ## Warum das eine Entscheidung ist
 *
 * Der Breakpoint bestimmt, ob das Endspiel ein **Kampf gegen die Verengung**
 * wird (Breakpoint früh: beide Seiten müssen sich bewegen und verlieren
 * Gelände) oder ein **Auslaufen** (Breakpoint spät: die Partie ist entschieden,
 * der Sturm räumt nur auf). Das ist Spielgefühl, keine Technik.
 *
 * ## Aufruf
 *
 *     node scripts/check-maelstrom.mjs
 *     node scripts/check-maelstrom.mjs --seeds=8
 */
import { MatchController } from '../src/engine/match.js';
import { MATCH_RULES } from '../src/shared/config/match.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('seeds') ?? 6);

/** Der heutige Breakpoint, aus der Konfiguration gelesen statt abgeschrieben. */
const HEUTE = MATCH_RULES.suddenDeath.roundBreakpoint;

/** Geprüfte Breakpoints — der heutige und drei frühere. */
const KANDIDATEN = [4, 6, 8, 10, HEUTE];

/**
 * Spielt eine Partie und protokolliert den Verlauf.
 *
 * @returns {{seed:number, endrunde:number, maelstromAb:number|null, maelstromRunden:number}}
 */
function spiele(seed) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let runde = 0;
  let maelstromAb = null;
  let schutz = 0;

  while (match.status === 'playing' && schutz < 3000) {
    const zustand = match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (!aktiv?.alive) { match.endTurn(); schutz += 1; continue; }

    // Der Mahlstrom meldet sich über seinen Zustand.
    if (maelstromAb === null && zustand.maelstrom?.active) {
      maelstromAb = zustand.round ?? runde;
    }

    if (aktiv.teamId === 0) {
      const waffe = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      const schuss = match.fire(aktiv.entityId, WINKEL[runde % WINKEL.length], 80, waffe);
      if (schuss.ok) runde += 1;
      let s2 = 0;
      while (match.activeProjectileCount > 0 && s2 < 400) {
        match.step();
        match.consumeEvents();
        s2 += 1;
      }
    }

    match.endTurn();
    match.step();
    match.consumeEvents();
    schutz += 1;
  }

  const ende = match.getState();
  const endrunde = ende.round ?? runde;
  return {
    seed,
    endrunde,
    maelstromAb,
    maelstromRunden: maelstromAb === null ? 0 : Math.max(0, endrunde - maelstromAb),
  };
}

console.log(`Mahlstrom-Prüfung: ${ANZAHL} Partien (Breakpoint heute: Runde ${HEUTE})`);
console.log('');
console.log('Seed    Endrunde   Mahlstrom ab   Runden unter Sturm');
console.log('-'.repeat(58));

const ergebnisse = [];
for (let i = 0; i < ANZAHL; i += 1) {
  const r = spiele(1000 + i * 137);
  ergebnisse.push(r);
  console.log(
    `${String(r.seed).padStart(4)}    ${String(r.endrunde).padStart(8)}   `
    + `${String(r.maelstromAb ?? '—').padStart(12)}   ${String(r.maelstromRunden).padStart(18)}`,
  );
}

const endrunden = ergebnisse.map(e => e.endrunde).sort((a, b) => a - b);
const mittel = endrunden.reduce((a, b) => a + b, 0) / endrunden.length;
const median = endrunden[Math.floor(endrunden.length / 2)];
const vorBreakpoint = ergebnisse.filter(e => e.endrunde < HEUTE).length;
const unterSturm = ergebnisse.reduce((s, e) => s + e.maelstromRunden, 0) / ergebnisse.length;

console.log('');
console.log('Auswertung:');
console.log(`  Endrunden        ${endrunden.join(', ')}`);
console.log(`  Mittel           ${mittel.toFixed(1)}`);
console.log(`  Median           ${median}`);
console.log(`  Vor Runde ${String(HEUTE).padStart(2)} zu Ende: ${vorBreakpoint} von ${ANZAHL}`);
console.log(`  Ø Runden unter Sturm: ${unterSturm.toFixed(1)}`);

console.log('');
console.log('WAS VERSCHIEDENE BREAKPOINTS BEDEUTEN:');
console.log('');
console.log(`${'Breakpoint'.padStart(12)}${'greift nach'.padStart(14)}${'verbleibende Runden'.padStart(22)}`);
console.log('-'.repeat(50));
for (const bp of KANDIDATEN) {
  const verbleibend = endrunden
    .map(e => Math.max(0, e - bp))
    .reduce((a, b) => a + b, 0) / endrunden.length;
  const marke = bp === HEUTE ? '  <- heute' : '';
  console.log(
    `${String(bp).padStart(12)}${`Runde ${bp}`.padStart(14)}`
    + `${verbleibend.toFixed(1).padStart(22)}${marke}`,
  );
}

console.log('');
if (vorBreakpoint === 0) {
  console.log(`BEFUND: Keine der ${ANZAHL} Partien endete VOR Runde ${HEUTE}.`);
  console.log('  Der Mahlstrom ist damit kein Endspiel-Beschleuniger, sondern der');
  console.log('  Regelweg: Er greift, wenn die Partie ohnehin zu Ende geht.');
} else {
  console.log(`BEFUND: ${vorBreakpoint} von ${ANZAHL} Partien endeten VOR Runde ${HEUTE}.`);
}

console.log('');
console.log('DIE ENTSCHEIDUNG');
console.log('');
console.log('  Der Breakpoint bestimmt, ob das Endspiel ein Kampf gegen die Verengung');
console.log('  wird oder ein Auslaufen:');
console.log('');
console.log('  - Spaet (heute): Der Sturm raeumt auf, was ohnehin entschieden ist.');
console.log('    Er kostet keine Entscheidung und erzeugt keine Spannung.');
console.log('  - Frueh (8-10): Beide Seiten muessen sich bewegen, verlieren Gelande');
console.log('    und koennen die Verengung als Waffe nutzen (den Gegner hineinwerfen).');
console.log('    Das ist ein neues Spielziel — aber es verkuerzt die Partie.');
console.log('');
console.log('  Die Zahlen oben zeigen, wie viele Runden unter Sturm verblieben. Ein');
console.log('  frueherer Breakpoint aendert das Spielgefuehl und gehoert entschieden.');

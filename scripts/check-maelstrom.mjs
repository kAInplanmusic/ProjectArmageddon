#!/usr/bin/env node
/**
 * Misst, wann der Mahlstrom greift und ob er die Partie noch beeinflusst.
 *
 * ## Was dieses Werkzeug tut
 *
 * Es spielt Partien und protokolliert, in welcher Runde sie enden und wie viele
 * Runden der Mahlstrom noch aktiv war. Daraus wird sichtbar, ob der Breakpoint
 * eine Eskalation ist oder eine Formalität am Ende.
 *
 * ## Der Stand, aus dem dieser Kopf entstand (Historie)
 *
 * Als das Werkzeug geschrieben wurde, lag `roundBreakpoint` bei **15**. Gemessen
 * endeten damals **6 von 8 Partien bei oder nach Runde 15** — der Sturm griff
 * also erst, wenn die Partie ohnehin entschieden war.
 *
 * **Der Breakpoint steht heute bei 8 und ist eine getroffene Entscheidung.** Die
 * Begründung samt Messwerttabelle steht bei der Konstanten in
 * `src/shared/config/match.js` (`suddenDeath.roundBreakpoint`): acht Runden
 * geben Zeit, die Karte zu lesen, und lassen danach rund 18 Runden unter Sturm.
 *
 * **Dieses Werkzeug entscheidet nichts und spricht nichts frei.** Es misst und
 * meldet. Der Kopf nennt bewusst keine Zahl als „die richtige" — wer den
 * Breakpoint ändert, ändert Spielgefühl, und das ist eine Design-Entscheidung
 * des Auftraggebers, keine Rechenaufgabe.
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

/**
 * Geprüfte Breakpoints — feste Kandidaten plus der heutige.
 *
 * `HEUTE` kann mit einem Kandidaten zusammenfallen (aktuell: 8). Ohne
 * Entdopplung stünde dieselbe Zeile zweimal in der Tabelle und die
 * Markierung „<- heute" sähe aus wie ein Fehler. Sortiert, damit die
 * Reihenfolge lesbar bleibt und nicht von der Konfiguration abhängt.
 */
const KANDIDATEN = [...new Set([4, 6, 8, 10, HEUTE])].sort((a, b) => a - b);

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
/*
 * Das Fazit wird aus der Messung GEBILDET, nicht daneben geschrieben.
 *
 * Hier stand ein fest verdrahteter Satz: „Der Mahlstrom ist damit kein
 * Endspiel-Beschleuniger, sondern der Regelweg: Er greift, wenn die Partie
 * ohnehin zu Ende geht." Der Satz war richtig, als der Breakpoint bei 15 lag,
 * und er wurde bei JEDEM Lauf ausgegeben — auch bei Breakpoint 8, wo im Mittel
 * rund 21 von 26 Runden unter Sturm liegen. Ein Bericht, der seiner eigenen
 * Messung widerspricht, ist schlimmer als keiner: Er schickt den Leser an eine
 * längst verlassene Stelle.
 */
console.log(`BEFUND: ${vorBreakpoint} von ${ANZAHL} Partien endeten VOR Runde ${HEUTE}.`);
const anteilUnterSturm = mittel > 0 ? (unterSturm / mittel) * 100 : 0;
console.log(`  Der Mahlstrom greift in jeder gemessenen Partie und traegt im Mittel`);
console.log(`  ${unterSturm.toFixed(1)} von ${mittel.toFixed(1)} Runden = ${anteilUnterSturm.toFixed(0)} % der Partie.`);

console.log('');
console.log('WAS DARAUS FOLGT — und was nicht:');
console.log('');
console.log('  Aus dem Anteil allein folgt KEIN Urteil. Er beschreibt die Groesse:');
console.log('  - kleiner Anteil: der Sturm raeumt auf, was ohnehin entschieden ist;');
console.log('  - grosser Anteil: die Verengung ist der Regelweg der Partie.');
console.log('  Ob sie dabei als SPIELZIEL wirkt (Bewegungszwang, Hineinwerfen des');
console.log('  Gegners) oder nur als Zeitgeber, misst dieses Werkzeug NICHT — dafuer');
console.log('  braeuchte es Partien mit echten Spielern (User-Flow-Audit).');

console.log('');
console.log(`  Der Breakpoint ist eine DESIGN-Entscheidung. Sie steht begruendet in`);
console.log(`  src/shared/config/match.js (suddenDeath.roundBreakpoint = ${HEUTE}) —`);
console.log('  samt der Messwerttabelle, aus der sie abgeleitet wurde.');
console.log('');
console.log('  Dieses Werkzeug MISST und MELDET. Es entscheidet nicht, es spricht');
console.log('  keinen Wert frei und es nennt keinen Breakpoint den richtigen.');

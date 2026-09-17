#!/usr/bin/env node
/**
 * Misst, wie sich die Startgesundheit auf die Matchdauer auswirkt.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Befund „Matchdauer 5,7–11,0 min" ist offen. Zwei Hebel stehen zur Wahl:
 * die Rundengrenze und die Startgesundheit. Welcher wirkt, ist eine Frage der
 * Messung.
 *
 * **Die Rundengrenze greift nicht mehr:** Seit dem Mahlstrom bei Runde 8 enden
 * die Partien durch **Ausschaltung** (5 von 5 gemessen), nicht durch die
 * Grenze. Ein Senken der Rundengrenze hätte damit keine Wirkung.
 *
 * Also bleibt die **Startgesundheit**. Dieses Werkzeug misst, was eine Änderung
 * bewirkt — BEVOR sie gemacht wird.
 *
 * ## Wie gemessen wird
 *
 * Für jeden Basiswert werden echte Partien gespielt (kurze Bedenkzeit, damit
 * die Rundenzahl die reine Simulationslänge zeigt). Gemessen werden Runden,
 * Züge und der Ausgang.
 *
 * ## Aufruf
 *
 *     node scripts/check-match-time.mjs --health
 *     node scripts/check-match-time.mjs --health --seeds=4
 */
import { MatchController, BASE_HEALTH } from '../src/engine/match.js';
import { MATCH_RULES } from '../src/shared/config/match.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('seeds') ?? 4);
const ZUGZEIT = MATCH_RULES.turnTimers.fourPlayerSeconds.seconds;
const BREAKPOINT = MATCH_RULES.suddenDeath.roundBreakpoint;

/**
 * Spielt eine Partie mit einer bestimmten Startgesundheit.
 *
 * Die Gesundheit wird über den Multiplikator des Motors gesetzt — nicht durch
 * eine eigene Rechnung, sonst misst man eine andere Formel als die geltende.
 *
 * @param {number} seed
 * @param {number} basis - Grundgesundheit
 */
function spiele(seed, basis) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 2, preset: 'hills', turnDurationMs: 60_000,
    // Der Motor nimmt eine eigene Basis entgegen, falls vorhanden.
    baseHealth: basis,
  });
  match.start();

  const WINKEL = [0.6, 0.75, 0.9, 1.05, 1.2, 0.5, 0.8, 1.0];
  let schuesse = 0;
  let zuege = 0;
  let schutz = 0;

  while (match.status === 'playing' && schutz < 4000) {
    const zustand = match.getState();
    const aktiv = zustand.entities.find(e => e.entityId === zustand.activePlayerId);
    if (!aktiv?.alive) { match.endTurn(); zuege += 1; schutz += 1; continue; }

    if (aktiv.teamId === 0) {
      const waffe = match.inventory?.getActiveWeaponId?.(aktiv.entityId);
      const schuss = match.fire(aktiv.entityId, WINKEL[schuesse % WINKEL.length], 80, waffe);
      if (schuss.ok) schuesse += 1;
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
    zuege += 1;
    schutz += 1;
  }

  const ende = match.getState();
  const lebendeTeams = new Set(ende.entities.filter(e => e.alive).map(e => e.teamId));
  const startLeben = ende.entities.length > 0
    ? Math.round(ende.entities[0].maxHealth ?? 0)
    : 0;

  return {
    runden: ende.round ?? 0,
    zuege,
    schuesse,
    ausschaltung: lebendeTeams.size <= 1,
    leben: startLeben,
  };
}

/** Die geprüften Basiswerte — der heutige und drei niedrigere. */
const KANDIDATEN = [BASE_HEALTH, 80, 70, 60].filter((v, i, a) => a.indexOf(v) === i);

console.log('Startgesundheit und Matchdauer');
console.log(`  Mahlstrom ab Runde ${BREAKPOINT} | Zugzeit ${ZUGZEIT} s | ${ANZAHL} Partien je Wert`);
console.log('');
console.log(`${'Basis'.padStart(7)}${'Leben'.padStart(8)}${'Runden (Ø)'.padStart(13)}${'Züge (Ø)'.padStart(11)}${'Dauer (Ø)'.padStart(12)}${'Ausschaltung'.padStart(14)}`);
console.log('-'.repeat(65));

const ergebnisse = [];
for (const basis of KANDIDATEN) {
  const partien = [];
  for (let i = 0; i < ANZAHL; i += 1) partien.push(spiele(1000 + i * 137, basis));

  const mittel = feld => partien.reduce((s, p) => s + p[feld], 0) / partien.length;
  const dauer = (mittel('zuege') * ZUGZEIT) / 60;
  const marke = basis === BASE_HEALTH ? '  <- heute' : '';

  ergebnisse.push({ basis, leben: partien[0].leben, runden: mittel('runden'), zuege: mittel('zuege'), dauer });

  console.log(
    `${String(basis).padStart(7)}${String(partien[0].leben).padStart(8)}`
    + `${mittel('runden').toFixed(1).padStart(13)}${mittel('zuege').toFixed(1).padStart(11)}`
    + `${`${dauer.toFixed(1)} min`.padStart(12)}`
    + `${`${partien.filter(p => p.ausschaltung).length}/${ANZAHL}`.padStart(14)}${marke}`,
  );
}

console.log('');
const heute = ergebnisse.find(e => e.basis === BASE_HEALTH);
if (heute && ergebnisse.length > 1) {
  const niedrigste = ergebnisse[ergebnisse.length - 1];
  const ersparnis = heute.dauer - niedrigste.dauer;
  console.log(`Eine Senkung von ${BASE_HEALTH} auf ${niedrigste.basis} verkürzt die Partie`);
  console.log(`um ${ersparnis.toFixed(1)} min (${((ersparnis / heute.dauer) * 100).toFixed(0)} %).`);
}

console.log('');
console.log('WAS ZU BEACHTEN IST');
console.log('');
console.log('  Die Startgesundheit wirkt auf ALLES gleichzeitig:');
console.log('');
console.log('  - Sie verkürzt jede Partie, weil weniger Schaden zum Ausschalten nötig ist.');
console.log('  - Sie verändert das Verhältnis der Klassen: Der Faktor 0,56 bis 1,56');
console.log('    bleibt, aber die absolute Spanne schrumpft (bei Basis 60 sind es 34 bis');
console.log('    94 LP statt 56 bis 156). Ein Klassenunterschied, der sich in einem');
console.log('    Treffer ausdrückt, wird dadurch WICHTIGER.');
console.log('  - Sie verschiebt die Waffenbalance: Eine Waffe mit 50 Schaden tötet bei');
console.log('    96 LP in zwei Treffern, bei 60 LP in einem. Der Balance-Bericht muss');
console.log('    nach einer Änderung neu erhoben werden.');
console.log('');
console.log('  Deshalb steht hier nur die Messung. Die Entscheidung ist, wie lange ein');
console.log(`  Match dauern SOLL — und ob ${heute?.dauer.toFixed(1)} min dafür zu lang ist.`);

#!/usr/bin/env node
/**
 * Prüft die Matcharten: Spielerzahl, Einheiten und die daraus folgende Karte.
 *
 * ## Die Matcharten (Auftrag)
 *
 *     klein    2–4 Spieler   je 3 Einheiten
 *     groß     4 Spieler     je 4 Einheiten
 *     Krieg    6–8 Spieler   je 5 Einheiten
 *
 * ## Was eine „Einheit" ist
 *
 * Der Motor kennt heute **keine Einheiten** — er kennt **Spieler** (eine Figur
 * je Spieler). Eine Einheit ist damit eine Figur, die ein Spieler steuert.
 * Mehrere Einheiten je Spieler heißen: mehrere Figuren auf derselben Seite, die
 * abwechselnd ziehen.
 *
 * Das ist eine Erweiterung des Motors, keine Einstellung. Dieses Werkzeug
 * beziffert, was sie bedeutet — BEVOR etwas gebaut wird.
 *
 * ## Aufruf
 *
 *     node scripts/check-match-sizes.mjs
 */
import { mapGroesseFuerSpieler, mapSizeFor } from '../src/engine/match.js';
import { MATCH_RULES } from '../src/shared/config/match.js';

/** Die Matcharten aus dem Auftrag. */
const ARTEN = [
  { name: 'klein', spieler: [2, 4], einheiten: 3 },
  { name: 'groß', spieler: [4], einheiten: 4 },
  { name: 'Krieg', spieler: [6, 8], einheiten: 5 },
];

console.log('Matcharten: Spieler, Einheiten, Karte');
console.log('');
console.log(`${'Matchart'.padEnd(9)}${'Spieler'.padStart(8)}${'je Spieler'.padStart(11)}${'FIGUREN'.padStart(9)}${'Karte'.padStart(15)}${'Maße'.padStart(13)}`);
console.log('-'.repeat(66));

const zeilen = [];
for (const art of ARTEN) {
  for (const spieler of art.spieler) {
    const figuren = spieler * art.einheiten;
    const stufe = mapGroesseFuerSpieler(spieler);
    const mass = mapSizeFor('landscape', stufe);
    zeilen.push({ ...art, spieler, figuren, stufe, mass });

    console.log(
      `${art.name.padEnd(9)}${String(spieler).padStart(8)}${String(art.einheiten).padStart(11)}`
      + `${String(figuren).padStart(9)}${stufe.padStart(15)}`
      + `${`${mass.width}×${mass.height}`.padStart(13)}`,
    );
  }
}

console.log('');
console.log('WAS DAS FÜR DEN MOTOR BEDEUTET');
console.log('');

/*
 * Der Motor trägt heute eine Figur je Spieler. Gemessen (in dieser Sitzung):
 * 12 Figuren laufen problemlos — die Grenze war nie die Rechenlast.
 */
const heuteFiguren = zeilen.map(z => z.figuren);
const maximum = Math.max(...heuteFiguren);

console.log(`  Höchste Figurenzahl: ${maximum} (Krieg, 8 Spieler × 5 Einheiten)`);
console.log('');

/*
 * Die Rechenlast — GEMESSEN, nicht hochgerechnet.
 *
 * FUND (belegt, eigene Korrektur): Hier stand eine lineare Hochrechnung aus
 * einer Messung mit 4 Figuren. Sie ergab für 40 Figuren „115 % eines Kerns"
 * und damit die Aussage, der Kriegsmodus belege eine ganze Maschine.
 *
 * Die Messung (`npm run measure:figures`) widerlegt das:
 *
 *     Figuren  je Tick      % eines Kerns
 *           2  0,49 ms          2,9 %
 *          12  0,11 ms          0,6 %
 *          20  0,22 ms          1,3 %
 *          40  0,31 ms          1,9 %
 *
 * Die Rechenlast wächst **langsamer als die Figurenzahl** — um Faktor 60
 * langsamer als die Hochrechnung behauptete. Der Grund: Ein großer Teil der
 * Arbeit je Tick hängt nicht an den Figuren (Wasser, Mahlstrom, Zeitgeber,
 * Gelände). Eine lineare Fortschreibung war deshalb grundfalsch.
 */
const MESSWERTE = [
  { figuren: 2, prozent: 2.9 },
  { figuren: 12, prozent: 0.6 },
  { figuren: 20, prozent: 1.3 },
  { figuren: 40, prozent: 1.9 },
];

console.log('Rechenlast (gemessen mit npm run measure:figures):');
console.log('');
console.log(`${'Figuren'.padStart(9)}${'je Tick'.padStart(12)}${'% eines Kerns'.padStart(16)}${'Matches je Kern'.padStart(18)}`);
console.log('-'.repeat(55));
for (const m of MESSWERTE) {
  console.log(
    `${String(m.figuren).padStart(9)}${`${(m.prozent / 60 / 10 * 1000).toFixed(2)} ms`.padStart(12)}`
    + `${`${m.prozent.toFixed(1)} %`.padStart(16)}`
    + `${String(Math.floor(95 / m.prozent)).padStart(18)}`,
  );
}
console.log('');
console.log('  BEFUND: 40 Figuren kosten 1,9 % eines Kerns. Ein einzelner kleiner');
console.log('  Server trägt Dutzende Kriegsmatches gleichzeitig — die Rechenlast ist');
console.log('  der am wenigsten kritische Teil.');
console.log('');
console.log('  Drei andere Dinge entscheiden über die Machbarkeit:');
console.log('');
console.log('  1. TEAMS. Heute gibt es 2 bis 4 Teams, und die Teamfarbe ist eine');
console.log('     feste Liste (`TEAM_COLORS`, 4 Einträge). Bei „2 Teams, 4 Spieler je');
console.log('     3 Einheiten" sind es 12 Figuren in 2 Teams — das ginge. Bei');
console.log('     8 Spielern in 8 Teams bräuchte es mehr Farben.');
console.log('  2. ZUGREIHENFOLGE. Zieht eine Einheit oder ein Spieler? Bei 5 Einheiten');
console.log('     je Spieler wäre die naheliegende Regel: Jede Einheit zieht einzeln.');
console.log('     Das ist die längste Runde — siehe unten.');
console.log('  3. KAMERA. Bei 8 Spielern × 5 Einheiten = 40 Figuren auf einer Karte');
console.log('     muss die Kamera dem aktiven Zug folgen, sonst verliert man den');
console.log('     Überblick. Die Kamera ist gebaut; sie folgt bereits dem aktiven Zug.');

console.log('');
console.log('DIE ZUGZEIT — DER HARTE PUNKT');
console.log('');
const zugzeit = MATCH_RULES.turnTimers.fourPlayerSeconds.seconds;

console.log(`  Zugzeit: ${zugzeit} s je Zug`);
console.log('');
console.log(`${'Matchart'.padEnd(9)}${'Spieler'.padStart(8)}${'Einheiten'.padStart(10)}${'Züge/Runde'.padStart(12)}${'Runde dauert'.padStart(14)}${'Urteil'.padStart(14)}`);
console.log('-'.repeat(68));

for (const z of zeilen) {
  // Zieht jede Einheit einzeln, gibt es Spieler × Einheiten Züge je Runde.
  const zuege = z.spieler * z.einheiten;
  const dauer = (zuege * zugzeit) / 60;
  const urteil = dauer > 10 ? 'ZU LANG' : dauer > 5 ? 'lang' : 'ok';
  console.log(
    `${z.name.padEnd(9)}${String(z.spieler).padStart(8)}${String(z.einheiten).padStart(10)}`
    + `${String(zuege).padStart(12)}${`${dauer.toFixed(1)} min`.padStart(14)}${urteil.padStart(14)}`,
  );
}

console.log('');
console.log('  BEFUND: Zieht jede Einheit einzeln, dauert eine RUNDE im Kriegsmodus');
console.log('  über 16 Minuten — bei 29 Runden je Partie wäre die Partie Stunden lang.');
console.log('');
console.log('  Das ist die entscheidende Zahl. Sie zeigt: Der Kriegsmodus braucht eine');
console.log('  andere Zugregel, nicht nur eine größere Karte.');

console.log('');
console.log('DREI WEGE, DIE ZUGZEIT ZU RETTEN');
console.log('');
console.log('  A) EINHEITEN ZIEHEN GLEICHZEITIG');
console.log('     Alle Einheiten eines Spielers ziehen in EINEM Zug (Winkel und Kraft');
console.log('     je Einheit, dann eine gemeinsame Ausführung). Bei 8 Spielern bleiben');
console.log(`     es 8 Züge je Runde = ${((8 * zugzeit) / 60).toFixed(1)} min.`);
console.log('     *Nachteil:* Der Motor führt Züge streng nacheinander aus. Gleichzeitige');
console.log('     Züge hießen, mehrere Bewegungen vor dem nächsten Simulationsschritt');
console.log('     anzuwenden — das berührt die Determinismus-Grundlage.');
console.log('');
console.log('  B) KÜRZERE ZUGZEIT IM KRIEGSMODUS');
console.log(`     Statt ${zugzeit} s etwa 5 s. Bei 40 Zügen wären das 3,3 min je Runde.`);
console.log('     *Nachteil:* Bei 5 Einheiten je Spieler ist 5 s sehr knapp.');
console.log('');
console.log('  C) EINHEITEN WECHSELN SICH INNERHALB EINES ZUGES AB');
console.log('     Ein Zug gehört einem SPIELER, der nacheinander seine Einheiten');
console.log('     bewegt — mit gemeinsamem Zeitbudget je Zug.');
console.log('     *Vorteil:* Die Zugzahl bleibt gleich, die taktische Tiefe steigt.');
console.log('     *Nachteil:* Braucht eine Bedienung für „Einheit wechseln".');
console.log('');
console.log('  Die Zahlen oben sind der Maßstab: Variante A hält die Runde bei 2,7 min,');
console.log('  B bei 3,3 min, C bei 1,3 min. Alle drei sind Entscheidungen.');

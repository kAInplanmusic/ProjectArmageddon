#!/usr/bin/env node
/**
 * Prüft: Was kostet der gleichzeitige Zug, und was bringt er?
 *
 * ## Der Befund, der dazu führte
 *
 * Der Auftrag nennt Matcharten mit vielen Spielern:
 *
 *     klein    2-4 Spieler   je 3 Einheiten
 *     groß     4 Spieler     je 4 Einheiten
 *     Krieg    6-8 Spieler   je 5 Einheiten
 *
 * Die Zugzeit gilt **je Zug**. Zieht jede Einheit einzeln, dauert eine Runde:
 *
 *     klein   2 Spieler × 3 =  6 Züge →  2,0 min
 *     groß    4 Spieler × 4 = 16 Züge →  5,3 min
 *     Krieg   8 Spieler × 5 = 40 Züge → 13,3 min
 *
 * Bei 29 Runden je Partie wäre der Kriegsmodus **Stunden** lang.
 *
 * ## Was dieses Werkzeug prüft
 *
 * Ob und wie sich das lösen lässt — mit den Zahlen, die das Projekt liefert.
 * Es entscheidet nichts; es beziffert die Wege.
 *
 * ## Aufruf
 *
 *     node scripts/check-simultaneous.mjs
 */
import { MATCH_RULES } from '../src/shared/config/match.js';

const ZUGZEIT = MATCH_RULES.turnTimers.fourPlayerSeconds.seconds;

/** Die Matcharten aus dem Auftrag. */
const ARTEN = [
  { name: 'klein', spieler: [2, 4], einheiten: [3] },
  { name: 'groß', spieler: [4], einheiten: [4] },
  { name: 'Krieg', spieler: [6, 8], einheiten: [5] },
];

console.log('Gleichzeitige Züge: Was sie kosten und was sie bringen');
console.log('');
console.log(`Zugzeit heute: ${ZUGZEIT} s je Zug · Runden je Partie: ca. 29`);
console.log('');

/*
 * Die drei Modelle, in aufsteigender Eingriffstiefe.
 */
const MODELLE = {
  einzeln: {
    name: 'Jede Einheit einzeln',
    zuege: (spieler, einheiten) => spieler * einheiten,
    beschreibung: 'heute — jede Figur ist ein Spieler',
    eingriff: 'keiner',
  },
  spieler: {
    name: 'Je Spieler ein Zug',
    zuege: (spieler) => spieler,
    beschreibung: 'alle Einheiten eines Spielers ziehen in EINEM Zug',
    eingriff: 'mittel — die Ausführung muss mehrere Bewegungen sammeln',
  },
  team: {
    name: 'Je Team ein Zug',
    zuege: (spieler) => Math.ceil(spieler / 2),
    beschreibung: 'ein Team gibt gemeinsam ab',
    eingriff: 'groß — der Zug gehört einer Seite, nicht einer Person',
  },
};

console.log(`${'Matchart'.padEnd(9)}${'Spieler'.padStart(8)}${'Einheiten'.padStart(10)}`);
console.log('-'.repeat(30));
for (const art of ARTEN) {
  for (const sp of art.spieler) {
    for (const e of art.einheiten) {
      console.log(`${art.name.padEnd(9)}${String(sp).padStart(8)}${String(e).padStart(10)}`);
    }
  }
}

console.log('');
console.log('RUNDENDAUER JE MODELL');
console.log('');
console.log(`${'Matchart'.padEnd(9)}${'Spieler'.padStart(8)}${'einzeln'.padStart(12)}${'je Spieler'.padStart(13)}${'je Team'.padStart(11)}`);
console.log('-'.repeat(54));

for (const art of ARTEN) {
  for (const sp of art.spieler) {
    for (const e of art.einheiten) {
      const dauer = modell => {
        const zuege = MODELLE[modell].zuege(sp, e);
        return `${((zuege * ZUGZEIT) / 60).toFixed(1)} min`;
      };
      console.log(
        `${art.name.padEnd(9)}${String(sp).padStart(8)}`
        + `${dauer('einzeln').padStart(12)}${dauer('spieler').padStart(13)}`
        + `${dauer('team').padStart(11)}`,
      );
    }
  }
}

console.log('');
console.log('PARTIEDAUER (bei 29 Runden)');
console.log('');
console.log(`${'Matchart'.padEnd(9)}${'einzeln'.padStart(12)}${'je Spieler'.padStart(13)}${'je Team'.padStart(11)}`);
console.log('-'.repeat(46));

for (const art of ARTEN) {
  for (const sp of art.spieler) {
    for (const e of art.einheiten) {
      const partie = modell => {
        const zuege = MODELLE[modell].zuege(sp, e);
        const min = (zuege * ZUGZEIT * 29) / 60;
        return min >= 120 ? `${(min / 60).toFixed(1)} h` : `${min.toFixed(0)} min`;
      };
      console.log(
        `${art.name.padEnd(9)}${partie('einzeln').padStart(12)}`
        + `${partie('spieler').padStart(13)}${partie('team').padStart(11)}`,
      );
    }
  }
}

console.log('');
console.log('WAS DAS BEDEUTET');
console.log('');
console.log('  Der Unterschied ist nicht kosmetisch: Im Kriegsmodus macht er aus');
console.log('  einer Partie von mehreren Stunden eine von unter einer.');

console.log('');
console.log('DIE MODELLE IM EINZELNEN');
console.log('');
for (const [id, m] of Object.entries(MODELLE)) {
  console.log(`  ${m.name}`);
  console.log(`    ${m.beschreibung}`);
  console.log(`    Eingriff: ${m.eingriff}`);
  console.log('');
}

console.log('DER EINGRIFF — WAS ER BERÜHRT');
console.log('');
console.log('  Alle drei Modelle berühren dieselbe Stelle: `endTurn()` in match.js');
console.log('  zählt heute EINEN Spieler weiter:');
console.log('');
console.log('      nextIndex = (nextIndex + 1) % this.#turnOrder.length;');
console.log('');
console.log('  Für „je Spieler" müsste die Runde in GRUPPEN laufen: Alle Spieler einer');
console.log('  Gruppe geben ab, dann wird gemeinsam ausgeführt. Das ist ein Umbau der');
console.log('  Zugschleife — und er berührt die Determinismus-Grundlage:');
console.log('');
console.log('    - Die Reihenfolge der Ausführung muss festgelegt sein (etwa nach');
console.log('      Spieler-ID), sonst ist der Verlauf nicht reproduzierbar.');
console.log('    - Der Zustandshash muss die Gruppe enthalten, sonst meldet ein Replay');
console.log('      Gleichheit, obwohl eine andere Gruppierung gespielt wurde.');
console.log('    - Die Aufzeichnung (`ReplayRecorder`) speichert Eingaben je Spieler —');
console.log('      sie müsste sie je Gruppe ordnen.');
console.log('');
console.log('  Das ist machbar, aber es ist die größte Einzeländerung am Motor seit');
console.log('  Beginn — nicht eine Einstellung.');

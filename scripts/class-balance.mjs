#!/usr/bin/env node
/**
 * Zeigt alle neun Klasse/Archetyp-Kombinationen mit ihren Wirkwerten.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Ein Audit bemerkte: Die Kopplung von Klasse und Archetyp ist aufgehoben (jede
 * Kombination ist wählbar), aber **die Balance der neuen Kombinationen war nie
 * gemessen**. `npm run balance` prüft Waffen, nicht Klassen.
 *
 * Dieses Werkzeug schließt die Lücke: Es listet alle neun Kombinationen mit
 * ihren vier wirksamen Achsen und ordnet sie nach einer Summe.
 *
 * ## Was die Summe IST und was sie NICHT ist
 *
 * Sie ist ein **grober Indikator**: vier Achsen gleich gewichtet addiert. Sie
 * beweist keine Balance — ein Charakter mit viel Leben und wenig Tempo kann
 * gleich stark sein wie der umgekehrte. Sie zeigt nur, ob eine Kombination auf
 * ALLEN Achsen hinterherliegt, und das ist ein Warnsignal.
 *
 * Für einen echten Nachweis braucht es Partien; siehe `npm run balance` für
 * die Waffenseite und `tests/` für die Determinismus-Prüfungen.
 *
 * ## Aufruf
 *
 *     node scripts/class-balance.mjs
 */
import {
  CLASS_IDS, ARCHETYPE_IDS, combatProfile,
} from '../src/shared/config/classes.js';

/** Die vier Achsen, die der Motor tatsächlich liest. */
const ACHSEN = [
  { id: 'leben', feld: 'healthMultiplier', label: 'Leben' },
  { id: 'wucht', feld: 'damageMultiplier', label: 'Wucht' },
  { id: 'tempo', feld: 'launchSpeedMultiplier', label: 'Tempo' },
  { id: 'beweglichkeit', feld: 'mobilityMultiplier', label: 'Bewegl.' },
];

const zeilen = [];
for (const klasse of CLASS_IDS) {
  for (const archetyp of ARCHETYPE_IDS) {
    const p = combatProfile(klasse, archetyp);
    const werte = {};
    for (const achse of ACHSEN) werte[achse.id] = p[achse.feld] ?? 0;
    const summe = ACHSEN.reduce((s, a) => s + werte[a.id], 0);
    zeilen.push({ kombi: `${klasse}/${archetyp}`, klasse, werte, summe });
  }
}
zeilen.sort((a, b) => b.summe - a.summe);

console.log('Klasse/Archetyp — alle neun Kombinationen');
console.log('');
console.log(`${'Kombination'.padEnd(24)}${ACHSEN.map(a => a.label.padStart(9)).join('')}${'Summe'.padStart(9)}`);
console.log('-'.repeat(24 + ACHSEN.length * 9 + 9));

for (const z of zeilen) {
  const werte = ACHSEN.map(a => z.werte[a.id].toFixed(2).padStart(9)).join('');
  console.log(`${z.kombi.padEnd(24)}${werte}${z.summe.toFixed(2).padStart(9)}`);
}

const summen = zeilen.map(z => z.summe);
const min = Math.min(...summen);
const max = Math.max(...summen);

console.log('');
console.log(`Spannweite: ${min.toFixed(2)} .. ${max.toFixed(2)} (Faktor ${(max / min).toFixed(2)})`);

/*
 * Der eigentliche Befund: Liegt eine KLASSE mit allen ihren Archetypen unten?
 * Das wäre ein Zeichen, dass nicht die Kombination das Problem ist, sondern die
 * Klasse selbst.
 */
console.log('');
const proKlasse = {};
for (const z of zeilen) {
  (proKlasse[z.klasse] ??= []).push(z.summe);
}
const schnitt = Object.entries(proKlasse)
  .map(([k, v]) => ({ klasse: k, mittel: v.reduce((a, b) => a + b, 0) / v.length }))
  .sort((a, b) => b.mittel - a.mittel);

console.log('Mittelwert je Klasse:');
for (const s of schnitt) {
  console.log(`  ${s.klasse.padEnd(12)} ${s.mittel.toFixed(2)}`);
}

const beste = schnitt[0];
const schlechteste = schnitt[schnitt.length - 1];
const abstand = beste.mittel / schlechteste.mittel;

console.log('');
if (abstand > 1.15) {
  console.log(`BEFUND: "${schlechteste.klasse}" liegt mit allen Archetypen durchgehend zurück`);
  console.log(`  (${schlechteste.mittel.toFixed(2)} gegen ${beste.mittel.toFixed(2)} bei "${beste.klasse}",`);
  console.log(`   Abstand ${((abstand - 1) * 100).toFixed(0)} %).`);
  console.log('  Das ist eine BALANCE-Entscheidung, keine Aufräumarbeit: Ob die Klasse');
  console.log('  angehoben oder ihre Rolle geschärft wird, hängt vom Spielgefühl ab.');
} else {
  console.log('Die Klassen liegen nah beieinander — kein auffälliger Abstand.');
}

console.log('');
console.log('Hinweis: Die Summe wiegt alle Achsen gleich und ist damit ein grober');
console.log('Indikator, kein Balancenachweis. Sie zeigt Ausreißer, nicht Feinheiten.');

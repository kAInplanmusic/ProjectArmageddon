#!/usr/bin/env node
/**
 * Misst, was eine größere Karte für das Spiel bedeutet.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die Planung nennt „große Welten" — 2 Spieler auf kleiner Karte, 8 Spieler auf
 * riesiger. Die Kartengröße ist aber **nicht** eine reine Anzeigefrage. Der
 * Kommentar in `match.js` nennt den Grund:
 *
 *   „Die Reichweiten, Sprunghöhen und Wurfweiten der Waffen sind in
 *    Kartenpixeln angegeben. Eine deutlich kleinere Hochkantkarte hätte alle
 *    Waffen zu weit reichen lassen, eine größere zu kurz."
 *
 * Bevor eine 4K-Karte eingetragen wird, muss klar sein, **was das kostet** —
 * sonst reichen alle 150 Waffen zu kurz und niemand weiß, warum.
 *
 * ## Was gemessen wird
 *
 * 1. **Wie viel der Karte eine Waffe überstreicht.** Bei 1280 px Breite deckt
 *    eine Waffe mit 850 px Reichweite zwei Drittel der Karte ab. Bei 3840 px
 *    ist es ein Fünftel — das Spielgefühl ändert sich grundlegend.
 * 2. **Wie viele Kartenpixel je Bildschirmpixel.** Ohne Kamera würde eine
 *    4K-Karte auf einem Full-HD-Bildschirm auf ein Drittel verkleinert.
 *
 * ## Aufruf
 *
 *     node scripts/check-map-scale.mjs
 */
import { MAP_SIZES } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

/** Die geprüften Kartengrößen. */
const GROESSEN = [
  { name: 'heute (720p)', width: 1280, height: 720 },
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: 'QHD', width: 2560, height: 1440 },
  { name: '4K', width: 3840, height: 2160 },
];

/*
 * Die Reichweiten der Waffen. Gemessen wird die Verteilung, damit ein
 * Mittelwert die Aussage nicht verdeckt.
 */
const reichweiten = [];
for (const waffe of Object.values(WEAPONS)) {
  const r = waffe.maxRange ?? waffe.projectileSpeed ?? 0;
  if (typeof r === 'number' && r > 0) reichweiten.push(r);
}
reichweiten.sort((a, b) => a - b);

const mittel = reichweiten.reduce((a, b) => a + b, 0) / reichweiten.length;
const median = reichweiten[Math.floor(reichweiten.length / 2)];
const minimum = reichweiten[0];
const maximum = reichweiten[reichweiten.length - 1];

console.log('Was eine größere Karte bedeutet');
console.log('');
console.log(`Waffen mit Reichweite: ${reichweiten.length}`);
console.log(`  kürzeste  ${minimum} px`);
console.log(`  Median    ${median} px`);
console.log(`  Mittel    ${mittel.toFixed(0)} px`);
console.log(`  weiteste  ${maximum} px`);
console.log('');

console.log('Anteil der Kartenbreite, den eine Waffe überstreicht');
console.log('');
console.log(`${'Karte'.padEnd(14)}${'Breite'.padStart(9)}${'kürzeste'.padStart(11)}${'Median'.padStart(10)}${'Mittel'.padStart(10)}${'weiteste'.padStart(11)}`);
console.log('-'.repeat(66));

for (const g of GROESSEN) {
  const anteil = px => `${((px / g.width) * 100).toFixed(0)} %`;
  const marke = g.width === MAP_SIZES.landscape.width ? '  <- heute' : '';
  console.log(
    `${g.name.padEnd(14)}${String(g.width).padStart(9)}`
    + `${anteil(minimum).padStart(11)}${anteil(median).padStart(10)}`
    + `${anteil(mittel).padStart(10)}${anteil(maximum).padStart(11)}`
    + marke,
  );
}

console.log('');
console.log('WAS DAS BEDEUTET');
console.log('');
const heute = GROESSEN[0];
const vierK = GROESSEN[GROESSEN.length - 1];

console.log(`  Heute (${heute.width} px) überstreicht die MITTLERE Waffe`);
console.log(`  ${((mittel / heute.width) * 100).toFixed(0)} % der Kartenbreite — sie kann fast den ganzen Schauplatz erreichen.`);
console.log('');
console.log(`  Auf einer 4K-Karte (${vierK.width} px) wären es`);
console.log(`  ${((mittel / vierK.width) * 100).toFixed(0)} % — weniger als ein Fünftel.`);
console.log('');
console.log('  Eine Waffe, die ein Fünftel der Karte erreicht, ist kein Artillerie-');
console.log('  Geschütz mehr, sondern ein Nahkampfwerkzeug. Die weiteste Waffe');
console.log(`  (${maximum} px) käme auf ${((maximum / vierK.width) * 100).toFixed(0)} % — sie könnte nicht einmal die halbe Karte beschießen.`);

console.log('');
console.log('DIE ZWEI WEGE');
console.log('');
console.log('  Eine größere Karte zu bauen heißt, sich für einen zu entscheiden:');
console.log('');
console.log('  A) REICHWEITEN MITSKALIEREN');
console.log(`     Bei 4K wären alle Waffen mit Faktor ${(vierK.width / heute.width).toFixed(1)} zu`)
console.log('     multiplizieren — 150 Werte in der Designdatei. Die Partie fühlt');
console.log('     sich dann genauso an wie heute, nur mit mehr Platz.');
console.log('     *Nachteil:* Alle Balance-Messungen gelten neu.');
console.log('');
console.log('  B) REICHWEITEN LASSEN, FLÄCHE GEWINNEN');
console.log('     Die Waffen bleiben, wie sie sind — dann wird die Karte ein');
console.log('     SCHACHBRETT: Man muss sich bewegen, um in Schussweite zu kommen.');
console.log('     *Nachteil:* Allein durch Laufen entsteht Druck; die Zugzeit von');
console.log('     20 s könnte dafür zu knapp sein.');
console.log('');
console.log('  Was NICHT geht: die Karte vergrößern und die Waffen vergessen. Dann');
console.log('  reichen alle 150 zu kurz, und zwar unbemerkt — es sieht nicht nach');
console.log('  einem Fehler aus, sondern nach einem sehr langsamen Spiel.');

console.log('');
console.log('DIE ANZEIGE-FRAGE (unabhängig davon)');
console.log('');
console.log('  Eine 4K-Karte auf einem Full-HD-Bildschirm passt nicht in voller Größe.');
console.log('  Ohne Kamera würde sie auf ein Drittel verkleinert: Die Figuren wären');
console.log(`  ${(MAP_SIZES.landscape.height / 3).toFixed(0)} statt ${MAP_SIZES.landscape.height} Kartenpixel hoch auf dem Schirm.`);
console.log('');
console.log('  Deshalb braucht der Weg zu großen Karten eine KAMERA: Der Bildschirm');
console.log('  zeigt einen Ausschnitt, die Karte ist größer. Das ist eine eigene');
console.log('  Aufgabe — und sie ist unabhängig von der Frage der Reichweiten.');

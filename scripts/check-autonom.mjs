#!/usr/bin/env node
/**
 * Prüft den autonomen Kartengenerator.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Die Vorgabe lautet: „Kartengenerator hoch 10, aber ohne dass Menschen
 * Einfluss nehmen können." Daraus folgen zwei Fragen, die beide **gemessen**
 * werden müssen — sonst ist „autonom" nur ein Wort:
 *
 *   1. **Vielfalt** — erzeugt der Generator wirklich verschiedene Karten?
 *      Ein autonomer Generator, der immer dasselbe liefert, wäre eine
 *      Einstellung ohne Einstellfeld.
 *   2. **Spielbarkeit** — bleibt jede Karte spielbar? Ein Zufall, der eine
 *      Karte ohne Land erzeugt, ist kein Zufall, sondern ein Fehler.
 *
 * ## Aufruf
 *
 *     node scripts/check-autonom.mjs
 *     node scripts/check-autonom.mjs --karten=100
 */
import { erzeugeAutonomeKarte, CHARAKTER_ACHSEN } from '../src/shared/terrainGen3.js';
import { SeededRandom } from '../src/shared/prng.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('karten') ?? 60);
const BREITE = Number(args.get('breite') ?? 1280);
const HOEHE = Number(args.get('hoehe') ?? 720);

const karten = [];
let mitWarnung = 0;
let versucheGesamt = 0;

for (let i = 0; i < ANZAHL; i += 1) {
  const k = erzeugeAutonomeKarte({
    rng: new SeededRandom(100000 + i * 7919), width: BREITE, height: HOEHE,
  });
  karten.push(k);
  if (k.warnung) mitWarnung += 1;
  versucheGesamt += k.versuche;
}

console.log(`Autonomer Generator: ${ANZAHL} Karten à ${BREITE}×${HOEHE}`);
console.log('');

const mittel = a => a.reduce((x, y) => x + y, 0) / a.length;
const spanne = a => [Math.min(...a), Math.max(...a)];
const streuung = a => {
  const m = mittel(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

/* ---------------------------------------------------------------- Vielfalt */
const achsen = Object.keys(CHARAKTER_ACHSEN);
console.log('DIE GEZOGENEN CHARAKTERE');
console.log('');
console.log(`${'Achse'.padEnd(18)}${'Bereich'.padStart(18)}${'Mittel'.padStart(9)}${'Streuung'.padStart(10)}`);
console.log('-'.repeat(55));

for (const achse of achsen) {
  const werte = karten.map(k => k.charakter[achse]);
  const [min, max] = spanne(werte);
  const [sollMin, sollMax] = CHARAKTER_ACHSEN[achse];
  const abdeckung = (max - min) / (sollMax - sollMin);

  console.log(
    `${achse.padEnd(18)}${`${min.toFixed(2)}–${max.toFixed(2)}`.padStart(18)}`
    + `${mittel(werte).toFixed(2).padStart(9)}${streuung(werte).toFixed(3).padStart(10)}`
    + `  ${(abdeckung * 100).toFixed(0)} % des Bereichs`,
  );
}

/* ------------------------------------------------------------ Spielbarkeit */
console.log('');
console.log('DIE ERZEUGTEN KARTEN');
console.log('');
console.log(`${'Kennzahl'.padEnd(18)}${'Bereich'.padStart(18)}${'Mittel'.padStart(9)}${'Streuung'.padStart(10)}`);
console.log('-'.repeat(55));

const kennzahlen = ['landAnteil', 'hohlraum', 'hoehennutzung', 'erhebungen', 'ueberhaenge'];
for (const name of kennzahlen) {
  const werte = karten.map(k => k.kennzahlen[name]);
  const [min, max] = spanne(werte);
  const formatiert = name === 'erhebungen' || name === 'ueberhaenge'
    ? [`${min.toFixed(0)}`, `${max.toFixed(0)}`]
    : [`${(min * 100).toFixed(0)} %`, `${(max * 100).toFixed(0)} %`];

  console.log(
    `${name.padEnd(18)}${`${formatiert[0]}–${formatiert[1]}`.padStart(18)}`
    + `${mittel(werte).toFixed(name === 'erhebungen' || name === 'ueberhaenge' ? 1 : 3).padStart(9)}`
    + `${streuung(werte).toFixed(3).padStart(10)}`,
  );
}

/* ------------------------------------------------------------------ Urteil */
console.log('');
console.log('URTEIL');
console.log('');
console.log(`  Karten mit Warnung:     ${mitWarnung} von ${ANZAHL}`);
console.log(`  Versuche je Karte:      ${(versucheGesamt / ANZAHL).toFixed(2)} im Mittel`);
console.log('');

/*
 * Die Vielfalt wird an der Streuung gemessen, nicht am Bereich: Ein Bereich
 * kann groß sein und trotzdem nur aus zwei Werten bestehen. Die Streuung sagt,
 * wie breit die Werte STREUEN — eine Karte, die immer dieselbe ist, hätte 0.
 */
const landStreuung = streuung(karten.map(k => k.kennzahlen.landAnteil));
const hohlStreuung = streuung(karten.map(k => k.kennzahlen.hohlraum));
const erhebungStreuung = streuung(karten.map(k => k.kennzahlen.erhebungen));

if (landStreuung > 0.03) {
  console.log(`  Vielfalt im Land:        Streuung ${landStreuung.toFixed(3)} — die Karten`);
  console.log('                           unterscheiden sich deutlich.');
} else {
  console.log(`  Vielfalt im Land:        Streuung ${landStreuung.toFixed(3)} — ZU GERING.`);
  console.log('                           Die Karten ähneln einander zu stark.');
}

if (hohlStreuung > 0.03) {
  console.log(`  Vielfalt im Hohlraum:    Streuung ${hohlStreuung.toFixed(3)} — es gibt`);
  console.log('                           massive UND durchlöcherte Karten.');
}

if (erhebungStreuung > 1.5) {
  console.log(`  Vielfalt der Struktur:   Streuung ${erhebungStreuung.toFixed(1)} Erhebungen.`);
}

console.log('');

/* --------------------------------------------------- Die Verteilung im Bild */
console.log('VERTEILUNG (jede Zeile ein Wertebereich)');
console.log('');
const histogramm = (name, faecher, format) => {
  const werte = karten.map(k => k.kennzahlen[name]);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const breite = (max - min) / faecher || 1;

  const zaehler = new Array(faecher).fill(0);
  for (const w of werte) {
    const i = Math.min(faecher - 1, Math.floor((w - min) / breite));
    zaehler[i] += 1;
  }

  console.log(`  ${name}:`);
  for (let i = 0; i < faecher; i += 1) {
    const von = min + i * breite;
    const bis = von + breite;
    const balken = '#'.repeat(Math.round((zaehler[i] / ANZAHL) * 50));
    console.log(`    ${format(von).padStart(6)}–${format(bis).padStart(6)} ${String(zaehler[i]).padStart(3)} ${balken}`);
  }
  console.log('');
};

histogramm('landAnteil', 8, v => `${(v * 100).toFixed(0)} %`);
histogramm('hohlraum', 8, v => `${(v * 100).toFixed(0)} %`);

console.log('  (Eine breite Verteilung heißt: Der Generator nutzt seinen Spielraum.');
console.log('   Ein einzelner Balken hieße: Er liefert immer dasselbe.)');

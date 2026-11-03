#!/usr/bin/env node
/**
 * Tiefenanalyse des Kartengenerators.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der Generator ist gebaut, die Tests sind grün, die Biome stimmen. Aber
 * „läuft" heißt nicht „gut". Dieses Werkzeug sucht nach den Stellen, die noch
 * schwach sind — mit Messungen statt mit Vermutungen.
 *
 * ## Was gemessen wird
 *
 * 1. **Zusammenhang** — zerfällt eine Karte in viele Teile? Bei zu vielen
 *    kleinen Brocken ist sie unspielbar.
 * 2. **Steilheit der Flanken** — ein Gelände aus senkrechten Wänden hat keine
 *    Plateaus; Figuren können nicht stehen.
 * 3. **Verteilung der Landmasse** — liegt das Land gleichmäßig, oder drängt es
 *    sich an einer Seite?
 * 4. **Höhenprofil** — nutzt die Karte ihre Höhe, oder spielt alles in einer
 *    Zeile?
 * 5. **Glattheit** — wie oft springt die Oberfläche? Zacken sind unschön und
 *    machen Bewegung unmöglich.
 * 6. **Wasserfläche** — wie viel Land steht unter Wasser?
 * 7. **Zeit** — wie lange braucht ein Kartenbau?
 *
 * ## Aufruf
 *
 *     node scripts/measure-generator.mjs
 *     node scripts/measure-generator.mjs --karten=50 --breite=2560
 */
import { erzeugeAutonomeKarte } from '../src/shared/terrainGen3.js';
import { findeFlaechen } from '../src/shared/erreichbarkeit.js';
import { SeededRandom } from '../src/shared/prng.js';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const ANZAHL = Number(args.get('karten') ?? 25);
const BREITE = Number(args.get('breite') ?? 1280);
const HOEHE = Math.round(BREITE * 9 / 16);

/** Die Steigung je Spalte — wie steil die Flanken sind. */
function flankensteilheit(surface, width) {
  const steigungen = [];
  for (let x = 6; x < width - 6; x += 1) {
    if (surface[x] < 0 || surface[x - 1] < 0) continue;
    steigungen.push(Math.abs(surface[x] - surface[x - 1]));
  }
  if (steigungen.length === 0) return { mittel: 0, max: 0, steilAnteil: 0 };
  const mittel = steigungen.reduce((a, b) => a + b, 0) / steigungen.length;
  // „Steil" heißt: mehr als 3 px Höhenunterschied auf 1 px Breite.
  const steilAnteil = steigungen.filter(s => s > 3).length / steigungen.length;
  return { mittel, max: Math.max(...steigungen), steilAnteil };
}

/** Zackigkeit: Vorzeichenwechsel der Steigung in kurzer Folge. */
function zackigkeit(surface, width) {
  let wechsel = 0;
  for (let x = 8; x < width - 8; x += 1) {
    const d1 = surface[x] - surface[x - 3];
    const d2 = surface[x + 3] - surface[x];
    if (d1 * d2 < 0 && Math.abs(d1) > 2 && Math.abs(d2) > 2) wechsel += 1;
  }
  return wechsel / Math.max(1, width);
}

/** Der Schwerpunkt der Landmasse in x — drängt sie sich an einer Seite? */
function masseSchwerpunkt(bitmap, width, height) {
  let summe = 0;
  let anzahl = 0;
  for (let x = 0; x < width; x += 2) {
    for (let y = 0; y < height; y += 2) {
      if (bitmap[y * width + x]) { summe += x; anzahl += 1; }
    }
  }
  return anzahl === 0 ? 0.5 : (summe / anzahl) / width;
}

console.log(`Tiefenanalyse (${ANZAHL} Karten, ${BREITE}×${HOEHE})`);
console.log('');

const werte = {
  flaechen: [], groessteFlaeche: [], steilheit: [], steilAnteil: [],
  schwerpunkt: [], hoehennutzung: [], zackigkeit: [], wasseranteil: [], zeit: [],
};

for (let i = 0; i < ANZAHL; i += 1) {
  const seed = 400000 + i * 3571;
  const t0 = performance.now();
  const k = erzeugeAutonomeKarte({
    rng: new SeededRandom(seed), width: BREITE, height: HOEHE,
  });
  werte.zeit.push(performance.now() - t0);

  const f = findeFlaechen(k.bitmap, BREITE, HOEHE);
  werte.flaechen.push(f.anzahl);
  werte.groessteFlaeche.push(Math.max(...f.groessen) / k.bitmap.length);

  const steil = flankensteilheit(k.surface, BREITE);
  werte.steilheit.push(steil.mittel);
  werte.steilAnteil.push(steil.steilAnteil);

  werte.schwerpunkt.push(masseSchwerpunkt(k.bitmap, BREITE, HOEHE));
  werte.zackigkeit.push(zackigkeit(k.surface, BREITE));

  const ober = [...k.surface].slice(6, -6).filter(v => v >= 0);
  werte.hoehennutzung.push((Math.max(...ober) - Math.min(...ober)) / HOEHE);

  // Anteil des Landes unter dem Wasserspiegel.
  let unterWasser = 0;
  for (let x = 0; x < BREITE; x += 1) if (k.surface[x] > k.wasserY) unterWasser += 1;
  werte.wasseranteil.push(unterWasser / BREITE);
}

const mittel = a => a.reduce((x, y) => x + y, 0) / a.length;
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const streuung = a => {
  const m = mittel(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

console.log(`${'Kennzahl'.padEnd(26)}${'Median'.padStart(10)}${'Mittel'.padStart(10)}${'Streuung'.padStart(11)}${'Min'.padStart(9)}${'Max'.padStart(9)}`);
console.log('-'.repeat(75));

const zeilen = [
  ['Zusammenhängende Flächen', werte.flaechen, v => v.toFixed(1)],
  ['Größte Fläche (Anteil)', werte.groessteFlaeche, v => `${(v * 100).toFixed(0)} %`],
  ['Flankensteigheit (px/px)', werte.steilheit, v => v.toFixed(2)],
  ['Steile Stellen (Anteil)', werte.steilAnteil, v => `${(v * 100).toFixed(1)} %`],
  ['Massenschwerpunkt (x)', werte.schwerpunkt, v => v.toFixed(3)],
  ['Höhennutzung', werte.hoehennutzung, v => `${(v * 100).toFixed(0)} %`],
  ['Zackigkeit (Wechsel/px)', werte.zackigkeit, v => v.toFixed(4)],
  ['Land unter Wasser', werte.wasseranteil, v => `${(v * 100).toFixed(0)} %`],
  ['Bauzeit', werte.zeit, v => `${v.toFixed(0)} ms`],
];

for (const [name, arr, fmt] of zeilen) {
  console.log(
    `${name.padEnd(26)}${fmt(med(arr)).padStart(10)}${fmt(mittel(arr)).padStart(10)}`
    + `${fmt(streuung(arr)).padStart(11)}${fmt(Math.min(...arr)).padStart(9)}`
    + `${fmt(Math.max(...arr)).padStart(9)}`,
  );
}

console.log('');
console.log('DIE SCHWACHEN STELLEN');
console.log('');

const befund = [];

// 1. Zerfällt die Karte?
const vieleFlaechen = werte.flaechen.filter(n => n > 4).length;
if (vieleFlaechen > 0) {
  befund.push(
    `${vieleFlaechen} von ${ANZAHL} Karten zerfallen in mehr als 4 Flächen `
    + `(max ${Math.max(...werte.flaechen)}) — viele kleine Brocken sind unspielbar`,
  );
} else {
  console.log(`  ✓ Keine Karte zerfällt in mehr als ${Math.max(...werte.flaechen)} Flächen.`);
}

// 2. Zu steil?
if (mittel(werte.steilAnteil) > 0.25) {
  befund.push(
    `${(mittel(werte.steilAnteil) * 100).toFixed(1)} % der Flanken sind steiler als 3 px/px — `
    + 'Figuren finden kaum Plateaus',
  );
} else {
  console.log(`  ✓ Flanken sind mit ${(mittel(werte.steilAnteil) * 100).toFixed(1)} % steilen Stellen begehbar.`);
}

// 3. Drängt sich die Masse an einer Seite?
const schiefe = werte.schwerpunkt.filter(s => Math.abs(s - 0.5) > 0.1).length;
if (schiefe > ANZAHL * 0.3) {
  befund.push(
    `${schiefe} von ${ANZAHL} Karten haben den Massenschwerpunkt deutlich neben der Mitte `
    + '— das Land drängt sich an einer Seite',
  );
} else {
  console.log('  ✓ Die Landmasse liegt ausgewogen (Schwerpunkt nahe der Mitte).');
}

// 4. Zu flach?
const flach = werte.hoehennutzung.filter(h => h < 0.2).length;
if (flach > 0) {
  befund.push(`${flach} von ${ANZAHL} Karten nutzen weniger als 20 % der Höhe`);
} else {
  console.log(`  ✓ Die Höhe wird genutzt (${(mittel(werte.hoehennutzung) * 100).toFixed(0)} % im Mittel).`);
}

// 5. Zu zackig?
if (mittel(werte.zackigkeit) > 0.05) {
  befund.push(
    `Die Oberfläche wechselt ${mittel(werte.zackigkeit).toFixed(3)}-mal je Pixel die Richtung `
    + '— das Gelände ist zackig statt hügelig',
  );
} else {
  console.log(`  ✓ Die Oberfläche ist ruhig (${mittel(werte.zackigkeit).toFixed(3)} Wechsel/px).`);
}

// 6. Zu viel Wasser?
const zuNass = werte.wasseranteil.filter(w => w > 0.5).length;
if (zuNass > ANZAHL * 0.2) {
  befund.push(`${zuNass} von ${ANZAHL} Karten haben mehr als die Hälfte des Landes unter Wasser`);
} else {
  console.log(`  ✓ Der Wasserstand ist maßvoll (${(mittel(werte.wasseranteil) * 100).toFixed(0)} % unter Wasser).`);
}

// 7. Bauzeit
const langsam = werte.zeit.filter(z => z > 500).length;
if (langsam > 0) {
  befund.push(`${langsam} Karten brauchten über 500 ms zum Bau`);
} else {
  console.log(`  ✓ Der Bau dauert ${mittel(werte.zeit).toFixed(0)} ms im Mittel.`);
}

console.log('');
if (befund.length === 0) {
  console.log('  Keine Schwachstelle gefunden — alle Kennzahlen liegen im grünen Bereich.');
} else {
  console.log('  ZU BEHEBEN:');
  for (const b of befund) console.log(`   • ${b}`);
}

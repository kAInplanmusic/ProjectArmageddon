#!/usr/bin/env node
/**
 * Prüft das Kantenlicht am SICHTBAREN Gelände.
 *
 * ## Warum dieses Werkzeug umgebaut wurde (2026-10-26)
 *
 * Es maß bis hierher `edgeLightColor()` und `drawSurfaceEdge()` aus dem
 * damaligen `terrainBaker.js` (am 2026-10-26 entfernt) — den EINFACHEN Boden. Den zeigt das Spiel nicht: Der
 * Renderer baut die Geländeebene mit `baueGelaendeEbene` in einem Zug (Maske →
 * `faerbeGelaende` → ein `putImageData`). Ein Gate, das eine Fläche absegnet,
 * die nie auf dem Bildschirm steht, kann grün sein und trotzdem nichts über das
 * Bild sagen.
 *
 * Gemessen wird deshalb auf den PIXELN der Ebene, die der Renderer wirklich
 * baut: Attrappe statt Browser, echte `faerbeGelaende`-Ausgabe.
 *
 * ## Die zwei geprüften Größen
 *
 * 1. **Oberflächenkante** — Helligkeit des obersten festen Pixels einer Spalte
 *    gegen das Gestein 4 px darunter. Unter etwa 8 Stufen (Rec. 709) ist der
 *    Unterschied bei 8 Bit je Kanal kaum zu sehen; das ist die Schwelle.
 * 2. **Struktur** — Anteil der Gesteinspixel, deren Helligkeit sich vom Pixel
 *    darüber um mindestens 12 Stufen unterscheidet. Das ist die Lesbarkeit der
 *    Steinkanten; ohne sie wirkt auch ein heller Boden flach.
 *
 * Die **Tiefenwirkung** (Oberfläche gegen 60 px darunter) wird BERICHNET, aber
 * nicht bewertet: Bei dunklen Paletten liegt sie gemessen bei 5,6 Stufen
 * (Basalt) — dort trägt die Struktur die Tiefe, nicht der Verlauf. Eine
 * Schwelle darauf wäre eine Geschmacksentscheidung, keine Reparatur.
 *
 * ## Aufruf
 *
 *     node scripts/check-terrain-look.mjs
 *
 * Exit 1, sobald eine Palette die Kante oder die Struktur verfehlt.
 */
import { erzeugeKarte } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';
import { baueGelaendeEbene } from '../src/client/gelaendeStil.js';

const BREITE = 320;
const HOEHE = 240;
const SEED = 20260916;
const KARTENTYP = 'huegel';

/** Ab hier ist ein Helligkeitsunterschied bei 8 Bit je Kanal sichtbar. */
const KANTE_MIN = 8;
/** Ab hier gilt das Gestein als strukturiert (Steinkanten lesbar). */
const STRUKTUR_MIN_PROZENT = 5;
/** Abstand unter der Oberfläche, an dem die Kante gemessen wird. */
const KANTE_TIEFE_PX = 4;
/** Abstand, in dem der Tiefenverlauf berichtet wird. */
const TIEFE_PX = 60;
/** Schwelle, ab der zwei übereinanderliegende Pixel als Kante gelten. */
const STRUKTUR_SCHWELLE = 12;

const PALETTEN = [
  { name: 'Wiese', palette: { surface: [86, 148, 74], deep: [34, 66, 32] } },
  { name: 'Sand', palette: { surface: [214, 190, 130], deep: [120, 96, 60] } },
  { name: 'Eis', palette: { surface: [188, 214, 226], deep: [90, 120, 140] } },
  { name: 'Basalt', palette: { surface: [72, 72, 82], deep: [28, 28, 34] } },
  { name: 'Schnee', palette: { surface: [232, 236, 240], deep: [130, 140, 150] } },
];

const noop = () => {};

/**
 * Eine Leinwand-Attrappe, die die fertigen Pixel wirklich hält.
 *
 * `baueGelaendeEbene` schreibt genau einmal über `putImageData`; alles andere
 * sind Zeichenaufrufe für die Grasbüschel, die für diese Messung nichts tun
 * müssen.
 */
function leinwandAttrappe() {
  let geschrieben = null;
  const ctx = {
    createImageData: (b, h) => ({ data: new Uint8ClampedArray(b * h * 4), width: b, height: h }),
    putImageData: (bild) => { geschrieben = bild.data; },
    getImageData: () => ({ data: geschrieben, width: BREITE, height: HOEHE }),
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    fillRect: noop,
  };
  return { layer: { getContext: () => ctx }, daten: () => geschrieben };
}

/** Wahrgenommene Helligkeit eines Pixels (Rec. 709). */
function helligkeit(daten, index) {
  return 0.2126 * daten[index * 4] + 0.7152 * daten[index * 4 + 1] + 0.0722 * daten[index * 4 + 2];
}

/** Erste feste Zeile je Spalte, -1 bei leerer Spalte. */
function oberflaechen(bitmap) {
  const oben = new Int32Array(BREITE).fill(-1);
  for (let x = 0; x < BREITE; x += 1) {
    for (let y = 0; y < HOEHE; y += 1) {
      if (bitmap[y * BREITE + x]) { oben[x] = y; break; }
    }
  }
  return oben;
}

/**
 * Misst die drei Größen an einer gebauten Ebene.
 *
 * Spalten ohne genug Gestein darunter werden übersprungen — dort gibt es keine
 * Kante zu beurteilen, und ein Mittelwert über angebrochene Spalten wäre still
 * falsch.
 */
function messe(daten, bitmap, oben) {
  let kanteSumme = 0;
  let tiefeSumme = 0;
  let spalten = 0;
  let kanteGut = 0;

  for (let x = 0; x < BREITE; x += 1) {
    const start = oben[x];
    if (start < 0 || start + TIEFE_PX + 2 >= HOEHE) continue;
    spalten += 1;
    const obenIdx = start * BREITE + x;
    const kante = helligkeit(daten, obenIdx) - helligkeit(daten, obenIdx + KANTE_TIEFE_PX * BREITE);
    kanteSumme += kante;
    if (kante >= KANTE_MIN) kanteGut += 1;
    tiefeSumme += helligkeit(daten, obenIdx + KANTE_TIEFE_PX * BREITE)
      - helligkeit(daten, obenIdx + TIEFE_PX * BREITE);
  }

  let struktur = 0;
  let fest = 0;
  for (let y = 1; y < HOEHE; y += 1) {
    for (let x = 0; x < BREITE; x += 1) {
      if (!bitmap[y * BREITE + x]) continue;
      fest += 1;
      const hier = helligkeit(daten, y * BREITE + x);
      const drueber = helligkeit(daten, (y - 1) * BREITE + x);
      if (Math.abs(hier - drueber) >= STRUKTUR_SCHWELLE) struktur += 1;
    }
  }

  return {
    spalten,
    kante: kanteSumme / Math.max(1, spalten),
    anteilGut: (kanteGut / Math.max(1, spalten)) * 100,
    tiefe: tiefeSumme / Math.max(1, spalten),
    struktur: (struktur / Math.max(1, fest)) * 100,
  };
}

const karte = erzeugeKarte({ rng: new SeededRandom(SEED), width: BREITE, height: HOEHE, typ: KARTENTYP });
const oben = oberflaechen(karte.bitmap);

console.log('Kantenlicht am SICHTBAREN Gelände (baueGelaendeEbene, echte Pixel)');
console.log('');
console.log(`  Karte   : ${BREITE}×${HOEHE} ${KARTENTYP}, Seed ${SEED}`);
console.log(`  Schwelle: Kante ≥ ${KANTE_MIN} Stufen, Struktur ≥ ${STRUKTUR_MIN_PROZENT} %`);
console.log('');
console.log(
  `${'Palette'.padEnd(9)}${'Kante Δ'.padStart(9)}${'Spalten ≥'.padStart(11)}`
  + `${'Struktur'.padStart(10)}${'Tiefe Δ'.padStart(10)}  Urteil`,
);
console.log('-'.repeat(64));

const fehlschlaege = [];

for (const { name, palette } of PALETTEN) {
  const attrappe = leinwandAttrappe();
  baueGelaendeEbene(attrappe.layer, karte.bitmap, BREITE, HOEHE, palette, 7);
  const daten = attrappe.daten();
  if (!daten) throw new Error(`Die Ebene wurde für ${name} nie geschrieben — die Attrappe hätte greifen müssen`);

  const m = messe(daten, karte.bitmap, oben);

  const kanteOk = m.kante >= KANTE_MIN;
  const strukturOk = m.struktur >= STRUKTUR_MIN_PROZENT;
  if (!kanteOk) fehlschlaege.push(`${name}: Kante Δ ${m.kante.toFixed(1)} < ${KANTE_MIN}`);
  if (!strukturOk) fehlschlaege.push(`${name}: Struktur ${m.struktur.toFixed(1)} % < ${STRUKTUR_MIN_PROZENT} %`);

  const urteil = kanteOk && strukturOk ? 'ok' : 'FEHLT';
  console.log(
    `${name.padEnd(9)}`
    + `${m.kante.toFixed(1).padStart(9)}`
    + `${`${m.anteilGut.toFixed(0)} %`.padStart(11)}`
    + `${`${m.struktur.toFixed(1)} %`.padStart(10)}`
    + `${m.tiefe.toFixed(1).padStart(10)}  ${urteil}`,
  );
}

console.log('');
console.log('  Kante Δ  = Oberfläche gegen Gestein 4 px darunter (Mittel über alle Spalten)');
console.log('  Struktur = Gesteinspixel mit ≥ 12 Stufen Unterschied zum Pixel darüber');
console.log('  Tiefe Δ  = Oberfläche gegen 60 px darunter — nur Bericht, keine Schwelle:');
console.log('             bei dunklen Paletten trägt die Struktur die Tiefe, nicht der Verlauf.');
console.log('');

if (fehlschlaege.length > 0) {
  console.log('ERGEBNIS: FEHLGESCHLAGEN');
  for (const grund of fehlschlaege) console.log(`  - ${grund}`);
  process.exitCode = 1;
} else {
  console.log(`ERGEBNIS: alle ${PALETTEN.length} Paletten tragen eine sichtbare Kante und Struktur.`);
}

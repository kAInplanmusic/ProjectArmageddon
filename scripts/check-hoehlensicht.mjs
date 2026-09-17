#!/usr/bin/env node
/**
 * Prüft die Sichtbarkeit der Höhlen.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * Der neue Kartengenerator (`terrainGen2`) erzeugt 2D-Masken mit Höhlen. Zwei
 * Fehler auf dem Weg dorthin wurden gemessen und behoben:
 *
 *   1. Der **Baker** malte von der Oberfläche bis zum Kartenboden und fragte die
 *      Maske nie — bei einem Höhenfeld richtig, bei einer 2D-Maske fatal: Die
 *      Hohlräume wurden zugemalt. Belegt mit `isSolid` an fünf Spalten (die
 *      Kollision HATTE die Löcher) und einem Screenshot (man SAH sie nicht).
 *   2. Derselbe Fehler stand im **GPU-Shader**.
 *
 * Beide sind behoben. Dieses Werkzeug prüft, ob die Löcher im Gerenderten
 * ankommen — und ob sie als Höhle oder als Fehler wirken.
 *
 * ## Aufruf
 *
 *     node scripts/check-hoehlensicht.mjs
 */
import { erzeugeKarte, KARTENTYPEN } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';
import { fillGroundPixels, surfaceRows } from '../src/client/terrainBaker.js';

const BREITE = 1280;
const HOEHE = 720;
const PALETTE = { surface: [86, 148, 74], deep: [34, 66, 32] };

/** Zählt die durchsichtigen Pixel innerhalb der Erdmasse. */
function durchsichtigeLoecher(daten, breite, hoehe) {
  let loecher = 0;
  for (let i = 3; i < daten.length; i += 4) {
    if (daten[i] === 0) loecher += 1;
  }
  return loecher;
}

/**
 * Zählt durchsichtige Pixel, die TIEF liegen — mindestens 5 px unter der
 * Oberfläche ihrer Spalte.
 *
 * ## Warum nicht „von Land umschlossen"
 *
 * FUND (belegt, eigener Messfehler): Ein erster Anlauf prüfte, ob alle vier
 * Nachbarn Land sind. Das ergab **0** — auch bei einer Karte mit 141.766
 * Hohlraumpixeln. Der Grund: Eine Höhle ist ein großer zusammenhängender
 * Bereich; nur ihre unmittelbaren Randpixel haben Land auf allen Seiten, und
 * die sind ein Bruchteil.
 *
 * Die Tiefe ist das bessere Maß: Alles über der Oberfläche ist Himmel, alles
 * darunter sollte Land sein. Ist es das nicht, ist es ein Hohlraum — und
 * sichtbar, wenn der Baker die Maske fragt.
 */
function tiefeLoecher(daten, rows, breite, hoehe, mindestTiefe = 5) {
  let tief = 0;
  for (let x = 0; x < breite; x += 1) {
    if (rows[x] < 0) continue;
    for (let y = rows[x] + mindestTiefe; y < hoehe; y += 1) {
      if (daten[(y * breite + x) * 4 + 3] === 0) tief += 1;
    }
  }
  return tief;
}

console.log('Höhlensichtbarkeit im Gerenderten');
console.log('');
console.log(`${'Typ'.padEnd(20)}${'Hohlraum'.padStart(11)}${'durchsichtig'.padStart(14)}${'tief (sichtbar)'.padStart(16)}`);
console.log('-'.repeat(61));

for (const [schluessel, def] of Object.entries(KARTENTYPEN)) {
  const k = erzeugeKarte({
    rng: new SeededRandom(4242), width: BREITE, height: HOEHE, typ: schluessel,
  });

  // Wie der Renderer es macht: Maske → Pixel.
  const daten = new Uint8ClampedArray(BREITE * HOEHE * 4);
  const rows = surfaceRows(k.bitmap, k.width, k.height);
  fillGroundPixels(daten, k.bitmap, k.width, k.height, PALETTE, rows);

  // Der Hohlraum in der Maske.
  let unterOberflaeche = 0;
  let leer = 0;
  for (let x = 0; x < BREITE; x += 1) {
    if (rows[x] < 0) continue;
    for (let y = rows[x]; y < HOEHE; y += 1) {
      unterOberflaeche += 1;
      if (!k.bitmap[y * BREITE + x]) leer += 1;
    }
  }
  const hohlraum = unterOberflaeche === 0 ? 0 : leer / unterOberflaeche;

  const durchsichtig = durchsichtigeLoecher(daten, BREITE, HOEHE);
  const innen = tiefeLoecher(daten, rows, BREITE, HOEHE);

  console.log(
    `${def.name.padEnd(20)}${`${(hohlraum * 100).toFixed(0)} %`.padStart(11)}`
    + `${String(durchsichtig).padStart(14)}${String(innen).padStart(14)}`,
  );
}

console.log('');
console.log('WAS DIE ZAHLEN SAGEN');
console.log('');
console.log('  „durchsichtig" sind die Pixel, die der Baker NICHT gefüllt hat. Bei den');
console.log('  Höhlentypen müssen das deutlich mehr sein als die Fläche über dem Land');
console.log('  — sonst werden die Hohlräume wieder zugemalt.');
console.log('');
console.log('  „tief (sichtbar)" sind durchsichtige Pixel mindestens 5 px unter der');
console.log('  Oberfläche. Das ist das Maß für sichtbare HÖHLEN: Bei den Höhlentypen');
console.log('  muss diese Zahl deutlich über 0 liegen — sonst malt der Baker die');
console.log('  Hohlräume wieder zu, und man sieht im Bild eine massive Erdmasse.');
console.log('');
console.log('DIE OFFENE AUFGABE');
console.log('');
console.log('  Ein Blick auf das Gerenderte (Browser, 2026-09-17) zeigte: Die Löcher');
console.log('  sind sichtbar, aber sie wirken wie ein FEHLER, nicht wie eine Höhle.');
console.log('  Beobachtung im Wortlaut:');
console.log('');
console.log('    „Die Ränder der Löcher sind hart abgeschnitten. Es gibt keinen');
console.log('     Farbübergang, keine Schattierung. Das verstärkt den Eindruck eines');
console.log('     Grafikfehlers statt eines gestalteten Höhlensystems."');
console.log('');
console.log('  Der Grund ist benennbar: Ein Loch zeigt den Himmel — dieselbe Farbe wie');
console.log('  über dem Gelände. Eine Höhle müsste dagegen DUNKEL sein (sie liegt im');
console.log('  Schatten des Gesteins).');
console.log('');
console.log('  Was fehlt, ist eine Innenschattierung: An einer Wand, die nach innen');
console.log('  zeigt, müsste der Baker abdunkeln — nach Tiefe und Blickrichtung.');
console.log('  Das ist die nächste Aufgabe am Generator.');

#!/usr/bin/env node
/**
 * Prüft, ob Höhlen im Bild als RÄUME ankommen.
 *
 * ## Warum dieses Werkzeug umgebaut wurde (2026-10-26)
 *
 * Es maß bis hierher den EINFACHEN Boden (`fillGroundPixels` aus dem am
 * 2026-10-26 entfernten `terrainBaker.js`) — den baut der Renderer nicht. Sichtbar ist die Ebene aus
 * `baueGelaendeEbene`, und mit LOOK-4 ist die Frage eine andere geworden:
 *
 * Früher lautete sie „sind die Löcher überhaupt durchsichtig?", und die offene
 * Aufgabe war: „Ein Loch zeigt den Himmel — eine Höhle müsste dunkel sein."
 * Seit LOOK-4 füllt `fuelleHoehlenluft` eingeschlossene Luft deckend dunkel,
 * und `daempfeInnenkanten` dunkelt die Felsränder ab.
 *
 * Damit sind zwei Regeln prüfbar geworden:
 *
 *   a) eingeschlossene Luft  →  deckend dunkel (Raum)
 *   b) offene Luft           →  NICHT mit der Höhlenfarbe gefüllt (Himmel bleibt Himmel)
 *
 * Beides wird getrennt gerechnet: `fuelleHoehlenluft` bestimmt auf einem leeren
 * Puffer, WELCHE Pixel eingeschlossen sind; die gebaute Ebene wird danach
 * daraufhin geprüft, ob sie diese Pixel dunkel gefüllt und alle übrigen
 * Luftpixel unangetastet gelassen hat.
 *
 * ## Warum nicht „offene Luft muss durchsichtig sein"
 *
 * FUND (eigener Messfehler, 2026-10-26): Ein erster Anlauf verlangte genau das
 * und meldete auf JEDER Karte 2.600–3.200 Verstöße — auch auf Hügeln, wo es
 * gar keine Höhle gibt. Die Ursache war kein Fehler im Bild: `baueGelaendeEbene`
 * zeichnet **Grasbüschel** auf dieselbe Ebene, und die liegen legitim in der
 * Luft. Deshalb prüft Regel b) die FARBE (nicht die Deckung allein) und meldet
 * nur, wenn die Höhlenfüllung selbst im Himmel landet.
 *
 * ## Was hier NICHT behauptet wird
 *
 * Ob eine Höhle schön aussieht, sagt diese Messung nicht — nur, dass sie als
 * Raum und nicht als Loch im Himmel erscheint.
 *
 * ## Aufruf
 *
 *     node scripts/check-hoehlensicht.mjs
 *
 * Exit 1, sobald ein Kartentyp eine der beiden Regeln verletzt.
 */
import { erzeugeKarte, KARTENTYPEN } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';
import { baueGelaendeEbene, fuelleHoehlenluft } from '../src/client/gelaendeStil.js';

const BREITE = 1280;
const HOEHE = 720;
const SEED = 4242;
const PALETTE = { surface: [86, 148, 74], deep: [34, 66, 32] };

/** Alpha der Höhlenluft-Füllung in `fuelleHoehlenluft` (siehe dort). */
const HOEHLEN_ALPHA = 235;
/** Farbe dieser Füllung (dunkle Höhlenluft). */
const HOEHLEN_FARBE = [16, 18, 22];
/** Ab dieser Helligkeit gilt ein gefüllter Pixel als dunkel (Raum, nicht Gestein). */
const DUNKEL_MAX = 40;
/** Toleranz in Promille — einzelne Pixel dürfen durch Rundung danebenliegen. */
const TOLERANZ_PROMILLE = 1;

const noop = () => {};

/** Leinwand-Attrappe, die die fertigen Pixel hält (kein Browser nötig). */
function leinwandAttrappe() {
  let geschrieben = null;
  const ctx = {
    createImageData: (b, h) => ({ data: new Uint8ClampedArray(b * h * 4), width: b, height: h }),
    putImageData: (bild) => { geschrieben = bild.data; },
    getImageData: () => ({ data: geschrieben, width: BREITE, height: HOEHE }),
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, closePath: noop, fill: noop, stroke: noop, arc: noop, fillRect: noop,
  };
  return { layer: { getContext: () => ctx }, daten: () => geschrieben };
}

const helligkeit = (d, i) => 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];

/** Trägt dieser Pixel die Höhlenluft-Füllung (Farbe UND Deckung)? */
function istHoehlenfuellung(d, i) {
  return d[i * 4 + 3] >= HOEHLEN_ALPHA - 10
    && Math.abs(d[i * 4] - HOEHLEN_FARBE[0]) <= 6
    && Math.abs(d[i * 4 + 1] - HOEHLEN_FARBE[1]) <= 6
    && Math.abs(d[i * 4 + 2] - HOEHLEN_FARBE[2]) <= 6;
}

console.log('Höhlen als Räume: eingeschlossene Luft dunkel, Himmel bleibt Himmel');
console.log('');
console.log(`  Karte: ${BREITE}×${HOEHE}, Seed ${SEED}`);
console.log('');
console.log(
  `${'Typ'.padEnd(20)}${'eingeschl.'.padStart(11)}${'als Raum'.padStart(10)}`
  + `${'nicht gefüllt'.padStart(14)}${'im Himmel'.padStart(11)}  Urteil`,
);
console.log('-'.repeat(68));

const verstoesse = [];

for (const [schluessel, def] of Object.entries(KARTENTYPEN)) {
  const karte = erzeugeKarte({
    rng: new SeededRandom(SEED), width: BREITE, height: HOEHE, typ: schluessel,
  });
  const bitmap = karte.bitmap;

  // 1. Die sichtbare Ebene bauen — genau wie der Renderer.
  const attrappe = leinwandAttrappe();
  baueGelaendeEbene(attrappe.layer, bitmap, BREITE, HOEHE, PALETTE, 7);
  const bild = attrappe.daten();
  if (!bild) throw new Error(`Für ${schluessel} wurde keine Ebene geschrieben`);

  // 2. Unabhängig bestimmen, WELCHE Luft eingeschlossen ist.
  const probe = new Uint8ClampedArray(BREITE * HOEHE * 4);
  const eingeschlossen = fuelleHoehlenluft(probe, bitmap, BREITE, HOEHE);

  // 3. Die beiden Regeln prüfen.
  let alsRaum = 0;
  let nichtGefuellt = 0;
  let imHimmel = 0;
  for (let i = 0; i < BREITE * HOEHE; i += 1) {
    if (bitmap[i]) continue;
    const gefuellt = istHoehlenfuellung(bild, i);
    if (probe[i * 4 + 3] === HOEHLEN_ALPHA) {
      // Regel a): eingeschlossene Luft muss ein dunkler Raum sein.
      if (gefuellt && helligkeit(bild, i) < DUNKEL_MAX) alsRaum += 1;
      else nichtGefuellt += 1;
    } else if (gefuellt) {
      // Regel b): offene Luft darf die Höhlenfarbe nicht tragen.
      imHimmel += 1;
    }
  }

  const grenzeA = Math.max(1, Math.round(eingeschlossen * TOLERANZ_PROMILLE / 1000));
  const grenzeB = Math.max(1, Math.round((alsRaum + imHimmel) * TOLERANZ_PROMILLE / 1000));
  const ok = nichtGefuellt <= grenzeA && imHimmel <= grenzeB;
  if (nichtGefuellt > grenzeA) {
    verstoesse.push(`${def.name}: ${nichtGefuellt} eingeschlossene Luftpixel sind kein dunkler Raum (Grenze ${grenzeA})`);
  }
  if (imHimmel > grenzeB) {
    verstoesse.push(`${def.name}: ${imHimmel} Luftpixel tragen die Höhlenfarbe, obwohl sie offen sind (Grenze ${grenzeB})`);
  }

  console.log(
    `${def.name.padEnd(20)}`
    + `${String(eingeschlossen).padStart(11)}`
    + `${String(alsRaum).padStart(10)}`
    + `${String(nichtGefuellt).padStart(14)}`
    + `${String(imHimmel).padStart(11)}  ${ok ? 'ok' : 'FEHLT'}`,
  );
}

console.log('');
console.log('  eingeschl.    = Luftpixel, die `fuelleHoehlenluft` als eingeschlossen bestimmt');
console.log('  als Raum      = davon deckend dunkel in der Ebene (Regel a erfüllt)');
console.log('  nicht gefüllt = davon NICHT dunkel gefüllt — eine Höhle, die wie Himmel aussieht');
console.log('  im Himmel     = offene Luft, die die Höhlenfarbe trägt — der Himmel wäre schwarz');
console.log('');
console.log('  Grasbüschel liegen legitim über der Luft; sie tragen weder die Höhlenfarbe');
console.log('  noch deren Deckung und stören deshalb keine der beiden Regeln.');
console.log('');

if (verstoesse.length > 0) {
  console.log('ERGEBNIS: FEHLGESCHLAGEN');
  for (const grund of verstoesse) console.log(`  - ${grund}`);
  process.exitCode = 1;
} else {
  console.log(`ERGEBNIS: alle ${Object.keys(KARTENTYPEN).length} Kartentypen halten beide Regeln.`);
}

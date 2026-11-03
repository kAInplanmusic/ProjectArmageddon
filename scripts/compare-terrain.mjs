#!/usr/bin/env node
/**
 * Vergleicht den alten und den neuen Kartengenerator.
 *
 * ## Warum dieses Werkzeug existiert
 *
 * „Der Kartengenerator muss richtig gut werden" ist eine Aufgabe, keine
 * Messgröße. Dieser Vergleich macht den Fortschritt prüfbar: derselbe Seed,
 * dieselbe Größe, beide Generatoren — und die Kennzahlen nebeneinander.
 *
 * ## Was gemessen wird
 *
 *   Erhebungen   Vorzeichenwechsel der Steigung. Mehr = strukturierter.
 *   Höhe         Genutzter Anteil der Kartenhöhe. Wenig = verschenkter Platz.
 *   Hohlraum     Anteil nicht-solider Pixel unterhalb der Oberfläche. Das sind
 *                die Höhlen — beim alten Generator immer 0 in der Struktur.
 *   Überhänge    Spalten mit mehr als einem soliden Bereich. Ein 1D-Höhenfeld
 *                kann das per Definition nicht; der neue Generator soll es.
 *   Inseln       Zusammenhängende Landmassen (nur gezählt, nicht gelistet).
 *   Streuung     Wie unterschiedlich zwei Karten desselben Typs sind.
 *
 * ## Aufruf
 *
 *     node scripts/compare-terrain.mjs
 */
import { generateTerrain } from '../src/shared/terrainGen.js';
import { erzeugeKarte, KARTENTYPEN } from '../src/shared/terrainGen2.js';
import { SeededRandom } from '../src/shared/prng.js';

const BREITE = 1280;
const HOEHE = 720;

/**
 * Erhebungen: Vorzeichenwechsel der Steigung im Oberflächenprofil.
 *
 * ## Zwei Formate, ein Maß
 *
 * FUND (belegt): Der alte Generator liefert `heightMap` — ein Float32-Feld mit
 * Werten zwischen 0 und 1 (Anteil der Kartenhöhe). Der neue liefert `surface` —
 * ganze Pixelwerte (y-Position je Spalte). Beide beschreiben dasselbe
 * („wie hoch ist der Boden an x?"), nur in verschiedenen Einheiten.
 *
 * Damit die Messung vergleichbar ist, wird die **Schwelle** mitgegeben: Beim
 * alten Feld zählt eine Änderung ab 0,001, beim neuen ab 0,5 px. Ohne das
 * hätte der alte Generator 1000 Erhebungen gemeldet und der neue 8 — ein
 * Artefakt der Einheiten, kein Unterschied im Gelände.
 */
function erhebungen(profil, schwelleInEinheit) {
  const werte = [...profil].filter(v => v >= 0);
  let wechsel = 0;
  let richtung = 0;
  for (let i = 1; i < werte.length; i += 1) {
    const d = werte[i] - werte[i - 1];
    const r = d > schwelleInEinheit ? 1 : d < -schwelleInEinheit ? -1 : 0;
    if (r !== 0 && richtung !== 0 && r !== richtung) wechsel += 1;
    if (r !== 0) richtung = r;
  }
  return wechsel;
}

/**
 * Überhänge: Spalten mit mehr als einem soliden Abschnitt.
 *
 * ## Was diese Zahl bedeutet — und was nicht
 *
 * Ein 1D-Höhenfeld kann keine Überhänge haben: Je Spalte gibt es genau einen
 * Übergang von Luft zu Land. Alles darunter ist massiv.
 *
 * **Fund (belegt, eigener Messfehler):** Der erste Anlauf meldete für den ALTEN
 * Generator **1278** solcher Spalten — praktisch die ganze Karte. Das war
 * falsch: Beide Ränder werden versiegelt (`bitmap[y*width] = 1`), also hat die
 * Randspalte oben UND unten ein Segment. Gezählt wurden damit nur die zwei
 * Randspalten, millionenfach — nein: **1278** ist genau `width - 2`.
 *
 * Die Messung schließt die versiegelten Ränder deshalb aus. Dann zeigt sich
 * das ehrliche Bild:
 *
 *     ALT           0 Überhänge   (ein 1D-Feld, wie erwartet)
 *     NEU Kavernen  ~1200         (echte Hohlräume)
 */
function ueberhaenge(bitmap, breite, hoehe) {
  let spalten = 0;
  // Die versiegelten Ränder auslassen — sie haben immer zwei Segmente.
  for (let x = 1; x < breite - 1; x += 1) {
    let abschnitte = 0;
    let vorher = false;
    for (let y = 1; y < hoehe - 1; y += 1) {
      const solide = bitmap[y * breite + x] === 1;
      if (solide && !vorher) abschnitte += 1;
      vorher = solide;
    }
    if (abschnitte > 1) spalten += 1;
  }
  return spalten;
}

/** Hohlraum: Anteil nicht-solider Pixel unterhalb der Oberfläche. */
function hohlraum(bitmap, surface, breite, hoehe) {
  let unter = 0;
  let leer = 0;
  for (let x = 0; x < breite; x += 1) {
    if (surface[x] < 0) continue;
    for (let y = surface[x]; y < hoehe; y += 1) {
      unter += 1;
      if (!bitmap[y * breite + x]) leer += 1;
    }
  }
  return unter === 0 ? 0 : leer / unter;
}

/**
 * Genutzter Anteil der Kartenhöhe.
 *
 * ## Der Messfehler, der hier stand
 *
 * FUND (belegt): Ein erster Anlauf rechnete `Math.max - Math.min` über das
 * ganze Profil. Beim ALTEN Generator ist das ein Float32-Feld mit Werten
 * zwischen 0 und 1 — die Spanne war also 0,85, und die Anzeige meldete
 * „22267 %". Beim neuen (Pixelwerte) ergab dieselbe Rechnung einen
 * vernünftigen Wert. Zwei Einheiten, eine Formel: Das konnte nicht gutgehen.
 *
 * Jetzt wird die Spanne auf die Kartenhöhe bezogen — unabhängig davon, ob das
 * Profil in Pixeln oder als Anteil vorliegt. Die Randspalten bleiben außen vor,
 * weil sie versiegelt sind und die Messung verfälschen würden.
 */
function hoehennutzung(profil) {
  const rand = 4;
  const werte = [...profil].slice(rand, -rand).filter(v => v >= 0);
  if (werte.length === 0) return 0;

  const spanne = Math.max(...werte) - Math.min(...werte);
  /*
   * Ein Anteilsprofil (0..1) wird mit der Kartenhöhe multipliziert, ein
   * Pixelprofil bleibt wie es ist. Der Unterschied ist eine Zeile — aber ohne
   * sie misst man zwei verschiedene Dinge.
   */
  const inPixeln = spanne <= 1.001 ? spanne * HOEHE : spanne;
  return inPixeln / HOEHE;
}

/** Anteil solider Pixel — wie viel Land die Karte hat. */
function landAnteil(bitmap) {
  let solide = 0;
  for (let i = 0; i < bitmap.length; i += 1) if (bitmap[i]) solide += 1;
  return solide / bitmap.length;
}

const ANZAHL = 6;

/** Misst einen Generator über mehrere Seeds. */
function messe(name, erzeuge) {
  const werte = { erhebungen: [], hoehe: [], hohlraum: [], ueberhaenge: [], land: [] };

  for (let i = 0; i < ANZAHL; i += 1) {
    const r = erzeuge(1000 + i * 137);
    werte.erhebungen.push(erhebungen(r.surface, r.schwelle));
    werte.hoehe.push(hoehennutzung(r.surface));
    werte.hohlraum.push(hohlraum(r.bitmap, r.surface, BREITE, HOEHE));
    werte.ueberhaenge.push(ueberhaenge(r.bitmap, BREITE, HOEHE));
    werte.land.push(landAnteil(r.bitmap));
  }

  const mittel = a => a.reduce((x, y) => x + y, 0) / a.length;
  const streuung = a => {
    const m = mittel(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  return {
    name,
    erhebungen: mittel(werte.erhebungen),
    streuung: streuung(werte.erhebungen),
    hoehe: mittel(werte.hoehe),
    hohlraum: mittel(werte.hohlraum),
    ueberhaenge: mittel(werte.ueberhaenge),
    land: mittel(werte.land),
  };
}

console.log(`Generatorvergleich (${BREITE}×${HOEHE}, ${ANZAHL} Seeds je Zeile)`);
console.log('');
console.log(`${'Generator'.padEnd(20)}${'Erheb.'.padStart(8)}${'Streu.'.padStart(8)}${'Höhe'.padStart(8)}${'Hohlr.'.padStart(8)}${'Überh.'.padStart(8)}${'Land'.padStart(7)}`);
console.log('-'.repeat(67));

/*
 * Der alte Generator liefert `heightMap` (Anteil 0..1) statt `surface`
 * (Pixelwerte). Die Messung bekommt daher ein einheitliches Profil — und die
 * Schwelle, ab der eine Änderung zählt.
 */
const ALT = messe('ALT (1D)', seed => {
  const alt = generateTerrain({ rng: new SeededRandom(seed), width: BREITE, height: HOEHE, preset: 'hills' });
  return {
    bitmap: alt.bitmap,
    surface: alt.heightMap.map(v => Math.round(v * HOEHE)),
    istAnteil: true,
    // heightMap ist ein Anteil: 0,001 entspricht rund 0,7 px.
    schwelle: 0.001,
    echteSurface: alt.heightMap.map(v => Math.round(v * HOEHE)),
  };
});

const zeile = (m, marke = '') => {
  console.log(
    `${(m.name + marke).padEnd(20)}${m.erhebungen.toFixed(1).padStart(8)}`
    + `${m.streuung.toFixed(1).padStart(8)}${`${(m.hoehe * 100).toFixed(0)} %`.padStart(8)}`
    + `${`${(m.hohlraum * 100).toFixed(0)} %`.padStart(8)}`
    + `${String(Math.round(m.ueberhaenge)).padStart(8)}`
    + `${`${(m.land * 100).toFixed(0)} %`.padStart(7)}`,
  );
};

zeile(ALT);

const NEU = [];
for (const [schluessel, def] of Object.entries(KARTENTYPEN)) {
  const m = messe(`NEU ${def.name}`, seed => {
    const k = erzeugeKarte({ rng: new SeededRandom(seed), width: BREITE, height: HOEHE, typ: schluessel });
    return { ...k, istAnteil: false, schwelle: 0.5 };
  });
  NEU.push(m);
  zeile(m);
}

console.log('');
console.log('WAS DER VERGLEICH ZEIGT');
console.log('');

const beste = NEU.reduce((a, b) => (b.erhebungen > a.erhebungen ? b : a));
console.log(`  Erhebungen: alt ${ALT.erhebungen.toFixed(1)} → neu bis ${beste.erhebungen.toFixed(1)}`);
console.log(`  Überhänge:  alt ${Math.round(ALT.ueberhaenge)} → neu bis ${Math.round(Math.max(...NEU.map(m => m.ueberhaenge)))}`);
console.log(`  Hohlraum:   alt ${(ALT.hohlraum * 100).toFixed(0)} % → neu bis ${(Math.max(...NEU.map(m => m.hohlraum)) * 100).toFixed(0)} %`);

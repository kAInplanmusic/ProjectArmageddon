/**
 * Feuerfassung: Brand, Lava und Ragnarök-Eskalation (`config.feuer` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Feuer, das sich über brennbare Zellen ausbreitet, Lava-Ausbrüche und die Flammenwände des
 * Weltuntergangs verändern Gesundheit und Gelände. Eine alte Aufzeichnung muss dieselbe Partie
 * ergeben wie damals:
 *
 *   - `FEUER_ALT` (1): kein Feuersystem. Das Feld FEHLT in jeder Datei aus der Zeit davor.
 *   - `FEUER_ENTFACHT` (2): `FeuerSystem` (`engine/systems/feuerSystem.js`) mit eigenem Seed-Zweig `FEUER`.
 *
 * Voraussetzung ist die Stoffkarte (Geländefassung 2 oder höher, Zerstörungsfassung 5 oder höher): ohne
 * Stoffkarte gibt es nichts, was brennen könnte. Lava erscheint im Biom `vulkan` und, sobald Valhalla
 * beginnt, auf jeder Karte.
 *
 * ## Was das System tut (alles in Takten, nie in Sekunden der Uhr)
 *
 *   - Feuer: Eine Hitzewaffe (Wirkgruppe `hitze`) entzündet brennbare Stoffzellen (`brennbar` in
 *     `config/stoffe.js`: Holz, Pilz) im Einschlagradius. Eine brennende Zelle springt mit der
 *     Wahrscheinlichkeit `ausbreitung` auf jeden brennbaren Nachbarn (nach oben stärker) und brennt nach
 *     `brenndauer` Schritten zu Asche aus (Stoff Asche als Überlagerung der Stoffkarte).
 *   - Wasser löscht (Wasserwaffen im Radius, Zellen unter dem Wasserspiegel) und macht Zellen für
 *     `nassSchritte` Schritte nass: Nasses brennt nicht.
 *   - Lava: Ein Ausbruch setzt Lavazellen, die fallen, rinnen und nach einer Weile zu Basalt erstarren
 *     (Obsidian, wenn Wasser in der Nähe ist). Lava schmilzt Schnee und Eis und entzündet Brennbares.
 *   - Ragnarök: Ab Valhalla kommen in immer kürzeren Abständen Flammenwände und Lavarisse dazu.
 *   - Figuren in Flammen oder Lava nehmen Feuerschaden (mit Klassen- und Archetypresistenz) und den
 *     Brand-Malus; ein Feuerfest-Archetyp (`FEUERFEST`) nimmt weniger.
 *
 * Reine Daten und Rechenvorschriften, kein Zufall, keine Uhr.
 *
 * @module config/feuer
 */

export const FEUER_ALT = 1;
export const FEUER_ENTFACHT = 2;
export const FEUER_STANDARD = FEUER_ENTFACHT;

/**
 * Kantenlänge einer Feuerzelle in Pixeln. Der Motor rechnet Brand und Lava in diesem Raster,
 * der Client zeichnet dieselben Zellindizes — beide Seiten müssen dieselbe Zahl lesen.
 */
export const FEUER_ZELLE = 8;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereFeuer(fassung) {
  return fassung === FEUER_ALT || fassung === FEUER_ENTFACHT ? fassung : FEUER_STANDARD;
}

export const FEUER = Object.freeze({
  /** Ticks je Feuerschritt (Ausbreitung, Brenndauer) und je Lavaschritt (Fließen). */
  takt: 20,
  laveTakt: 10,
  /** Schritte, die eine Zelle brennt, ehe sie zu Asche wird: [min, max]. */
  brenndauer: Object.freeze([4, 7]),
  /** Wahrscheinlichkeit je Schritt und brennbarem Nachbarn; nach oben mal `aufwaerts`. */
  ausbreitung: 0.34,
  aufwaerts: 1.5,
  diagonal: 0.5,
  /** Entzündungswahrscheinlichkeit einer brennbaren Zelle im Radius einer Hitzewaffe. */
  entzuendung: 0.85,
  /** So weit über den Kraterradius hinaus entzündet / löscht ein Einschlag (Faktor). */
  einschlagReichweite: 1.3,
  /** Wasserwaffe: Reichweite des Löschens (Faktor auf den Kraterradius) und Dauer der Nässe. */
  loeschReichweite: 1.6,
  nassSchritte: 45,
  /** Anteil ausgebrannter Holzzellen, die als Loch wegbrechen (Terrainveränderung). */
  holzDurchbrand: 0.35,
  durchbrandRadius: 5,
  /** Obergrenzen (Zellen), damit Rechenzeit und Ereignisse beschränkt bleiben. */
  maxBrennend: 220,
  maxLava: 200,
  maxZellenJeEreignis: 48,
  /** Schaden je Schritt an einer Figur in einer Flammen- bzw. Lavazelle (vor Resistenzen). */
  schadenFlamme: 3,
  schadenLava: 9,
  brandMalusDauer: 2,
  brandMalusSchaden: 3,
  /** Lava: Zellen je Ausbruch, Lebensdauer in Lavaschritten, Fließbudget seitwärts. */
  lava: Object.freeze({
    ausbruchZellen: Object.freeze([14, 24]),
    leben: Object.freeze([150, 260]),
    fliessen: 7,
    abstandZuFiguren: 70,
    /** Pause zwischen Ausbrüchen in Biom Vulkan (Ticks): [min, max]. */
    pauseTicks: Object.freeze([1500, 3000]),
    /** Erster Ausbruch frühestens nach so vielen Ticks. */
    ersterAusbruch: 1200,
    /** Alle so viele Lavaschritte prüft eine ruhende Lavazelle ihre Nachbarn: Schnee und Eis schmelzen, Brennbares fängt Feuer. */
    nachbarIntervall: 12,
  }),
  /** Ragnarök (ab Valhalla): Pause zwischen Ereignissen (Ticks) und ihre Verkürzung je Ereignis. */
  ragnarok: Object.freeze({
    pauseTicks: Object.freeze([900, 1500]),
    verkuerzung: 0.9,
    mindestPause: 360,
    flammenwandBreite: Object.freeze([4, 8]),
    flammenwandSchritte: 8,
    abstandZuFiguren: 56,
  }),
  /** Mindestabstand (px) einer Figur zur Zelle, damit Lava dort erstarren darf (sonst wartet sie). */
  figurRadius: 12,
});

/**
 * Feuerfest: Faktor auf Schaden aus Flammen und Lava nach Archetyp (zusätzlich zur Familienresistenz
 * in `config/schaden.js`, die der Schadensmodifikator ohnehin anwendet). Der Perk steht damit im
 * Archetyp, nicht in einem Sidegrade, weil Sidegrades nur drei Kampfachsen kennen.
 */
export const FEUERFEST = Object.freeze({
  artillerist: 0.6,
});

export function feuerfestFaktor(archetypeId) {
  return FEUERFEST[archetypeId] ?? 1;
}

export default { FEUER_ALT, FEUER_ENTFACHT, FEUER_STANDARD, FEUER, FEUERFEST, normalisiereFeuer, feuerfestFaktor };

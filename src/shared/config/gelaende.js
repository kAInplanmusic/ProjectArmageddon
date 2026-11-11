/**
 * Geländefassung: Sonderbiome und Stoffkarte (`config.gelaende` im Replay-Kopf).
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Ein Sonderbiom lenkt die Achsen des Kartencharakters (`terrainGen3.formeCharakter`) und
 * verändert damit das Gelände; die Stoffkarte (`shared/stoffkarte.js`) kommt dazu. Eine
 * alte Aufzeichnung muss aber dieselbe Karte bauen wie damals:
 *
 *   - `GELAENDE_ALT` (1): Das Biom folgt der Karte (`biomwahl.js`), es gibt keine Stoffkarte.
 *     Das Feld FEHLT in jeder Datei aus der Zeit davor — `ReplayRecorder.fromJSON` setzt dann
 *     diesen Wert.
 *   - `GELAENDE_BIOME` (2): Der Seed (oder die Wahl `config.biom`) zieht mit einem eigenen
 *     Zweig zuerst ein Sonderbiom (`SONDER_ANTEIL` der Seeds) und formt den Charakter danach.
 *     Zieht er keines, bleibt die Karte Bit für Bit die der Fassung 1. Dazu entsteht die
 *     Stoffkarte; wirken lässt sie erst die Zerstörungsfassung 5.
 *
 *   - `GELAENDE_THEMEN` (3): Zusätzlich ziehen die vier Themenbiome `kosmos`, `surreal`, `fabrik`,
 *     `burg` (`config/biome-themen.js`); die Ziehung läuft über alle dreizehn Kennungen. Fassung 2
 *     zieht weiter nur aus den neun und kennt die Themenbiome nicht (auch nicht als Wahl).
 *
 *   - `GELAENDE_PLANET` (4): Zusätzlich zieht (und wählt) das Biom `planet`: eine Scheibenwelt im All
 *     (`config/biome-planet.js`, `terrainPlanet.js`); der Seed bestimmt die Art (Eis, Lava, Sand, Dschungel,
 *     Rost, Stein). Die Ziehung läuft über vierzehn Kennungen; die Fassungen 1 bis 3 kennen `planet` nicht und
 *     bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_KOMPOSITION` (6): Die Karte entsteht aus Bauteilen (`terrainKomposition.js`); die Kartenart zieht der
 *     Seed. Die Fassungen 1 bis 5 bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_BIOME_20` (7): Zusätzlich ziehen (und wählen) die Biome 15 bis 20 der Biom-SSOT (Schlackeschmiede,
 *     Schwebearchipel, Tempelstadt, Tiefsee, Dimensionsriss, Kristallwald; `config/biome-fassung-7.js`, Rezepte in
 *     `config/stoff-rezepte-material.js`). Die Ziehung läuft über zwanzig Kennungen; die Fassungen 1 bis 6 kennen die
 *     sechs nicht und bleiben Bit für Bit gleich. Zufall nur aus dem Seed-Zweig „BIO“ (unverändert).
 *
 *   - `GELAENDE_KLAR` (8, TODO N-29/UI-8): Jedes Biom bekommt einen Leitstoff und eine Kontrastader
 *     (`config/stoff-rezepte-klar.js`), Ruinen der Bauteilkarten tragen Schutthalden und eine begehbare Krone
 *     (`terrainKomposition.ruine`), und Figuren starten nur auf der Hauptlandmasse, nicht auf losen Brocken
 *     (`engine/karteStart.trockenerStartX`). Die Ziehung bleibt wie in 7; die Fassungen 1 bis 7 bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_OHNE_SCHACHT` (9): Kein Start in einem Schacht. Das oberste Fenster einer Ruine (`terrainKomposition.ruine`)
 *     brach durch die Mauerkrone und ließ einen 24 px breiten, rund 40 px tiefen Schacht stehen; die Startplatzwahl
 *     (`engine/karteStart.trockenerStartX`) prüfte nur Spalten ±12 px neben der Figur, also genau die Schachtränder, und nahm
 *     ihn als begehbar (Pilzwald Seed 2092081, 8×4 und 8×5). Ab 9 bleibt ein Fenster unter der Krone, und ein Startplatz
 *     braucht einen zu Fuß begehbaren Abschnitt von `MIN_START_ABSCHNITT` px. Zufall und Ziehung wie in 8; die Fassungen 1 bis
 *     8 bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_WEIT` (10): Breite Karten (ab `ZONEN_AB_BREITE` = 2800 px, also 24:9 ab `gross`, 16:9 ab 3840 px) entstehen aus Zonen
 *     (`terrainKomposition.erzeugeZonenKarte`): je ~2000 px Breite eine eigene Kartenart, gemeinsame Wasserlinie, 300 px
 *     Mischzone und Träger-Brücken an den Nähten; die Spielbarkeitsprüfung rechnet dort mit fester Wurfweite (939 px) statt
 *     proportional zur Breite. Karten unter 2800 px bleiben Bit für Bit die der Fassung 9; die Fassungen 1 bis 9 bleiben gleich.
 *
 *
 *   - `GELAENDE_NAHT` (11): Zonenkarten (ab 2800 px) ohne Wand an den Nähten (Höhenangleichung über Mischzone + Auslauf, Böschung statt
 *     Klippe), ohne Schwebereste (kleine Landstücke abseits der Hauptfläche) und mit Brücken über jede Lücke im trockenen Land;
 *     dazu ein schnelleres Aufräumen (`raeumeAuf`, Ergebnis unverändert). Karten unter 2800 px und die Fassungen 1 bis 10 bleiben
 *     Bit für Bit gleich.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/gelaende
 */
import { SeededRandom } from '../prng.js';
import { SONDERBIOM_IDS, SONDERBIOM_IDS_FASSUNG_3, SONDERBIOM_IDS_FASSUNG_4, SONDERBIOM_IDS_FASSUNG_7 } from './biome-neu.js';
import { PLANET_WAHL, PLANET_BIOM_IDS, planetArtAusZug } from './biome-planet.js';

export const GELAENDE_ALT = 1;
export const GELAENDE_BIOME = 2;
export const GELAENDE_THEMEN = 3;
export const GELAENDE_PLANET = 4;
/** Fassung 5: die Biome nutzen die Biom-Materialien (`config/stoff-rezepte-material.js`); Form und Zufall bleiben wie in 4. */
export const GELAENDE_MATERIAL = 5;
/** Fassung 6: Karten aus Bauteilen (`terrainKomposition.js`: Insel, Höhle, Schlucht, Archipel, Vulkan, Ruinenstadt, Pyramide, Hochkant, Ebenen) statt Hügelfeld; Planet bleibt wie in 4. */
export const GELAENDE_KOMPOSITION = 6;
/** Fassung 7: die Biome 15 bis 20 sind spielbar (`config/biome-fassung-7.js`); Karten und Rezepte der Biome 1 bis 14 bleiben wie in 6, nur die Ziehung läuft über zwanzig statt vierzehn Plätze. */
export const GELAENDE_BIOME_20 = 7;
/** Fassung 8: unterscheidbare Biome (ein Leitstoff, eine Kontrastader), begehbare Ruinen, Start nur auf der Hauptlandmasse. */
export const GELAENDE_KLAR = 8;
/** Fassung 9: kein Start in einem Schacht (Ruinenfenster bleiben unter der Krone, Startplatz mit begehbarem Abschnitt). */
export const GELAENDE_OHNE_SCHACHT = 9;
/** Fassung 10: breite Karten aus mehreren Zonen (`terrainKomposition.erzeugeZonenKarte`); schmale Karten wie in 9. */
export const GELAENDE_WEIT = 10;
/** Ab dieser Kartenbreite (px) wirkt die Fassung 10 (Zonenkarte, Kistenverteilung); darunter bleibt alles wie in 9. */
export const GELAENDE_WEIT_AB_BREITE = 2800;
/** Fassung 11: Zonenkarten mit Böschung an den Nähten, ohne Schwebereste, mit Brücken über alle Lücken (`terrainKomposition.erzeugeZonenKarte`). */
export const GELAENDE_NAHT = 11;
export const GELAENDE_STANDARD = GELAENDE_NAHT;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereZerstoerung`). */
export function normalisiereGelaende(fassung) {
  return fassung === GELAENDE_ALT || fassung === GELAENDE_BIOME || fassung === GELAENDE_THEMEN || fassung === GELAENDE_PLANET || fassung === GELAENDE_MATERIAL || fassung === GELAENDE_KOMPOSITION || fassung === GELAENDE_BIOME_20 || fassung === GELAENDE_KLAR || fassung === GELAENDE_OHNE_SCHACHT || fassung === GELAENDE_WEIT || fassung === GELAENDE_NAHT ? fassung : GELAENDE_STANDARD;
}

/** Anteil der Seeds, die ohne ausdrückliche Wahl ein Sonderbiom ziehen. */
const SONDER_ANTEIL = 0.4;
/** Wahl „kein Sonderbiom": das Biom folgt der Karte wie in Fassung 1. */
const BIOM_KLASSISCH = 'klassisch';
/** Seed-Zweig der Biomziehung („BIO"). */
const BIOM_FORK = 0x42494F;

/** Die Kennungen, die eine Fassung ziehen und wählen kann. */
function idsFuer(fassung) {
  if (fassung >= GELAENDE_BIOME_20) return SONDERBIOM_IDS_FASSUNG_7;
  if (fassung >= GELAENDE_PLANET) return SONDERBIOM_IDS_FASSUNG_4;
  return fassung >= GELAENDE_THEMEN ? SONDERBIOM_IDS_FASSUNG_3 : SONDERBIOM_IDS;
}

/**
 * Die gültigen Werte der Wahl: `null`/`auto` (der Seed entscheidet), `klassisch` oder ein Sonderbiom.
 * Alles andere wird `null` (automatisch).
 */
export function normalisiereBiomWahl(wahl, fassung = GELAENDE_STANDARD) {
  const ids = idsFuer(fassung);
  // Die Planetenarten sind einzeln wählbar (ab Fassung 4), die Wahl `planet` lässt den Seed die Art ziehen.
  if (wahl === BIOM_KLASSISCH || ids.includes(wahl) || (fassung >= GELAENDE_PLANET && PLANET_BIOM_IDS.includes(wahl))) return wahl;
  return null;
}

/**
 * Löst die Geländeoptionen eines Matches auf (ein Aufruf im Konstruktor).
 *
 * @returns {{gelaende:number, biomWahl:string|null, sonderbiom:string|null}} `sonderbiom` ist nur ab Fassung 2 gesetzt
 */
export function loeseGelaende(gelaende, biom, seed, kartenart = null) {
  const fassung = normalisiereGelaende(gelaende);
  const biomWahl = normalisiereBiomWahl(biom, fassung);
  return {
    gelaende: fassung, biomWahl, sonderbiom: fassung >= GELAENDE_BIOME ? waehleSonderbiom(seed, biomWahl, fassung) : null,
    kartenart: normalisiereKartenart(kartenart, fassung),
  };
}

/** Die Kartenvorlagen (Kartenarten der Bauteilkarte, ab Fassung 6). `null` = der Seed zieht die Art. */
export const KARTENARTEN = Object.freeze(['ebenen', 'insel', 'inselgruppe', 'hoehle', 'hoehleInsel', 'schlucht', 'archipel', 'vulkan', 'ruinenstadt', 'pyramide', 'hochkant']);

/** Gültige Vorlage oder `null`; vor Fassung 6 und bei Unbekanntem gilt immer `null` (alte Karten bleiben unverändert). */
export function normalisiereKartenart(art, fassung = GELAENDE_STANDARD) {
  return fassung >= GELAENDE_KOMPOSITION && KARTENARTEN.includes(art) ? art : null;
}

/**
 * Welches Sonderbiom gilt für diesen Seed und diese Wahl?
 *
 * Eigener Zweig des Seeds (nicht der Kartenzufall): die Ziehung verschiebt keine Zahl des Geländes.
 *
 * @param {number} seed
 * @param {string|null} wahl - siehe `normalisiereBiomWahl`
 * @returns {string|null} Kennung aus `NEUE_BIOME` oder `null` (klassisch)
 */
export function waehleSonderbiom(seed, wahl = null, fassung = GELAENDE_STANDARD) {
  const w = normalisiereBiomWahl(wahl, fassung);
  if (w === BIOM_KLASSISCH) return null;
  const rng = new SeededRandom(((Math.abs(Math.floor(Number(seed) || 0)) >>> 0) + BIOM_FORK) >>> 0);
  if (w && w !== PLANET_WAHL) return w;
  if (!w && rng.next() >= SONDER_ANTEIL) return null;
  const ids = idsFuer(fassung);
  const gezogen = w ?? ids[Math.floor(rng.next() * ids.length)];
  // `planet`: die Art zieht ein weiterer Wert desselben Zweigs (Fassungen vor 4 erreichen das nie).
  return gezogen === PLANET_WAHL ? planetArtAusZug(rng.next()) : gezogen;
}

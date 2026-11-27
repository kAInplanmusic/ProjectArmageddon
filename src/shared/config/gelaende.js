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
 *   - `GELAENDE_KLAR` (8, N-29/UI-8 erledigt 2026-11-12): Jedes Biom bekommt einen Leitstoff und eine Kontrastader
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
 *   - `GELAENDE_RAMPE` (12): Zonenkarten (ab 2800 px) mit begehbaren Rampen an den Nähten: die Zonen werden nicht mehr gegeneinander verschoben
 *     (das scherte Höhlen und Pyramiden), sondern die Oberfläche folgt einem Rampenprofil mit höchstens `NAHT_STEIGUNG_MAX` (1,0 = 45°; die
 *     Engine steigt bis 1,4, `config/bewegung.js`), das Land darüber wird abgetragen, die Lücke darunter aufgeschüttet; das Innere
 *     bleibt unberührt. Senkrechte Hohlräume schmaler als `SCHACHT_MIN_BREITE` (64 px) und tiefer als dieselbe Länge werden gefüllt
 *     (keine Schächte, in die eine Figur fällt und nicht mehr herauskommt). Brücken: 40 px dick (zwei Figurenhöhen), bündig mit dem
 *     Land, höchstens 0,8 Steigung, Stützen. Karten unter 2800 px und die Fassungen 1 bis 11 bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_FORM` (13): Feinschliff der Fassung 12 (`terrainKomposition`): Brückenstützen als kegelige Felspfeiler mit Fuß statt 40-px-Masten;
 *     das Rampenprofil der Nähte ist eine weiche, leicht gewellte Kurve (Zielsteigung 0,6 statt Gerade an der Grenze) und erhält Wasserbecken der
 *     Zonen; hohe senkrechte Felswände zu trockenem Land (Fall ≥ 200 px) bekommen eine steile Schutthalde; auf Karten unter 2800 px füllt `fuelleSchaechte` die
 *     Schächte (auch den Vulkan-Schlot). Fassung 12 und alle älteren bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_RUND` (14, N-40 „rund“, Entscheidung 2026-11-11, Stand 2026-11-14: Engine umgesetzt, Sichtabnahme offen): drei runde Kartenarten (`KARTENARTEN_RUND`: Planet, runde Höhle,
 *     schwebende Insel; `terrainRund.js`) für das Format 1:1, dazu die Kartenstufe `kolossal` (1:1 = 5760 × 5760 = 33,18 Mio. Pixel,
 *     `engine/karte.js`). Ohne gewählte runde Art (auf allen Formaten außer 1:1, und auf 1:1 mit den elf alten Arten) baut Fassung 14 Bit für
 *     Bit wie 13; nur auf 1:1 zieht der Seed ohne Wahl aus vierzehn statt elf Arten (derselbe eine Zug, anderer Teiler). Der Startplatz
 *     (`engine/karteStart`) verteilt die Figuren auf den begehbaren Stand der runden Karte. Fassung 13 und alle älteren bleiben Bit für Bit gleich.
 *
 *   - `GELAENDE_DURCHGANG` (15, TODO 2.3): Qualitätstor `shared/kartenTor.pruefeDurchgaenge`: Liegt begehbarer Boden von
 *     `TOR_LAUF_MAX` px oder mehr hinter einem Gang, der dünner ist als eine Figur, zieht der Generator neu (dieselbe Schleife mit
 *     bis zu acht Versuchen). Das Tor zieht keinen Zufall: Jede Karte, die es beim ersten Versuch besteht, ist Bit für Bit die der
 *     Fassung 14; nur abgelehnte Seeds bauen anders. Fassung 14 und alle älteren bleiben Bit für Bit gleich. *
 *   - `GELAENDE_START` (16, TODO 2.3b): Startfairness (`engine/startFairness.js`): Bei zwei Teams mit höchstens zwölf Figuren
 *     verteilt die Engine dieselben Startplätze so auf die Teams, dass keines im Mittel über 150 px höher steht, keines 1,6-mal
 *     weiter vom nächsten Gegner entfernt ist und kein Gegner näher als 120 px steht. Ist die bisherige Verteilung schon fair, bleibt
 *     sie. Karten ändern sich nicht. Fassung 15 und alle älteren bleiben Bit für Bit gleich. *
 *   - `GELAENDE_ABSTAND` (17, TODO 2.12): Startplätze nicht zu dicht. (1) Ohne ausdrückliche Wahl zieht der Seed die runden Arten erst ab
 *     `RUND_AB_BREITE` px (1:1 „gross“): Gemessen standen auf 1:1 „mittel“ (1920 px) in 11 von 11 Partien mit Planet oder runder Höhle
 *     Gegner unter 120 px, weil der begehbare Stand nur rund 600 px breit ist. (2) Startplätze halten `START_ABSTAND_MIN` px Abstand statt
 *     28 px (kleine Karten: Figuren starteten 22 px auseinander). Fassung 16 und älter bleiben Bit für Bit gleich. *
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
/** Fassung 12: begehbare Rampen statt Verschiebung der Zonen, keine Schächte, dicke Brücken mit Stützen (`terrainKomposition.erzeugeZonenKarte`). */
export const GELAENDE_RAMPE = 12;
/** Fassung 13: kegelige Brückenpfeiler, geschwungene Rampen mit Wasserbecken, Schutthalden an hohen Wänden, Schachtfüllung auch unter 2800 px. */
export const GELAENDE_FORM = 13;
/** Fassung 14: runde Kartenarten (Planet, runde Höhle, schwebende Insel) auf 1:1, Stufe `kolossal`, Startplatz auf dem begehbaren Stand. */
export const GELAENDE_RUND = 14;
/** Fassung 15: Qualitätstor gegen begehbaren Boden hinter zu dünnen Gängen (`shared/kartenTor.js`); bestandene Karten wie in 14. */
export const GELAENDE_DURCHGANG = 15;
/** Fassung 16: Startplätze fair auf die zwei Teams verteilt (`engine/startFairness.js`); Karten wie in 15. */
export const GELAENDE_START = 16;
/** Fassung 17: runde Arten per Seed erst ab `RUND_AB_BREITE`, Startplätze mindestens `START_ABSTAND_MIN` px auseinander. */
export const GELAENDE_ABSTAND = 17;
/**
 * Fassung 18 (TODO 4.6, Rückmeldung 2026-11-25 „Landschaft unabwechslungsreich“): Inseln mit mehr Umrissen — schief
 * (linke und rechte Flanke verschieden breit), Tafelberg (flache Krone, steile Wände) und Überhang (der Sockel wird
 * schmaler als die Krone). Fassungen 1 bis 17 bleiben bitgleich.
 */
export const GELAENDE_VIELFALT = 18;
export const GELAENDE_STANDARD = GELAENDE_VIELFALT;
/** Fassung 17: Ab dieser Kartenbreite zieht der Seed auf 1:1 auch die runden Arten (sonst nur bei ausdrücklicher Wahl). */
export const RUND_AB_BREITE = 2880;
/** Fassung 17: Mindestabstand zweier Startplätze (px), wo die Karte es zulässt. */
export const START_ABSTAND_MIN = 100;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereZerstoerung`). */
export function normalisiereGelaende(fassung) {
  return fassung === GELAENDE_ALT || fassung === GELAENDE_BIOME || fassung === GELAENDE_THEMEN || fassung === GELAENDE_PLANET || fassung === GELAENDE_MATERIAL || fassung === GELAENDE_KOMPOSITION || fassung === GELAENDE_BIOME_20 || fassung === GELAENDE_KLAR || fassung === GELAENDE_OHNE_SCHACHT || fassung === GELAENDE_WEIT || fassung === GELAENDE_NAHT || fassung === GELAENDE_RAMPE || fassung === GELAENDE_FORM || fassung === GELAENDE_RUND || fassung === GELAENDE_DURCHGANG || fassung === GELAENDE_START || fassung === GELAENDE_ABSTAND || fassung === GELAENDE_VIELFALT ? fassung : GELAENDE_STANDARD;
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

/**
 * Die drei runden Kartenarten (ab Fassung 14, `terrainRund.js`). Eigene Liste: `KARTENARTEN` bleibt unverändert, weil der Seed-Zug
 * ohne Wahl über deren Länge teilt (eine längere Liste würde alle Karten der Fassungen 6 bis 13 ändern).
 */
export const KARTENARTEN_RUND = Object.freeze(['rundPlanet', 'rundeHoehle', 'schwebendeInsel']);

/** Gültige Vorlage oder `null`; vor Fassung 6 und bei Unbekanntem gilt immer `null` (alte Karten bleiben unverändert). Die runden Arten erst ab 14. */
export function normalisiereKartenart(art, fassung = GELAENDE_STANDARD) {
  if (fassung >= GELAENDE_RUND && KARTENARTEN_RUND.includes(art)) return art;
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

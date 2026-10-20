/**
 * Zerstörungsfassung: Kraterform und Nachrutschen des Geländes.
 *
 * ## Warum es eine Versionsmarke gibt (AGENTS.md §2)
 *
 * Raue Krater und nachstürzende Geländeinseln ändern die Kollisionsmaske und
 * damit jeden Verlauf, der danach gespielt wird. Eine alte Aufzeichnung muss
 * aber unverändert laufen. Deshalb trägt der Replay-Kopf `config.zerstoerung`
 * (wie `config.kit`):
 *
 *   - `ZERSTOERUNG_ALT` (1): Krater sind perfekte Kreise, nichts stürzt nach.
 *     Das Feld FEHLT in jeder Datei aus der Zeit davor — `ReplayRecorder.fromJSON`
 *     setzt dann diesen Wert.
 *   - `ZERSTOERUNG_GELAENDE` (2): raue Krater mit waffenabhängiger Tiefe und
 *     Nachrutschen freischwebender Geländeinseln (`engine/zerstoerung.js`);
 *     Massen über 6000 Zellen gelten als gewachsener Fels.
 *   - `ZERSTOERUNG_SCHOLLEN` (3): wie 2, aber auch große Schollen (bis 60 000
 *     Zellen) stürzen nach; die Suche läuft dafür auch MITTEN in einer Masse über
 *     mehrere Ticks weiter statt eine Masse am Stück abzuarbeiten. Aufzeichnungen
 *     mit Fassung 2 laufen mit den alten Grenzen unverändert.
 *   - `ZERSTOERUNG_BRUCH` (4): wie 3, dazu: landende Inseln werden beim Aufprall
 *     „weich" (der Rand zerbröselt, die Brocken fliegen als Partikel-Zellen und setzen
 *     sich als Schutt ab), große Inseln brechen bei hartem Aufprall in zwei Teile,
 *     der Zerstörungscharakter der Waffe wirkt (`zerstoerungsArt`: Durchschlag, Splitter-
 *     streuung, Erdbeben-Setzrutsch), Figuren am Kraterrand rutschen nach. Neue
 *     Logeinträge der Maske: `['x', ...Läufe]` (Zellen weg), `['p', x, y, ...]` (Schutt
 *     gesetzt), `['r', x1, y1, x2, y2, ...]` (Setzrutsch). Fassung 1–3 bleiben Bit für Bit.
 *
 * Neue Aufzeichnungen tragen IMMER das Feld.
 *
 * @module config/zerstoerung
 */

export const ZERSTOERUNG_ALT = 1;
export const ZERSTOERUNG_GELAENDE = 2;
export const ZERSTOERUNG_SCHOLLEN = 3;
export const ZERSTOERUNG_BRUCH = 4;
export const ZERSTOERUNG_STANDARD = ZERSTOERUNG_BRUCH;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereKit`). */
export function normalisiereZerstoerung(fassung) {
  return fassung === ZERSTOERUNG_ALT || fassung === ZERSTOERUNG_GELAENDE || fassung === ZERSTOERUNG_SCHOLLEN
    || fassung === ZERSTOERUNG_BRUCH ? fassung : ZERSTOERUNG_STANDARD;
}

/**
 * Suchgrenzen einer Fassung (ab `ZERSTOERUNG_GELAENDE`).
 *
 * Fassung 2: Massen über 6000 Zellen gelten als Fels, eine Masse wird in EINEM Tick
 * zu Ende gefüllt. Fassung 3: Schollen bis 60 000 Zellen fallen, und auch die Füllung
 * einer einzelnen Masse ist auf `SUCH_BUDGET_PRO_TICK` je Tick begrenzt (sie setzt im
 * nächsten Tick fort), damit ein Tick nie mehr als das Budget kostet.
 *
 * @returns {{maxZellen:number, faktor:number, fortsetzen:boolean}}
 */
export function suchGrenzen(fassung) {
  if (fassung >= ZERSTOERUNG_SCHOLLEN) return { maxZellen: INSEL_MAX_ZELLEN_SCHOLLEN, faktor: SUCH_BUDGET_FAKTOR, fortsetzen: true };
  return { maxZellen: INSEL_MAX_ZELLEN, faktor: SUCH_BUDGET_FAKTOR, fortsetzen: false };
}

/**
 * Tiefe eines Kraters in Prozent des Radius (unterhalb des Einschlagpunkts).
 *
 * Grabende Waffen (nur `terrainDamage`, kein Flächenradius: Spaten, Bohrer,
 * Schwerschlag) graben tief und schmal wirkend; reine Sprengwaffen (nur
 * `blastRadius`) reißen eine flache, weite Mulde; Mischformen liegen dazwischen.
 * Winzige Löcher (Direkttreffer, Radius ≤ 5) bleiben rund.
 *
 * Ganzzahl in Prozent: Sie reist im Ereignis und im Kraterlog mit, und der
 * Client rechnet damit dieselbe Form wie der Server.
 */
export function kraterTiefeProzent(terrainDamage, blastRadius, radius) {
  if (!(radius > 5)) return 100;
  if (terrainDamage > 0 && !(blastRadius > 0)) return 135;
  if (terrainDamage > 0) return 115;
  return 85;
}

/** Größte Insel (Zellen), die noch nachstürzt; größere Massen gelten als gewachsener Fels. */
export const INSEL_MAX_ZELLEN = 6000;
/** Fassung 3: größte Scholle (Zellen), die noch nachstürzt (rund 245 × 245 px). */
export const INSEL_MAX_ZELLEN_SCHOLLEN = 60000;
/** Besuchte Zellen je Tick für die Inselsuche (Kostenbudget; die Suche setzt im nächsten Tick fort). */
export const SUCH_BUDGET_PRO_TICK = 9000;
/** Gesamtbudget einer Krater-Analyse in Vielfachen von `INSEL_MAX_ZELLEN`; der Rest gilt als verankert. */
export const SUCH_BUDGET_FAKTOR = 4;
/** Fallbeschleunigung einer Insel (px/Tick²) und Höchsttempo (px/Tick). */
export const INSEL_GRAVITATION = 0.45;
export const INSEL_TEMPO_MAX = 10;
/** Schaden an Figuren, die eine landende Insel unter sich begräbt. */
export const INSEL_QUETSCH_SCHADEN = 20;
/** Fallbeschleunigung loser Objekte (Kisten, Geschütze) nach Bodenverlust. */
export const OBJEKT_GRAVITATION = 0.5;

/* ------------------------------------------------------------ Fassung 4 */

/**
 * Wie hart schlägt eine Insel auf? 0 (Kiesel) bis 1 (Felsbrocken aus großer Höhe).
 * Gewichtet die Masse (Wurzel der Zellenzahl, bei 8000 Zellen voll) und die Fallhöhe
 * `dy` (bei 160 px voll). EINE Formel für Server (Zerbröseln, Bruch) und Client (Optik).
 */
export function aufprallStaerke(zellen, dy) {
  const masse = Math.min(1, Math.max(0, Number(zellen) || 0) / 8000);
  const fall = Math.min(1, Math.max(0, Number(dy) || 0) / 160);
  return Math.min(1, 0.12 + 0.55 * Math.sqrt(masse) + 0.33 * fall);
}

/** Ab dieser Aufprallstärke, Fallhöhe und Masse zerbröselt der Rand einer gelandeten Insel. */
export const WEICH_AB_STAERKE = 0.4;
export const WEICH_MIN_FALL = 20;
export const WEICH_MIN_ZELLEN = 150;
/** Obergrenze der Schuttzellen je Landung und der gleichzeitig fliegenden Partikel-Zellen im Match. */
export const SCHUTT_MAX_JE_LANDUNG = 72;
export const SCHUTT_MAX_GESAMT = 400;
/** Fallbeschleunigung der Partikel-Zellen (px/Tick²) und ihre Höchstlebensdauer (Ticks). */
export const SCHUTT_GRAVITATION = 0.35;
export const SCHUTT_LEBEN = 240;
/** Bruch in zwei Teile: nur bei hartem Aufprall einer großen Insel. */
export const BRUCH_AB_STAERKE = 0.7;
export const BRUCH_MIN_ZELLEN = 2400;
export const BRUCH_MIN_FALL = 60;
/** Mindestüberstand (px) über der Auflage, damit der Bruch einen Teil wirklich loslässt. */
export const BRUCH_MIN_UEBERSTAND = 20;
/** Erdbeben (Ultimate): größter Wirkradius, Mindesthöhenunterschied zweier Nachbarspalten für einen Setzrutsch, Obergrenze der Züge. */
export const BEBEN_MAX_RADIUS = 72;
export const BEBEN_MIN_RADIUS = 20;
/** Höhe des Abtastfensters über und unter dem Einschlag, zusätzlich zum Radius. */
export const BEBEN_RAND = 12;
export const BEBEN_STEILHEIT = 3;
export const BEBEN_MAX_ZUEGE = 300;
/** Splitterstreuung: so viele Nebenlöcher (4 bis 4 + Spanne - 1) um den Hauptkrater. */
export const SPLITTER_MIN = 4;
export const SPLITTER_SPANNE = 3;
/** Figuren am Kraterrand rutschen mit diesem Schub (px/Tick) in den Krater. */
export const RUTSCH_SCHUB = 1.4;
export const RUTSCH_MIN_RADIUS = 10;

const BRAND_ARTEN = new Set(['fire', 'plasma', 'energy', 'dragon']);
const BOHR_SPECIALS = new Set(['drill', 'drill_cannon', 'drill_rocket']);
const SPLITTER_SPECIALS = new Set(['fragmentation', 'spread_shot', 'banana_split', 'cosmic_banana']);

/**
 * Zerstörungscharakter einer Waffe (Fassung 4): wie ihr Einschlag das Gelände behandelt.
 *
 *   - `beben`: Ultimate mit großem Geländeschaden — Erschütterung, Setzrutsch um den Einschlag
 *   - `durchschlag`: Bohrer — Tunnel, ein gemeinsamer Auftrag für die Inselsuche
 *   - `splitter`: Splitter- und Streuwaffen — Nebenlöcher rund um den Hauptkrater
 *   - `brand`: Feuer, Plasma, Energie — Brandspuren und Schmelzränder (nur Optik)
 *   - `sprengung`: alles andere
 *
 * @param {object|null} waffe - Eintrag des Waffenkatalogs
 * @returns {'beben'|'durchschlag'|'splitter'|'brand'|'sprengung'}
 */
export function charakterDerWaffe(waffe) {
  if (!waffe) return 'sprengung';
  if (waffe.category === 'ultimate' && (waffe.terrainDamage ?? 0) >= 90) return 'beben';
  if (BOHR_SPECIALS.has(waffe.special)) return 'durchschlag';
  if (SPLITTER_SPECIALS.has(waffe.special)) return 'splitter';
  if (BRAND_ARTEN.has(waffe.damageType)) return 'brand';
  return 'sprengung';
}

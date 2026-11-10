/**
 * Kartenmaße: Formate (Seitenverhältnisse), Größenstufen und die Maße je
 * Format und Stufe — dazu die toleranten Normalisierer für Lobby, Client und
 * Replay-Köpfe.
 *
 * Ausgezogen aus `match.js` (2026-11-05), weil die Datei das Zeilenbudget riss
 * (`AGENTS.md` §3, `tests/zeilenbudget.test.js`: höchstens 2790 Zeilen). Reine
 * VERSCHIEBUNG: keine Formel, kein Faktor und kein Maß hat sich geändert; die
 * Goldwert-Tests (Gelände- und Zustands-Hash, Replay-Köpfe) belegen das.
 *
 * `match.js` importiert, was es selbst braucht, und RE-EXPORTIERT alle Namen
 * unverändert, damit die bestehenden Importe (`client/terrainPreview.js`,
 * `server/lobby.js`, Tests, Werkzeuge) weiter greifen. Dieses Modul importiert
 * `match.js` nicht — kein Zyklus.
 *
 * @module karte
 */

/*
 * Kartenmaße: sieben FORMATE je Stufe, alle mit derselben Fläche.
 *
 * Reichweiten, Sprunghöhen und Wurfweiten sind in Kartenpixeln angegeben. Eine
 * kleinere Karte ließe alle Waffen zu weit reichen, eine größere zu kurz. Die
 * Form entscheidet deshalb nur über den ZUSCHNITT: klein 921 600 px, mittel
 * 3 686 400 px, groß 8 294 400 px (4× bzw. 9×).
 *
 * Die 16:9-Maße (1280×720, 2560×1440, 3840×2160) sind die bisherigen und
 * bleiben bitgleich — Gelände- und Zustands-Hashes der Goldwert-Tests hängen
 * daran (AGENTS.md §2). Alle anderen Formate sind neue, ganzzahlige Zuschnitte
 * derselben Fläche auf ±2 %; die Rechnung steht am Format.
 *
 * Drahtformat: Int16 mit Faktor 4 = höchstens 8191,75 px. Das breiteste Format
 * hier ist 6272 px (Krieg, 24:9).
 *
 * `krieg` (5120×2880) wird nicht mehr angeboten (historische Entscheidung 2026-11-05: drei
 * Stufen; seit 2026-11-09 fünf), bleibt aber lesbar, damit alte Aufzeichnungen unverändert laufen.
 */
const FORMATE = Object.freeze({
  /* 24:9 (8:3): h = sqrt(A·3/8), w = 8/3·h. 1568×588 = 921 984 (+0,04 %); je Stufe verdoppelt. */
  '24:9': [[1568, 588], [3136, 1176], [4704, 1764], [6272, 2352]],
  /* 9:24 (3:8) — dasselbe, hochkant. */
  '9:24': [[588, 1568], [1176, 3136], [1764, 4704], [2352, 6272]],
  /* 16:9 — die bisherigen Maße, bitgleich (1280×720 = 921 600, 2560×1440, 3840×2160, 5120×2880). */
  '16:9': [[1280, 720], [2560, 1440], [3840, 2160], [5120, 2880]],
  /* 9:16 — die bisherigen Hochformat-Maße, getauscht. */
  '9:16': [[720, 1280], [1440, 2560], [2160, 3840], [2880, 5120]],
  /* 4:3: h = sqrt(A·3/4), w = 4/3·h. 1108×831 = 920 748 (−0,09 %); 3328×2496 = 8 306 688 (+0,15 %). */
  '4:3': [[1108, 831], [2216, 1662], [3328, 2496], [4434, 3326]],
  /* 3:4 — dasselbe, hochkant. */
  '3:4': [[831, 1108], [1662, 2216], [2496, 3328], [3326, 4434]],
  /* 1:1: w = sqrt(A): 960, 1920, 2880, 3840 — alle exakt. */
  '1:1': [[960, 960], [1920, 1920], [2880, 2880], [3840, 3840]],
});

/** Die sieben Formate als Seitenverhältnis. */
export const MAP_FORMATS = Object.freeze(Object.keys(FORMATE));
/** Vorgabe, wenn keine Form gewählt ist: 16:9 wie bisher. */
export const MAP_FORMAT_VORGABE = '16:9';
/** Vorgabestufe, wenn keine Größe gewählt ist. */
export const MAP_GROESSE_VORGABE = 'mittel';
/** Die wählbaren Größenstufen, klein nach groß (ohne die Altstufe `krieg`). */
export const MAP_GROESSEN = Object.freeze(['klein', 'kompakt', 'mittel', 'weit', 'gross', 'riesig']);
/** Alle Stufen der Tabelle — `krieg` nur noch zum Lesen alter Aufzeichnungen (gleiche Maße wie `riesig`). */
export const MAP_GROESSEN_ALLE = Object.freeze([...MAP_GROESSEN, 'krieg']);

/**
 * Vorgaben für NEUE Partien aus dem Menü (nicht für die Engine: fehlt in einem Replay-Kopf die Angabe, gilt weiter
 * `MAP_FORMAT_VORGABE`/`MAP_GROESSE_VORGABE`, damit alte Aufzeichnungen bitgleich laufen).
 *
 * 24:9 (≈ 2,67:1) liegt nahe an der Standardkarte von Worms Armageddon (1920×696 px ≈ 2,76:1); `gross` ist 4704×1764 px =
 * 336 × 88 Figurenbreiten/-höhen (14 × 20 px), `riesig` 6272×2352 px.
 */
export const MAP_FORMAT_MENUE = '24:9';
export const MAP_GROESSE_MENUE = 'gross';

/**
 * Altnamen der Ausrichtung: Eine Aufzeichnung von vor den Formaten trägt
 * `orientation: 'portrait'` und meint damit 9:16.
 */
export const MAP_FORMAT_ALIASE = Object.freeze({ landscape: '16:9', portrait: '9:16' });

const KARTEN = Object.freeze(Object.fromEntries(
  Object.entries(FORMATE).map(([format, liste]) => [format, Object.freeze(Object.fromEntries(
    MAP_GROESSEN_ALLE.map((stufe, index) => {
      // `riesig` (5) und die Altstufe `krieg` (6) teilen sich das größte Maß der Tabelle.
      const [width, height] = index >= 5 ? liste[3] : liste[Math.floor(index / 2)];
      if (index === 1 || index === 3) {
        const [w, h] = liste[Math.ceil(index / 2)];
        return [stufe, Object.freeze({ width: Math.round((width + w) / 2), height: Math.round((height + h) / 2) })];
      }
      return [stufe, Object.freeze({ width, height })];
    }),
  ))]),
));

/** Maße je Format und Stufe. `landscape`/`portrait` bleiben als Altnamen lesbar. */
export const MAP_SIZES = Object.freeze({
  ...KARTEN,
  landscape: KARTEN['16:9'],
  portrait: KARTEN['9:16'],
});

/** Die wählbare Stufe, die einer Spielerzahl nahegelegt wird (Vorschlag, keine Regel). */
export function mapGroesseFuerSpieler(spieler) {
  if (spieler <= 2) return 'klein';
  if (spieler <= 8) return 'mittel';
  return 'gross';
}

/** Körpermaß einer Figur in Kartenpixeln (`config/player.js`: 14 × 20) — für Maßangaben in Figurenbreiten. */
export const FIGUR_BREITE_PX = 14;
export const FIGUR_HOEHE_PX = 20;

/**
 * Stufe für die Figurenzahl einer Partie (Vorschlag für das Menü, Format 24:9): Je Figur sollen rund 40–55 Figurenbreiten
 * Kartenbreite zur Verfügung stehen (Worms Armageddon: 1920 px / 9 px = 213 Breiten bei meist 6–8 Würmern, also 27–35).
 * Die Waffenreichweiten (Kartenpixel) bleiben dabei im Spiel: der nächste Gegner liegt meist unter 700 px entfernt.
 */
export function mapGroesseFuerFiguren(figuren) {
  if (figuren <= 3) return 'kompakt';
  if (figuren <= 5) return 'mittel';
  if (figuren <= 8) return 'weit';
  if (figuren <= 14) return 'gross';
  return 'riesig';
}

/** Ausrichtungen der Karte (Altbegriff; die Form ist die neue Angabe). */
export const ORIENTATIONS = Object.freeze(['landscape', 'portrait']);

/** Die Ausrichtung zu einem Format — für Anzeige und Altcode (`1:1` gilt als quer). */
export function ausrichtungFuerFormat(format) {
  const schluessel = MAP_FORMAT_ALIASE[format] ?? format;
  return ['9:24', '9:16', '3:4'].includes(schluessel) ? 'portrait' : 'landscape';
}

/**
 * Querformat als Vorgabe — die Konstanten bleiben für Altcode erhalten.
 *
 * Sie zeigen auf die MITTLERE Stufe, weil das die Vorgabe der Lobby ist
 * (2 Teams × 2 Spieler = 4 Spieler).
 */
export const MAP_WIDTH = MAP_SIZES['16:9'].mittel.width;
export const MAP_HEIGHT = MAP_SIZES['16:9'].mittel.height;

/**
 * Maße eines Formats und einer Größe.
 *
 * Der erste Parameter heißt historisch `orientation`; `landscape`/`portrait`
 * werden auf 16:9/9:16 abgebildet. Tolerant wie die übrige Konfiguration: Eine
 * unbekannte Form oder Stufe fällt auf die Vorgabe zurück, statt zu werfen —
 * eine Einstellung aus einer älteren Fassung soll spielbar bleiben.
 */
export function mapSizeFor(orientation, groesse = MAP_GROESSE_VORGABE) {
  const schluessel = MAP_FORMAT_ALIASE[orientation] ?? orientation;
  const seite = MAP_SIZES[schluessel] ?? MAP_SIZES[MAP_FORMAT_VORGABE];
  return seite[groesse] ?? seite[MAP_GROESSE_VORGABE];
}

/**
 * Prüft eine Formangabe tolerant (AGENTS.md §6: der Server vertraut dem Client
 * nie, aber eine unbekannte Angabe darf kein Match verhindern). Unbekanntes
 * fällt auf `orientation` und dann auf die Vorgabe 16:9 zurück.
 */
export function normalisiereFormat(format, orientation = MAP_FORMAT_VORGABE) {
  const direkt = MAP_FORMAT_ALIASE[format] ?? format;
  if (MAP_FORMATS.includes(direkt)) return direkt;
  const alt = MAP_FORMAT_ALIASE[orientation] ?? orientation;
  return MAP_FORMATS.includes(alt) ? alt : MAP_FORMAT_VORGABE;
}

/** Prüft eine Größenstufe tolerant; Unbekanntes wird zur Vorgabe `mittel`. */
export function normalisiereGroesse(groesse) {
  return MAP_GROESSEN_ALLE.includes(groesse) ? groesse : MAP_GROESSE_VORGABE;
}

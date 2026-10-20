/**
 * Schadensfassung: Schadensarten, ihre Mali und die Gegenspiele (`config.schaden` im Replay-Kopf).
 *
 * ## Der Befund (Bestandsaufnahme 2026-10-19, gemessen)
 *
 * Die 27 Schadensarten des Katalogs (`src/engine/damageTypes.js`) reisten bis ins
 * `damage`-Ereignis, aber KEINE Art wirkte anders als die andere. Nachteile entstanden
 * nur aus dem `special` einer Waffe oder aus dem Elementarwert:
 *
 *   - Feuer und Gift: Schaden über Zeit, UNBEGRENZT stapelbar (jeder Treffer eine neue Zeile)
 *   - Einfrieren (Eis, `stun`, `sleep`): bis zu 5 Züge Aussetzen, erneut setzbar — Dauerbetäubung
 *   - Verlangsamung: nur durch Günthers Kackhaufen
 *   - Elektro, Magie, Energie, Säure, Dunkel, Wasser, Wind, Heilig …: kein Nachteil
 *   - kein Gegenspiel: kein Mittel, Brand oder Gift zu entfernen; Heilung ignorierte beides
 *   - Schaden über Zeit ohne Urheber (kein Kill-Nachweis), Rüstung/Schild ohne Bezug zur Art
 *
 * ## Die Fassungen (AGENTS.md §2)
 *
 * Neue Regeln würden alte Aufzeichnungen verändern. Deshalb trägt der Replay-Kopf
 * `config.schaden` (wie `kit`, `zerstoerung`, `waffen`, `kisten`):
 *
 *   - `SCHADEN_ALT` (1): das bisherige Verhalten, bitgleich. Eine Datei OHNE das Feld
 *     (und jede alte Sicherung) ist `SCHADEN_ALT`.
 *   - `SCHADEN_STATUS` (2, Standard für neue Aufzeichnungen): Mali je Schadensart mit
 *     Dauer, Stapelgrenze und Gegenspiel; Obergrenzen gegen Missbrauch.
 *
 * Die Waffenwerte (`weapons.js`) bleiben unberührt: Diese Datei hält die Schaden-Tabelle
 * GETRENNT vom Katalog, damit die Katalogfassung (`waffen-fassung.js`) unabhängig bleibt.
 * Klassenwerte (`classes.js`) werden nicht geändert; die Resistenzen stehen in der
 * Zusatztabelle unten.
 *
 * @module config/schaden
 */

export const SCHADEN_ALT = 1;
export const SCHADEN_STATUS = 2;
export const SCHADEN_STANDARD = SCHADEN_STATUS;

/** Unbekannte Werte fallen auf den Standard (wie `normalisiereWaffen`). */
export function normalisiereSchaden(fassung) {
  return fassung === SCHADEN_ALT || fassung === SCHADEN_STATUS ? fassung : SCHADEN_STANDARD;
}

/**
 * Die Mali. Dauer zählt in EIGENEN Zugbeginnen des Betroffenen: Bei Dauer 3 wirkt der
 * Malus in den nächsten drei eigenen Zügen. Schaden über Zeit fällt zu Beginn des Zuges
 * an (vor der Zugfreigabe), danach sinkt die Dauer um eins.
 *
 * `stapel`: höchstens so viele gleichzeitige Einträge DERSELBEN Art; ein weiterer Treffer
 * ersetzt den schwächsten oder frischt ihn nur auf.
 */
export const MALUS = Object.freeze({
  brand: Object.freeze({
    label: 'Brand', symbol: '♨', farbe: '#ff8a1f', bit: 0, dauer: 3, stapel: 1, schadensart: 'fire',
    kurz: 'Schaden über Zeit; Wasser, Eis und große Heilung löschen ihn',
  }),
  gift: Object.freeze({
    label: 'Gift', symbol: '☠', farbe: '#8be04a', bit: 1, dauer: 3, stapel: 2, schadensart: 'poison',
    heilungAbzug: 0.25,
    kurz: 'Schaden über Zeit, bis zu zwei Stapel; jeder Stapel mindert Heilung um ein Viertel',
  }),
  fluch: Object.freeze({
    label: 'Fluch', symbol: '☾', farbe: '#b0488f', bit: 2, dauer: 2, stapel: 1, schadensart: 'dark',
    heilungAbzug: 0.5, schadenAbzug: 0.15,
    kurz: 'halbe Heilung und 15 % weniger eigener Schaden; nur große Heilung bricht ihn',
  }),
  saeure: Object.freeze({
    label: 'Säure', symbol: '⚗', farbe: '#d6e83a', bit: 3, dauer: 2, stapel: 1, schadensart: 'acid',
    ruestungAbzug: 0.25,
    kurz: 'zersetzt die Rüstung um 25 Punkte Prozent',
  }),
  frost: Object.freeze({
    label: 'Frost', symbol: '❄', farbe: '#7fd8ff', bit: 4, dauer: 2, stapel: 1, schadensart: 'ice',
    tempo: 0.7,
    kurz: 'Tempo auf 70 %; ein zweiter Treffer oder Nässe betäubt',
  }),
  schock: Object.freeze({
    label: 'Schock', symbol: '↯', farbe: '#ffe14a', bit: 5, dauer: 1, stapel: 1, schadensart: 'electric',
    tempo: 0.5,
    kurz: 'Tempo auf 50 %; bei Nässe Betäubung und Leitung auf nasse Gegner',
  }),
  nass: Object.freeze({
    label: 'Nass', symbol: '≈', farbe: '#4aa3ff', bit: 6, dauer: 2, stapel: 1, schadensart: 'water',
    kurz: 'löscht Brand, verstärkt Frost und Schock',
  }),
});

export const MALUS_SCHLUESSEL = Object.freeze(Object.keys(MALUS));

/** Betäubung (Aussetzen) ist kein Eintrag im Speicher, sondern `frozenTurns` — mit eigener Marke. */
export const BETAEUBUNG = Object.freeze({
  label: 'Betäubung', symbol: '✖', farbe: '#7fd8ff', dauer: 1,
  kurz: 'setzt einen Zug aus; danach ein Zug Schutz',
});

/** Obergrenzen gegen Stapel-Exploits. */
export const OBERGRENZEN = Object.freeze({
  /** Gleichzeitige Mali (ohne Nass): ein vierter ersetzt den mit der kürzesten Restdauer. */
  maxMali: 3,
  /** Schaden über Zeit je Zugbeginn, alle Quellen zusammen, als Anteil der Maximalgesundheit. */
  dotAnteil: 0.2,
  /** Eigene Züge Schutz nach einer Betäubung (die Betäubung trifft nie zwei Züge hintereinander). */
  betaeubungSchutz: 1,
  /** Mindestdauer eines Malus nach Abzügen durch Archetyp. */
  mindestDauer: 1,
});

/**
 * Wie viel vom Schaden-über-Zeit-Wert der Waffe (`elemental`-Formel des Katalogs) übernommen
 * wird. Die Faktoren sind gemessen (`npm run balance:schaden`) und halten Brand, Gift und
 * Fluch vergleichbar mit dem direkten Schaden einer Waffe der gleichen Stufe.
 */
export const DOT_FAKTOR = Object.freeze({ brand: 0.8, gift: 0.7, fluch: 0.5 });

/** Obergrenze des Schadens je Zug eines einzelnen Eintrags (vor der Gesamtgrenze). */
export const DOT_MAX_JE_EINTRAG = Object.freeze({ brand: 16, gift: 12, fluch: 8 });

/** Wechselwirkungen mit Gelände und Karte. */
export const WECHSELWIRKUNG = Object.freeze({
  /** Bewachsene Karte (Biom `forest`): Feuer greift um sich. */
  brandBiomZusatz: Object.freeze({ forest: 1 }),
  /** Frost hält länger auf Schnee und Berg (Biom `alpine`) und auf Eisboden. */
  frostBiomZusatz: Object.freeze({ alpine: 1 }),
  frostEisbodenZusatz: 1,
  /** Eisboden dämpft Feuer um einen Zug. */
  brandEisbodenAbzug: 1,
  /** Leitung des Schocks: Reichweite (px) und Schadensanteil. */
  leitungReichweite: 140,
  leitungAnteil: 0.4,
  /** Heilige Treffer auf Verfluchte. */
  heiligGegenFluch: 1.25,
  /** Heilung (Rohwert), ab der Brand, ein Gift-Stapel und Säure enden / auch Fluch und alles Gift endet. */
  heilungLoescht: 20,
  heilungBrichtFluch: 40,
});

/** Familien: eine Zuordnung Art → Familie für Resistenzen und Darstellung. */
export const FAMILIE_VON_ART = Object.freeze({
  physical: 'koerper', impact: 'koerper', explosive: 'koerper', defense: 'koerper', utility: 'koerper',
  fire: 'feuer', dragon: 'feuer',
  ice: 'eis',
  electric: 'elektro', magnetic: 'elektro',
  energy: 'energie',
  poison: 'gift', acid: 'gift',
  arcane: 'magie', astral: 'magie', spatial: 'magie', temporal: 'magie', time: 'magie', psychic: 'magie',
  dark: 'schatten', void: 'schatten', chaos: 'schatten',
  water: 'natur', wind: 'natur', nature: 'natur',
  holy: 'heilig', medical: 'heilig',
});

/**
 * Regeln je Schadensart.
 *
 * `malus`: der Malus, den ein Treffer dieser Art ausübt (`null` = keiner, mit Grund).
 * `ruestung`: Anteil der Rüstung, der gegen diese Art wirkt (1 = voll).
 * `schild`: Anteil des Schadens, den ein Schild fängt (1 = alles bis zum Schildwert).
 * Alles, was hier nicht steht, ist 1 / ohne Malus.
 */
export const ART_REGEL = Object.freeze({
  physical: Object.freeze({ malus: null, grund: 'Wucht: Rüstung wirkt voll; Betäubung nur über Kriegshammer und Traumfänger' }),
  impact: Object.freeze({ malus: null, grund: 'Wucht: die Erschütterung ist der Rückstoß' }),
  explosive: Object.freeze({ malus: null, grund: 'Fläche und Krater sind der Nachteil des Gegners' }),
  defense: Object.freeze({ malus: null, grund: 'Selbstwirkung (Schutz)' }),
  utility: Object.freeze({ malus: null, grund: 'Selbstwirkung (Bewegung, Munition)' }),
  fire: Object.freeze({ malus: 'brand' }),
  dragon: Object.freeze({ malus: 'brand' }),
  ice: Object.freeze({ malus: 'frost' }),
  electric: Object.freeze({ malus: 'schock' }),
  magnetic: Object.freeze({ malus: null, grund: 'Sog statt Nachteil (Heranziehen)' }),
  energy: Object.freeze({ malus: null, schild: 0.5, grund: 'Schildbrecher: ein Schild fängt nur die Hälfte' }),
  poison: Object.freeze({ malus: 'gift', ruestung: 0.5 }),
  acid: Object.freeze({ malus: 'saeure', ruestung: 0.5 }),
  arcane: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  astral: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  psychic: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  spatial: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  temporal: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  time: Object.freeze({ malus: null, ruestung: 0.5, grund: 'Magie durchdringt die Hälfte der Rüstung' }),
  dark: Object.freeze({ malus: 'fluch', ruestung: 0.5 }),
  void: Object.freeze({ malus: 'fluch', ruestung: 0.5 }),
  chaos: Object.freeze({ malus: 'fluch', ruestung: 0.5 }),
  water: Object.freeze({ malus: 'nass' }),
  wind: Object.freeze({ malus: null, grund: 'Sog und Versatz statt Nachteil' }),
  nature: Object.freeze({ malus: null, grund: 'Aufbau (Buff), kein Nachteil' }),
  holy: Object.freeze({ malus: null, grund: 'Heilig: +25 % gegen Verfluchte' }),
  medical: Object.freeze({ malus: null, grund: 'Heilung des Schützen' }),
});

/**
 * Zusatzresistenzen (Faktor auf den Schaden je Familie) nach Klasse und Archetyp.
 *
 * Die Klassenwerte in `classes.js` bleiben unverändert; hier steht nur, was zusätzlich
 * gilt. Jede Klasse hat eine Stärke und eine Schwäche, ungefähr ±10-15 %.
 * `dauer`: Abzug in Zügen auf die Dauer des genannten Malus (nie unter `mindestDauer`).
 */
export const RESISTENZ_KLASSE = Object.freeze({
  scout: Object.freeze({ gift: 0.85, energie: 1.1 }),
  heavy: Object.freeze({ koerper: 0.9, elektro: 1.15 }),
  artillery: Object.freeze({ feuer: 0.9, magie: 1.1 }),
});

export const RESISTENZ_ARCHETYP = Object.freeze({
  brawler: Object.freeze({ faktor: Object.freeze({}), dauer: Object.freeze({ gift: 1, saeure: 1 }) }),
  artillerist: Object.freeze({ faktor: Object.freeze({}), dauer: Object.freeze({ brand: 1 }) }),
  occultist: Object.freeze({ faktor: Object.freeze({ magie: 0.9, schatten: 0.9 }), dauer: Object.freeze({ fluch: 1 }) }),
});

/** Darstellung der Schadenszahlen je Familie (Farbe) und Zeichen hinter der Zahl. */
export const ZAHL_FAMILIE = Object.freeze({
  koerper: Object.freeze({ farbe: '#ff3b3b', symbol: '' }),
  feuer: Object.freeze({ farbe: '#ff8a1f', symbol: '♨' }),
  eis: Object.freeze({ farbe: '#7fd8ff', symbol: '❄' }),
  elektro: Object.freeze({ farbe: '#ffe14a', symbol: '↯' }),
  energie: Object.freeze({ farbe: '#33e6c8', symbol: '◈' }),
  gift: Object.freeze({ farbe: '#8be04a', symbol: '☠' }),
  magie: Object.freeze({ farbe: '#c07bff', symbol: '✦' }),
  schatten: Object.freeze({ farbe: '#e0569e', symbol: '☾' }),
  natur: Object.freeze({ farbe: '#4aa3ff', symbol: '≈' }),
  heilig: Object.freeze({ farbe: '#fff2a8', symbol: '✚' }),
});

/** Familie einer Art (unbekannt: `koerper`). */
export function familieVonArt(art) {
  return FAMILIE_VON_ART[art] ?? 'koerper';
}

/** Regel einer Art (unbekannt: leere Regel). */
export function artRegel(art) {
  return ART_REGEL[art] ?? ART_REGEL.physical;
}

/** Bitfeld der aktiven Mali (für die Leitung: Bit 7 kennzeichnet "Maske statt Anzahl"). */
export function maliMaske(mali) {
  let maske = 0;
  for (const schluessel of MALUS_SCHLUESSEL) {
    if (mali?.[schluessel]) maske |= 1 << MALUS[schluessel].bit;
  }
  return maske;
}

/** Gegenstück zu `maliMaske`: aus dem Bitfeld die aktiven Schlüssel. */
export function maskeZuMali(maske) {
  const mali = {};
  for (const schluessel of MALUS_SCHLUESSEL) {
    if (maske & (1 << MALUS[schluessel].bit)) mali[schluessel] = {};
  }
  return mali;
}

/** Wert der Leitung für `dotsCount` bei Fassung 2: Bit 7 + Maske. */
export const MALI_LEITUNGSMARKE = 0x80;

/** Schadensfaktor einer Familie für eine Klasse / einen Archetyp (Zusatztabelle). */
export function resistenzFaktor(classId, archetypeId, art) {
  const familie = familieVonArt(art);
  const klasse = RESISTENZ_KLASSE[classId]?.[familie] ?? 1;
  const archetyp = RESISTENZ_ARCHETYP[archetypeId]?.faktor?.[familie] ?? 1;
  return klasse * archetyp;
}

/** Abzug (Züge) auf die Dauer eines Malus durch den Archetyp. */
export function dauerAbzug(archetypeId, malus) {
  return RESISTENZ_ARCHETYP[archetypeId]?.dauer?.[malus] ?? 0;
}

/** Die Markenliste einer Figur für die Anzeige: `[{schluessel, label, symbol, farbe, turns, kurz}]`. */
export function maliMarken(zustand) {
  const marken = [];
  for (const schluessel of MALUS_SCHLUESSEL) {
    const eintrag = zustand?.mali?.[schluessel];
    if (!eintrag) continue;
    const m = MALUS[schluessel];
    const stapel = Array.isArray(eintrag) ? eintrag.length : 1;
    const turns = Array.isArray(eintrag)
      ? Math.max(0, ...eintrag.map(e => e.turns ?? 0))
      : (eintrag.turns ?? 0);
    marken.push({
      schluessel, label: m.label, symbol: m.symbol, farbe: m.farbe, turns, stapel, kurz: m.kurz,
      text: `${m.symbol}${stapel > 1 ? stapel : ''}${turns > 0 ? ` ${turns}` : ''}`,
    });
  }
  return marken;
}

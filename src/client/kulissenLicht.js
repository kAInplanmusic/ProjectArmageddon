/**
 * Licht und Sättigung je Biom (A19).
 *
 * Bisher galt für jede Kulisse derselbe Sättigungsdeckel (0,45) und derselbe
 * Abdunkelungsverlauf. Das ist für ein düsteres Waldbild zu viel und für eine
 * Schnee- oder Wüstenkulisse zu wenig: helle Flächen brauchen mehr Tiefe,
 * damit die Spielfläche lesbar bleibt; Lava und Nacht dürfen nicht zusätzlich
 * ausgeblichen werden.
 *
 * Die Werte sind ein Kalibrierungsstart, keine Messzusage. Abnahme ist eine
 * Sichtprüfung mit Figuren und HUD vor jeder Referenzkulisse (A22) plus
 * Kontrastmessung der Spielfläche (siehe `lesbarkeitsHinweis`).
 *
 * @module kulissenLicht
 */

/**
 * Je Lichtklasse:
 *  - `saettigungDeckel`  höchste mittlere Sättigung der Kulisse (0…1)
 *  - `daempfung.start`   Höhe (Anteil), ab der nach unten abgedunkelt wird
 *  - `daempfung.stops`   Verlauf: Offset 0…1, Alpha der Farbe `(8,14,24)`
 *  - `lichtVon`          Lichtrichtung, die die Kulisse zeigen soll
 *  - `hinweis`           was bei der Abnahme zu prüfen ist
 */
export const LICHT_KLASSEN = Object.freeze({
  schnee: Object.freeze({
    klasse: 'schnee',
    saettigungDeckel: 0.30,
    daempfung: Object.freeze({ start: 0.33, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.30 }, { offset: 1, alpha: 0.58 }]) }),
    lichtVon: 'links oben, kalt',
    hinweis: 'Weiße Flächen dürfen nicht ausfressen; Figurenkontur dunkel, HUD mit Schatten.',
  }),
  wald: Object.freeze({
    klasse: 'wald',
    saettigungDeckel: 0.45,
    daempfung: Object.freeze({ start: 0.35, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.28 }, { offset: 1, alpha: 0.55 }]) }),
    lichtVon: 'links oben, gefiltert',
    hinweis: 'Grün nicht entsättigen, aber Mittelgrund zurücknehmen; Figuren vor Blattwerk abgrenzen.',
  }),
  wueste: Object.freeze({
    klasse: 'wueste',
    saettigungDeckel: 0.36,
    daempfung: Object.freeze({ start: 0.32, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.32 }, { offset: 1, alpha: 0.60 }]) }),
    lichtVon: 'links oben, warm',
    hinweis: 'Sandton nicht in Orange kippen; harte Schattenkante, Figuren brauchen dunkle Kontur.',
  }),
  lava: Object.freeze({
    klasse: 'lava',
    saettigungDeckel: 0.50,
    daempfung: Object.freeze({ start: 0.36, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.32 }, { offset: 1, alpha: 0.56 }]) }),
    lichtVon: 'Glut von unten, Rest von links oben',
    hinweis: 'Glut ist die Lichtquelle und bleibt gesättigt; Schwarzflächen nicht zu Crush abdunkeln.',
  }),
  stadt: Object.freeze({
    klasse: 'stadt',
    saettigungDeckel: 0.40,
    daempfung: Object.freeze({ start: 0.34, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.30 }, { offset: 1, alpha: 0.56 }]) }),
    lichtVon: 'links oben, künstlich gemischt',
    hinweis: 'Neon nicht als Flächenlicht über die Spielfläche legen; Reklame nur oberhalb des Terrains.',
  }),
  nacht: Object.freeze({
    klasse: 'nacht',
    saettigungDeckel: 0.32,
    daempfung: Object.freeze({ start: 0.36, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.22 }, { offset: 1, alpha: 0.48 }]) }),
    lichtVon: 'Mond von links oben, wenige kalte Akzente',
    hinweis: 'Dunkle Kulisse nicht weiter abdunkeln; Figuren über Helligkeit/Aura trennen, nicht über Schwarz.',
  }),
  standard: Object.freeze({
    klasse: 'standard',
    saettigungDeckel: 0.45,
    daempfung: Object.freeze({ start: 0.35, stops: Object.freeze([{ offset: 0, alpha: 0 }, { offset: 0.55, alpha: 0.28 }, { offset: 1, alpha: 0.55 }]) }),
    lichtVon: 'links oben',
    hinweis: 'Neutraler Startwert; bei der Abnahme gegen die Nachbarklassen prüfen.',
  }),
});

/** Biom → Lichtklasse. Nicht gelistete Biome bleiben `standard`. */
const BIOM_KLASSE = Object.freeze({
  alpine: 'schnee',
  spires: 'schnee',
  forest: 'wald',
  open: 'wald',
  western: 'wueste',
  caverns: 'lava',
  urban: 'stadt',
  hyperreal: 'stadt',
  noir: 'nacht',
  cosmos: 'nacht',
});

/** Schlüsselwörter im Varianten-/Dateinamen, die eine Klasse erzwingen. */
const SCHLUESSEL_KLASSE = Object.freeze([
  [/lava|ragnarok|glut|ember|volcan/, 'lava'],
  [/schnee|snow|eis|arctic|gletscher|packeis|winter/, 'schnee'],
  [/wueste|desert|sand|dune|western|badlands/, 'wueste'],
  [/nacht|night|noir|moon|mond|aurora/, 'nacht'],
  [/stadt|city|urban|hafen|harbor|industrie|ruine|street/, 'stadt'],
  [/wald|forest|jungle|dschungel|wiese|meadow|grove/, 'wald'],
]);

/**
 * Ordnet eine Kulisse einer Lichtklasse zu. Variantenname sticht vor Biom:
 * `caverns/lava_tube` ist Lava, obwohl das Biom `caverns` heißt.
 *
 * @param {{key?:string, id?:string, biomeId?:string, file?:string}|null} backdrop
 * @param {{id?:string}|null} [scenery]
 * @returns {'schnee'|'wald'|'wueste'|'lava'|'stadt'|'nacht'|'standard'}
 */
export function lichtKlasseFuer(backdrop, scenery = null) {
  if (backdrop?.lichtKlasse && LICHT_KLASSEN[backdrop.lichtKlasse]) return backdrop.lichtKlasse;
  const text = [backdrop?.key, backdrop?.id, backdrop?.file].filter(Boolean).join(' ').toLowerCase();
  for (const [muster, klasse] of SCHLUESSEL_KLASSE) {
    if (muster.test(text)) return klasse;
  }
  const biom = backdrop?.biomeId ?? scenery?.id ?? null;
  return (biom && BIOM_KLASSE[biom]) || 'standard';
}

/**
 * Vollständige Lichtvorgabe einer Kulisse.
 * @returns {{klasse:string, saettigungDeckel:number, daempfung:object, lichtVon:string, hinweis:string}}
 */
export function lichtFuerKulisse(backdrop, scenery = null) {
  return LICHT_KLASSEN[lichtKlasseFuer(backdrop, scenery)] ?? LICHT_KLASSEN.standard;
}

/**
 * Sättigungsfaktor aus einer gemessenen mittleren Sättigung `s` (0…1).
 * Liegt `s` unter dem Deckel, bleibt das Bild unverändert (Faktor 1).
 */
export function saettigungsFaktorAusMessung(s, deckel) {
  const messwert = Number.isFinite(s) && s > 0 ? s : 0;
  const grenze = Number.isFinite(deckel) && deckel > 0 ? deckel : LICHT_KLASSEN.standard.saettigungDeckel;
  if (messwert <= grenze) return 1;
  return grenze / messwert;
}

/** Unter dieser mittleren Leuchtdichte (0…1) wird eine Kulisse aufgehellt (N-35: die Sternennacht- und Höhlenbilder lagen bei 0,13 bis 0,25). */
export const AUFHELL_GRENZE = 0.26;
/** Größte Aufhellung (Faktor für `brightness()`), erreicht bei völlig schwarzem Bild. */
export const AUFHELL_MAX = 1.45;

/**
 * Helligkeitsfaktor aus der mittleren Leuchtdichte `l` (0…1) einer Kulisse: 1 ab `AUFHELL_GRENZE`, darunter linear bis
 * `AUFHELL_MAX`. Nur für sehr dunkle Bilder; hellere bleiben unverändert (Lesbarkeit der Figuren wird dort über die
 * Abdunkelung nach unten gesichert).
 */
export function aufhellFaktorAusMessung(l) {
  const wert = Number.isFinite(l) ? Math.min(1, Math.max(0, l)) : 1;
  if (wert >= AUFHELL_GRENZE) return 1;
  return 1 + ((AUFHELL_GRENZE - wert) / AUFHELL_GRENZE) * (AUFHELL_MAX - 1);
}

/**
 * Kontrastverhältnis zweier relativer Leuchtdichten (WCAG-Formel).
 * Dient der Abnahme „Spielfläche vor hellem/dunklem Hintergrund“.
 */
export function kontrastVerhaeltnis(hell, dunkel) {
  const a = Math.min(1, Math.max(0.0001, Number.isFinite(hell) ? hell : 0));
  const b = Math.min(1, Math.max(0.0001, Number.isFinite(dunkel) ? dunkel : 0));
  const hoch = Math.max(a, b);
  const tief = Math.min(a, b);
  return (hoch + 0.05) / (tief + 0.05);
}

/** Mindestkontrast der Figurensilhouette zur Kulisse (Großflächen, keine Schrift). */
export const KONTRAST_MIN = 3;

/**
 * Prüft die Lesbarkeit der Spielfläche vor einer Kulisse.
 * @param {{figur:number, hintergrund:number}} luminanz relative Leuchtdichten 0…1
 * @returns {{kontrast:number, ausreichend:boolean}}
 */
export function lesbarkeitsHinweis({ figur, hintergrund }) {
  const kontrast = kontrastVerhaeltnis(figur, hintergrund);
  return { kontrast, ausreichend: kontrast >= KONTRAST_MIN };
}

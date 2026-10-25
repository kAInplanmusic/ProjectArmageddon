/**
 * Gesteinsstoffe: WAS im Gelände steckt und wie es auf Schaden reagiert.
 *
 * ## Abgrenzung zu `terrain.js`
 *
 * `terrain.js` beschreibt die Bodenphysik (Eis rutscht, Gummi federt) in groben
 * 64-px-Zonen. Dieser Katalog beschreibt die Zerstörbarkeit: Jede Zelle (8 × 8 px) der
 * Stoffkarte (`shared/stoffkarte.js`) trägt eine Kennung (ein Byte) aus diesem Katalog.
 * Die beiden Felder sind unabhängig.
 *
 * ## Zwei Achsen der Wirkung
 *
 *   - Härte (`haerte`): bestimmt, wie groß und tief ein Krater wird.
 *     weich, normal, hart, sehr_hart, unzerstoerbar.
 *   - Anfälligkeit: Schadensart der Waffe (`wirkgruppe`) mal Stoff. Feuer frisst Holz und
 *     Pilz, schmilzt Eis und Schnee; Wasser löscht; Säure ätzt Fels; Metall und
 *     Grundgestein halten alles.
 *
 * Dazu kommt der Zerstörungscharakter der Waffe (`charakterDerWaffe`): Der Bohrer durchbohrt
 * Hartes nicht, ein Erdbeben (Ultimate) wirkt nur auf Weiches.
 *
 * Die Zahlen sind Verhältniswerte zum Krater, den die Waffe ohne Stoff gestanzt hätte
 * (Fassung 4). Sie greifen NUR ab Zerstörungsfassung 5 (`config/zerstoerung.js`) und nur
 * auf Karten mit Stoffkarte (Geländefassung 2, `config/gelaende.js`). Der Katalog
 * zieht keine Zufallszahl.
 *
 * Kennungen sind Teil des Wirkungsvertrags (Byte in der Karte): NUR ANHÄNGEN.
 *
 * @module config/stoffe
 */

export const STOFF = Object.freeze({
  ERDE: 0,
  SAND: 1,
  SCHNEE: 2,
  PILZ: 3,
  HOLZ: 4,
  FELS: 5,
  OBSIDIAN: 6,
  EIS: 7,
  KRISTALL: 8,
  METALL: 9,
  GRUNDGESTEIN: 10,
  BASALT: 11,
  ASCHE: 12,
  KORALLE: 13,
  BETON: 14,
  GLAS: 15,
  REGOLITH: 16,
  MAGIEKRISTALL: 17,
});

export const HAERTEN = Object.freeze(['weich', 'normal', 'hart', 'sehr_hart', 'unzerstoerbar']);

/**
 * Wirkgruppen der Schadensarten. Die Namen stammen aus `engine/damageTypes.js`
 * (nur gelesen); alles, was hier nicht steht, wirkt als `wucht`.
 */
export const WIRKGRUPPEN = Object.freeze(['wucht', 'hitze', 'kaelte', 'aetz', 'strom', 'nass']);

const GRUPPE_VON_ART = Object.freeze({
  fire: 'hitze', dragon: 'hitze', energy: 'hitze', plasma: 'hitze',
  ice: 'kaelte',
  acid: 'aetz', poison: 'aetz',
  electric: 'strom', magnetic: 'strom',
  water: 'nass',
});

/** Wirkgruppe einer Schadensart (Name). Unbekanntes und `null` wirken als Wucht. */
export function wirkgruppe(damageType) {
  return GRUPPE_VON_ART[damageType] ?? 'wucht';
}

/*
 * Der Katalog. Felder:
 *   radius/tiefe   Grundfaktor auf Radius und Tiefe des Kraters
 *   bruechig       0 = nein; sonst Zahl der Nebenbrüche (Splitterlöcher) bei Wucht
 *   brennbar       Feuer frisst weiter (Radius wächst, Brandspur), Wasser löscht
 *   schmelzbar     Hitze schmilzt (großer Radius)
 *   anfaellig      Faktor auf den Radius je Wirkgruppe (fehlt = 1)
 *   farbe, muster  Darstellung (Client): Grundton und Struktur
 */
export const STOFFE = Object.freeze([
  Object.freeze({
    id: 0, key: 'erde', label: 'Erde', haerte: 'normal', radius: 1, tiefe: 1, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ nass: 1.1 }), farbe: Object.freeze([120, 92, 64]), muster: 'koernig',
  }),
  Object.freeze({
    id: 1, key: 'sand', label: 'Sand', haerte: 'weich', radius: 1.25, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ nass: 0.85, hitze: 0.9 }), farbe: Object.freeze([214, 190, 140]), muster: 'koernig',
  }),
  Object.freeze({
    id: 2, key: 'schnee', label: 'Schnee', haerte: 'weich', radius: 1.35, tiefe: 1.15, bruechig: 0, brennbar: false, schmelzbar: true,
    anfaellig: Object.freeze({ hitze: 1.4, kaelte: 0.9 }), farbe: Object.freeze([232, 240, 248]), muster: 'poroes',
  }),
  Object.freeze({
    id: 3, key: 'pilz', label: 'Pilzgewebe', haerte: 'weich', radius: 1.2, tiefe: 1.1, bruechig: 0, brennbar: true, schmelzbar: false,
    anfaellig: Object.freeze({ hitze: 1.25, aetz: 1.15 }), farbe: Object.freeze([150, 96, 120]), muster: 'fasern',
  }),
  Object.freeze({
    id: 4, key: 'holz', label: 'Holz', haerte: 'normal', radius: 0.95, tiefe: 0.9, bruechig: 0, brennbar: true, schmelzbar: false,
    anfaellig: Object.freeze({ hitze: 1.25, nass: 0.9 }), farbe: Object.freeze([128, 88, 52]), muster: 'fasern',
  }),
  Object.freeze({
    id: 5, key: 'fels', label: 'Fels', haerte: 'hart', radius: 0.7, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ aetz: 1.2, kaelte: 0.95 }), farbe: Object.freeze([112, 112, 118]), muster: 'schichten',
  }),
  Object.freeze({
    id: 6, key: 'obsidian', label: 'Obsidian', haerte: 'sehr_hart', radius: 0.4, tiefe: 0.35, bruechig: 1, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ strom: 0.9 }), farbe: Object.freeze([34, 30, 44]), muster: 'facetten',
  }),
  Object.freeze({
    id: 7, key: 'eis', label: 'Eis', haerte: 'normal', radius: 1, tiefe: 0.85, bruechig: 3, brennbar: false, schmelzbar: true,
    anfaellig: Object.freeze({ hitze: 1.5, kaelte: 0.8 }), farbe: Object.freeze([168, 214, 236]), muster: 'facetten',
  }),
  Object.freeze({
    id: 8, key: 'kristall', label: 'Kristall', haerte: 'hart', radius: 0.8, tiefe: 0.6, bruechig: 4, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ strom: 1.15, aetz: 0.9 }), farbe: Object.freeze([150, 120, 220]), muster: 'facetten',
  }),
  Object.freeze({
    id: 9, key: 'metall', label: 'Metallplatte', haerte: 'unzerstoerbar', radius: 0, tiefe: 0, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({}), farbe: Object.freeze([96, 104, 116]), muster: 'platten',
  }),
  Object.freeze({
    id: 10, key: 'grundgestein', label: 'Grundgestein', haerte: 'unzerstoerbar', radius: 0, tiefe: 0, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({}), farbe: Object.freeze([54, 54, 62]), muster: 'schichten',
  }),
  Object.freeze({
    id: 11, key: 'basalt', label: 'Basalt', haerte: 'hart', radius: 0.65, tiefe: 0.5, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ hitze: 0.9, aetz: 1.1 }), farbe: Object.freeze([62, 58, 66]), muster: 'schichten',
  }),
  Object.freeze({
    id: 12, key: 'asche', label: 'Asche', haerte: 'weich', radius: 1.3, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ nass: 0.8 }), farbe: Object.freeze([96, 90, 92]), muster: 'poroes',
  }),
  Object.freeze({
    id: 13, key: 'koralle', label: 'Koralle', haerte: 'normal', radius: 0.95, tiefe: 0.8, bruechig: 2, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ aetz: 1.3 }), farbe: Object.freeze([226, 128, 124]), muster: 'poroes',
  }),
  Object.freeze({
    id: 14, key: 'beton', label: 'Beton', haerte: 'hart', radius: 0.72, tiefe: 0.55, bruechig: 2, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ aetz: 1.15, hitze: 0.95 }), farbe: Object.freeze([142, 142, 138]), muster: 'platten',
  }),
  Object.freeze({
    id: 15, key: 'glas', label: 'Glas', haerte: 'normal', radius: 1.05, tiefe: 0.8, bruechig: 5, brennbar: false, schmelzbar: true,
    anfaellig: Object.freeze({ hitze: 1.2, kaelte: 1.1, strom: 0.9 }), farbe: Object.freeze([176, 220, 228]), muster: 'facetten',
  }),
  Object.freeze({
    id: 16, key: 'regolith', label: 'Regolith', haerte: 'weich', radius: 1.3, tiefe: 1.1, bruechig: 0, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ hitze: 0.9, nass: 0.9 }), farbe: Object.freeze([128, 122, 134]), muster: 'koernig',
  }),
  Object.freeze({
    id: 17, key: 'magiekristall', label: 'Magiekristall', haerte: 'hart', radius: 0.75, tiefe: 0.55, bruechig: 4, brennbar: false, schmelzbar: false,
    anfaellig: Object.freeze({ strom: 1.3, hitze: 1.1, aetz: 0.85 }), farbe: Object.freeze([190, 120, 236]), muster: 'facetten',
  }),
]);

/** Stoff nach Kennung; Unbekanntes fällt auf Erde (die Vorgabe) zurück. */
export function stoffById(id) {
  return STOFFE[id] ?? STOFFE[0];
}

/** Stoff nach Name (`key`) oder `null`. */
export function stoffByKey(key) {
  return STOFFE.find(s => s.key === key) ?? null;
}

/**
 * Wirkung des Zerstörungscharakters je Härte: [Radiusfaktor, Tiefenfaktor].
 * Unzerstörbare Stoffe haben keine Zeile (Faktor 0).
 */
export const CHARAKTER_FAKTOR = Object.freeze({
  sprengung: Object.freeze({ weich: [1.2, 1.1], normal: [1, 1], hart: [0.75, 0.5], sehr_hart: [0.4, 0.35] }),
  splitter: Object.freeze({ weich: [1.1, 1.05], normal: [1, 1], hart: [0.7, 0.5], sehr_hart: [0.35, 0.3] }),
  brand: Object.freeze({ weich: [1.15, 1.05], normal: [1, 1], hart: [0.75, 0.5], sehr_hart: [0.4, 0.35] }),
  durchschlag: Object.freeze({ weich: [1.1, 1.2], normal: [1, 1], hart: [0.35, 0.3], sehr_hart: [0, 0] }),
  beben: Object.freeze({ weich: [1.15, 1.2], normal: [0.9, 0.9], hart: [0.45, 0.4], sehr_hart: [0.2, 0.2] }),
});

/**
 * Feintuning der Tabelle (Zerstörungsfassung 7, `config/zerstoerung.js`): Nur diese Werte weichen von der
 * Fassung 6 ab. `radius` ersetzt den Grundfaktor des Stoffes, `anfaellig` ergänzt/ersetzt je Wirkgruppe.
 * Begründung (gemessen mit `stoffWirkung` über den Waffenkatalog, Krater 0,6 × Sprengradius, Median
 * 29 px): Obsidian stanzte bei 0,16 nur 4,6 px große Löcher, ein Faktor 3 unter Fels; die übrigen Werte
 * schließen Lücken der Tabelle, in denen ein Stoff auf eine Schadensart gar nicht reagierte.
 */
export const STOFF_FEIN = Object.freeze({
  obsidian: Object.freeze({ radius: 0.55 }),
  schnee: Object.freeze({ anfaellig: Object.freeze({ nass: 0.9 }) }),
  holz: Object.freeze({ anfaellig: Object.freeze({ aetz: 1.1 }) }),
  kristall: Object.freeze({ anfaellig: Object.freeze({ kaelte: 1.1 }) }),
  erde: Object.freeze({ anfaellig: Object.freeze({ hitze: 0.95 }) }),
});

/** Ab dieser Härte wirkt ein Erdbeben nicht mehr (Setzrutsch nur auf weichem und normalem Boden). */
const BEBEN_NUR_BIS_HAERTE = 'normal';

/** Kleinste Radiusgröße (px), die noch als Krater gestanzt wird. */
export const MIN_KRATER_RADIUS = 2;

/**
 * Die Wirkung eines Einschlags auf einen Stoff.
 *
 * @param {number} stoffId - dominanter Stoff am Einschlag
 * @param {string} charakter - `sprengung|splitter|brand|durchschlag|beben`
 * @param {string} gruppe - Wirkgruppe (`wirkgruppe(damageType)`)
 * @param {boolean} [fein] - Zerstörungsfassung 7: feingetunte Tabelle (`STOFF_FEIN`)
 * @returns {{radius:number, tiefe:number, unzerstoerbar:boolean, reaktion:string|null, nebenbrueche:number}}
 *   `radius` und `tiefe` sind Faktoren auf den Krater der Fassung 4.
 */
export function stoffWirkung(stoffId, charakter = 'sprengung', gruppe = 'wucht', fein = false) {
  let stoff = stoffById(stoffId);
  const aenderung = fein ? STOFF_FEIN[stoff.key] : null;
  if (aenderung) stoff = { ...stoff, ...aenderung, anfaellig: { ...stoff.anfaellig, ...aenderung.anfaellig } };
  if (stoff.haerte === 'unzerstoerbar') {
    return { radius: 0, tiefe: 0, unzerstoerbar: true, reaktion: 'haelt', nebenbrueche: 0 };
  }
  const tabelle = CHARAKTER_FAKTOR[charakter] ?? CHARAKTER_FAKTOR.sprengung;
  const [rc, tc] = tabelle[stoff.haerte] ?? [1, 1];
  let radius = stoff.radius * rc;
  const tiefe = stoff.tiefe * tc;
  let reaktion = null;
  let nebenbrueche = 0;

  const anfaellig = stoff.anfaellig[gruppe];
  if (anfaellig !== undefined) radius *= anfaellig;

  if (gruppe === 'hitze') {
    if (stoff.brennbar) reaktion = 'brennt';
    else if (stoff.schmelzbar) reaktion = 'schmilzt';
  } else if (gruppe === 'nass' && stoff.brennbar) {
    reaktion = 'loescht';
    radius *= 0.9;
  } else if (gruppe === 'aetz' && stoff.haerte !== 'weich' && anfaellig > 1) {
    reaktion = 'aetzt';
  } else if (gruppe === 'strom' && anfaellig !== undefined && anfaellig > 1) {
    reaktion = 'laedt';
  }
  if (stoff.bruechig > 0 && (gruppe === 'wucht' || charakter === 'splitter' || charakter === 'sprengung')) {
    nebenbrueche = stoff.bruechig;
    if (reaktion === null) reaktion = 'splittert';
  }
  if (radius <= 0) return { radius: 0, tiefe: 0, unzerstoerbar: false, reaktion: 'haelt', nebenbrueche: 0 };
  return { radius, tiefe, unzerstoerbar: false, reaktion, nebenbrueche };
}

/** Darf ein Erdbeben (Setzrutsch) auf diesem Stoff wirken? Nur weich und normal. */
export function bebenWirkt(stoffId) {
  const h = HAERTEN.indexOf(stoffById(stoffId).haerte);
  return h <= HAERTEN.indexOf(BEBEN_NUR_BIS_HAERTE);
}

/** Ist der Stoff unzerstörbar (Krater lassen ihn stehen)? */
export function unzerstoerbar(stoffId) {
  return stoffById(stoffId).haerte === 'unzerstoerbar';
}

export default { STOFF, STOFFE, STOFF_FEIN, HAERTEN, WIRKGRUPPEN, CHARAKTER_FAKTOR, stoffById, stoffWirkung, wirkgruppe, bebenWirkt, unzerstoerbar };

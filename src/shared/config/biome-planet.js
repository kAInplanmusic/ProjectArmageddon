/**
 * Das Planeten-Biom (Geländefassung 4, `config/gelaende.js`): eine Scheibenwelt im All.
 *
 * ## Was es ist
 *
 * Statt eines Höhenzugs über die ganze Breite steht EIN Planet in der Karte: eine flache Ellipse
 * (Scheibe) aus Gestein mit Kraterkranz, Terrassen an den Flanken und Tunnelbögen im Inneren,
 * umgeben von der Leere (Wasserart `void`, tödlich). Die Geometrie bleibt im bestehenden
 * 2D-Zellraster und der Kollisionsmaske: Es gibt keine Kugelschwerkraft, das Kugelgefühl entsteht
 * aus der gewölbten Silhouette, den Rundumkratern und der Kulisse (Planetenkugeln vor Sternen).
 *
 * Die Kennung `planet` ist die WAHL (Menü, Zufall): Sie löst sich aus dem Seed zu einer der sechs
 * Arten (`planet_eis` … `planet_stein`) auf (`gelaende.waehleSonderbiom`). Erst die Art hat Rezept,
 * Boden, Kugel und Formwerte — so greifen Stoffkarte, Kulisse und Pflanzen ohne Sonderfall über
 * dieselben Tabellen wie bei jedem anderen Sonderbiom.
 *
 * Alle Konstruktionswerte stehen HIER; `terrainPlanet.js` rechnet nur damit, der Zufall kommt aus
 * dem Seed-Zweig des Geländes. Ein Wert in `PLANET_FORM` ist ein Anteil an der Karte (0 bis 1)
 * oder eine Pixelzahl, wie am Namen und Kommentar erkennbar.
 *
 * @module config/biome-planet
 */

/** Die sechs Arten in fester Reihenfolge (die Ziehung aus dem Seed indiziert sie). */
export const PLANET_ARTEN = Object.freeze(['eis', 'lava', 'sand', 'dschungel', 'rost', 'stein']);

/** Kennungen der Arten als Sonderbiom. */
export const PLANET_BIOM_IDS = Object.freeze(PLANET_ARTEN.map(a => `planet_${a}`));

/** Die Wahl „Planet": der Seed entscheidet die Art. */
export const PLANET_WAHL = 'planet';

/** Ist `id` eine Planetenart (als Sonderbiom)? */
export function istPlanetBiom(id) {
  return typeof id === 'string' && PLANET_BIOM_IDS.includes(id);
}

/** Art (`eis` …) aus der Sonderbiom-Kennung, sonst `null`. */
export function planetArt(id) {
  return istPlanetBiom(id) ? id.slice('planet_'.length) : null;
}

/**
 * Grundform des Planeten. Anteile beziehen sich auf Kartenbreite/-höhe, `px` sind Pixel.
 *
 *  - Körper: Ellipse um (`mitteX`·B, `mitteY`·H) mit den Halbachsen `halbBreite`·B und `halbHoehe`·H.
 *    Die Breite deckt die Kistenplätze (8 bis 92 % der Breite) ab.
 *  - `rand`: Rauschen der Oberkante (Amplitude in px, Wellenlänge in px).
 *  - `krater`: Anzahl und Radius (px) zufällig im Bereich; `tiefe` (Anteil am Radius), `kranz*` (Breite
 *    und Höhe des Walls als Anteil am Radius); `u` = größte Entfernung von der Mitte in Halbbreiten;
 *    `abstand` = Mindestlücke zwischen Kratern (px).
 *  - `ebenen`: Terrassen an den Flanken ab `ab` Halbbreiten, Stufenhöhe `stufe` (px), `rampe` = Anteil
 *    der Stufe, der Rampe ist (befahrbar), `staerke` 0 bis 1.
 *  - `tunnel`: Bögen (Anzahl), Radius in Halbachsen, Dicke (px), Öffnungswinkel in Anteilen von π,
 *    `dach` = Mindestdicke der Decke (px). `schacht`: Breite (px) und Anzahl der Schächte, die von einem
 *    Kraterboden zum Tunnel führen.
 *  - `wasser`: Abstand (px) der Leere-Oberfläche unter dem Planeten.
 */
export const PLANET_FORM = Object.freeze({
  mitteX: 0.5,
  mitteY: 0.6,
  halbBreite: 0.475,
  halbHoehe: 0.34,
  rand: Object.freeze({ amplitude: 22, welle: 240 }),
  krater: Object.freeze({ anzahl: [4, 6], radius: [58, 116], tiefe: 0.5, kranzBreite: 0.3, kranzHoehe: 0.26, u: 0.78, abstand: 36 }),
  ebenen: Object.freeze({ ab: 0.4, stufe: 30, rampe: 0.5, staerke: 0 }),
  tunnel: Object.freeze({ boegen: [1, 2], radius: [0.55, 0.78], dicke: [40, 56], oeffnung: [0.16, 0.34], dach: 40 }),
  schacht: Object.freeze({ breite: 56, anzahl: [0, 2] }),
  wasser: Object.freeze({ abstand: 24 }),
});

/** Kurzform für eine Bodenvariante. */
const boden = (surface, deep) => ({ surface, deep });

/** Gemeinsame Felder aller Arten (Kulisse: Kosmos-Himmel mit Planetenkugeln). */
const GEMEINSAM = {
  mapPreset: 'islands',
  sky: ['kosmos_planet', 'kosmos_planet_blau', 'kosmos_planet_rot'],
  water: ['void'],
  landmarks: ['none'],
  ambient: ['stars', 'nebula_glow', 'glimmer'],
  form: {},
};

/**
 * Die sechs Arten. `kugel` benennt die Planetenkugel der Kulisse (`client/planetenKulisse.js`),
 * `form` überschreibt Teile von `PLANET_FORM` (je Gruppe zusammengeführt).
 */
export const PLANET_BIOME = Object.freeze({
  planet_eis: {
    ...GEMEINSAM,
    label: 'Planet: Eis',
    beschreibung: 'Eisplanet: Schnee und Eis über Fels, Kristalladern, wenige tiefe Krater und lange Tunnelbögen.',
    fraktion: 'shinobi',
    ground: boden([186, 212, 232], [66, 94, 128]),
    groundVarianten: [boden([186, 212, 232], [66, 94, 128]), boden([208, 224, 240], [84, 108, 140])],
    kugel: 'eis',
    planetForm: { krater: { anzahl: [3, 5], tiefe: 0.6 }, tunnel: { boegen: [2, 2] } },
    stoffe: {
      deck: [['schnee', 16], ['eis', 54]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.08, ab: 40, groesse: 5 }, { stoff: 'obsidian', dichte: 0.03, ab: 70 }],
    },
    pflanzen: { dichte: 0.1, arten: ['kristall'] },
  },
  planet_lava: {
    ...GEMEINSAM,
    label: 'Planet: Lava',
    beschreibung: 'Lavaplanet: Basalt und Asche, Obsidianadern, viele tiefe Krater mit steilen Wällen.',
    fraktion: 'beasts',
    ground: boden([82, 56, 50], [28, 18, 20]),
    groundVarianten: [boden([82, 56, 50], [28, 18, 20]), boden([66, 60, 66], [24, 22, 28])],
    kugel: 'lava',
    planetForm: { krater: { anzahl: [5, 7], tiefe: 0.62, kranzHoehe: 0.34 } },
    stoffe: {
      deck: [['asche', 12], ['basalt', 70]], kern: 'basalt',
      adern: [{ stoff: 'obsidian', dichte: 0.08, ab: 50, groesse: 4 }, { stoff: 'fels', dichte: 0.08, ab: 36 }],
    },
    pflanzen: { dichte: 0.1, arten: ['knochen'] },
  },
  planet_sand: {
    ...GEMEINSAM,
    label: 'Planet: Wüste',
    beschreibung: 'Wüstenplanet: weicher Sand in langen Dünen, flache Krater, Felsrippen darunter.',
    fraktion: 'pirates',
    ground: boden([214, 184, 128], [124, 92, 58]),
    groundVarianten: [boden([214, 184, 128], [124, 92, 58]), boden([196, 150, 104], [112, 76, 50])],
    kugel: 'sand',
    planetForm: { rand: { amplitude: 54, welle: 420 }, krater: { anzahl: [2, 4], tiefe: 0.34, kranzHoehe: 0.16 }, tunnel: { boegen: [1, 1] } },
    stoffe: {
      deck: [['sand', 46]], kern: 'fels',
      adern: [{ stoff: 'fels', dichte: 0.1, ab: 40, groesse: 5 }, { stoff: 'kristall', dichte: 0.03, ab: 70 }],
    },
    pflanzen: { dichte: 0.2, arten: ['kaktus', 'knochen'] },
  },
  planet_dschungel: {
    ...GEMEINSAM,
    label: 'Planet: Dschungel',
    beschreibung: 'Dschungelplanet: Moos, Pilzgewebe und Holz über Erde, sanfte Krater, dichter Bewuchs.',
    fraktion: 'undead',
    ground: boden([92, 140, 86], [34, 58, 40]),
    groundVarianten: [boden([92, 140, 86], [34, 58, 40]), boden([108, 128, 80], [44, 56, 36])],
    kugel: 'gruen',
    planetForm: { rand: { amplitude: 34, welle: 180 }, krater: { anzahl: [3, 5], tiefe: 0.4 } },
    stoffe: {
      deck: [['erde', 24]], kern: 'erde',
      adern: [{ stoff: 'holz', dichte: 0.08, ab: 8, groesse: 4 }, { stoff: 'pilz', dichte: 0.12, ab: 20, groesse: 5 }, { stoff: 'fels', dichte: 0.08, ab: 60 }],
    },
    pflanzen: { dichte: 1, arten: ['farn', 'pilz', 'busch'] },
  },
  planet_rost: {
    ...GEMEINSAM,
    label: 'Planet: Rost',
    beschreibung: 'Rostplanet: Regolith und Metallplatten, Beton-Nester, breite Terrassen an den Flanken.',
    fraktion: 'machina',
    ground: boden([160, 98, 66], [64, 36, 28]),
    groundVarianten: [boden([160, 98, 66], [64, 36, 28]), boden([138, 90, 74], [56, 36, 32])],
    kugel: 'rost',
    planetForm: { ebenen: { ab: 0.3, stufe: 34, rampe: 0.45, staerke: 1 }, krater: { anzahl: [3, 5] } },
    stoffe: {
      deck: [['regolith', 16]], kern: 'fels',
      adern: [{ stoff: 'metall', dichte: 0.08, ab: 14, groesse: 4 }, { stoff: 'beton', dichte: 0.1, ab: 24, groesse: 6 }],
      platten: { stoff: 'metall', abstand: 12, anteil: 0.14, ab: 26 },
    },
    pflanzen: { dichte: 0.12, arten: ['knochen', 'gras'] },
  },
  planet_stein: {
    ...GEMEINSAM,
    label: 'Planet: Stein',
    beschreibung: 'Steinplanet: nackter Fels mit Kristall- und Obsidianadern, viele Krater wie auf einem Mond.',
    fraktion: 'rodentia',
    ground: boden([128, 120, 110], [52, 48, 44]),
    groundVarianten: [boden([128, 120, 110], [52, 48, 44]), boden([112, 116, 124], [46, 48, 56])],
    kugel: 'stein',
    planetForm: { krater: { anzahl: [6, 9], radius: [46, 100], abstand: 24 } },
    stoffe: {
      deck: [['fels', 26]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.06, ab: 30, groesse: 5 }, { stoff: 'obsidian', dichte: 0.04, ab: 50 }],
    },
    pflanzen: { dichte: 0.1, arten: ['kristall'] },
  },
});

/**
 * Himmel der Kulisse: Kosmos mit Planetenkugeln (gezeichnet von `client/planetenKulisse.js`). Alle drei haben den
 * Himmelskörper `planet`; die Farben bestimmen den Verlauf unter der Szene und das Ambiente.
 */
export const PLANET_HIMMEL = Object.freeze([
  { id: 'kosmos_planet', label: 'Exoplanet im All', colors: ['#04040c', '#0a0a22', '#1a1038'], light: 0.35, celestial: 'planet', ambient: ['stars', 'nebula_glow'] },
  { id: 'kosmos_planet_blau', label: 'Exoplanet, blaue Sterne', colors: ['#02060e', '#06122c', '#10286a'], light: 0.4, celestial: 'planet', ambient: ['stars', 'glimmer'] },
  { id: 'kosmos_planet_rot', label: 'Exoplanet, roter Zwerg', colors: ['#0c0406', '#220a14', '#4a1424'], light: 0.4, celestial: 'planet', ambient: ['stars', 'nebula_glow'] },
]);

/**
 * Löst die Wahl `planet` zu einer Art auf (aus der Ziehung `t` in [0,1)).
 * @param {number} t
 * @returns {string} Kennung wie `planet_eis`
 */
export function planetArtAusZug(t) {
  return PLANET_BIOM_IDS[Math.min(PLANET_BIOM_IDS.length - 1, Math.floor((Number(t) || 0) * PLANET_BIOM_IDS.length))];
}

/**
 * Formwerte einer Art: `PLANET_FORM` mit den Überschreibungen der Art (je Gruppe zusammengeführt).
 * @param {string} biomId - `planet_*`
 */
export function planetFormFuer(biomId) {
  const art = PLANET_BIOME[biomId]?.planetForm ?? {};
  const form = { ...PLANET_FORM };
  for (const [k, v] of Object.entries(art)) form[k] = typeof v === 'object' && !Array.isArray(v) ? { ...PLANET_FORM[k], ...v } : v;
  return form;
}

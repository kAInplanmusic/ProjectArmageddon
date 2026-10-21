/**
 * Die neun Sonderbiome (Geländefassung 2, `config/gelaende.js`).
 *
 * ## Was ein Sonderbiom ist
 *
 * Die alten Biome FOLGEN der Karte (`biomwahl.js`: viel Wasser wird Überschwemmung). Ein
 * Sonderbiom ist umgekehrt: Der Seed (oder die Wahl im Menü) bestimmt das Biom ZUERST, und
 * seine Form (`form`) lenkt die Achsen des Kartencharakters in einen Teilbereich. Eine
 * Vulkankarte ist deshalb steil, löchrig und voller Lava, ein Schwebinsel-Archipel ist
 * inselig und dünn. Die Karte ist trotzdem eine Funktion des Seeds.
 *
 * Jeder Eintrag hat dieselben Felder wie ein Eintrag in `SCENERY_BIOMES` (Himmel, Wasser,
 * Landmarken, Ambiente, Boden) und dazu:
 *   - `beschreibung`: ein Satz für Menü und Hilfe
 *   - `fraktion`: die Fraktion, an die das Biom thematisch angelehnt ist
 *   - `form`: Teilbereiche der Charakterachsen (`CHARAKTER_ACHSEN`), siehe `formeCharakter`
 *   - `stoffe`: Rezept der Stoffkarte (`shared/stoffkarte.js`)
 *   - `pflanzen`: Dichte und Arten der Deko (`client/pflanzen.js`)
 *
 * Die Wasserarten mit `hazard` (Lava, Säure) sind Beschreibung und Optik: Die Engine
 * ertränkt in jedem Wasser gleich (`config/water.js`).
 *
 * @module config/biome-neu
 */

import { PLANET_BIOME, PLANET_HIMMEL, PLANET_WAHL } from './biome-planet.js';

export const NEUE_HIMMEL = Object.freeze([
  {
    id: 'ember_sky', label: 'Glutnacht', colors: ['#1a0a0a', '#5a1a0e', '#c0521a'], light: 0.5, celestial: 'dim_sun', ambient: ['embers', 'ash', 'haze'],
  },
  {
    id: 'crystal_glow', label: 'Kristallschimmer', colors: ['#0a0c24', '#2a2466', '#6a58b8'], light: 0.4, celestial: 'stars', ambient: ['glimmer', 'nebula_glow'],
  },
  {
    id: 'spore_dusk', label: 'Sporendämmerung', colors: ['#1a1030', '#4a2a5c', '#8a5a78'], light: 0.45, celestial: 'moon', ambient: ['spores', 'fog_banks'],
  },
  {
    id: 'abyss', label: 'Tiefsee', colors: ['#04182c', '#0a3c5e', '#1a7a8a'], light: 0.5, celestial: null, ambient: ['bubbles', 'haze'],
  },
  ...PLANET_HIMMEL,
]);

export const NEUE_WASSER = Object.freeze([
  {
    id: 'acid',
    label: 'Säure',
    body: [60, 110, 10],
    shallow: [200, 240, 40],
    alpha: 0.9,
    surface: 'bubbles',
    hazard: { kind: 'damage', perStep: 7, label: 'Säure' },
  },
]);

export const NEUE_AMBIENTE = Object.freeze({
  spores: { count: [40, 80], scale: [0.4, 1], alpha: 0.7, drift: 0.02, band: [0.3, 1] },
  glimmer: { count: [30, 70], scale: [0.3, 0.9], alpha: 0.8, drift: 0.01, band: [0.1, 0.8] },
});

export const NEUE_LANDMARKEN = Object.freeze([
  'volcano', 'floating_isles', 'mushroom_grove', 'scrap_towers', 'glacier_wall', 'kelp_forest',
]);

import { THEMEN_BIOME } from './biome-themen.js';

/** Kurzform für eine Bodenvariante. */
const boden = (surface, deep) => ({ surface, deep });

const BIOME_FASSUNG_2 = Object.freeze({
  vulkan: {
    label: 'Vulkan & Lavafeld',
    beschreibung: 'Schwarzer Basalt, Glut in der Luft und Lava in den Senken.',
    fraktion: 'beasts',
    mapPreset: 'mountains',
    sky: ['ember_sky', 'ash_storm', 'dusk', 'thunderstorm'],
    water: ['lava'],
    landmarks: ['volcano', 'mountain_ridge', 'rock_arch', 'cliff'],
    ambient: ['embers', 'ash', 'haze', 'lightning', 'clouds_storm'],
    ground: boden([78, 56, 52], [28, 20, 22]),
    groundVarianten: [boden([78, 56, 52], [28, 20, 22]), boden([62, 60, 66], [26, 24, 30]), boden([110, 70, 54], [44, 26, 22])],
    form: { steilheit: [0.44, 0.58], hoehlung: [0.06, 0.2], wasser: [0.16, 0.3], zerklueftung: [1.1, 1.8], landanteil: [0.32, 0.48], kessel: [0.5, 1] },
    stoffe: {
      deck: [['asche', 16], ['basalt', 80]], kern: 'basalt',
      adern: [{ stoff: 'obsidian', dichte: 0.07, ab: 56 }, { stoff: 'fels', dichte: 0.1, ab: 40 }],
    },
    pflanzen: { dichte: 0.25, arten: ['knochen', 'gras'] },
  },
  kristallhoehle: {
    label: 'Kristallhöhlen',
    beschreibung: 'Tiefe Gänge, in denen Kristalladern leuchten und splittern.',
    fraktion: 'pixel',
    mapPreset: 'caverns',
    sky: ['crystal_glow', 'moonlit_night', 'fog', 'plasma_storm'],
    water: ['shallow_lake', 'meltwater', 'void'],
    landmarks: ['crystal_spires', 'rock_arch', 'none'],
    ambient: ['glimmer', 'fog_banks', 'fireflies', 'haze', 'bubbles'],
    ground: boden([116, 132, 182], [38, 44, 80]),
    groundVarianten: [boden([116, 132, 182], [38, 44, 80]), boden([104, 150, 170], [34, 58, 76]), boden([150, 120, 190], [54, 40, 84])],
    form: { hoehlung: [0.13, 0.22], steilheit: [0.34, 0.52], wasser: [0, 0.14], landanteil: [0.42, 0.55], zerklueftung: [1, 1.6], kessel: [0.3, 0.9] },
    stoffe: {
      deck: [['fels', 20]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.2, ab: 12, groesse: 6 }, { stoff: 'obsidian', dichte: 0.04, ab: 60 }],
    },
    pflanzen: { dichte: 0.55, arten: ['kristall', 'kristall', 'pilz'] },
  },
  dschungel: {
    label: 'Dschungel & Sumpf',
    beschreibung: 'Feuchter Urwald mit Wurzelwerk, Schilf und trübem Wasser.',
    fraktion: 'undead',
    mapPreset: 'flooded',
    sky: ['dawn_mist', 'fog', 'overcast', 'toxic_noon', 'thunderstorm'],
    water: ['swamp_sludge', 'poison', 'shallow_lake'],
    landmarks: ['forest_line', 'ruins', 'palm_grove', 'rock_arch'],
    ambient: ['fireflies', 'fog_banks', 'rain', 'birds', 'haze', 'clouds_heavy'],
    ground: boden([76, 106, 56], [30, 44, 28]),
    groundVarianten: [boden([76, 106, 56], [30, 44, 28]), boden([92, 100, 54], [38, 42, 26]), boden([64, 96, 76], [26, 42, 36])],
    form: { wasser: [0.16, 0.3], landanteil: [0.32, 0.5], steilheit: [0.28, 0.42], hoehlung: [0, 0.08], zerklueftung: [1, 1.6], inseligkeit: [0.1, 0.3] },
    stoffe: {
      deck: [['erde', 36]], kern: 'erde',
      adern: [{ stoff: 'holz', dichte: 0.16, ab: 8, groesse: 5 }, { stoff: 'pilz', dichte: 0.07, ab: 16 }, { stoff: 'fels', dichte: 0.08, ab: 70 }],
    },
    pflanzen: { dichte: 1, arten: ['schilf', 'farn', 'palme', 'busch', 'pilz'] },
  },
  eiswueste: {
    label: 'Eiswüste & Gletscher',
    beschreibung: 'Weißes Ödland aus Firn und Gletschereis, darunter nackter Fels.',
    fraktion: 'datacult',
    mapPreset: 'mountains',
    sky: ['ice_haze', 'aurora', 'clear_day', 'overcast', 'moonlit_night'],
    water: ['frozen_lake', 'meltwater', 'deep_sea'],
    landmarks: ['ice_peaks', 'glacier_wall', 'mountain_ridge'],
    ambient: ['snow', 'stars', 'fog_banks', 'aurora_bands', 'clouds_few'],
    ground: boden([228, 238, 248], [140, 170, 198]),
    groundVarianten: [boden([228, 238, 248], [140, 170, 198]), boden([200, 224, 240], [112, 150, 184]), boden([236, 240, 244], [156, 168, 186])],
    form: { wasser: [0.05, 0.2], steilheit: [0.3, 0.5], landanteil: [0.4, 0.55], hoehlung: [0.04, 0.14], terrassen: [0.3, 0.85], inseligkeit: [0.05, 0.25] },
    stoffe: {
      deck: [['schnee', 20], ['eis', 70]], kern: 'fels',
      adern: [{ stoff: 'eis', dichte: 0.16, ab: 20, groesse: 8 }, { stoff: 'kristall', dichte: 0.03, ab: 80 }],
    },
    pflanzen: { dichte: 0.35, arten: ['kristall', 'busch'] },
  },
  duenen: {
    label: 'Wüsten-Dünen mit Ruinen',
    beschreibung: 'Weicher Sand, halb versunkene Mauern und Knochen im Wind.',
    fraktion: 'pirates',
    mapPreset: 'open',
    sky: ['clear_day', 'sandstorm', 'dusk', 'dawn_mist'],
    water: ['quicksand', 'tar_pit', 'shallow_lake'],
    landmarks: ['dunes', 'ruins', 'temple', 'mesa', 'cactus_field'],
    ambient: ['haze', 'birds', 'debris', 'clouds_few'],
    ground: boden([220, 190, 140], [150, 118, 80]),
    groundVarianten: [boden([220, 190, 140], [150, 118, 80]), boden([206, 160, 112], [132, 96, 62]), boden([226, 206, 166], [160, 138, 102])],
    form: { steilheit: [0.28, 0.4], wasser: [0, 0.08], landanteil: [0.46, 0.55], zerklueftung: [0.8, 1.2], hoehlung: [0, 0.06], terrassen: [0, 0.3] },
    stoffe: {
      deck: [['sand', 60]], kern: 'sand',
      adern: [{ stoff: 'fels', dichte: 0.14, ab: 24, groesse: 5 }, { stoff: 'holz', dichte: 0.04, ab: 10 }],
    },
    pflanzen: { dichte: 0.45, arten: ['kaktus', 'knochen', 'gras'] },
  },
  schrott: {
    label: 'Schrottplatz & zerstörte Stadt',
    beschreibung: 'Rost, Betonbrocken und Stahlplatten, die keine Granate durchschlägt.',
    fraktion: 'machina',
    mapPreset: 'warren',
    sky: ['smog', 'ash_storm', 'overcast', 'toxic_noon', 'dusk'],
    water: ['tar_pit', 'poison', 'swamp_sludge'],
    landmarks: ['city_skyline', 'ruins', 'scrap_towers'],
    ambient: ['ash', 'haze', 'debris', 'rain', 'embers'],
    ground: boden([112, 100, 90], [48, 44, 42]),
    groundVarianten: [boden([112, 100, 90], [48, 44, 42]), boden([126, 104, 80], [56, 46, 36]), boden([96, 100, 104], [40, 42, 46])],
    form: { terrassen: [0.4, 0.85], steilheit: [0.3, 0.5], zerklueftung: [1.2, 1.8], wasser: [0.04, 0.18], hoehlung: [0, 0.1], lippen: [0.3, 0.7] },
    stoffe: {
      deck: [['erde', 12]], kern: 'erde',
      adern: [{ stoff: 'metall', dichte: 0.09, ab: 10, groesse: 4 }, { stoff: 'holz', dichte: 0.1, ab: 8 }, { stoff: 'fels', dichte: 0.12, ab: 30 }],
      platten: { stoff: 'metall', abstand: 9, anteil: 0.3, ab: 20 },
    },
    pflanzen: { dichte: 0.2, arten: ['busch', 'gras', 'knochen'] },
  },
  schwebinseln: {
    label: 'Kristall-Archipel',
    beschreibung: 'Schwebende Inseln über der Leere; Kristallkerne halten sie zusammen.',
    fraktion: 'shinobi',
    mapPreset: 'islands',
    sky: ['aurora', 'galaxy', 'dusk', 'crystal_glow', 'clear_day'],
    water: ['void', 'deep_sea'],
    landmarks: ['floating_isles', 'crystal_spires', 'mountain_ridge'],
    ambient: ['clouds_few', 'glimmer', 'birds', 'stars'],
    ground: boden([152, 130, 214], [54, 46, 102]),
    groundVarianten: [boden([152, 130, 214], [54, 46, 102]), boden([120, 168, 200], [40, 66, 100]), boden([176, 150, 196], [70, 56, 92])],
    form: { inseligkeit: [0.34, 0.45], landanteil: [0.3, 0.44], wasser: [0, 0.1], zusammenhaengung: [0.35, 0.55], kessel: [0, 0.4], steilheit: [0.3, 0.5] },
    stoffe: {
      deck: [['erde', 14]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.3, ab: 18, groesse: 6 }, { stoff: 'obsidian', dichte: 0.05, ab: 50 }],
    },
    pflanzen: { dichte: 0.5, arten: ['kristall', 'busch', 'kristall'] },
  },
  riff: {
    label: 'Korallenriff & Tiefsee-Rand',
    beschreibung: 'Sand, Korallenbänke und Kelp am Rand der Tiefe.',
    fraktion: 'pirates',
    mapPreset: 'islands',
    sky: ['clear_day', 'dawn_mist', 'abyss', 'thunderstorm', 'dusk'],
    water: ['deep_sea', 'shallow_lake'],
    landmarks: ['coral_reef', 'kelp_forest', 'rock_arch', 'cliff'],
    ambient: ['bubbles', 'fog_banks', 'clouds_few', 'birds'],
    ground: boden([226, 204, 168], [138, 112, 90]),
    groundVarianten: [boden([226, 204, 168], [138, 112, 90]), boden([210, 170, 160], [124, 88, 92]), boden([176, 206, 196], [84, 120, 124])],
    form: { wasser: [0.2, 0.3], inseligkeit: [0.25, 0.45], landanteil: [0.3, 0.45], steilheit: [0.28, 0.42], hoehlung: [0.02, 0.12] },
    stoffe: {
      deck: [['sand', 16], ['koralle', 40]], kern: 'fels',
      adern: [{ stoff: 'koralle', dichte: 0.2, ab: 6, groesse: 5 }, { stoff: 'fels', dichte: 0.07, ab: 50 }],
    },
    pflanzen: { dichte: 0.8, arten: ['koralle', 'schilf', 'koralle'] },
  },
  pilzwald: {
    label: 'Pilzwald & Säuresumpf',
    beschreibung: 'Riesenpilze aus weichem Gewebe, das brennt, und Säure in den Senken.',
    fraktion: 'xeno',
    mapPreset: 'caverns',
    sky: ['spore_dusk', 'fog', 'dawn_mist', 'toxic_noon', 'moonlit_night'],
    water: ['acid', 'poison', 'swamp_sludge'],
    landmarks: ['mushroom_grove', 'forest_line', 'rock_arch'],
    ambient: ['spores', 'fireflies', 'fog_banks', 'haze'],
    ground: boden([134, 92, 130], [54, 36, 58]),
    groundVarianten: [boden([134, 92, 130], [54, 36, 58]), boden([96, 120, 84], [38, 52, 40]), boden([150, 110, 96], [62, 44, 42])],
    form: { hoehlung: [0.05, 0.15], wasser: [0.1, 0.26], steilheit: [0.28, 0.44], landanteil: [0.36, 0.5], zerklueftung: [1, 1.5] },
    stoffe: {
      deck: [['pilz', 28]], kern: 'erde',
      adern: [{ stoff: 'pilz', dichte: 0.3, ab: 28, groesse: 6 }, { stoff: 'holz', dichte: 0.08, ab: 12 }, { stoff: 'fels', dichte: 0.1, ab: 70 }],
    },
    pflanzen: { dichte: 1, arten: ['pilz', 'pilz', 'farn'] },
  },
});

/** Alle Sonderbiome: die neun der Fassung 2, die vier Themenbiome (`biome-themen.js`, ab Fassung 3) und die sechs Planetenarten (`biome-planet.js`, ab Fassung 4). */
export const NEUE_BIOME = Object.freeze({ ...BIOME_FASSUNG_2, ...THEMEN_BIOME, ...PLANET_BIOME });

/** Die Kennungen der neun Sonderbiome der Geländefassung 2 in fester Reihenfolge (Zug aus dem Seed, Menü). */
export const SONDERBIOM_IDS = Object.freeze(Object.keys(BIOME_FASSUNG_2));

/** Die Themenbiome (ab Geländefassung 3). */
export const THEMEN_BIOM_IDS = Object.freeze(Object.keys(THEMEN_BIOME));

/** Alle Kennungen ab Geländefassung 3: erst die neun, dann die Themenbiome (die Reihenfolge ist Teil des Seed-Zugs). */
export const SONDERBIOM_IDS_FASSUNG_3 = Object.freeze([...SONDERBIOM_IDS, ...THEMEN_BIOM_IDS]);

/**
 * Alle Wahlen ab Geländefassung 4: die dreizehn der Fassung 3 und `planet` (Planet, die Art zieht der Seed).
 * Die Planetenarten selbst (`PLANET_BIOM_IDS`) sind eigene Sonderbiome in `NEUE_BIOME`, aber keine eigenen Ziehplätze.
 * Die Reihenfolge ist Teil des Seed-Zugs.
 */
export const SONDERBIOM_IDS_FASSUNG_4 = Object.freeze([...SONDERBIOM_IDS_FASSUNG_3, PLANET_WAHL]);

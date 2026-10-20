/**
 * Die vier Themenbiome (Geländefassung 3, `config/gelaende.js`): Kosmos, Surreal, Fabrik, Burg.
 *
 * ## Was es davor gab
 *
 * Die Themen Galaxie, Abstrakt, Stadt und Fantasy existierten nur als KULISSE und Stoffrezept
 * der alten Biome `cosmos`, `abstract`, `urban`, `fantasy` (`config/scenery.js`): Sie wurden
 * gewählt, wenn die Karte zufällig dazu passte (`biomwahl.js`), und hatten keine eigene Form.
 * Hier bekommt jedes Thema ein Sonderbiom wie die neun aus `biome-neu.js`: eigene Form der Karte,
 * eigener Materialmix (auch die neuen Stoffe Beton, Glas, Regolith, Magiekristall), eigene Deko.
 * Himmel, Wasser, Landmarken und Ambiente sind Kennungen aus den bestehenden Listen, die Kulisse
 * (`backdrops.js`) und die Karte stimmen also überein.
 *
 * Die Eintragsfelder sind die von `NEUE_BIOME`. Die Themenbiome ziehen nur ab Geländefassung 3;
 * ältere Aufzeichnungen sehen sie nie (`SONDERBIOM_IDS` bleibt für Fassung 2 bei den neun).
 *
 * @module config/biome-themen
 */

/** Kurzform für eine Bodenvariante. */
const boden = (surface, deep) => ({ surface, deep });

export const THEMEN_BIOME = Object.freeze({
  kosmos: {
    label: 'Asteroidenfeld & Wracks',
    beschreibung: 'Treibende Gesteinsbrocken aus Regolith, Kristalladern und Metall-Wracks über der Leere.',
    fraktion: 'xeno',
    mapPreset: 'islands',
    sky: ['galaxy', 'aurora', 'plasma_storm', 'moonlit_night'],
    water: ['void', 'deep_sea'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'rock_arch', 'none'],
    ambient: ['stars', 'nebula_glow', 'debris', 'glimmer'],
    ground: boden([104, 98, 120], [32, 28, 46]),
    groundVarianten: [boden([104, 98, 120], [32, 28, 46]), boden([84, 80, 100], [26, 24, 38]), boden([128, 104, 112], [46, 34, 44])],
    form: { inseligkeit: [0.3, 0.42], landanteil: [0.32, 0.46], wasser: [0, 0.06], zusammenhaengung: [0.4, 0.6], kessel: [0.2, 0.7], steilheit: [0.38, 0.56], zerklueftung: [1.2, 1.8] },
    stoffe: {
      deck: [['regolith', 18]], kern: 'basalt',
      adern: [{ stoff: 'metall', dichte: 0.07, ab: 14, groesse: 3 }, { stoff: 'kristall', dichte: 0.14, ab: 12, groesse: 5 }, { stoff: 'obsidian', dichte: 0.04, ab: 50 }],
      platten: { stoff: 'metall', abstand: 11, anteil: 0.12, ab: 22 },
    },
    pflanzen: { dichte: 0.3, arten: ['kristall', 'knochen'] },
  },
  surreal: {
    label: 'Surreale Schwebewelt',
    beschreibung: 'Glas- und Kristallbrocken ohne erkennbaren Halt; Bläschen steigen nach oben, als gäbe es keine Schwerkraft.',
    fraktion: 'pixel',
    mapPreset: 'islands',
    sky: ['aurora', 'galaxy', 'plasma_storm', 'dusk', 'toxic_noon'],
    water: ['void', 'poison', 'tar_pit'],
    landmarks: ['floating_isles', 'crystal_spires', 'city_skyline', 'temple'],
    ambient: ['bubbles', 'nebula_glow', 'aurora_bands', 'glimmer', 'debris'],
    ground: boden([160, 72, 140], [52, 24, 60]),
    groundVarianten: [boden([160, 72, 140], [52, 24, 60]), boden([96, 168, 150], [30, 64, 62]), boden([112, 108, 176], [40, 36, 76])],
    form: { inseligkeit: [0.28, 0.4], zusammenhaengung: [0.42, 0.62], hoehlung: [0.08, 0.18], landanteil: [0.32, 0.46], kessel: [0, 0.3], steilheit: [0.4, 0.58], wasser: [0, 0.12] },
    stoffe: {
      deck: [['glas', 10]], kern: 'fels',
      adern: [{ stoff: 'glas', dichte: 0.22, ab: 10, groesse: 5 }, { stoff: 'kristall', dichte: 0.18, ab: 16, groesse: 6 }, { stoff: 'obsidian', dichte: 0.05, ab: 56 }],
    },
    pflanzen: { dichte: 0.4, arten: ['kristall', 'pilz', 'kristall'] },
  },
  fabrik: {
    label: 'Fabrik & Hochhausruine',
    beschreibung: 'Betonplatten, Stahlträger und Rohre; einstürzende Stockwerke und Schrott dazwischen.',
    fraktion: 'machina',
    mapPreset: 'warren',
    sky: ['smog', 'ash_storm', 'overcast', 'toxic_noon', 'thunderstorm'],
    water: ['tar_pit', 'poison', 'swamp_sludge'],
    landmarks: ['city_skyline', 'scrap_towers', 'ruins'],
    ambient: ['ash', 'haze', 'debris', 'rain', 'clouds_heavy'],
    ground: boden([120, 124, 128], [54, 58, 62]),
    groundVarianten: [boden([120, 124, 128], [54, 58, 62]), boden([96, 92, 88], [42, 40, 38]), boden([110, 116, 110], [48, 52, 50])],
    form: { terrassen: [0.55, 0.9], lippen: [0.4, 0.75], steilheit: [0.34, 0.52], zerklueftung: [1.2, 1.8], wasser: [0.04, 0.14], hoehlung: [0.02, 0.1], landanteil: [0.42, 0.55] },
    stoffe: {
      deck: [['beton', 24]], kern: 'erde',
      adern: [{ stoff: 'metall', dichte: 0.07, ab: 12, groesse: 4 }, { stoff: 'beton', dichte: 0.2, ab: 24, groesse: 7 }, { stoff: 'fels', dichte: 0.08, ab: 44 }],
      platten: { stoff: 'metall', abstand: 8, anteil: 0.22, ab: 18 },
    },
    pflanzen: { dichte: 0.15, arten: ['busch', 'knochen', 'gras'] },
  },
  burg: {
    label: 'Burgfelsen & Magiekristall',
    beschreibung: 'Steile Felsen mit Türmen, Holzgerüsten und Magiekristallen, die auf Strom reagieren.',
    fraktion: 'undead',
    mapPreset: 'mountains',
    sky: ['dusk', 'aurora', 'galaxy', 'thunderstorm', 'dawn_mist', 'moonlit_night'],
    water: ['shallow_lake', 'meltwater', 'swamp_sludge'],
    landmarks: ['crystal_spires', 'temple', 'ruins', 'mountain_ridge'],
    ambient: ['clouds_few', 'fireflies', 'nebula_glow', 'fog_banks'],
    ground: boden([104, 142, 104], [40, 58, 48]),
    groundVarianten: [boden([104, 142, 104], [40, 58, 48]), boden([124, 100, 156], [48, 40, 74]), boden([80, 96, 128], [32, 40, 60])],
    form: { steilheit: [0.46, 0.6], terrassen: [0.3, 0.7], zerklueftung: [1, 1.6], landanteil: [0.38, 0.52], wasser: [0.02, 0.14], hoehlung: [0.02, 0.1], kessel: [0.2, 0.6] },
    stoffe: {
      deck: [['erde', 12]], kern: 'fels',
      adern: [{ stoff: 'magiekristall', dichte: 0.14, ab: 14, groesse: 5 }, { stoff: 'holz', dichte: 0.06, ab: 8, groesse: 4 }, { stoff: 'obsidian', dichte: 0.04, ab: 60 }],
    },
    pflanzen: { dichte: 0.6, arten: ['kristall', 'busch', 'pilz', 'farn'] },
  },
});

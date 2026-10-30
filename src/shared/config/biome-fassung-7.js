/**
 * Die sechs Biome 15 bis 20 der Biom-SSOT (Geländefassung 7, `config/gelaende.js`).
 *
 * ## Was hier steht
 *
 * Schlackeschmiede (15), Kristallines Schwebearchipel (16), Bio-Alien-Tempelstadt (17), Abyssale Tiefsee (18),
 * Dimensionsriss (19) und Versteinerter Kristallwald (20) bekommen dieselbe Spieldefinition wie die Biome 1 bis 14:
 * Himmel, Wasser, Landmarken und Ambiente (Kennungen aus `config/scenery.js`), Boden, `form` (Teilbereiche der
 * Charakterachsen, `terrainGen3.formeCharakter`), Stoffrezept und Pflanzen. Quelle der Inhalte: `docs/biome-ssot.md`
 * (Abschnitte 15 bis 20) und `docs/biome-manifest.md` (Deck, Kern, Adern, Fluid).
 *
 * ## Was bewusst NICHT hier steht (nichts erfunden, was das System nicht kann)
 *
 * Objekte und Trigger der SSOT (Förderplattformen, Druckkessel, Myzelnetz, Portale, Zeitrisse, Stammsturz …),
 * Sonderwirkungen (Überdruck, Netzwerkreaktion, Druckentlastung, Zeit-/Dimensions-/Lichtimpuls) und Gase/Strömungen
 * kennt die Engine nicht (`MASTERDOTO.md`, Biom-SSOT: Umsetzung). Sie sind keine Felder dieser Einträge und bleiben
 * offene Punkte (`docs/biome-20.md`). Die Biom-Objekt-Sheets (`assets/biom-objekte`) sind isometrisch, das Spiel ist
 * eine Seitenansicht: nicht eingebunden.
 *
 * Fluide: Die Engine ertränkt in jedem Wasser gleich (`config/water.js`); `lava` und `acid` tragen eine
 * Schadensangabe (`hazard`), die übrigen sind Optik. „Industriemagma“ wird als `lava` abgebildet, „Bio-Säurewasser“ als
 * `acid`, die Abgründe (Eiswasser-Abgrund, Zeit-Vortex, Binnensee-Abgrund) als `void`, die Tiefsee als `deep_sea`.
 *
 * ## Zwei Rezepte je Biom
 *
 * `stoffe` hier nutzt nur die 18 Basisstoffe (Rückfall wie bei den Biomen der Fassungen 2 bis 4; ein Test prüft, dass
 * `NEUE_BIOME` keine neuen Kennungen enthält). Das Rezept mit den Biom-Materialien steht in
 * `config/stoff-rezepte-material.js` und gilt ab Gelände-Fassung 5, die neuen Biome gibt es aber erst ab Fassung 7.
 *
 * @module config/biome-fassung-7
 */
import { boden } from './biome-boden.js';

export const BIOME_FASSUNG_7 = Object.freeze({
  schlackeschmiede: {
    label: 'Vulkanische Schlackeschmiede',
    beschreibung: 'Industrieanlage im Vulkan: Schlacke und Basalt, Keramikschilde, Metallschienen und Dampf über dem Schmelzkanal.',
    fraktion: 'machina',
    mapPreset: 'mountains',
    sky: ['ember_sky', 'ash_storm', 'smog', 'dusk'],
    water: ['lava'],
    landmarks: ['volcano', 'scrap_towers', 'mountain_ridge', 'cliff'],
    ambient: ['embers', 'ash', 'haze', 'debris', 'clouds_heavy'],
    ground: boden([92, 66, 58], [32, 24, 26]),
    groundVarianten: [boden([92, 66, 58], [32, 24, 26]), boden([74, 70, 74], [28, 26, 32]), boden([118, 78, 60], [46, 28, 24])],
    form: { terrassen: [0.45, 0.85], steilheit: [0.42, 0.58], lippen: [0.3, 0.65], zerklueftung: [1.1, 1.7], wasser: [0.1, 0.24], hoehlung: [0.02, 0.1], landanteil: [0.36, 0.5], kessel: [0.4, 0.9] },
    stoffe: {
      deck: [['asche', 12], ['basalt', 60]], kern: 'basalt',
      adern: [{ stoff: 'obsidian', dichte: 0.05, ab: 50 }, { stoff: 'fels', dichte: 0.08, ab: 30 }],
      platten: { stoff: 'metall', abstand: 10, anteil: 0.24, ab: 22 },
    },
    pflanzen: { dichte: 0.1, arten: ['knochen'] },
  },
  kristallarchipel: {
    label: 'Kristallines Schwebearchipel',
    beschreibung: 'Schwebende Eis- und Felsinseln unter Schnee, mit Klareiskristallen und Magnetgestein über dem Eiswasser-Abgrund.',
    fraktion: 'datacult',
    mapPreset: 'islands',
    sky: ['ice_haze', 'aurora', 'clear_day', 'moonlit_night', 'crystal_glow'],
    water: ['void'],
    landmarks: ['floating_isles', 'ice_peaks', 'crystal_spires'],
    ambient: ['snow', 'clouds_few', 'glimmer', 'stars', 'aurora_bands'],
    ground: boden([214, 232, 246], [96, 128, 168]),
    groundVarianten: [boden([214, 232, 246], [96, 128, 168]), boden([188, 214, 238], [72, 106, 150]), boden([226, 232, 240], [118, 134, 166])],
    form: { inseligkeit: [0.32, 0.45], landanteil: [0.3, 0.42], wasser: [0, 0.08], zusammenhaengung: [0.4, 0.6], kessel: [0, 0.3], steilheit: [0.34, 0.54], terrassen: [0.1, 0.5] },
    stoffe: {
      deck: [['schnee', 14], ['eis', 40]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.2, ab: 16, groesse: 6 }, { stoff: 'obsidian', dichte: 0.03, ab: 60 }],
    },
    pflanzen: { dichte: 0.25, arten: ['kristall', 'busch'] },
  },
  tempelstadt: {
    label: 'Bio-Alien-Tempelstadt',
    beschreibung: 'Überwucherte Alienstadt, in der Organik und Technik verschmolzen sind: Wurzeln tragen Plattformen, Myzel und Säure in den Senken.',
    fraktion: 'xeno',
    mapPreset: 'spires',
    sky: ['spore_dusk', 'fog', 'dawn_mist', 'toxic_noon', 'moonlit_night'],
    water: ['acid', 'swamp_sludge'],
    landmarks: ['temple', 'ruins', 'forest_line', 'mushroom_grove'],
    ambient: ['spores', 'fireflies', 'fog_banks', 'haze', 'rain'],
    ground: boden([96, 112, 72], [34, 44, 30]),
    groundVarianten: [boden([96, 112, 72], [34, 44, 30]), boden([112, 104, 84], [44, 40, 34]), boden([76, 118, 92], [28, 46, 40])],
    form: { terrassen: [0.4, 0.8], steilheit: [0.4, 0.58], hoehlung: [0.06, 0.16], wasser: [0.06, 0.2], lippen: [0.2, 0.6], kessel: [0.2, 0.6], zerklueftung: [1, 1.6] },
    stoffe: {
      deck: [['erde', 14]], kern: 'fels',
      adern: [{ stoff: 'pilz', dichte: 0.14, ab: 20, groesse: 5 }, { stoff: 'holz', dichte: 0.12, ab: 8, groesse: 5 }, { stoff: 'metall', dichte: 0.05, ab: 24, groesse: 4 }],
    },
    pflanzen: { dichte: 0.7, arten: ['pilz', 'farn', 'busch'] },
  },
  tiefsee: {
    label: 'Abyssale Tiefsee',
    beschreibung: 'Dunkle Basaltgräben, versunkene Metropole und Leuchtalgen; Schlamm, Koralle und korrodiertes Metall in mehreren Tiefenstufen.',
    fraktion: 'pirates',
    mapPreset: 'flooded',
    sky: ['abyss', 'fog', 'moonlit_night'],
    water: ['deep_sea'],
    landmarks: ['kelp_forest', 'coral_reef', 'rock_arch', 'ruins'],
    ambient: ['bubbles', 'fog_banks', 'glimmer', 'haze'],
    ground: boden([70, 98, 112], [20, 34, 44]),
    groundVarianten: [boden([70, 98, 112], [20, 34, 44]), boden([60, 86, 104], [18, 30, 44]), boden([88, 104, 106], [30, 40, 44])],
    form: { wasser: [0.2, 0.3], steilheit: [0.34, 0.54], hoehlung: [0.04, 0.14], landanteil: [0.34, 0.48], terrassen: [0.3, 0.7], zerklueftung: [1, 1.6], inseligkeit: [0.05, 0.25] },
    stoffe: {
      deck: [['sand', 16]], kern: 'basalt',
      adern: [{ stoff: 'koralle', dichte: 0.14, ab: 8, groesse: 5 }, { stoff: 'metall', dichte: 0.05, ab: 14, groesse: 4 }, { stoff: 'kristall', dichte: 0.05, ab: 30, groesse: 4 }],
    },
    pflanzen: { dichte: 0.7, arten: ['koralle', 'schilf', 'koralle'] },
  },
  dimensionsriss: {
    label: 'Dimensionsriss',
    beschreibung: 'Zerbrochene Landschaft aus instabilem Boden und Phasen-Fels; Zeitkristalle und Glasfragmente über dem Zeit-Vortex.',
    fraktion: 'pixel',
    mapPreset: 'islands',
    sky: ['plasma_storm', 'galaxy', 'aurora', 'dusk', 'crystal_glow'],
    water: ['void'],
    landmarks: ['floating_isles', 'crystal_spires', 'rock_arch', 'ruins'],
    ambient: ['glimmer', 'nebula_glow', 'debris', 'stars', 'aurora_bands'],
    ground: boden([128, 96, 176], [40, 28, 72]),
    groundVarianten: [boden([128, 96, 176], [40, 28, 72]), boden([96, 120, 170], [30, 40, 78]), boden([160, 108, 150], [58, 32, 62])],
    form: { inseligkeit: [0.3, 0.45], zusammenhaengung: [0.35, 0.5], bruchstelle: [0.5, 0.7], kessel: [0, 0.4], zerklueftung: [1.3, 1.8], steilheit: [0.4, 0.58], wasser: [0, 0.08], landanteil: [0.3, 0.44] },
    stoffe: {
      deck: [['fels', 10]], kern: 'fels',
      adern: [{ stoff: 'kristall', dichte: 0.16, ab: 12, groesse: 5 }, { stoff: 'glas', dichte: 0.12, ab: 10, groesse: 4 }, { stoff: 'obsidian', dichte: 0.05, ab: 50 }],
    },
    pflanzen: { dichte: 0.3, arten: ['kristall', 'pilz'] },
  },
  kristallwald: {
    label: 'Versteinerter Kristallwald',
    beschreibung: 'Uralte, versteinerte Baumriesen mit Kristallzweigen, Moos, Leuchtpilzen und einem Binnensee.',
    fraktion: 'shinobi',
    mapPreset: 'hills',
    sky: ['dawn_mist', 'crystal_glow', 'moonlit_night', 'aurora', 'clear_day'],
    water: ['shallow_lake', 'void'],
    landmarks: ['forest_line', 'crystal_spires', 'rock_arch', 'mountain_ridge'],
    ambient: ['fireflies', 'glimmer', 'fog_banks', 'haze', 'birds'],
    ground: boden([84, 120, 96], [30, 46, 44]),
    groundVarianten: [boden([84, 120, 96], [30, 46, 44]), boden([104, 128, 100], [40, 52, 44]), boden([76, 108, 118], [28, 42, 54])],
    form: { steilheit: [0.3, 0.5], landanteil: [0.4, 0.55], wasser: [0.04, 0.16], terrassen: [0.2, 0.6], zerklueftung: [1, 1.5], hoehlung: [0.02, 0.1], lippen: [0.1, 0.4] },
    stoffe: {
      deck: [['erde', 20]], kern: 'fels',
      adern: [{ stoff: 'holz', dichte: 0.12, ab: 8, groesse: 5 }, { stoff: 'kristall', dichte: 0.14, ab: 14, groesse: 5 }, { stoff: 'pilz', dichte: 0.07, ab: 16 }],
    },
    pflanzen: { dichte: 0.8, arten: ['kristall', 'pilz', 'farn', 'busch'] },
  },
});

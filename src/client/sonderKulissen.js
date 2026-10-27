/**
 * Gemalte Kulissen für die Sonderbiome (`config/biome-neu.js`): welche Bilder zu welchem Gelände passen.
 *
 * Reine Darstellung. Aus der Liste zieht der Seed ein Bild; `planet` fehlt absichtlich (eigene generative Szene mit
 * Kosmos und Kugeln, `planetenKulisse.js`). Jeder Eintrag ist ein Schlüssel des Katalogs `config/backdrops.js`
 * (Prüfung in `tests/sonder-kulissen.test.js`).
 *
 * @module sonderKulissen
 */
import { hash2 } from './stil.js';

export const SONDER_KULISSEN = Object.freeze({
  vulkan: Object.freeze(['caverns/lava_tube', 'island/volcano']),
  kristallhoehle: Object.freeze(['caverns/crystal', 'fantasy/crystal_magic']),
  dschungel: Object.freeze(['hyperreal/jungle_river', 'deluge/drowned_forest', 'forest/fantasy_glade']),
  eiswueste: Object.freeze(['alpine/winter_snow', 'hyperreal/polar_station', 'maritime/arctic_ice', 'spires/ice_spires']),
  duenen: Object.freeze(['hyperreal/desert_caravan', 'spires/desert_hoodoos', 'western/desert_town']),
  schrott: Object.freeze(['urban/industrial_ruins', 'urban/war_torn', 'noir/harbor_docks']),
  schwebinseln: Object.freeze(['fantasy/dragon_peak', 'alpine/moonlit_peaks', 'spires/karst_peaks']),
  riff: Object.freeze(['island/caribbean_day', 'maritime/calm_day', 'island/polynesian_night']),
  pilzwald: Object.freeze(['forest/fantasy_glade', 'forest/fog_night', 'fantasy/elven_city']),
  kosmos: Object.freeze(['cosmos/nebula', 'cosmos/ringed_planet', 'cosmos/alien_world']),
  surreal: Object.freeze(['abstract/surreal', 'abstract/vaporwave', 'abstract/psychedelic']),
  fabrik: Object.freeze(['urban/industrial_ruins', 'urban/neon_night']),
  burg: Object.freeze(['fantasy/castle_siege', 'alpine/war_ruins', 'fantasy/dragon_peak']),
});

/**
 * Der Schlüssel (`biom/variante`) für ein Sonderbiom und einen Seed, oder `null` (kein Bild vorgesehen).
 * @param {string|null|undefined} sonderbiom
 * @param {number} seed
 */
export function sonderKulisseFuer(sonderbiom, seed) {
  const liste = SONDER_KULISSEN[sonderbiom];
  if (!liste) return null;
  return liste[Math.floor(hash2(seed | 0, 17, 5) * liste.length) % liste.length];
}

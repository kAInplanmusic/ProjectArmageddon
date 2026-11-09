/**
 * Gemalte Kulissen für die Sonderbiome (`config/biome-neu.js`): welche Bilder zu welchem Gelände passen.
 *
 * Reine Darstellung. Aus der Liste zieht der Seed ein Bild; `planet` fehlt absichtlich (eigene generative Szene mit
 * Kosmos und Kugeln, `planetenKulisse.js`). Jeder Eintrag ist ein Schlüssel des Katalogs `config/backdrops.js`
 * oder, für die Biome 15 bis 20, von `config/backdrops-neu.js` (Prüfung in `tests/sonder-kulissen.test.js`).
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
  // Biome 15 bis 20 (Geländefassung 7): Schlüssel aus `config/backdrops-neu.js` („biom/stimmung“). „Ragnarök“ ist im Katalog,
  // kommt aber wie bei den klassischen Kulissen nicht in die automatische Wahl.
  schlackeschmiede: Object.freeze(['schlackeschmiede/hell', 'schlackeschmiede/dunkel', 'schlackeschmiede/hoehle']),
  kristallarchipel: Object.freeze(['kristallarchipel/hell', 'kristallarchipel/dunkel', 'kristallarchipel/hoehle']),
  tempelstadt: Object.freeze(['tempelstadt/hell', 'tempelstadt/dunkel', 'tempelstadt/hoehle']),
  tiefsee: Object.freeze(['tiefsee/hell', 'tiefsee/dunkel', 'tiefsee/hoehle']),
  dimensionsriss: Object.freeze(['dimensionsriss/hell', 'dimensionsriss/dunkel', 'dimensionsriss/hoehle']),
  kristallwald: Object.freeze(['kristallwald/hell', 'kristallwald/dunkel', 'kristallwald/hoehle']),
});

/** Katalogfamilie für den Höhlenblick jedes klassischen Sonderbioms. */
const HOEHLENFAMILIE = Object.freeze({
  vulkan: 'caverns', kristallhoehle: 'caverns', dschungel: 'forest', eiswueste: 'alpine',
  duenen: 'western', schrott: 'urban', schwebinseln: 'fantasy', riff: 'maritime',
  pilzwald: 'fantasy', kosmos: 'cosmos', surreal: 'abstract', fabrik: 'urban', burg: 'fantasy',
});

/** Klassische Karten bekommen bei eindeutiger Geometrie eine passende Motivfamilie. */
export function motivFamilieFuerArt(art) {
  switch (art) {
    case 'hoehle': case 'hoehleInsel': return 'caverns';
    case 'insel': case 'inselgruppe': case 'archipel': return 'island';
    case 'hochkant': case 'schlucht': return 'spires';
    case 'ruinenstadt': return 'urban';
    default: return null;
  }
}

/**
 * Der Schlüssel (`biom/variante`) für ein Sonderbiom und einen Seed, oder `null` (kein Bild vorgesehen).
 * @param {string|null|undefined} sonderbiom
 * @param {number} seed
 */
export function sonderKulisseFuer(sonderbiom, seed, art = null) {
  const liste = SONDER_KULISSEN[sonderbiom];
  if (!liste) return null;
  if (art === 'hoehle' || art === 'hoehleInsel') {
    const familie = HOEHLENFAMILIE[sonderbiom];
    return familie ? familie + '/stimmung_hoehle' : sonderbiom + '/hoehle';
  }
  const familie = motivFamilieFuerArt(art);
  const passende = familie ? liste.filter(key => key.startsWith(familie + '/')) : [];
  const pool = passende.length ? passende : liste;
  return pool[Math.floor(hash2(seed | 0, 17, 5) * pool.length) % pool.length];
}

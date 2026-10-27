/**
 * Stoffrezepte je Biom: Wie die Stoffkarte (`shared/stoffkarte.js`) ein Biom füllt.
 *
 * Die Sonderbiome tragen ihr Rezept selbst (`config/biome-neu.js`); hier stehen die der
 * sechzehn alten Biome. Format siehe `baueStoffkarte`: `deck` (Schichten von oben mit Tiefe in
 * px), `kern`, `adern` (Nester ab einer Tiefe) und `platten` (waagerechte Streifen).
 *
 * @module config/stoff-rezepte
 */
import { NEUE_BIOME } from './biome-neu.js';
import { REZEPTE_MATERIAL } from './stoff-rezepte-material.js';

/** Ab dieser Gelände-Fassung gelten die Rezepte mit Biom-Materialien. */
const FASSUNG_MATERIAL = 5;

const ERDE = { deck: [['erde', 40]], kern: 'erde', adern: [{ stoff: 'fels', dichte: 0.1, ab: 60 }] };

export const ALTE_REZEPTE = Object.freeze({
  maritime: { deck: [['sand', 14]], kern: 'fels', adern: [{ stoff: 'erde', dichte: 0.12, ab: 20 }] },
  island: { deck: [['sand', 32]], kern: 'fels', adern: [{ stoff: 'koralle', dichte: 0.08, ab: 8 }] },
  alpine: { deck: [['schnee', 14], ['fels', 40]], kern: 'fels', adern: [{ stoff: 'kristall', dichte: 0.03, ab: 70 }] },
  forest: { deck: [['erde', 44]], kern: 'erde', adern: [{ stoff: 'fels', dichte: 0.12, ab: 60 }, { stoff: 'holz', dichte: 0.05, ab: 10 }] },
  urban: { deck: [['erde', 10]], kern: 'erde', adern: [{ stoff: 'metall', dichte: 0.06, ab: 20 }], platten: { stoff: 'metall', abstand: 12, anteil: 0.15, ab: 24 } },
  cosmos: { deck: [['asche', 14]], kern: 'basalt', adern: [{ stoff: 'kristall', dichte: 0.1, ab: 30 }] },
  abstract: { deck: [['erde', 20]], kern: 'fels', adern: [{ stoff: 'obsidian', dichte: 0.08, ab: 30 }, { stoff: 'kristall', dichte: 0.08, ab: 30 }] },
  caverns: { deck: [['fels', 24]], kern: 'fels', adern: [{ stoff: 'kristall', dichte: 0.08, ab: 20 }, { stoff: 'obsidian', dichte: 0.03, ab: 60 }] },
  fantasy: { deck: [['erde', 30]], kern: 'fels', adern: [{ stoff: 'kristall', dichte: 0.07, ab: 40 }] },
  hyperreal: ERDE,
  western: { deck: [['sand', 30]], kern: 'fels', adern: [{ stoff: 'holz', dichte: 0.04, ab: 8 }] },
  noir: { deck: [['erde', 10]], kern: 'fels', adern: [{ stoff: 'metall', dichte: 0.05, ab: 16 }] },
  deluge: { deck: [['erde', 36]], kern: 'erde', adern: [{ stoff: 'holz', dichte: 0.08, ab: 8 }] },
  open: { deck: [['erde', 50]], kern: 'erde', adern: [{ stoff: 'fels', dichte: 0.08, ab: 80 }] },
  spires: { deck: [['fels', 30]], kern: 'fels', adern: [{ stoff: 'kristall', dichte: 0.05, ab: 40 }] },
  warren: { deck: [['erde', 14]], kern: 'fels', adern: [{ stoff: 'basalt', dichte: 0.1, ab: 40 }] },
});

/** Rezept eines Bioms (Sonderbiom oder altes Biom); Unbekanntes bekommt das Erdrezept. Ab Fassung 5 mit Biom-Materialien, wo es welche gibt. */
export function rezeptFuer(biomId, fassung = 0) {
  if (fassung >= FASSUNG_MATERIAL && REZEPTE_MATERIAL[biomId]) return REZEPTE_MATERIAL[biomId];
  return NEUE_BIOME[biomId]?.stoffe ?? ALTE_REZEPTE[biomId] ?? ERDE;
}

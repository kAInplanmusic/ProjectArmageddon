/** Fotokulissen übernehmen Gelände- und Wetterpalette ihrer Motivfamilie. */
import { getBackdrop } from '../shared/config/backdrops.js';

export const FOTOS = Object.freeze({
  snow_field: { label: 'Eiswüste · Schneefeld', basis: ['alpine', 'winter_snow'] },
  factory_yard: { label: 'Schrottplatz · Industriehof', basis: ['urban', 'industrial_ruins'] },
  small_cave: { label: 'Höhle · Felsöffnung', basis: ['caverns', 'crystal'] },
});

export function panorama(id) {
  if (!Object.hasOwn(FOTOS, id)) return null;
  const { label, basis } = FOTOS[id];
  return { ...getBackdrop(...basis), key: 'foto/' + id, label, foto: id, stimmung: true, fileHoch: null };
}

export function fotoFuerBiom(biom, art) {
  if (art === 'hoehle' || art === 'hoehleInsel') {
    return ['vulkan', 'kristallhoehle'].includes(biom) ? 'small_cave' : null;
  }
  if (biom === 'eiswueste') return 'snow_field';
  if (biom === 'schrott' || biom === 'fabrik') return 'factory_yard';
  return null;
}

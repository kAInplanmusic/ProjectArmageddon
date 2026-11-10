/** Fotokulissen übernehmen Gelände- und Wetterpalette ihrer Motivfamilie. */
import { getBackdrop } from '../shared/config/backdrops.js';
import { getBackdropNeu } from '../shared/config/backdrops-neu.js';

export const FOTOS = Object.freeze({
  snow_field: { label: 'Eiswüste · Schneefeld', basis: ['alpine', 'winter_snow'] },
  factory_yard: { label: 'Schrottplatz · Industriehof', basis: ['urban', 'industrial_ruins'] },
  small_cave: { label: 'Höhle · Felsöffnung', basis: ['caverns', 'crystal'] },
  // Fotos des Auftraggebers (2026-11-10, `scripts/panoramen-fotos.py`): 1:1 übernommen, nur Personen/Hund herausgeschnitten.
  western_regenbogen: { label: 'Western · Regenbogenstadt', basis: ['western', 'desert_town'] },
  maisfeld_sw: { label: 'Noir · Maisfeld', basis: ['noir', 'rooftop_silhouette'] },
  huegelweide: { label: 'Offenland · Hügelweide', basis: ['open', 'wheat_plains'] },
  feldweg_morgen: { label: 'Offenland · Feldweg am Morgen', basis: ['open', 'wheat_plains'] },
  schaefchenwolken: { label: 'Offenland · Schäfchenwolken', basis: ['open', 'heath_moor'] },
  abendrot_silhouette: { label: 'Offenland · Letztes Abendrot', basis: ['open', 'stimmung_dunkel'] },
  sonnenuntergang_feld: { label: 'Offenland · Sonnenuntergang', basis: ['open', 'prairie_storm'] },
  baum_wegegabelung: { label: 'Offenland · Baum an der Weggabel', basis: ['open', 'wheat_plains'] },
  schneegarten: { label: 'Wald · Schneegarten', basis: ['forest', 'winter_forest'] },
  palmenstrand_fluss: { label: 'Insel · Palmenstrand am Fluss', basis: ['island', 'caribbean_day'] },
  stadt_morgenrot: { label: 'Stadt · Morgenrot über den Dächern', basis: ['urban', 'modern_day'] },
  nebelmorgen_scheune: { label: 'Wald · Nebelmorgen', basis: ['forest', 'fog_night'] },
  nachtstadt_lichter: { label: 'Stadt · Lichter bei Nacht', basis: ['urban', 'neon_night'] },
  strand_ebbe: { label: 'Küste · Strand bei Ebbe', basis: ['maritime', 'calm_day'] },
  fluss_goldhaus: { label: 'Stadt · Fluss und Goldhaus', basis: ['urban', 'modern_day'] },
  rosa_abend: { label: 'Wald · Rosa Abend', basis: ['forest', 'autumn_forest'] },
  herbstwiese: { label: 'Wald · Herbstwiese', basis: ['forest', 'autumn_forest'] },
  nachtstrasse_boden: { label: 'Noir · Nachtstraße', basis: ['noir', 'wet_road_chase'] },
  nachtstrasse_sw: { label: 'Noir · Nachtstraße schwarzweiß', basis: ['noir', 'rainy_street'] },
});

/** Fotos je Kulissenbiom (`BACKDROP_BIOMES`) für Karten ohne Spielerwahl. */
export const FOTOS_JE_BIOM = Object.freeze({
  western: Object.freeze(['western_regenbogen']),
  noir: Object.freeze(['maisfeld_sw', 'nachtstrasse_boden', 'nachtstrasse_sw']),
  open: Object.freeze(['huegelweide', 'feldweg_morgen', 'schaefchenwolken', 'abendrot_silhouette', 'sonnenuntergang_feld', 'baum_wegegabelung']),
  forest: Object.freeze(['schneegarten', 'nebelmorgen_scheune', 'rosa_abend', 'herbstwiese']),
  urban: Object.freeze(['stadt_morgenrot', 'nachtstadt_lichter', 'fluss_goldhaus']),
  maritime: Object.freeze(['strand_ebbe']),
  island: Object.freeze(['palmenstrand_fluss']),
});

/**
 * Fotokulisse für eine Karte ohne Spielerwahl: jede dritte Karte (Seed mod 3 = 0, wie bei den Sonderbiomen) eines
 * Bioms mit Fotos zeigt ein Foto, welches, entscheidet der Seed. Rein optisch, deterministisch, online auf allen Clients gleich.
 * @returns {object|null} Kulisse wie `panorama(id)` oder `null`
 */
export function fotoFuerKarte(biomId, seed) {
  const liste = FOTOS_JE_BIOM[biomId];
  const s = seed >>> 0;
  if (!liste || s % 3 !== 0) return null;
  return panorama(liste[Math.floor(s / 3) % liste.length]);
}

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

/** Gemeinsamer Katalogzugriff für manuelle Kulissen und automatische Motivwahl. */
export function findeKulisse(schluessel) {
  const [biom, variante] = String(schluessel).split('/');
  return biom === 'foto' ? panorama(variante) : getBackdrop(biom, variante) ?? getBackdropNeu(biom, variante);
}

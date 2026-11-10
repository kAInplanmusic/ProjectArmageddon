/**
 * Gemalte Panorama-Kulissen (`assets/panoramen-stil`, Laufzeitfassung `assets/panoramen-kulissen`, 1280x720 WebP):
 * 32 Motive mal vier Arten (hell, dunkel, hoehle, ragnarok) = 128 Bilder. Zuordnung zu Sonderbiomen und klassischen
 * Familien wie in `panoramen-stil/zuordnung.json` (Test prueft Gleichheit); Begruendung in `docs/panoramen-stil.md`.
 *
 * `staerke`: 'stark' = darf im zugeordneten Sonderbiom automatisch erscheinen; 'schwach' = nur ueber die Familie
 * (klassisches Biom) oder manuell; 'keins' = nur Familie; 'mangel' = nur manuell (Bildfehler).
 * `autoArten`: Einschraenkung der automatischen Wahl (Nachtmotive nur dunkel). Ragnarok liegt ausserhalb der
 * Auto-Wahl (`stimmung: true`). Reine Darstellung, nichts fliesst in Karte, Hash oder Replay.
 *
 * @module config/backdrops-panorama
 */

export const ARTEN_PANORAMA = Object.freeze([
  { id: 'hell', label: 'Heller Himmel' },
  { id: 'dunkel', label: 'Sternennacht' },
  { id: 'hoehle', label: 'Höhlenblick' },
  { id: 'ragnarok', label: 'Ragnarök' },
]);

/** [name, Bezeichnung, Sonderbiome, Familie, Staerke, autoArten|null] */
const T = [
  ['alpendorf_herbst', 'Alpendorf im Herbst', ['burg'], 'alpine', 'schwach'],
  ['baum_wegegabelung', 'Baum an der Weggabel', [], 'open', 'keins'],
  ['baum_weitblick', 'Baum mit Weitblick', [], 'open', 'keins'],
  ['bergsee', 'Bergsee', ['kristallarchipel'], 'alpine', 'schwach'],
  ['birke_gemaelde', 'Hängebirke', ['kristallwald'], 'forest', 'stark'],
  ['feldweg_morgen', 'Feldweg am Morgen', [], 'open', 'keins'],
  ['fluss_goldhaus', 'Fluss und Goldhaus', ['surreal'], 'urban', 'stark'],
  ['gewitter_abendrot', 'Gewitter im Abendrot', ['dimensionsriss'], 'open', 'schwach'],
  ['halbmond_huegel', 'Halbmond über dem Hügel', ['kristallwald'], 'forest', 'schwach'],
  ['herbstbaeume_dunst', 'Herbstbäume im Dunst', [], 'forest', 'keins'],
  ['herbstwiese', 'Herbstwiese', [], 'forest', 'keins'],
  ['huegelweide', 'Hügelweide', [], 'open', 'keins'],
  ['klondike_schnee', 'Goldgräberdorf im Schnee', ['eiswueste'], 'alpine', 'stark'],
  ['nachtstadt_lichter', 'Stadtlichter bei Nacht', ['fabrik'], 'urban', 'stark', ['dunkel']],
  ['nachtstadt_tal', 'Tal bei Nacht', ['fabrik'], 'urban', 'stark', ['dunkel']],
  ['nachtstadt_tal_2', 'Tal bei Nacht, Laternen', ['fabrik'], 'urban', 'stark', ['dunkel']],
  ['nachtstrasse_sw', 'Nachtstraße', ['schrott', 'fabrik'], 'noir', 'stark', ['dunkel']],
  ['nebelmorgen_scheune', 'Nebelmorgen', [], 'open', 'keins'],
  ['palmenstrand_fluss', 'Palmenstrand am Fluss', ['riff'], 'island', 'mangel'],
  ['rosa_abend', 'Rosa Abend', [], 'open', 'keins'],
  ['rosa_glut_feld', 'Rosa Glut über dem Feld', [], 'open', 'keins'],
  ['schaefchenwolken', 'Schäfchenwolken', [], 'open', 'keins'],
  ['schnee_alpendorf', 'Verschneites Alpendorf', ['eiswueste'], 'alpine', 'stark'],
  ['schneegarten', 'Schneegarten', ['eiswueste'], 'alpine', 'stark'],
  ['schotterweg_horizont', 'Schotterweg am Horizont', ['duenen'], 'open', 'schwach'],
  ['sonne_ueber_wald', 'Sonne über dem Wald', [], 'forest', 'keins'],
  ['sonnenaufgang_zaun', 'Sonnenaufgang am Zaun', [], 'open', 'keins'],
  ['sonnenstrahlen_felder', 'Sonnenstrahlen über Feldern', [], 'open', 'keins'],
  ['sonnenuntergang_feld', 'Sonnenuntergang überm Feld', ['duenen'], 'open', 'schwach'],
  ['stadt_morgenrot', 'Morgenrot über den Dächern', ['fabrik'], 'urban', 'stark'],
  ['strand_ebbe', 'Strand bei Ebbe', ['riff'], 'island', 'stark'],
  ['western_regenbogen', 'Westernstadt', ['duenen'], 'western', 'stark'],
];

/** Lichtklasse je Motiv fuer hell/hoehle (`client/kulissenLicht.js`); dunkel = nacht, ragnarok = lava. */
const LICHT = { alpine: 'schnee', open: 'wald', forest: 'wald', urban: 'stadt', island: 'standard', noir: 'nacht', western: 'wueste' };

export const PANORAMEN_STIL = Object.freeze(T.map(([name, label, biome, familie, staerke, autoArten = null]) => Object.freeze({
  name, label, biome: Object.freeze(biome), familie, staerke, autoArten: autoArten && Object.freeze(autoArten),
})));

/** Alle 128 Kulissen als flache Liste (Form wie `ALL_BACKDROPS`, Schluessel „stil/<name>_<art>“). */
export const BACKDROPS_PANORAMA = Object.freeze(PANORAMEN_STIL.flatMap(m => ARTEN_PANORAMA.map(a => Object.freeze({
  biomeId: 'stil',
  biomeLabel: 'Panoramen im Kulissenstil',
  id: `${m.name}_${a.id}`,
  art: a.id,
  motiv: m.name,
  label: `${m.label} · ${a.label}`,
  file: `${m.name}_${a.id}.webp`,
  fileHoch: null,
  stimmung: true,
  lichtKlasse: a.id === 'ragnarok' ? 'lava' : a.id === 'dunkel' ? 'nacht' : LICHT[m.familie],
  key: `stil/${m.name}_${a.id}`,
}))));

export function getBackdropPanorama(variantId) {
  return BACKDROPS_PANORAMA.find(b => b.id === variantId) ?? null;
}

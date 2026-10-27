/**
 * Stoffrezepte der Gelände-Fassung 5 („Material“): Die Biome nutzen die Biom-Materialien des Manifests
 * (`docs/biome-manifest.md`, Spalten Deck, Kern, Adern). Tiefen, Dichten und Plattenstreifen stammen aus den
 * Rezepten der Fassungen 2–4; ersetzt werden die Stoffe, damit sich die Form der Karte nicht ändert.
 *
 * Nur für die Sonderbiome und Planetenarten, die es im Spiel gibt. Die sechs neuen Biome der SSOT
 * (Schlackeschmiede, Schwebearchipel, Tempelstadt, Tiefsee, Dimensionsriss, Kristallwald) haben noch keine
 * Spieldefinition und damit auch kein Rezept hier.
 *
 * @module config/stoff-rezepte-material
 */
import { NEUE_BIOME } from './biome-neu.js';

/** Rezept des Bioms aus Fassung 2–4 mit ersetzten Schichten; alles Übrige (Platten, …) bleibt. */
const ableiten = (id, { deck, kern, adern, platten }) => Object.freeze({
  ...NEUE_BIOME[id].stoffe,
  deck, kern, adern,
  ...(platten ? { platten: { ...NEUE_BIOME[id].stoffe.platten, ...platten } } : {}),
});

export const REZEPTE_MATERIAL = Object.freeze({
  vulkan: ableiten('vulkan', { deck: [['asche', 16], ['basalt', 80]], kern: 'basalt', adern: [{ stoff: 'obsidian', dichte: 0.07, ab: 56 }, { stoff: 'fels', dichte: 0.1, ab: 40 }, { stoff: 'schlacke', dichte: 0.08, ab: 20, groesse: 5 }] }),
  kristallhoehle: ableiten('kristallhoehle', { deck: [['kalkstein', 10], ['fels', 14]], kern: 'fels', adern: [{ stoff: 'kristall', dichte: 0.2, ab: 12, groesse: 6 }, { stoff: 'obsidian', dichte: 0.04, ab: 60 }] }),
  dschungel: ableiten('dschungel', { deck: [['humus', 14], ['erde', 22]], kern: 'lehmige_erde', adern: [{ stoff: 'holz', dichte: 0.16, ab: 8, groesse: 5 }, { stoff: 'pilze', dichte: 0.07, ab: 16 }, { stoff: 'fels', dichte: 0.08, ab: 70 }] }),
  eiswueste: ableiten('eiswueste', { deck: [['schnee', 20], ['klareis', 70]], kern: 'tiefenfels', adern: [{ stoff: 'eis', dichte: 0.16, ab: 20, groesse: 8 }, { stoff: 'kristall', dichte: 0.03, ab: 80 }] }),
  duenen: ableiten('duenen', { deck: [['feinsand', 60]], kern: 'sandstein', adern: [{ stoff: 'fels', dichte: 0.14, ab: 24, groesse: 5 }, { stoff: 'versteinertes_holz', dichte: 0.04, ab: 10 }, { stoff: 'treibsand', dichte: 0.05, ab: 6, groesse: 6 }] }),
  schrott: ableiten('schrott', { deck: [['kontaminierte_erde', 12]], kern: 'rostmetall', adern: [{ stoff: 'metall', dichte: 0.09, ab: 10, groesse: 4 }, { stoff: 'holz', dichte: 0.1, ab: 8 }, { stoff: 'fels', dichte: 0.12, ab: 30 }, { stoff: 'beton', dichte: 0.08, ab: 24, groesse: 5 }] }),
  schwebinseln: ableiten('schwebinseln', { deck: [['erdueberzug', 14]], kern: 'kristallfelsen', adern: [{ stoff: 'kristall', dichte: 0.3, ab: 18, groesse: 6 }, { stoff: 'obsidian', dichte: 0.05, ab: 50 }] }),
  riff: ableiten('riff', { deck: [['feinsand', 16], ['koralle', 40]], kern: 'riff_kalkstein', adern: [{ stoff: 'lebende_koralle', dichte: 0.2, ab: 6, groesse: 5 }] }),
  pilzwald: ableiten('pilzwald', { deck: [['pilz', 16], ['humus', 12]], kern: 'kontaminierte_erde', adern: [{ stoff: 'pilzmyzel', dichte: 0.14, ab: 28, groesse: 4 }, { stoff: 'holz', dichte: 0.08, ab: 12 }] }),
  kosmos: ableiten('kosmos', { deck: [['regolith_staub', 18]], kern: 'meteoritenfels', adern: [{ stoff: 'nickel_eisen', dichte: 0.07, ab: 14, groesse: 3 }, { stoff: 'kristall', dichte: 0.14, ab: 12, groesse: 5 }] }),
  surreal: ableiten('surreal', { deck: [['glas', 10], ['traumgestein', 14]], kern: 'traumgestein', adern: [{ stoff: 'gehaertetes_glas', dichte: 0.22, ab: 10, groesse: 5 }, { stoff: 'kristall', dichte: 0.18, ab: 16, groesse: 6 }] }),
  fabrik: ableiten('fabrik', { deck: [['poroeser_beton', 24]], kern: 'stahlbeton', adern: [{ stoff: 'metalltraeger', dichte: 0.07, ab: 12, groesse: 4 }, { stoff: 'beton', dichte: 0.2, ab: 24, groesse: 7 }], platten: { stoff: 'metalltraeger' } }),
  burg: ableiten('burg', { deck: [['mutterboden', 12]], kern: 'mauerwerk', adern: [{ stoff: 'magiekristall', dichte: 0.14, ab: 14, groesse: 5 }, { stoff: 'holz', dichte: 0.06, ab: 8, groesse: 4 }] }),
  // Planetenarten: Tabelle „Planet (Biom 14)“ im Manifest (freigegeben 2026-10-27).
  planet_eis: ableiten('planet_eis', { deck: [['schnee', 16], ['firnschnee', 54]], kern: 'fels', adern: [{ stoff: 'eis', dichte: 0.08, ab: 30, groesse: 5 }, { stoff: 'kristall', dichte: 0.06, ab: 40, groesse: 5 }] }),
  planet_lava: ableiten('planet_lava', { deck: [['asche', 12], ['schlacke', 70]], kern: 'basalt', adern: [{ stoff: 'obsidian', dichte: 0.08, ab: 50, groesse: 4 }, { stoff: 'magmaadern', dichte: 0.06, ab: 40, groesse: 4 }] }),
  planet_sand: ableiten('planet_sand', { deck: [['sand', 30], ['salzkruste', 16]], kern: 'sandstein', adern: [{ stoff: 'teer', dichte: 0.05, ab: 40, groesse: 5 }] }),
  planet_dschungel: ableiten('planet_dschungel', { deck: [['humus', 24]], kern: 'fels', adern: [{ stoff: 'wurzeln', dichte: 0.1, ab: 10, groesse: 4 }, { stoff: 'holz', dichte: 0.06, ab: 8, groesse: 4 }, { stoff: 'pilze', dichte: 0.12, ab: 20, groesse: 5 }] }),
  planet_rost: ableiten('planet_rost', { deck: [['schrott', 8], ['korrosion', 8]], kern: 'rostmetall', adern: [{ stoff: 'metall', dichte: 0.08, ab: 14, groesse: 4 }, { stoff: 'beton', dichte: 0.06, ab: 24, groesse: 6 }] }),
  planet_stein: ableiten('planet_stein', { deck: [['geroell', 26]], kern: 'fels', adern: [{ stoff: 'obsidian', dichte: 0.04, ab: 50 }, { stoff: 'kristalladern', dichte: 0.06, ab: 30, groesse: 5 }] }),
});

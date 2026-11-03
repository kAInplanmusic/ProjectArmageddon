/**
 * Stoffrezepte der Gelände-Fassung 8 („Klar“, TODO N-29): Jedes Biom bekommt EINEN Leitstoff (Deck und Kern aus derselben
 * Farbfamilie, die dominante Deckfarbe) und EINE Kontrastader. Kristall-Violett und Grau-Fels stehen nur noch dort, wo sie
 * das Leitmaterial sind (Kristallhöhle, Burg mit Magiekristall, Kristallwald, Alpen, Höhlen, Steinplanet).
 *
 * ## Warum eine eigene Fassung
 *
 * Die Rezepte der Fassung 5 mischten je Biom drei bis fünf Stoffe; fast überall lagen dieselben violetten Kristall- und
 * grauen Felsadern darin. Auf dem Kontaktbogen sahen dadurch Vulkan, Kosmos, Surreal und Schwebeinseln einander ähnlich.
 * Andere Stoffe ändern die Stoffkarte (`stoffHash`) und damit Härte und Bruch – alte Aufzeichnungen müssen aber dieselbe
 * Karte bauen. Deshalb gelten diese Rezepte erst ab `config.gelaende` 8; die Fassungen 1 bis 7 bleiben Bit für Bit gleich.
 *
 * Tiefen, Plattenstreifen und die übrigen Felder der älteren Rezepte bleiben, damit die Form der Schichten gleich wirkt.
 *
 * @module config/stoff-rezepte-klar
 */
import { REZEPTE_MATERIAL } from './stoff-rezepte-material.js';

/** Rezept mit Leitstoff `kern`, Deckschichten `deck` und genau einer Kontrastader. */
const klar = (basis, deck, kern, ader) => Object.freeze({ ...basis, deck, kern, adern: [ader] });
const m = (id, deck, kern, ader) => klar(REZEPTE_MATERIAL[id], deck, kern, ader);
// Die fünf alten Rezepte (`stoff-rezepte.js`) tragen nur Deck, Kern und Adern; kein Import von dort (Kreisbezug).
const a = (_id, deck, kern, ader) => klar({}, deck, kern, ader);

export const REZEPTE_KLAR = Object.freeze({
  // Schwarzer Basalt unter Asche, glühende Magmaadern.
  vulkan: m('vulkan', [['asche', 16], ['basalt', 80]], 'basalt', { stoff: 'magmaadern', dichte: 0.15, ab: 20, groesse: 6 }),
  // Violetter Kristallfels (Leitstoff), türkis leuchtende Kristalle.
  kristallhoehle: m('kristallhoehle', [['kristallfelsen', 24]], 'kristallfelsen', { stoff: 'leuchtkristall', dichte: 0.14, ab: 12, groesse: 6 }),
  // Moos über dunklem Humus, Adern aus rotem Lehm.
  dschungel: m('dschungel', [['moos', 12], ['humus', 40]], 'humus', { stoff: 'lehmige_erde', dichte: 0.14, ab: 14, groesse: 6 }),
  // Weißer Schnee über blauem Gletschereis, braune gefrorene Wurzeln.
  eiswueste: m('eiswueste', [['schnee', 24], ['gletschereis', 70]], 'gletschereis', { stoff: 'gefrorene_wurzeln', dichte: 0.08, ab: 16, groesse: 5 }),
  // Heller Feinsand über Sandstein, terrakottarote Scherben der Ruinen.
  duenen: m('duenen', [['feinsand', 60]], 'sandstein', { stoff: 'keramik', dichte: 0.1, ab: 16, groesse: 5 }),
  // Rostmetall (Leitstoff), blaugraue blanke Metallreste.
  schrott: m('schrott', [['korrosion', 12]], 'rostmetall', { stoff: 'metall', dichte: 0.12, ab: 10, groesse: 5 }),
  // Weißer Wolkenstein mit grünem Moos, violette Kristalle (das Kristall-Archipel).
  schwebinseln: m('schwebinseln', [['moos', 12]], 'wolkenstein', { stoff: 'kristall', dichte: 0.16, ab: 14, groesse: 6 }),
  // Rosa Korallenstock unter einer dünnen Sandschicht, grünes Seegras.
  riff: m('riff', [['feinsand', 12]], 'koralle', { stoff: 'seegras', dichte: 0.14, ab: 8, groesse: 5 }),
  // Malvenfarbenes Pilzgeflecht (Leitstoff), giftgrüne Säureadern.
  pilzwald: m('pilzwald', [['pilz', 16]], 'pilzbruecke', { stoff: 'saeureablagerungen', dichte: 0.12, ab: 16, groesse: 5 }),
  // Graumalvener Regolith über dunklem Meteoritenfels, helles Nickeleisen.
  kosmos: m('kosmos', [['regolith_staub', 18]], 'meteoritenfels', { stoff: 'nickel_eisen', dichte: 0.12, ab: 12, groesse: 5 }),
  // Lavendelnes Traumgestein (Leitstoff), türkises gehärtetes Glas.
  surreal: m('surreal', [['traumgestein', 24]], 'traumgestein', { stoff: 'gehaertetes_glas', dichte: 0.18, ab: 10, groesse: 6 }),
  // Grauer Beton (Leitstoff), rostige Adern; die Träger bleiben Plattenstreifen.
  fabrik: m('fabrik', [['poroeser_beton', 24]], 'stahlbeton', { stoff: 'rostmetall', dichte: 0.08, ab: 16, groesse: 5 }),
  // Warmes Mauerwerk unter Mutterboden, violette Magiekristalle.
  burg: m('burg', [['mutterboden', 12]], 'mauerwerk', { stoff: 'magiekristall', dichte: 0.12, ab: 14, groesse: 5 }),
  planet_eis: m('planet_eis', [['schnee', 16], ['firnschnee', 54]], 'gletschereis', { stoff: 'wasserader', dichte: 0.08, ab: 30, groesse: 5 }),
  planet_lava: m('planet_lava', [['asche', 12], ['schlacke', 70]], 'basalt', { stoff: 'magmaadern', dichte: 0.1, ab: 30, groesse: 5 }),
  planet_sand: m('planet_sand', [['sand', 30], ['salzkruste', 16]], 'sandstein', { stoff: 'teer', dichte: 0.06, ab: 40, groesse: 5 }),
  planet_dschungel: m('planet_dschungel', [['moos', 10], ['humus', 24]], 'lehmige_erde', { stoff: 'wurzeln', dichte: 0.12, ab: 10, groesse: 5 }),
  planet_rost: m('planet_rost', [['schrott', 8], ['korrosion', 8]], 'rostmetall', { stoff: 'metall', dichte: 0.1, ab: 14, groesse: 4 }),
  planet_stein: m('planet_stein', [['geroell', 26]], 'fels', { stoff: 'obsidian', dichte: 0.06, ab: 30, groesse: 5 }),
  // Warmbraune Schlacke (Leitstoff), rostiges Schmiedeeisen; die Schienen bleiben Plattenstreifen.
  schlackeschmiede: m('schlackeschmiede', [['schlacke', 60]], 'schlacke', { stoff: 'rostmetall', dichte: 0.12, ab: 12, groesse: 5 }),
  // Hellblaues Klareis und Eiskristall, dunkles Magnetgestein.
  kristallarchipel: m('kristallarchipel', [['firnschnee', 10], ['klareis', 40]], 'klareiskristall', { stoff: 'magnetgestein', dichte: 0.1, ab: 16, groesse: 5 }),
  // Ockerner Tempelstein unter Humus, grünes Alienharz.
  tempelstadt: m('tempelstadt', [['humus', 10], ['tempelstein', 26]], 'tempelstein', { stoff: 'alienharz', dichte: 0.12, ab: 16, groesse: 5 }),
  // Dunkler Tiefseeschlamm über Tiefseebasalt, türkise Leuchtalgen.
  tiefsee: m('tiefsee', [['tiefseeschlamm', 16]], 'tiefseebasalt', { stoff: 'leuchtalgen', dichte: 0.1, ab: 12, groesse: 5 }),
  // Violetter Phasenfels unter instabilem Boden, blaue Zeitkristalle.
  dimensionsriss: m('dimensionsriss', [['instabiler_boden', 12]], 'phasen_fels', { stoff: 'zeitkristall', dichte: 0.14, ab: 12, groesse: 5 }),
  // Versteinertes Holz unter Moos, violette Kristalladern (Leitstoff des Kristallwalds).
  kristallwald: m('kristallwald', [['moos', 14], ['versteinertes_holz', 22]], 'versteinertes_holz', { stoff: 'kristalladern', dichte: 0.14, ab: 14, groesse: 5 }),
  // Die fünf alten Biome der Bauteilkarten (`biomFuerCharakter`, Wahl „klassisch“).
  forest: a('forest', [['erde', 44]], 'erde', { stoff: 'holz', dichte: 0.08, ab: 10 }),
  alpine: a('alpine', [['schnee', 14], ['fels', 40]], 'fels', { stoff: 'eis', dichte: 0.06, ab: 30, groesse: 5 }),
  island: a('island', [['sand', 32]], 'kalkstein', { stoff: 'koralle', dichte: 0.1, ab: 8 }),
  deluge: a('deluge', [['feuchte_erde', 36]], 'erde', { stoff: 'holz', dichte: 0.08, ab: 8 }),
  caverns: a('caverns', [['fels', 24]], 'fels', { stoff: 'stalaktiten', dichte: 0.08, ab: 20 }),
});

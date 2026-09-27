/**
 * Generative Kulissen: Himmel, Wasser, Ambiente, Landmarken und Boden.
 *
 * Warum generativ und nicht nur als fertiges Bild: Ein Bild hat ein festes
 * Seitenverhältnis. Sobald es Hochkant-Karten gibt, kann ein Querformatbild die
 * Fläche nicht mehr füllen, ohne dass Wesentliches weggeschnitten wird. Eine aus
 * Einzelteilen zusammengesetzte Kulisse dagegen passt sich jeder Größe an —
 * derselbe Baukasten füllt 1280x720 und 720x1280.
 *
 * Aufbau: **Sechzehn** Biome bestimmen, WELCHE Bausteine zur Verfügung stehen;
 * der Seed wählt daraus. Damit sind die Kombinationen zahlreich (Himmel ×
 * Wasser × Ambiente × Landmarken × Boden), aber jede Kombination ist
 * reproduzierbar — nötig, damit ein Replay dieselbe Landschaft zeigt wie das
 * aufgezeichnete Spiel.
 *
 * FUND (belegt, 2026-09-27): Hier stand „Zwölf Biome". Es waren und sind
 * sechzehn (`Object.keys(SCENERY_BIOMES).length`). Die Zahl im Kopf war eine
 * Schätzung, die niemand nachgezählt hat — dieselbe Art Fehler wie „zwölf
 * Achsen" im Kopf von `terrainGen3.js`, wo sieben gezogen wurden.
 *
 * Alle erzeugten Werte sind reine Zahlen, damit sie über den Netcode gehen
 * können: Der Server schickt den Seed, der Client baut dieselbe Kulisse.
 *
 * @module scenery
 */
import { SeededRandom } from '../prng.js';
import { PRIMARY_BIOME_BY_PRESET } from './backdrops.js';

// ------------------------------------------------------------------ Himmel

/**
 * Himmelarten. `colors` sind die Verlaufsstufen von oben nach unten.
 * `light` ist die Grundhelligkeit der Szene (0–1), `ambient` nennt die
 * Begleitelemente, aus denen die Kulisse zusätzlich zieht.
 */
export const SKY_KINDS = Object.freeze([
  {
    id: 'clear_day',
    label: 'Klarer Tag',
    colors: ['#2f7fc4', '#7cb6e0', '#cfe6f5'],
    light: 0.95,
    celestial: 'sun',
    ambient: ['clouds_few', 'birds'],
  },
  {
    id: 'overcast',
    label: 'Bewölkt',
    colors: ['#5c6a78', '#8b98a4', '#c2cbd3'],
    light: 0.7,
    celestial: null,
    ambient: ['clouds_heavy'],
  },
  {
    id: 'thunderstorm',
    label: 'Gewitter',
    colors: ['#1a2029', '#333d4a', '#5a6675'],
    light: 0.42,
    celestial: null,
    ambient: ['clouds_storm', 'rain', 'lightning'],
  },
  {
    id: 'smog',
    label: 'Smog',
    colors: ['#6b5a44', '#98866c', '#c9b795'],
    light: 0.6,
    celestial: 'dim_sun',
    ambient: ['haze', 'ash'],
  },
  {
    id: 'fog',
    label: 'Nebel',
    colors: ['#8a949c', '#a8b1b8', '#cdd4d9'],
    light: 0.68,
    celestial: null,
    ambient: ['fog_banks'],
  },
  {
    id: 'galaxy',
    label: 'Galaxie',
    colors: ['#05060f', '#141033', '#2b1f4d'],
    light: 0.3,
    celestial: 'stars',
    ambient: ['stars', 'nebula_glow'],
  },
  {
    id: 'dusk',
    label: 'Abendrot',
    colors: ['#20264a', '#a4517a', '#f0a35e'],
    light: 0.62,
    celestial: 'setting_sun',
    ambient: ['clouds_few', 'birds'],
  },
  {
    id: 'aurora',
    label: 'Polarlicht',
    colors: ['#040a18', '#0d2a3f', '#1d5b6b'],
    light: 0.35,
    celestial: 'stars',
    ambient: ['stars', 'aurora_bands'],
  },
  {
    id: 'plasma_storm',
    label: 'Plasmasturm',
    colors: ['#0b0416', '#3a0f4a', '#7a1f5c'],
    light: 0.4,
    celestial: null,
    ambient: ['nebula_glow', 'embers', 'debris'],
  },
  {
    id: 'ash_storm',
    label: 'Aschehimmel',
    colors: ['#241c19', '#453832', '#6d5b50'],
    light: 0.45,
    celestial: 'dim_sun',
    ambient: ['ash', 'haze'],
  },
  /*
   * ==================================================================
   * Die fünf Himmel, die beim Terrain-Ausbau dazukamen
   * ==================================================================
   *
   * Warum das zur Gelände-Arbeit gehört: Die Vorgabe verlangt, dass ein Biom
   * mit seinem Hintergrund und seinen Kulissen **zusammenpasst**. Die Zahl der
   * Szenen, die ein Biom zeigen kann, ist das Produkt seiner Listen
   * (Himmel × Wasser × Ambiente × Landmarken). Mit zehn Himmeln, sieben
   * Wassern und achtzehn Ambiente-Arten sind es bereits Tausende — aber nur,
   * wenn die Listen lang genug sind. Ein Biom mit drei Himmeln zeigt nach drei
   * Partien dieselbe Szene.
   *
   * Jeder neue Himmel muss GEZEICHNET werden können. Das ist hier keine
   * Vermutung, sondern eine Eigenschaft des Malers: `sceneryPainter.js` malt den
   * Himmel als Farbverlauf aus `colors` und den Himmelskörper über `celestial`
   * — und kennt dafür genau fünf Formen (`sun`, `dim_sun`, `moon`,
   * `setting_sun`, `stars`) sowie `null`. Deshalb nennt jeder neue Himmel
   * ausschließlich diese Werte; ein sechster Name wäre eine Kulisse, die
   * niemand malt.
   *
   * Die Kennungen sind englisch — wie alle bestehenden (Projektregel: Biom-Id =
   * Dateipräfix, englisch).
   */
  {
    id: 'moonlit_night',
    label: 'Mondnacht',
    colors: ['#070b18', '#131c33', '#2b3a55'],
    light: 0.34,
    celestial: 'moon',
    ambient: ['stars', 'clouds_few'],
  },
  {
    id: 'sandstorm',
    label: 'Sandsturm',
    colors: ['#8a6b3d', '#c09a5f', '#e0c795'],
    light: 0.66,
    // Ein Sandsturm lässt die Sonne blass stehen — keine klare Sicht, keine Sterne.
    celestial: 'dim_sun',
    ambient: ['debris', 'haze'],
  },
  {
    id: 'toxic_noon',
    label: 'Giftiger Mittag',
    colors: ['#5d6b32', '#9fae5a', '#d7dfa0'],
    light: 0.58,
    celestial: 'dim_sun',
    ambient: ['haze', 'fireflies'],
  },
  {
    id: 'dawn_mist',
    label: 'Morgennebel',
    // Kühl oben, rosig in der Mitte, blassgold unten — der Übergang des
    // Sonnenaufgangs, nicht der des Untergangs (der ist `dusk`).
    colors: ['#33486f', '#b47a86', '#f0c98a'],
    light: 0.66,
    celestial: 'sun',
    ambient: ['fog_banks', 'clouds_few', 'birds'],
  },
  {
    id: 'ice_haze',
    label: 'Eisige Höhenluft',
    colors: ['#8fb2c9', '#bcd6e4', '#e8f2f8'],
    light: 0.8,
    celestial: 'dim_sun',
    ambient: ['snow', 'fog_banks'],
  },
]);

// ------------------------------------------------------------------ Wasser

/**
 * Wasserarten. `body` ist die tiefe Farbe, `shallow` die flache.
 *
 * `hazard` beschreibt, was das Wasser einem Spieler antut:
 *   - `null`      : normales Wasser, Ertrinken wie bisher
 *   - `damage`    : Schaden je Schritt (Lava, Gift) statt Ertrinken
 *   - `snare`     : kein Schaden, aber die Figur kommt kaum voran (Treibsand)
 *   - `suffocate` : wie Ertrinken, nur schneller (Schlamm)
 */
export const WATER_KINDS = Object.freeze([
  {
    id: 'deep_sea',
    label: 'Meerwasser',
    body: [16, 52, 92],
    shallow: [46, 128, 178],
    alpha: 0.9,
    surface: 'waves',
    hazard: null,
  },
  {
    id: 'shallow_lake',
    label: 'Seichtes Seewasser',
    body: [58, 138, 150],
    shallow: [140, 208, 196],
    alpha: 0.62,
    surface: 'ripples',
    hazard: null,
  },
  {
    id: 'lava',
    label: 'Lava',
    body: [120, 22, 8],
    shallow: [255, 138, 26],
    alpha: 1,
    surface: 'crust',
    hazard: { kind: 'damage', perStep: 14, label: 'Verbrennung' },
  },
  {
    id: 'swamp_sludge',
    label: 'Sumpfschlamm',
    body: [48, 44, 26],
    shallow: [104, 96, 54],
    alpha: 0.94,
    surface: 'bubbles',
    hazard: { kind: 'suffocate', perStep: 3, label: 'Schlamm' },
  },
  {
    id: 'quicksand',
    label: 'Treibsand',
    body: [152, 126, 82],
    shallow: [206, 184, 138],
    alpha: 0.96,
    surface: 'grain',
    hazard: { kind: 'snare', factor: 0.25, label: 'Treibsand' },
  },
  {
    id: 'void',
    label: 'Galaktisches Nichts',
    body: [8, 6, 22],
    shallow: [58, 32, 96],
    alpha: 0.98,
    surface: 'stars',
    hazard: { kind: 'damage', perStep: 9, label: 'Leere' },
  },
  {
    id: 'poison',
    label: 'Giftbrühe',
    body: [28, 74, 30],
    shallow: [126, 214, 70],
    alpha: 0.9,
    surface: 'bubbles',
    hazard: { kind: 'damage', perStep: 6, label: 'Gift' },
  },
  /*
   * ==================================================================
   * Die drei Wasser, die beim Terrain-Ausbau dazukamen
   * ==================================================================
   *
   * Dieselbe Begründung wie bei den Himmeln: Die Zahl der Szenen eines Bioms
   * ist das Produkt seiner Listen. Jede neue Wasserart ist eine Farbe mehr für
   * dieselbe Karte — und die Karten sind jetzt vielfältiger (Kessel, Gräben,
   * Terrassen), also brauchen sie auch mehr Wasser, das dazu passt: ein
   * gefrorenes Hochtal, eine Teergrube, Schmelzwasser.
   *
   * `surface` nennt die Struktur, die auf dem Wasser gezeichnet wird. Der Maler
   * (`sceneryPainter.js`, `drawWaterSurface`) kennt genau sechs: `waves`,
   * `ripples`, `crust`, `bubbles`, `grain`, `stars`. Jede neue Wasserart nennt
   * deshalb eine DIESER sechs — eine siebte würde nicht gezeichnet.
   *
   * ## Und warum die neuen kein `hazard` tragen
   *
   * FUND (belegt, 2026-09-27): `hazard` wird im ganzen Projekt **von keiner
   * Stelle gelesen**. `grep -rn hazard src/` findet nur die Deklarationen in
   * dieser Datei; die Tests `tests/scenery.test.js:91-94` prüfen die WERTE, die
   * Physik kennt sie nicht. Lava, Gift, Treibsand und Schlamm verhalten sich im
   * Spiel also wie Wasser (Ertrinken) — die Beschriftungen („Verbrennung",
   * „Gift", „Treibsand") sind eine Absicht ohne Wirkung.
   *
   * Die Behebung gehört in den Motor (dort wird Wasser `drown` behandelt) — er
   * liegt außerhalb dieses Auftrags. Bis dahin tragen die neuen Wasserarten
   * bewusst **kein** `hazard`: Eine dritte Deklaration ohne Leser würde den
   * Fund nur vergrößern, nicht beheben.
   */
  {
    id: 'frozen_lake',
    label: 'Gefrorener See',
    body: [118, 158, 188],
    shallow: [206, 234, 248],
    alpha: 0.85,
    surface: 'ripples',
    hazard: null,
  },
  {
    id: 'tar_pit',
    label: 'Teergrube',
    body: [26, 22, 20],
    shallow: [74, 63, 54],
    alpha: 1,
    surface: 'bubbles',
    hazard: null,
  },
  {
    id: 'meltwater',
    label: 'Schmelzwasser',
    body: [92, 134, 150],
    shallow: [182, 218, 226],
    alpha: 0.72,
    surface: 'grain',
    hazard: null,
  },
]);

// ------------------------------------------------------------------ Ambiente

/**
 * Begleitelemente. Jedes nennt, wie viele Exemplare gestreut werden und wie sie
 * schwanken. Die Farben kommen aus der Himmelart, damit ein Regenbogen nicht im
 * Smog leuchtet.
 */
export const AMBIENT_KINDS = Object.freeze({
  clouds_few: { count: [4, 7], scale: [0.5, 0.9], alpha: 0.75, drift: 0.02, band: [0.05, 0.45] },
  clouds_heavy: { count: [7, 12], scale: [0.7, 1.3], alpha: 0.85, drift: 0.035, band: [0.02, 0.5] },
  clouds_storm: { count: [8, 14], scale: [0.9, 1.7], alpha: 0.92, drift: 0.06, band: [0, 0.55] },
  rain: { count: [140, 220], scale: [0.6, 1.1], alpha: 0.5, drift: 0.5, band: [0, 1] },
  snow: { count: [90, 160], scale: [0.4, 1], alpha: 0.8, drift: 0.06, band: [0, 1] },
  lightning: { count: [1, 2], scale: [1, 1.6], alpha: 0.9, drift: 0, band: [0, 0.5] },
  stars: { count: [120, 220], scale: [0.4, 1.2], alpha: 0.85, drift: 0, band: [0, 0.7] },
  nebula_glow: { count: [2, 4], scale: [1.2, 2.4], alpha: 0.35, drift: 0.004, band: [0, 0.6] },
  aurora_bands: { count: [2, 4], scale: [1, 2], alpha: 0.4, drift: 0.01, band: [0, 0.4] },
  birds: { count: [3, 7], scale: [0.5, 1], alpha: 0.7, drift: 0.12, band: [0.08, 0.4] },
  embers: { count: [30, 70], scale: [0.4, 1], alpha: 0.8, drift: 0.05, band: [0.3, 1] },
  ash: { count: [50, 110], scale: [0.3, 0.9], alpha: 0.55, drift: 0.04, band: [0, 1] },
  haze: { count: [3, 5], scale: [1.5, 2.5], alpha: 0.3, drift: 0.008, band: [0.25, 0.65] },
  fog_banks: { count: [5, 9], scale: [1.4, 2.6], alpha: 0.45, drift: 0.015, band: [0.2, 0.7] },
  bubbles: { count: [20, 45], scale: [0.3, 0.8], alpha: 0.6, drift: 0.03, band: [0.4, 1] },
  fireflies: { count: [25, 55], scale: [0.3, 0.7], alpha: 0.85, drift: 0.04, band: [0.3, 0.9] },
  debris: { count: [15, 35], scale: [0.4, 1], alpha: 0.7, drift: 0.09, band: [0.2, 1] },
});

// ------------------------------------------------------------------ Landmarken

/**
 * Landmarken am Horizont. Sie liegen IMMER oberhalb der Geländekante, damit sie
 * sichtbar bleiben — das prozedurale Gelände bedeckt die untere Bildhälfte.
 */
export const LANDMARK_KINDS = Object.freeze([
  'mountain_ridge', 'hill_soft', 'cliff', 'city_skyline', 'forest_line',
  'palm_grove', 'cactus_field', 'ruins', 'temple', 'crystal_spires',
  'ice_peaks', 'coral_reef', 'dunes', 'mesa', 'rock_arch', 'none',
]);

// ------------------------------------------------------------------ Biome

/**
 * Je Biom: erlaubte Himmel, erlaubte Wasser, Landmarken und Bodenfarben.
 *
 * `ground` ist hier nötig, weil im generativen Betrieb kein Bild die Bodenfarbe
 * liefert. Dieselben Werte standen bisher im Kulissen-Katalog; für den
 * generativen Weg sind sie an das Biom gebunden, nicht an ein einzelnes Bild.
 */
export const SCENERY_BIOMES = Object.freeze({
  maritime: {
    label: 'Maritim & Meer',
    mapPreset: 'islands',
    sky: ['clear_day', 'overcast', 'thunderstorm', 'dusk', 'fog', 'moonlit_night', 'sandstorm', 'dawn_mist'],
    water: ['deep_sea', 'shallow_lake', 'frozen_lake', 'meltwater'],
    landmarks: ['cliff', 'coral_reef', 'rock_arch', 'mountain_ridge', 'ice_peaks'],
    ambient: ['clouds_few', 'birds', 'fog_banks', 'clouds_heavy', 'haze', 'debris'],
    ground: { surface: [110, 140, 120], deep: [45, 62, 60] },
    /*
     * Bodenvarianten — dieselbe Szene, vier Jahreszeiten.
     *
     * Warum das die größte Wirkung auf das Bild hat: Der Boden ist die
     * GRÖSSTE Fläche des Spiels (das Gelände bedeckt rund 47 % der Karte,
     * `TERRAIN_COVERAGE`). Eine einzige Farbe je Biom heißt: Nach drei Partien
     * sieht der Boden immer gleich aus, auch wenn Himmel und Wasser wechseln.
     * Die Varianten kommen aus demselben Seed wie alles andere — sie sind keine
     * Einstellung, sondern eine Ziehung.
     */
    groundVarianten: [
      { surface: [110, 140, 120], deep: [45, 62, 60] },
      { surface: [96, 128, 134], deep: [38, 54, 62] },
      { surface: [148, 152, 128], deep: [70, 74, 64] },
      { surface: [78, 96, 88], deep: [32, 44, 46] },
    ],
  },
  island: {
    label: 'Südsee & Karibik',
    mapPreset: 'islands',
    sky: ['clear_day', 'dusk', 'thunderstorm', 'dawn_mist', 'moonlit_night'],
    water: ['shallow_lake', 'deep_sea', 'meltwater'],
    landmarks: ['palm_grove', 'coral_reef', 'rock_arch', 'cliff'],
    ambient: ['clouds_few', 'birds', 'fireflies', 'lightning'],
    ground: { surface: [232, 214, 168], deep: [150, 130, 96] },
    groundVarianten: [
      { surface: [232, 214, 168], deep: [150, 130, 96] },
      { surface: [214, 188, 150], deep: [128, 104, 80] },
      { surface: [176, 196, 160], deep: [96, 118, 94] },
    ],
  },
  /*
   * Sintflut — Leitbiom der Geländeform `flooded`.
   *
   * Der generative Weg (Vorgabe im Menü) braucht die Werte hier, nicht nur in
   * den Kulissen: Ohne Eintrag fiele `pickScenery` auf `forest` zurück und eine
   * Flut sähe aus wie ein Wald. Genau das war der Zustand vorher.
   *
   * Die Listen sind auf Hochwasser abgestimmt: bedeckter Himmel, Sturm, Nebel;
   * Schlamm- und Flachwasser statt Meer; Ruinen und überflutete Waldkanten als
   * Landmarken; schwerer Regen als Ambiente. Kein `clear_day`, kein `birds` —
   * eine Sintflut bei Sonnenschein wäre eine andere Karte.
   */
  deluge: {
    label: 'Sintflut & Überschwemmung',
    mapPreset: 'flooded',
    sky: ['overcast', 'thunderstorm', 'fog', 'dusk', 'dawn_mist'],
    water: ['swamp_sludge', 'shallow_lake', 'tar_pit', 'meltwater'],
    landmarks: ['ruins', 'forest_line', 'cliff', 'city_skyline', 'rock_arch'],
    ambient: ['clouds_heavy', 'clouds_storm', 'rain', 'fog_banks', 'birds'],
    // Abgestimmt auf die Kulissen-Paletten: Schlamm ist gedämpft, nicht farbig.
    ground: { surface: [98, 98, 84], deep: [46, 50, 44] },
    /*
     * Die Varianten bleiben in derselben Farbfamilie (gedämpft, schlammig).
     * Eine Flut bei strahlend grünem Gras wäre eine andere Karte — hier ist die
     * Abwechslung die Menge an Schlamm, nicht die Sättigung.
     */
    groundVarianten: [
      { surface: [98, 98, 84], deep: [46, 50, 44] },
      { surface: [86, 82, 70], deep: [40, 40, 36] },
      { surface: [116, 106, 86], deep: [54, 50, 42] },
      { surface: [88, 96, 82], deep: [42, 50, 44] },
    ],
  },
  /*
   * Weite — Leitbiom der Geländeform `open` (die flachste Form, Höhenvarianz
   * rund 16). Der generative Weg braucht die Werte hier; ohne Eintrag fiele er
   * auf `forest` zurück und die offene Karte bekäme Waldränder.
   *
   * Deshalb: viel Himmel (klar und bedeckt, auch Dämmerung), nur sanfte
   * Landmarken (`hill_soft`, `forest_line`, `dunes`, `mesa`, `none`) — keine
   * Gipfel, die der Flachheit widersprechen. Vögel erlaubt: Eine Ebene ist kein
   * unwirtlicher Ort.
   */
  open: {
    label: 'Weite & Ebene',
    mapPreset: 'open',
    sky: ['clear_day', 'overcast', 'dusk', 'fog', 'sandstorm', 'dawn_mist', 'moonlit_night'],
    water: ['shallow_lake', 'meltwater', 'frozen_lake'],
    landmarks: ['hill_soft', 'forest_line', 'dunes', 'mesa', 'none', 'cactus_field'],
    ambient: ['clouds_few', 'clouds_heavy', 'birds', 'debris', 'fireflies', 'haze'],
    ground: { surface: [134, 120, 92], deep: [68, 62, 46] },
    groundVarianten: [
      { surface: [134, 120, 92], deep: [68, 62, 46] },
      { surface: [152, 136, 96], deep: [80, 70, 48] },
      { surface: [118, 128, 96], deep: [58, 66, 48] },
      { surface: [186, 180, 164], deep: [112, 108, 98] },
    ],
  },
  /*
   * Felsen — Leitbiom der Geländeform `spires` (die steilste Form, Höhenvarianz
   * rund 213). Hohe senkrechte Landmarken: `crystal_spires`, `mountain_ridge`,
   * `ice_peaks`, `cliff`. Kein `hill_soft` — ein sanfter Hügel im Hintergrund
   * einer Steilwandkarte wäre ein Widerspruch.
   */
  spires: {
    label: 'Hochgebirge & Karst',
    mapPreset: 'spires',
    sky: ['clear_day', 'overcast', 'dusk', 'aurora', 'fog', 'ice_haze', 'moonlit_night', 'thunderstorm'],
    water: ['shallow_lake', 'meltwater', 'frozen_lake'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'ice_peaks', 'cliff'],
    ambient: ['clouds_few', 'clouds_heavy', 'snow', 'fog_banks', 'haze', 'stars'],
    ground: { surface: [142, 138, 130], deep: [72, 70, 68] },
    groundVarianten: [
      { surface: [142, 138, 130], deep: [72, 70, 68] },
      { surface: [168, 160, 148], deep: [86, 82, 76] },
      { surface: [82, 86, 94], deep: [36, 38, 44] },
      { surface: [104, 118, 104], deep: [48, 56, 50] },
    ],
  },
  /*
   * Gewirr — Leitbiom der Geländeform `warren` (47 Geländesprünge je Breite,
   * gedacht für den Nahkampf). Enge, deckungsreiche Szenen: Ruinen, Felswände,
   * Waldkanten. Regen und Nebel statt klarer Sicht — die Karte soll sich eng
   * anfühlen, auch wenn das Gelände prozedural entsteht.
   */
  warren: {
    label: 'Gewirr & Enge',
    mapPreset: 'warren',
    sky: ['overcast', 'fog', 'dusk', 'smog', 'dawn_mist', 'thunderstorm'],
    water: ['shallow_lake', 'swamp_sludge', 'meltwater', 'tar_pit'],
    landmarks: ['ruins', 'cliff', 'forest_line', 'rock_arch', 'none', 'crystal_spires'],
    ambient: ['clouds_heavy', 'fog_banks', 'rain', 'fireflies', 'debris', 'haze'],
    ground: { surface: [112, 100, 84], deep: [54, 48, 40] },
    /*
     * Hier ist die Regel aus der Sichtprüfung eingebaut: Der Boden muss VOR dem
     * unruhigen Hintergrund ablesbar bleiben. Alle Varianten liegen deshalb in
     * gedeckten, erdigen Tönen — keiner nimmt die grüne Farbe der Kulisse an,
     * sonst verschwimmt die Geländekante mit dem Dickicht.
     */
    groundVarianten: [
      { surface: [112, 100, 84], deep: [54, 48, 40] },
      { surface: [96, 78, 62], deep: [46, 36, 28] },
      { surface: [126, 118, 106], deep: [60, 56, 50] },
      { surface: [104, 96, 74], deep: [48, 44, 34] },
    ],
  },
  alpine: {
    label: 'Gebirge & Alpin',
    mapPreset: 'mountains',
    sky: ['clear_day', 'overcast', 'aurora', 'galaxy', 'dusk', 'ice_haze', 'moonlit_night', 'dawn_mist', 'thunderstorm'],
    water: ['shallow_lake', 'deep_sea', 'meltwater', 'frozen_lake'],
    landmarks: ['mountain_ridge', 'ice_peaks', 'hill_soft', 'cliff', 'crystal_spires'],
    ambient: ['clouds_few', 'snow', 'stars', 'fog_banks', 'clouds_heavy', 'birds'],
    ground: { surface: [110, 148, 96], deep: [44, 62, 44] },
    groundVarianten: [
      { surface: [110, 148, 96], deep: [44, 62, 44] },
      { surface: [150, 164, 148], deep: [70, 80, 78] },
      { surface: [226, 236, 244], deep: [150, 172, 194] },
      { surface: [176, 158, 124], deep: [88, 78, 62] },
    ],
  },
  forest: {
    label: 'Wald & Wiese',
    mapPreset: 'hills',
    sky: ['clear_day', 'overcast', 'fog', 'dusk', 'dawn_mist', 'moonlit_night', 'thunderstorm'],
    water: ['shallow_lake', 'swamp_sludge', 'meltwater'],
    landmarks: ['forest_line', 'hill_soft', 'ruins', 'mountain_ridge', 'none'],
    ambient: ['clouds_few', 'birds', 'fireflies', 'fog_banks', 'clouds_heavy', 'rain'],
    ground: { surface: [104, 146, 86], deep: [42, 60, 40] },
    /*
     * Wald ist der HÄUFIGSTE Fall (`biomFuerCharakter` fällt darauf zurück) —
     * hier wirkt die Bodenvariante am stärksten. Die vier Varianten sind
     * Sommer, Herbst, Winter und Nacht: dieselben Hügel, vier Jahreszeiten.
     */
    groundVarianten: [
      { surface: [104, 146, 86], deep: [42, 60, 40] },
      { surface: [168, 132, 72], deep: [72, 54, 36] },
      { surface: [222, 232, 240], deep: [146, 168, 186] },
      { surface: [86, 92, 96], deep: [36, 40, 46] },
    ],
  },
  urban: {
    label: 'Stadt & Industrie',
    mapPreset: 'hills',
    sky: ['overcast', 'smog', 'thunderstorm', 'dusk', 'ash_storm', 'toxic_noon'],
    water: ['deep_sea', 'poison', 'quicksand', 'tar_pit'],
    landmarks: ['city_skyline', 'ruins', 'cliff', 'temple'],
    ambient: ['clouds_heavy', 'haze', 'ash', 'rain', 'clouds_storm', 'embers'],
    ground: { surface: [120, 124, 128], deep: [54, 58, 62] },
    groundVarianten: [
      { surface: [120, 124, 128], deep: [54, 58, 62] },
      { surface: [96, 92, 88], deep: [42, 40, 38] },
      { surface: [138, 122, 100], deep: [62, 54, 44] },
      { surface: [110, 116, 110], deep: [48, 52, 50] },
    ],
  },
  cosmos: {
    label: 'Universum & Galaxie',
    mapPreset: 'mountains',
    sky: ['galaxy', 'aurora', 'plasma_storm', 'moonlit_night'],
    water: ['void', 'deep_sea', 'poison'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'none', 'rock_arch'],
    ambient: ['stars', 'nebula_glow', 'debris', 'fireflies', 'embers'],
    ground: { surface: [96, 78, 124], deep: [32, 24, 52] },
    groundVarianten: [
      { surface: [96, 78, 124], deep: [32, 24, 52] },
      { surface: [72, 64, 96], deep: [24, 20, 36] },
      { surface: [124, 96, 108], deep: [44, 30, 44] },
    ],
  },
  abstract: {
    label: 'Abstrakt & Verrückt',
    mapPreset: 'hills',
    sky: ['galaxy', 'smog', 'dusk', 'plasma_storm', 'toxic_noon', 'sandstorm'],
    water: ['poison', 'void', 'lava', 'tar_pit'],
    landmarks: ['crystal_spires', 'none', 'rock_arch', 'city_skyline', 'temple'],
    ambient: ['nebula_glow', 'bubbles', 'fireflies', 'aurora_bands', 'embers', 'debris'],
    ground: { surface: [160, 72, 140], deep: [52, 24, 60] },
    groundVarianten: [
      { surface: [160, 72, 140], deep: [52, 24, 60] },
      { surface: [96, 168, 150], deep: [30, 64, 62] },
      { surface: [196, 148, 68], deep: [76, 52, 24] },
      { surface: [112, 108, 176], deep: [40, 36, 76] },
    ],
  },
  caverns: {
    label: 'Höhlenwelten',
    mapPreset: 'caverns',
    sky: ['ash_storm', 'fog', 'plasma_storm', 'moonlit_night', 'toxic_noon'],
    water: ['lava', 'shallow_lake', 'poison', 'quicksand', 'tar_pit'],
    landmarks: ['crystal_spires', 'rock_arch', 'none', 'mesa'],
    ambient: ['embers', 'bubbles', 'fireflies', 'ash', 'haze', 'lightning'],
    ground: { surface: [138, 124, 102], deep: [58, 52, 46] },
    /*
     * Eine Höhle ist dunkel — die Varianten gehen nach unten, nicht nach oben:
     * Basalt, Kalk, Kristall, aber keine helle Variante. Ein heller Boden in
     * einer Kaverne würde die Höhle zu einer Wiese machen.
     */
    groundVarianten: [
      { surface: [138, 124, 102], deep: [58, 52, 46] },
      { surface: [74, 76, 80], deep: [34, 36, 38] },
      { surface: [126, 152, 168], deep: [44, 62, 80] },
      { surface: [60, 50, 48], deep: [24, 20, 20] },
    ],
  },
  fantasy: {
    label: 'Fantasy',
    mapPreset: 'mountains',
    sky: ['dusk', 'aurora', 'galaxy', 'thunderstorm', 'dawn_mist', 'moonlit_night'],
    water: ['poison', 'swamp_sludge', 'shallow_lake', 'meltwater'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'temple', 'ruins', 'rock_arch'],
    ambient: ['clouds_few', 'fireflies', 'nebula_glow', 'aurora_bands', 'fog_banks', 'birds'],
    ground: { surface: [104, 142, 104], deep: [40, 58, 48] },
    groundVarianten: [
      { surface: [104, 142, 104], deep: [40, 58, 48] },
      { surface: [124, 100, 156], deep: [48, 40, 74] },
      { surface: [80, 96, 128], deep: [32, 40, 60] },
      { surface: [150, 128, 96], deep: [68, 56, 42] },
    ],
  },
  hyperreal: {
    label: 'Hyperrealismus',
    mapPreset: 'mountains',
    sky: ['clear_day', 'overcast', 'dusk', 'fog', 'dawn_mist', 'ice_haze', 'sandstorm'],
    water: ['shallow_lake', 'deep_sea', 'meltwater', 'frozen_lake'],
    landmarks: ['mountain_ridge', 'forest_line', 'dunes', 'cliff', 'hill_soft'],
    ambient: ['clouds_few', 'birds', 'fog_banks', 'clouds_heavy', 'haze'],
    ground: { surface: [126, 140, 98], deep: [52, 60, 44] },
    groundVarianten: [
      { surface: [126, 140, 98], deep: [52, 60, 44] },
      { surface: [216, 190, 144], deep: [140, 116, 80] },
      { surface: [88, 124, 72], deep: [34, 50, 32] },
      { surface: [128, 124, 112], deep: [54, 52, 48] },
    ],
  },
  western: {
    label: 'Cowboy & Western',
    mapPreset: 'hills',
    sky: ['clear_day', 'dusk', 'ash_storm', 'overcast', 'sandstorm', 'dawn_mist', 'moonlit_night'],
    water: ['quicksand', 'shallow_lake', 'meltwater', 'tar_pit'],
    landmarks: ['mesa', 'dunes', 'cactus_field', 'rock_arch', 'hill_soft'],
    ambient: ['clouds_few', 'birds', 'debris', 'haze', 'clouds_heavy'],
    ground: { surface: [200, 170, 124], deep: [124, 100, 68] },
    groundVarianten: [
      { surface: [200, 170, 124], deep: [124, 100, 68] },
      { surface: [178, 148, 106], deep: [104, 82, 56] },
      { surface: [156, 148, 96], deep: [66, 62, 44] },
      { surface: [214, 224, 232], deep: [142, 160, 176] },
    ],
  },
  noir: {
    label: 'Film Noir',
    mapPreset: 'hills',
    sky: ['overcast', 'fog', 'thunderstorm', 'moonlit_night'],
    water: ['deep_sea', 'swamp_sludge', 'tar_pit'],
    landmarks: ['city_skyline', 'cliff', 'ruins', 'rock_arch'],
    ambient: ['clouds_heavy', 'rain', 'fog_banks', 'haze', 'lightning'],
    ground: { surface: [74, 76, 80], deep: [30, 32, 36] },
    /*
     * Noir bleibt entsättigt — die Abwechslung ist der HELLIGKEITSGRAD, nicht
     * die Farbe. Ein bunter Boden würde die Szene nicht mehr Noir sein lassen.
     */
    groundVarianten: [
      { surface: [74, 76, 80], deep: [30, 32, 36] },
      { surface: [96, 94, 90], deep: [40, 40, 42] },
      { surface: [58, 62, 70], deep: [22, 24, 30] },
    ],
  },
});

/**
 * Leitbiom je Geländeform — hier nur HEREINGEREICHT und weitergegeben, NICHT
 * definiert.
 *
 * Die Tabelle steht an genau EINER Stelle: im Kulissen-Katalog
 * (`./backdrops.js`), wo die Regel entstanden ist und wo
 * `tests/backdrops.test.js` sie gegen die Biome durchsetzt.
 *
 * Vorher stand sie ZWEIMAL im Baum — hier und dort, ohne Import zwischen
 * beiden. Beide Fassungen waren wertgleich, und `tests/terrain-presets.test.js`
 * verglich sie Zeile für Zeile: Das hält die Kopien zusammen, beseitigt die
 * Doppelung aber nicht — „wer den einen Wert ändert, ändert nichts".
 *
 * Der Re-Export bleibt stehen, damit `pickScenery` unten und alle Leser dieser
 * Datei unverändert dieselbe Tabelle sehen. Eine Re-Export-Naht
 * (`export { NAME };`) ist KEINE zweite Definition; genau so unterscheidet es
 * auch der Wächter `tests/eine-regel-eine-stelle.test.js`.
 */
export { PRIMARY_BIOME_BY_PRESET };

// ------------------------------------------------------------------ Erzeugung

/** Findet eine Definition über ihre Kennung. */
function findById(liste, id) {
  return liste.find(eintrag => eintrag.id === id) ?? null;
}

/**
 * Streut Begleitelemente über die Fläche.
 *
 * Alle Werte sind auf 0–1 bezogen, nicht in Pixeln: So passt dieselbe Kulisse auf
 * jede Kartengröße, ohne neu erzeugt zu werden.
 */
function streueAmbiente(rng, arten, breite, hoehe) {
  const ergebnis = [];
  for (const artId of arten) {
    const def = AMBIENT_KINDS[artId];
    if (!def) continue;
    const anzahl = rng.nextInt(def.count[0], def.count[1]);
    for (let i = 0; i < anzahl; i += 1) {
      ergebnis.push({
        kind: artId,
        // x und y als Anteil der Kartengröße.
        x: rng.next(),
        y: def.band[0] + rng.next() * (def.band[1] - def.band[0]),
        scale: rng.nextFloat(def.scale[0], def.scale[1]),
        // Phase für die Bewegung: damit dieselbe Kulisse immer gleich aussieht.
        phase: rng.next(),
        seed: rng.nextInt(0, 999),
      });
    }
  }
  return { arten: [...arten], elemente: ergebnis, breite, hoehe };
}

/**
 * Wählt die Landmarken für den Horizont.
 *
 * Die Höhe liegt bewusst zwischen 0,28 und 0,44 der Bildhöhe: darüber beginnt
 * das Gelände (rund 0,47), darunter wäre die Landmarke verdeckt.
 */
function waehleLandmarken(rng, arten) {
  const auswahl = arten.filter(a => a !== 'none');
  if (auswahl.length === 0) return [];

  const anzahl = rng.nextInt(1, Math.min(2, auswahl.length));
  const landmarken = [];
  for (let i = 0; i < anzahl; i += 1) {
    const kind = auswahl[rng.nextIntBelow(auswahl.length)];
    landmarken.push({
      kind,
      // Über die Breite verteilt, damit sie sich nicht stapeln.
      x: (i + 0.5) / anzahl + rng.nextFloat(-0.12, 0.12),
      scale: rng.nextFloat(0.75, 1.35),
      flip: rng.nextBoolean(),
    });
  }
  return landmarken;
}

/**
 * Erzeugt eine vollständige Kulisse aus Seed und Geländeform.
 *
 * @param {number} seed
 * @param {string} [preset='hills'] - Geländeform; bestimmt die Auswahl
 * @param {string} [biomeId] - erzwingt ein Biom statt der Vorauswahl
 * @returns {object} Kulisse aus reinen Zahlen und Kennungen (netcode-tauglich)
 */
export function pickScenery(seed, preset = 'hills', biomeId = null) {
  const basisSeed = Math.abs(Math.floor(Number(seed) || 0)) >>> 0;
  const rng = new SeededRandom(basisSeed);

  const biomId = biomeId && SCENERY_BIOMES[biomeId]
    ? biomeId
    : (PRIMARY_BIOME_BY_PRESET[preset] ?? 'forest');
  const biom = SCENERY_BIOMES[biomId];

  const skyId = biom.sky[rng.nextIntBelow(biom.sky.length)];
  const waterId = biom.water[rng.nextIntBelow(biom.water.length)];
  const sky = findById(SKY_KINDS, skyId);
  const water = findById(WATER_KINDS, waterId);

  // Ambiente aus der Himmelart UND dem Biom: ein Gewitter bringt Regen mit, das
  // Biom ergänzt, was dort ohnehin vorkommt (Vögel, Glühwürmchen).
  const ambienteArten = [...new Set([...sky.ambient, ...biom.ambient])];
  const ambiente = streueAmbiente(rng, ambienteArten, 1, 1);

  const landmarken = waehleLandmarken(rng, biom.landmarks);

  // Himmelskörper: Position und Größe als Anteil.
  const himmelskoerper = sky.celestial
    ? {
      kind: sky.celestial,
      x: rng.nextFloat(0.15, 0.85),
      y: rng.nextFloat(0.08, 0.3),
      size: rng.nextFloat(0.05, 0.1),
      phase: rng.next(),
    }
    : null;

  /*
   * Der Boden — die größte Fläche des Bildes.
   *
   * Gezogen wird aus den Varianten des Bioms; fehlt die Liste (oder ist sie
   * leer), bleibt es beim festen Boden des Bioms. Die Ziehung steht bewusst am
   * ENDE: Himmel, Wasser, Ambiente und Landmarken hängen damit weiterhin an
   * denselben Zufallszahlen wie vorher — der Boden ist eine Aussage mehr, nicht
   * eine andere Reihenfolge.
   */
  const bodenVarianten = Array.isArray(biom.groundVarianten) && biom.groundVarianten.length > 0
    ? biom.groundVarianten
    : [biom.ground];
  const boden = bodenVarianten[rng.nextIntBelow(bodenVarianten.length)];

  return {
    seed: basisSeed,
    preset,
    biomeId: biomId,
    biomeLabel: biom.label,
    skyId,
    waterId,
    sky,
    water,
    ground: boden,
    celestial: himmelskoerper,
    landmarks: landmarken,
    ambient: ambiente,
    /**
     * Generator-Kennung, damit ein Replay erkennt, wie die Kulisse entstand.
     *
     * Sie ist von `scenery/1` auf `scenery/2` gestiegen, als die Bodenvarianten
     * und die neuen Himmel dazukamen: Für denselben Seed entsteht seither eine
     * ANDERE Kulisse. Die Kennung sagt genau das — eine alte Aufzeichnung ist
     * nicht falsch, sie stammt aus einer älteren Fassung.
     */
    generator: 'scenery/2',
  };
}

/** Nur die Kennungen — für Anzeige und Tests ohne Ballast. */
export function describeScenery(scenery) {
  return {
    biome: scenery.biomeId,
    sky: scenery.skyId,
    water: scenery.waterId,
    landmarks: scenery.landmarks.map(l => l.kind),
    ambientCount: scenery.ambient.elemente.length,
    celestial: scenery.celestial?.kind ?? null,
  };
}

export default SCENERY_BIOMES;

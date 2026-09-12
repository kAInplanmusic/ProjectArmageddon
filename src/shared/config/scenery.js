/**
 * Generative Kulissen: Himmel, Wasser, Ambiente und Landmarken.
 *
 * Warum generativ und nicht nur als fertiges Bild: Ein Bild hat ein festes
 * Seitenverhältnis. Sobald es Hochkant-Karten gibt, kann ein Querformatbild die
 * Fläche nicht mehr füllen, ohne dass Wesentliches weggeschnitten wird. Eine aus
 * Einzelteilen zusammengesetzte Kulisse dagegen passt sich jeder Größe an —
 * derselbe Baukasten füllt 1280x720 und 720x1280.
 *
 * Aufbau: Zwölf Biome bestimmen, WELCHE Bausteine zur Verfügung stehen; der Seed
 * wählt daraus. Damit sind die Kombinationen zahlreich (Himmel x Wasser x
 * Ambiente x Landmarken), aber jede Kombination ist reproduzierbar — nötig, damit
 * ein Replay dieselbe Landschaft zeigt wie das aufgezeichnete Spiel.
 *
 * Alle erzeugten Werte sind reine Zahlen, damit sie über den Netcode gehen
 * können: Der Server schickt den Seed, der Client baut dieselbe Kulisse.
 *
 * @module scenery
 */
import { SeededRandom } from '../prng.js';

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
    sky: ['clear_day', 'overcast', 'thunderstorm', 'dusk', 'fog'],
    water: ['deep_sea', 'shallow_lake'],
    landmarks: ['cliff', 'coral_reef', 'rock_arch', 'mountain_ridge'],
    ambient: ['clouds_few', 'birds', 'fog_banks'],
    ground: { surface: [110, 140, 120], deep: [45, 62, 60] },
  },
  island: {
    label: 'Südsee & Karibik',
    mapPreset: 'islands',
    sky: ['clear_day', 'dusk', 'thunderstorm'],
    water: ['shallow_lake', 'deep_sea'],
    landmarks: ['palm_grove', 'coral_reef', 'rock_arch'],
    ambient: ['clouds_few', 'birds'],
    ground: { surface: [232, 214, 168], deep: [150, 130, 96] },
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
    sky: ['overcast', 'thunderstorm', 'fog', 'dusk'],
    water: ['swamp_sludge', 'shallow_lake'],
    landmarks: ['ruins', 'forest_line', 'cliff', 'city_skyline'],
    ambient: ['clouds_heavy', 'clouds_storm', 'rain', 'fog_banks'],
    // Abgestimmt auf die Kulissen-Paletten: Schlamm ist gedämpft, nicht farbig.
    ground: { surface: [98, 98, 84], deep: [46, 50, 44] },
  },
  alpine: {
    label: 'Gebirge & Alpin',
    mapPreset: 'mountains',
    sky: ['clear_day', 'overcast', 'aurora', 'galaxy', 'dusk'],
    water: ['shallow_lake', 'deep_sea'],
    landmarks: ['mountain_ridge', 'ice_peaks', 'hill_soft'],
    ambient: ['clouds_few', 'snow', 'stars'],
    ground: { surface: [110, 148, 96], deep: [44, 62, 44] },
  },
  forest: {
    label: 'Wald & Wiese',
    mapPreset: 'hills',
    sky: ['clear_day', 'overcast', 'fog', 'dusk'],
    water: ['shallow_lake', 'swamp_sludge'],
    landmarks: ['forest_line', 'hill_soft', 'ruins'],
    ambient: ['clouds_few', 'birds', 'fireflies', 'fog_banks'],
    ground: { surface: [104, 146, 86], deep: [42, 60, 40] },
  },
  urban: {
    label: 'Stadt & Industrie',
    mapPreset: 'hills',
    sky: ['overcast', 'smog', 'thunderstorm', 'dusk', 'ash_storm'],
    water: ['deep_sea', 'poison', 'quicksand'],
    landmarks: ['city_skyline', 'ruins', 'cliff'],
    ambient: ['clouds_heavy', 'haze', 'ash', 'rain'],
    ground: { surface: [120, 124, 128], deep: [54, 58, 62] },
  },
  cosmos: {
    label: 'Universum & Galaxie',
    mapPreset: 'mountains',
    sky: ['galaxy', 'aurora', 'plasma_storm'],
    water: ['void', 'deep_sea'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'none'],
    ambient: ['stars', 'nebula_glow', 'debris'],
    ground: { surface: [96, 78, 124], deep: [32, 24, 52] },
  },
  abstract: {
    label: 'Abstrakt & Verrückt',
    mapPreset: 'hills',
    sky: ['galaxy', 'smog', 'dusk', 'plasma_storm'],
    water: ['poison', 'void', 'lava'],
    landmarks: ['crystal_spires', 'none', 'rock_arch'],
    ambient: ['nebula_glow', 'bubbles', 'fireflies'],
    ground: { surface: [160, 72, 140], deep: [52, 24, 60] },
  },
  caverns: {
    label: 'Höhlenwelten',
    mapPreset: 'caverns',
    sky: ['ash_storm', 'fog', 'plasma_storm'],
    water: ['lava', 'shallow_lake', 'poison', 'quicksand'],
    landmarks: ['crystal_spires', 'rock_arch', 'none'],
    ambient: ['embers', 'bubbles', 'fireflies'],
    ground: { surface: [138, 124, 102], deep: [58, 52, 46] },
  },
  fantasy: {
    label: 'Fantasy',
    mapPreset: 'mountains',
    sky: ['dusk', 'aurora', 'galaxy', 'thunderstorm'],
    water: ['poison', 'swamp_sludge', 'shallow_lake'],
    landmarks: ['crystal_spires', 'mountain_ridge', 'temple', 'ruins'],
    ambient: ['clouds_few', 'fireflies', 'nebula_glow'],
    ground: { surface: [104, 142, 104], deep: [40, 58, 48] },
  },
  hyperreal: {
    label: 'Hyperrealismus',
    mapPreset: 'mountains',
    sky: ['clear_day', 'overcast', 'dusk', 'fog'],
    water: ['shallow_lake', 'deep_sea'],
    landmarks: ['mountain_ridge', 'forest_line', 'dunes', 'cliff'],
    ambient: ['clouds_few', 'birds', 'fog_banks'],
    ground: { surface: [126, 140, 98], deep: [52, 60, 44] },
  },
  western: {
    label: 'Cowboy & Western',
    mapPreset: 'hills',
    sky: ['clear_day', 'dusk', 'ash_storm', 'overcast'],
    water: ['quicksand', 'shallow_lake'],
    landmarks: ['mesa', 'dunes', 'cactus_field', 'rock_arch'],
    ambient: ['clouds_few', 'birds', 'debris'],
    ground: { surface: [200, 170, 124], deep: [124, 100, 68] },
  },
  noir: {
    label: 'Film Noir',
    mapPreset: 'hills',
    sky: ['overcast', 'fog', 'thunderstorm'],
    water: ['deep_sea', 'swamp_sludge'],
    landmarks: ['city_skyline', 'cliff', 'ruins'],
    ambient: ['clouds_heavy', 'rain', 'fog_banks', 'haze'],
    ground: { surface: [74, 76, 80], deep: [30, 32, 36] },
  },
});

/** Leitbiom je Geländeform — dieselbe Regel wie im Kulissen-Katalog. */
export const PRIMARY_BIOME_BY_PRESET = Object.freeze({
  islands: 'maritime',
  mountains: 'alpine',
  hills: 'forest',
  caverns: 'caverns',
  // `flooded` hat sein Leitbiom bekommen (Sintflut).
  flooded: 'deluge',
  /*
   * Die drei übrigen später hinzugekommenen Geländeformen (`open`, `spires`,
   * `warren`) stehen hier ABSICHTLICH NICHT.
   *
   * Die Regel des Projekts lautet: Jede Geländeform hat ein eigenes Leitbiom,
   * und dessen `mapPreset` ist genau diese Form (siehe
   * `tests/backdrops.test.js`). Ein Leitbiom ist damit eine Kulissengruppe mit
   * eigenen Bildern — und eigene Bilder sind eine Inhaltsfrage, keine
   * Einstellung: Welche Szene zeigt „Offene Weite", welche „Gewirr"?
   *
   * Für die drei Formen fehlen diese Kulissen. Sie laufen bis dahin mit einer
   * beliebigen Szene: `pickScenery` fällt ohne Leitbiom auf `forest` zurück (oben
   * in dieser Datei). Spielbar und vollständig gezeichnet, aber ohne passende
   * Kulisse. Die Lücke ist in `tests/terrain-presets.test.js` und in
   * `tests/backdrops.test.js` namentlich festgehalten, damit sie sichtbar bleibt
   * und nicht als erledigt gilt.
   *
   * `flooded` ist erledigt: Es hat das Biom `deluge` mit vier eigenen Kulissen
   * (versunkene Stadt, Monsun, ertränkter Wald, Dammbruch).
   *
   * (Der Weg über ein BILD — `pickBackdrop` — ist hier nicht betroffen: Er wird
   * nur bei ausdrücklicher Wahl im Menü beschritten; Vorgabe ist die generative
   * Szene.)
   */
});

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

  return {
    seed: basisSeed,
    preset,
    biomeId: biomId,
    biomeLabel: biom.label,
    skyId,
    waterId,
    sky,
    water,
    ground: biom.ground,
    celestial: himmelskoerper,
    landmarks: landmarken,
    ambient: ambiente,
    /** Generator-Kennung, damit ein Replay erkennt, wie die Kulisse entstand. */
    generator: 'scenery/1',
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

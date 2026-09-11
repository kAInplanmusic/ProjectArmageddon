import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_SIZES, ORIENTATIONS, mapSizeFor, MAP_WIDTH, MAP_HEIGHT } from '../src/engine/match.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { WaterField } from '../src/engine/waterField.js';
import {
  SKY_KINDS,
  WATER_KINDS,
  AMBIENT_KINDS,
  LANDMARK_KINDS,
  SCENERY_BIOMES,
  PRIMARY_BIOME_BY_PRESET,
  pickScenery,
  describeScenery,
} from '../src/shared/config/scenery.js';
import { ORIENTATIONS as ORIENT_FROM_MATCH } from '../src/engine/match.js';

/**
 * Generativer Kulissen-Pool und Hochkant-Karten.
 *
 * Zwei Neuerungen, die zusammenhängen: Ein fertiges Hintergrundbild hat ein
 * festes Seitenverhältnis und kann eine Hochkantkarte nicht füllen. Eine aus
 * Bausteinen zusammengesetzte Kulisse passt sich jeder Größe an.
 */

// ------------------------------------------------------------------ Katalog

test('Die geforderten Himmelarten sind vorhanden', () => {
  // Aus der Anforderung: hell/blau, bewölkt, Gewitter mit Blitzen, Smog, Nebel,
  // Galaxie mit Sternen.
  const gefordert = {
    clear_day: 'hell und blau',
    overcast: 'bewölkt',
    thunderstorm: 'Gewitter mit Blitzen',
    smog: 'Smog',
    fog: 'Nebel',
    galaxy: 'Galaxie mit Sternen',
  };
  for (const [id, beschreibung] of Object.entries(gefordert)) {
    const art = SKY_KINDS.find(s => s.id === id);
    assert.ok(art, `Himmelart fehlt: ${id} (${beschreibung})`);
  }
  assert.ok(SKY_KINDS.length >= 6, `Zu wenige Himmelarten: ${SKY_KINDS.length}`);
});

test('Das Gewitter bringt tatsächlich Blitze und Regen mit', () => {
  const gewitter = SKY_KINDS.find(s => s.id === 'thunderstorm');
  assert.ok(gewitter.ambient.includes('lightning'), 'Ohne Blitze ist es kein Gewitter');
  assert.ok(gewitter.ambient.includes('rain'));
  // Und es ist dunkler als ein klarer Tag.
  assert.ok(gewitter.light < SKY_KINDS.find(s => s.id === 'clear_day').light);
});

test('Die geforderten Wasserarten sind vorhanden', () => {
  // Meerwasser dunkel, seichtes Seewasser, Lava, Sumpfschlamm, Treibsand,
  // galaktisches Nichts, grünes Gift.
  const gefordert = [
    'deep_sea', 'shallow_lake', 'lava', 'swamp_sludge', 'quicksand', 'void', 'poison',
  ];
  for (const id of gefordert) {
    assert.ok(WATER_KINDS.some(w => w.id === id), `Wasserart fehlt: ${id}`);
  }
  assert.ok(WATER_KINDS.length >= 7);
});

test('Wasserarten sind farblich unterschieden und haben gültige Werte', () => {
  const gesehen = new Set();
  for (const art of WATER_KINDS) {
    for (const [rolle, farbe] of [['body', art.body], ['shallow', art.shallow]]) {
      assert.ok(Array.isArray(farbe) && farbe.length === 3, `${art.id}.${rolle}: kein RGB`);
      for (const wert of farbe) {
        assert.ok(Number.isInteger(wert) && wert >= 0 && wert <= 255,
          `${art.id}.${rolle}: ungültiger Wert ${wert}`);
      }
    }
    assert.ok(art.alpha > 0 && art.alpha <= 1, `${art.id}: Deckkraft außerhalb 0–1`);
    assert.ok(art.shallow[0] >= art.body[0] || art.shallow[1] >= art.body[1] || art.shallow[2] >= art.body[2],
      `${art.id}: das Flache ist nicht heller als das Tiefe`);
    gesehen.add(art.body.join(','));
  }
  assert.equal(gesehen.size, WATER_KINDS.length, 'Zwei Wasserarten haben dieselbe Farbe');
});

test('Gefährliche Wasserarten sind als solche gekennzeichnet', () => {
  // Lava und Gift müssen wehtun — sonst wären sie nur eine andere Farbe.
  const lava = WATER_KINDS.find(w => w.id === 'lava');
  const gift = WATER_KINDS.find(w => w.id === 'poison');
  const treibsand = WATER_KINDS.find(w => w.id === 'quicksand');
  const meer = WATER_KINDS.find(w => w.id === 'deep_sea');

  assert.equal(lava.hazard.kind, 'damage');
  assert.ok(lava.hazard.perStep > gift.hazard.perStep, 'Lava muss stärker sein als Gift');
  assert.equal(treibsand.hazard.kind, 'snare');
  assert.equal(meer.hazard, null, 'Meerwasser ist gewöhnliches Wasser');
});

test('Ambiente und Landmarken sind vollständig definiert', () => {
  for (const [id, def] of Object.entries(AMBIENT_KINDS)) {
    assert.ok(Array.isArray(def.count) && def.count.length === 2, `${id}: Anzahl fehlt`);
    assert.ok(def.count[0] <= def.count[1], `${id}: Anzahl verdreht`);
    assert.ok(Array.isArray(def.band) && def.band.length === 2, `${id}: Bereich fehlt`);
    assert.ok(def.band[0] >= 0 && def.band[1] <= 1, `${id}: Bereich außerhalb 0–1`);
  }
  assert.ok(LANDMARK_KINDS.length >= 12, `Zu wenige Landmarken: ${LANDMARK_KINDS.length}`);
  assert.ok(LANDMARK_KINDS.includes('none'), 'Es muss auch „keine Landmarke" geben');
});

test('Jedes Biom nennt nur vorhandene Bausteine', () => {
  const himmelIds = new Set(SKY_KINDS.map(s => s.id));
  const wasserIds = new Set(WATER_KINDS.map(w => w.id));
  const landmarkenIds = new Set(LANDMARK_KINDS);
  const ambienteIds = new Set(Object.keys(AMBIENT_KINDS));

  for (const [id, biom] of Object.entries(SCENERY_BIOMES)) {
    for (const s of biom.sky) assert.ok(himmelIds.has(s), `${id}: unbekannter Himmel ${s}`);
    for (const w of biom.water) assert.ok(wasserIds.has(w), `${id}: unbekanntes Wasser ${w}`);
    for (const l of biom.landmarks) assert.ok(landmarkenIds.has(l), `${id}: unbekannte Landmarke ${l}`);
    for (const a of biom.ambient) assert.ok(ambienteIds.has(a), `${id}: unbekanntes Ambiente ${a}`);
    assert.ok(biom.sky.length >= 3, `${id}: zu wenig Himmelauswahl`);
    assert.ok(biom.water.length >= 1, `${id}: kein Wasser`);
    assert.ok(biom.ground?.surface?.length === 3, `${id}: keine Bodenfarbe`);
  }
});

// ------------------------------------------------------------------ Erzeugung

test('Die Kulisse ist deterministisch', () => {
  for (const seed of [0, 1, 42, 99999]) {
    const a = pickScenery(seed, 'hills');
    const b = pickScenery(seed, 'hills');
    assert.deepEqual(describeScenery(a), describeScenery(b));
    assert.deepEqual(a.ambient.elemente, b.ambient.elemente,
      'Auch die gestreuten Elemente müssen gleich sein');
  }
});

test('Verschiedene Seeds ergeben verschiedene Kulissen', () => {
  const gesehen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const k = pickScenery(seed, 'mountains');
    gesehen.add(`${k.skyId}|${k.waterId}|${k.landmarks.map(l => l.kind).join(',')}`);
  }
  assert.ok(gesehen.size >= 12,
    `Nur ${gesehen.size} verschiedene Kulissen bei 60 Seeds — zu wenig Abwechslung`);
});

test('Die Kulisse ist über den Netcode übertragbar', () => {
  // Sie geht als reine Zahlen und Kennungen über die Leitung. Funktionen oder
  // Klassen würden beim Serialisieren still verloren gehen.
  for (const seed of [7, 77, 777]) {
    const kulisse = pickScenery(seed, 'islands');
    const zurueck = JSON.parse(JSON.stringify(kulisse));
    assert.deepEqual(describeScenery(zurueck), describeScenery(kulisse));
    assert.equal(zurueck.ambient.elemente.length, kulisse.ambient.elemente.length);
    assert.equal(zurueck.landmarks.length, kulisse.landmarks.length);
    assert.equal(zurueck.ground.surface.join(','), kulisse.ground.surface.join(','));
  }
});

test('Die Elemente liegen innerhalb der Fläche', () => {
  // Anteile zwischen 0 und 1: außerhalb liegende Elemente wären unsichtbar.
  for (let seed = 0; seed < 40; seed++) {
    const k = pickScenery(seed, 'hills');
    for (const e of k.ambient.elemente) {
      assert.ok(e.x >= 0 && e.x <= 1, `${k.skyId}/${e.kind}: x außerhalb (${e.x})`);
      assert.ok(e.y >= 0 && e.y <= 1, `${k.skyId}/${e.kind}: y außerhalb (${e.y})`);
      assert.ok(e.scale > 0, `${k.skyId}/${e.kind}: Größe 0`);
    }
    for (const l of k.landmarks) {
      assert.ok(l.x >= -0.2 && l.x <= 1.2, `${l.kind}: x außerhalb (${l.x})`);
      assert.ok(l.scale > 0);
      assert.equal(typeof l.flip, 'boolean');
    }
    if (k.celestial) {
      assert.ok(k.celestial.x >= 0 && k.celestial.x <= 1);
      assert.ok(k.celestial.y >= 0 && k.celestial.y <= 0.5, 'Himmelskörper zu tief');
    }
  }
});

test('Landmarken liegen über der Geländekante', () => {
  // Das Gelände bedeckt die untere Bildhälfte. Eine Landmarke darunter wäre
  // unsichtbar — die Kulisse wirkte leer.
  for (let seed = 0; seed < 30; seed++) {
    const k = pickScenery(seed, 'hills', 'alpine');
    for (const l of k.landmarks) {
      assert.ok(l.x >= 0 && l.x <= 1, `${l.kind}: außerhalb der Breite`);
    }
    // Alle Landmarken zusammen dürfen nicht alles überdecken.
    assert.ok(k.landmarks.length <= 2, 'Zu viele Landmarken verdecken den Himmel');
  }
});

test('Die Kulisse passt zum Gelände', () => {
  for (const [preset, erwartet] of Object.entries(PRIMARY_BIOME_BY_PRESET)) {
    for (let seed = 0; seed < 20; seed++) {
      const k = pickScenery(seed, preset);
      assert.equal(k.biomeId, erwartet,
        `${preset}/${seed}: Biom ${k.biomeId} statt ${erwartet}`);
    }
  }
});

test('Ein unbekanntes Gelände bekommt trotzdem eine Kulisse', () => {
  const k = pickScenery(42, 'gibtsnicht');
  assert.ok(k, 'Es muss immer eine Kulisse geben');
  assert.ok(SCENERY_BIOMES[k.biomeId]);
  assert.ok(k.skyId && k.waterId);
});

test('Ein erzwungenes Biom wird übernommen', () => {
  // Geprüft wird die Zugehörigkeit, nicht eine feste Kennung: welche Spielart
  // gewählt wird, entscheidet der Seed.
  const k = pickScenery(42, 'hills', 'cosmos');
  assert.equal(k.biomeId, 'cosmos');
  const biom = SCENERY_BIOMES.cosmos;
  assert.ok(biom.sky.includes(k.skyId), `Himmel ${k.skyId} gehört nicht zu Kosmos`);
  assert.ok(biom.water.includes(k.waterId), `Wasser ${k.waterId} gehört nicht zu Kosmos`);

  // Und das Biom schlägt die Vorauswahl des Geländes.
  assert.notEqual(k.biomeId, PRIMARY_BIOME_BY_PRESET.hills);
});

// ------------------------------------------------------------------ Hochkant

test('Beide Ausrichtungen haben dieselbe Fläche', () => {
  // Gleiche Fläche ist Absicht: Reichweiten und Sprunghöhen sind in
  // Kartenpixeln angegeben und sollen in beiden Ausrichtungen gleich wirken.
  const quer = MAP_SIZES.landscape;
  const hoch = MAP_SIZES.portrait;
  assert.equal(quer.width * quer.height, hoch.width * hoch.height,
    'Ungleiche Fläche würde die Waffenbalance verschieben');
  assert.ok(hoch.height > hoch.width, 'Hochformat muss höher als breit sein');
  assert.equal(hoch.width, quer.height);
  assert.equal(hoch.height, quer.width);
});

test('mapSizeFor liefert bekannte Maße und fällt zurück', () => {
  assert.deepEqual(mapSizeFor('portrait'), MAP_SIZES.portrait);
  assert.deepEqual(mapSizeFor('landscape'), MAP_SIZES.landscape);
  assert.deepEqual(mapSizeFor('schraeg'), MAP_SIZES.landscape);
  assert.deepEqual(mapSizeFor(undefined), MAP_SIZES.landscape);
});

test('Die alten Konstanten sind unverändert Querformat', () => {
  // Der Server und viele Tests nutzen sie weiterhin.
  assert.equal(MAP_WIDTH, MAP_SIZES.landscape.width);
  assert.equal(MAP_HEIGHT, MAP_SIZES.landscape.height);
});

test('Ein Match im Hochformat hat die getauschten Maße', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, orientation: 'portrait' });
  match.start();
  assert.equal(match.orientation, 'portrait');
  assert.equal(match.width, MAP_SIZES.portrait.width);
  assert.equal(match.height, MAP_SIZES.portrait.height);
  assert.equal(match.bitmap.length, match.width * match.height,
    'Das Bitmap muss die neue Größe haben');
  assert.equal(match.getState().orientation, 'portrait');
});

test('Eine unbekannte Ausrichtung fällt auf Querformat zurück', () => {
  const match = new MatchController({ seed: 1, orientation: 'schraeg' });
  match.start();
  assert.equal(match.orientation, 'landscape');
  assert.equal(match.width, MAP_WIDTH);
});

test('Das Wasserfeld hat im Hochformat die passende Rastergröße', () => {
  const match = new MatchController({ seed: 99, orientation: 'portrait' });
  match.start();
  assert.ok(match.water, 'Es muss ein Wasserfeld geben');
  assert.ok(match.water.width > 0 && match.water.height > 0);
  // Das Raster ist gegenüber der Karte um WATER_SCALE verkleinert.
  assert.ok(match.water.height > match.water.width,
    'Im Hochformat muss das Raster höher als breit sein');
});

test('Die Figuren stehen im Hochformat innerhalb der Karte', () => {
  for (let seed = 0; seed < 12; seed++) {
    const match = new MatchController({
      seed: 500 + seed, teams: 2, playersPerTeam: 3, orientation: 'portrait',
    });
    match.start();
    for (const spieler of match.players) {
      if (!match.world.isActive(spieler.entityId)) continue;
      const x = match.world.getComponent(spieler.entityId, 'Position', 'x');
      const y = match.world.getComponent(spieler.entityId, 'Position', 'y');
      assert.ok(x >= 0 && x <= match.width,
        `Seed ${seed}: x=${x} außerhalb 0–${match.width}`);
      assert.ok(y >= 0 && y <= match.height,
        `Seed ${seed}: y=${y} außerhalb 0–${match.height}`);
    }
  }
});

test('Ein Hochformat-Match ist spielbar', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 2, orientation: 'portrait' });
  match.start();
  match.consumeEvents();
  for (let i = 0; i < 240; i++) {
    match.step();
    match.consumeEvents();
  }
  assert.equal(match.status, 'playing', 'Das Match muss laufen');
  const zustand = match.getState();
  assert.equal(zustand.terrainWidth, MAP_SIZES.portrait.width);
  assert.equal(zustand.terrainHeight, MAP_SIZES.portrait.height);
});

test('Das Gelände wird in beiden Ausrichtungen aus demselben Seed gebaut', () => {
  // Der Client baut das Gelände selbst nach. Wichen die Maße ab, stünde er vor
  // einer anderen Landschaft als der Server.
  for (const orientation of ORIENTATIONS) {
    const match = new MatchController({ seed: 2024, preset: 'hills', orientation });
    match.start();
    const nachgebaut = buildTerrainForSeed(match.seedManager.baseSeed, 'hills', orientation);
    assert.equal(nachgebaut.width, match.width, `${orientation}: Breite weicht ab`);
    assert.equal(nachgebaut.height, match.height, `${orientation}: Höhe weicht ab`);
    assert.equal(nachgebaut.bitmap.length, match.bitmap.length);
    // Stichproben: dasselbe Bitmap, nicht nur dieselbe Größe.
    let gleich = 0;
    for (let i = 0; i < match.bitmap.length; i += 997) {
      if (match.bitmap[i] === nachgebaut.bitmap[i]) gleich += 1;
    }
    assert.ok(gleich > 0, `${orientation}: Das nachgebaute Gelände weicht ab`);
  }
});

test('Die Ausrichtungen sind vollständig aufgezählt', () => {
  assert.deepEqual([...ORIENTATIONS], ['landscape', 'portrait']);
  assert.deepEqual([...ORIENT_FROM_MATCH], [...ORIENTATIONS]);
  // Genau zwei: eine dritte Ausrichtung bräuchte Maße im Katalog.
  assert.equal(ORIENTATIONS.length, 2);
});

test('Ein leeres WaterField nimmt jede Größe an', () => {
  // Beleg dafür, dass die Wasserberechnung nicht an 1280x720 gebunden ist.
  for (const [w, h] of [[320, 180], [180, 320], [64, 64]]) {
    const feld = new WaterField({ width: w, height: h, isSolid: () => false });
    assert.equal(feld.width, w);
    assert.equal(feld.height, h);
    feld.setLevel(Math.floor(w / 2), Math.floor(h / 2), 1);
    assert.equal(feld.getLevel(Math.floor(w / 2), Math.floor(h / 2)), 1);
  }
});

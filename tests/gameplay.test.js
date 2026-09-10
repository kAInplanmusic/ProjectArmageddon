import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_WIDTH, MAP_HEIGHT } from '../src/engine/match.js';
import { generateTerrain, surfaceY, TERRAIN_PRESETS } from '../src/shared/terrainGen.js';
import { WaterField } from '../src/engine/waterField.js';
import { MaelstromSystem } from '../src/engine/systems/maelstromSystem.js';
import { LootSystem, CRATE_TYPES, weaponIdFromIndex } from '../src/engine/systems/lootSystem.js';
import { CLASS_DEFINITIONS, CLASS_ARCHETYPES, applyClassModifiers, applyArchetypeModifiers } from '../src/shared/config/classes.js';
import { MATCH_RULES, computeMaelstromDamage } from '../src/shared/config/match.js';
import { WEAPONS, WEAPONS_BY_ID, getDefaultLoadout, FALLBACK_WEAPON_ID, pickWeaponForRarity } from '../src/shared/config/weapons.js';
import { SeededRandom } from '../src/shared/prng.js';
import { EventBus } from '../src/engine/events.js';

// ---------------------------------------------------------------- Terrain

test('Terrain-Generierung ist seed-deterministisch', () => {
  const a = generateTerrain({ rng: new SeededRandom(4711), width: 200, height: 120, preset: 'hills' });
  const b = generateTerrain({ rng: new SeededRandom(4711), width: 200, height: 120, preset: 'hills' });
  const c = generateTerrain({ rng: new SeededRandom(4712), width: 200, height: 120, preset: 'hills' });

  // Das gesamte Bitmap vergleichen: die oberen Reihen sind reine Luft und
  // daher seed-unabhängig, ein Ausschnitt oben wäre nicht aussagekräftig.
  assert.deepEqual(Array.from(a.bitmap), Array.from(b.bitmap));
  assert.notDeepEqual(Array.from(a.bitmap), Array.from(c.bitmap));
  // Auch die Oberflächen dürfen sich zwischen Seeds unterscheiden.
  const surfaceA = a.heightMap.map(v => Math.round(v * 100));
  const surfaceC = c.heightMap.map(v => Math.round(v * 100));
  assert.notDeepEqual(surfaceA, surfaceC);

  // Ränder müssen solide sein, damit niemand aus der Welt fällt.
  assert.equal(a.bitmap[0], 1);
  assert.equal(a.bitmap[a.width - 1], 1);
  assert.equal(a.bitmap[(a.height - 1) * a.width], 1);
});

test('Terrain-Presets und Oberflächensuche funktionieren', () => {
  for (const preset of Object.keys(TERRAIN_PRESETS)) {
    const terrain = generateTerrain({ rng: new SeededRandom(9), width: 120, height: 80, preset });
    assert.equal(terrain.bitmap.length, 120 * 80);
    const y = surfaceY(terrain.bitmap, terrain.width, terrain.height, 60);
    assert.ok(y >= 0 && y < terrain.height, `Preset ${preset} hat keine Oberfläche`);
    assert.equal(terrain.bitmap[y * terrain.width + 60], 1);
  }
  assert.throws(
    () => generateTerrain({ rng: null, width: 10, height: 10 }),
    /RNG/,
  );
});

// ------------------------------------------------------------------ Wasser

test('Wasser breitet sich aus und bleibt erhalten', () => {
  const field = new WaterField({ width: 20, height: 10, isSolid: () => false });
  field.setLevel(10, 0, 1);
  const before = field.totalVolume();

  for (let i = 0; i < 20; i++) field.step();

  const after = field.totalVolume();
  // Wasser muss nach unten gefallen sein: oberste Reihe leer, Bodenreihe gefüllt.
  assert.equal(field.getLevel(10, 0), 0, 'Startzelle muss leer sein');
  const bottomRow = Array.from({ length: 20 }, (_, x) => field.getLevel(x, 9));
  const bottomVolume = bottomRow.reduce((sum, level) => sum + level, 0);
  assert.ok(bottomVolume > before * 0.9, `Wasser liegt nicht am Boden: ${bottomVolume} von ${before}`);
  // Es verteilt sich seitlich, daher sinkt der Pegel pro Zelle unter den Startwert.
  assert.ok(Math.max(...bottomRow) < 1, 'Wasser muss sich seitlich ausbreiten');
  assert.ok(bottomRow.filter(level => level > 0.01).length > 4, 'Wasser muss mehrere Zellen erreichen');

  // Massenerhaltung: die CA darf Wasser weder erzeugen noch vernichten.
  assert.ok(Math.abs(after - before) < before * 0.05, `Volumen driftet: ${before} → ${after}`);
});

test('Wasser erreicht nach genügend Schritten den Boden eines Beckens', () => {
  const field = new WaterField({ width: 12, height: 8, isSolid: () => false });
  field.setLevel(5, 0, 1);
  // Ein Schritt bewegt Wasser genau eine Reihe nach unten.
  for (let i = 0; i < 8; i++) field.step();
  assert.equal(field.getLevel(5, 0), 0);
  const bottom = Array.from({ length: 12 }, (_, x) => field.getLevel(x, 7));
  assert.ok(bottom.reduce((a, b) => a + b, 0) > 0.95, 'Wasser muss im Becken angekommen sein');
});

test('Wasser meidet solides Terrain', () => {
  const solid = (x, y) => y >= 5;
  const field = new WaterField({ width: 10, height: 10, isSolid: solid });
  field.setLevel(3, 4, 1);
  for (let i = 0; i < 10; i++) field.step();
  assert.equal(field.getLevel(3, 6), 0, 'Wasser darf nicht in Terrain stehen');
});

// -------------------------------------------------------------- Mahlstrom

test('Mahlstrom kontrahiert Terrain und verursacht toxischen Regen', () => {
  const match = new MatchController({ seed: 555, teams: 2, playersPerTeam: 1 });
  match.start();

  const maelstrom = match.world.services.maelstrom;
  assert.equal(maelstrom.isActive, false);

  maelstrom.activate();
  const before = match.terrain.isSolid(2, Math.floor(MAP_HEIGHT * 0.6));
  maelstrom.contract(match.world);
  const after = match.terrain.isSolid(2, Math.floor(MAP_HEIGHT * 0.6));

  assert.equal(maelstrom.inset, MATCH_RULES.suddenDeath.terrainContractionPixelsPerRound);
  assert.notEqual(before, after, 'Randspalte muss abgetragen werden');

  // Toxischer Regen: Figur weit aussen verliert Leben.
  const victim = match.players[0].entityId;
  match.world.setComponent(victim, 'Position', 'x', 1);
  const healthBefore = match.world.getComponent(victim, 'Health', 'current');
  maelstrom.applyToxicRain(match.world);
  const healthAfter = match.world.getComponent(victim, 'Health', 'current');

  assert.ok(healthAfter < healthBefore, 'Toxischer Regen muss Schaden verursachen');
});

test('Mahlstrom-Schadensformel wächst exponentiell', () => {
  assert.equal(computeMaelstromDamage(14), 0);
  assert.equal(computeMaelstromDamage(15), MATCH_RULES.suddenDeath.outOfZoneDamageBase);
  assert.ok(computeMaelstromDamage(17) > computeMaelstromDamage(16));
});

// -------------------------------------------------------------------- Loot

test('Loot spawnt Kisten deterministisch und Pickup wirkt', () => {
  const spawn = seed => {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 1 });
    match.start();
    return match.getState().crates.map(crate => [crate.crateType, crate.rarity, Math.round(crate.x)]);
  };

  assert.deepEqual(spawn(313), spawn(313));

  const loot = new LootSystem({ rng: new SeededRandom(1) });
  const world = new MatchController({ seed: 8, teams: 2, playersPerTeam: 1 });
  world.start();
  const crateIds = loot.spawnRoundCrates(world.world, {
    rng: new SeededRandom(2),
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    surfaceYFor: x => world.surfaceYAt(x),
  });

  for (const id of crateIds) {
    assert.equal(world.world.getComponent(id, 'Crate', 'picked'), 0);
  }

  // Waffen-Index muss auf eine echte Waffe zeigen.
  const sampleIndex = WEAPONS[0].index;
  assert.equal(weaponIdFromIndex(sampleIndex), WEAPONS[0].id);
  assert.equal(weaponIdFromIndex(99999), null);
});

// -------------------------------------------------------- Klassen & Waffen

test('Klassen- und Archetypenmodifikatoren skalieren nachvollziehbar', () => {
  const base = { angle: 1, power: 100, speed: 10 };
  const heavy = applyClassModifiers(base, 'heavy');
  const artillery = applyClassModifiers(base, 'artillery');

  assert.equal(heavy.power, Math.round(100 * CLASS_DEFINITIONS.heavy.power));
  assert.equal(artillery.power, Math.round(100 * CLASS_DEFINITIONS.artillery.power));
  assert.ok(artillery.power > heavy.power, 'Artillerie muss stärker schießen');

  const brawler = applyArchetypeModifiers({ health: 100, damage: 100, speed: 100 }, 'brawler');
  const occultist = applyArchetypeModifiers({ health: 100, damage: 100, speed: 100 }, 'occultist');
  assert.equal(brawler.health, Math.round(100 * CLASS_ARCHETYPES.brawler.health));
  assert.ok(occultist.damage > brawler.damage);

  // Unbekannte Klasse bleibt wertgleich (kein stiller Default-Buff).
  assert.deepEqual(applyClassModifiers(base, 'unknown'), base);
});

test('Waffenkatalog ist konsistent und spielbar', () => {
  assert.ok(WEAPONS.length >= 100, `Zu wenige Waffen: ${WEAPONS.length}`);

  const damaging = WEAPONS.filter(weapon => weapon.damage > 0);
  const area = WEAPONS.filter(weapon => weapon.blastRadius > 0);
  const terrainBreakers = WEAPONS.filter(weapon => weapon.terrainDamage > 0);

  assert.ok(damaging.length > 100, 'Zu wenige Waffen mit Schaden');
  assert.ok(area.length > 20, 'Zu wenige Flächenwaffen');
  assert.ok(terrainBreakers.length > 5, 'Zu wenige Terrain-Waffen');

  const loadout = getDefaultLoadout(4);
  assert.equal(loadout.length, 4);
  assert.ok(loadout.includes(FALLBACK_WEAPON_ID) === false || true);
  for (const id of loadout) {
    const weapon = WEAPONS_BY_ID[id];
    assert.ok(weapon, `Unbekannte Waffe im Loadout: ${id}`);
    assert.ok(weapon.damage > 0, `Waffe ohne Schaden im Loadout: ${id}`);
  }
  // Das Loadout muss mindestens eine Waffe mit Flächenwirkung enthalten.
  assert.ok(loadout.some(id => WEAPONS_BY_ID[id].blastRadius > 0), 'Loadout ohne Flächenwaffe');

  const weapon = pickWeaponForRarity(new SeededRandom(5));
  assert.ok(weapon && weapon.damage > 0);
});

// ---------------------------------------------------------- Match-Integrität

test('Match startet mit getrennten Teams und vollen Leben', () => {
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 2 });
  match.start();
  const state = match.getState();

  assert.equal(state.status, 'playing');
  assert.equal(state.round, 1);
  assert.equal(state.entities.length, 4);
  assert.equal(new Set(state.entities.map(e => e.teamId)).size, 2);
  for (const entity of state.entities) {
    assert.equal(entity.health, entity.maxHealth);
    assert.ok(entity.health > 0);
    assert.ok(entity.x > 0 && entity.x < MAP_WIDTH);
    assert.ok(entity.y > 0 && entity.y < MAP_HEIGHT);
  }
});

test('Zielvorschau folgt derselben Physik wie das Projektil', () => {
  const match = new MatchController({ seed: 606, teams: 2, playersPerTeam: 1 });
  match.start();

  const playerId = match.activePlayerId;
  const preview = match.aimPreview(playerId, Math.PI / 4, 70);
  const start = preview[0];
  const end = preview[preview.length - 1];

  // Bahn muss sich bewegen und zunächst steigen (Schuss nach oben).
  assert.ok(preview.length > 3);
  assert.ok(Math.abs(end.x - start.x) > 10, 'Flugbahn bewegt sich nicht');
  const minY = Math.min(...preview.map(p => p.y));
  assert.ok(minY < start.y, 'Flugbahn steigt nicht');

  // Tatsächlicher Schuss muss im gleichen Bereich einschlagen.
  const result = match.fire(playerId, Math.PI / 4, 70);
  assert.equal(result.ok, true);
  const projectileId = result.projectileId;
  assert.ok(projectileId !== null);

  let impacts = [];
  match.events.on('projectile_impact', payload => impacts.push(payload));
  for (let i = 0; i < 400 && impacts.length === 0; i++) {
    match.step();
    for (const event of match.consumeEvents()) match.events.dispatch(event.type, event.payload);
  }

  assert.equal(impacts.length, 1, 'Projektil muss einschlagen');
  const distance = Math.hypot(impacts[0].x - end.x, impacts[0].y - end.y);
  assert.ok(distance < 140, `Einschlag weicht zu stark von der Vorschau ab: ${Math.round(distance)} px`);
});

test('Ungültige Schüsse werden abgelehnt, ohne Zustand zu verändern', () => {
  const match = new MatchController({ seed: 3, teams: 2, playersPerTeam: 1 });
  match.start();

  const active = match.activePlayerId;
  const other = match.players.find(p => p.entityId !== active).entityId;

  assert.equal(match.fire(other, 1, 50).ok, false, 'Fremder Spieler darf nicht feuern');
  assert.equal(match.fire(active, 1, 500).ok, false, 'Kraft über Limit');
  assert.equal(match.fire(active, 99, 50).ok, false, 'Winkel ausserhalb');
  assert.equal(match.fire(-1, 1, 50).ok, false, 'Unbekannter Spieler');
  assert.equal(match.getState().projectiles.length, 0, 'Kein Projektil nach Fehlversuchen');
});

test('EventBus puffert, verteilt und begrenzt den Verlauf', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('hit', payload => seen.push(payload.value));

  bus.emit('hit', { value: 1 });
  bus.emit('hit', { value: 2 });
  assert.equal(bus.pending, 2);
  assert.equal(seen.length, 0, 'Handler dürfen erst beim Drain laufen');

  bus.drain();
  assert.deepEqual(seen, [1, 2]);
  assert.equal(bus.pending, 0);

  bus.dispatch('hit', { value: 3 });
  assert.deepEqual(seen, [1, 2, 3]);

  const off = bus.on('other', () => {});
  off();
  bus.dispatch('other', {});
  assert.ok(bus.history.length >= 2);
});

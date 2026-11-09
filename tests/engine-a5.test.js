/**
 * A5 — Engine-Entkopplung, Allokationen und Renderer-Testbarkeit.
 *
 * Deckt die vier Punkte des Pakets ab:
 *  - ENG-1: Wurf/Abwurf zieht aus eigenem Strom; ohne eigenen Strom bleibt der
 *           alte Pfad (Fassung 1) Zeichen für Zeichen derselbe.
 *  - ENG-6: ECS-Query und LootSystem legen je Tick keine Wegwerflisten mehr an;
 *           das Verhalten (Reihenfolge, Aufsammeln) bleibt gleich.
 *  - ENG-7: `registerSystem` sortiert nicht mehr bei jeder Anmeldung; die
 *           Ausführungsreihenfolge bleibt Priorität, bei Gleichstand Anmeldung.
 *  - ENG-12: `renderer.js` ist in `node --test` ladbar; die Kistenlogik liegt
 *           ohne Canvas in `rendererLogik.js`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/ecs/world.js';
import { COMPONENT_SIGNATURES } from '../src/engine/ecs/componentStore.js';
import { registerDefaultComponents } from '../src/engine/init.js';
import { LootSystem, CRATE_TYPES, RARITY_IDS } from '../src/engine/systems/lootSystem.js';
import { rolleWurf } from '../src/engine/kistenWurf.js';
import { LOOT_DROP_RULES } from '../src/shared/config/loot.js';
import { kistenFarbe, kistenMarke } from '../src/client/rendererLogik.js';

test('ENG-7: Ausführungsreihenfolge hängt nur an der Priorität, nicht an der Anmeldung', () => {
  const welt = new World();
  const folge = [];
  const system = name => ({ update() { folge.push(name); } });
  // Absichtlich unsortiert angemeldet.
  welt.registerSystem('mitte', system('mitte'), 20);
  welt.registerSystem('spaet', system('spaet'), 10);
  welt.registerSystem('frueh', system('frueh'), 30);
  // Ohne Entity ruft der Tick kein System auf (wie bisher).
  welt.createEntity();

  welt.step();
  assert.deepEqual(folge, ['frueh', 'mitte', 'spaet']);

  // Nachträgliche Anmeldung muss die Liste erneut sortieren.
  folge.length = 0;
  welt.registerSystem('fruehst', system('fruehst'), 40);
  welt.step();
  assert.deepEqual(folge, ['fruehst', 'frueh', 'mitte', 'spaet']);
});

test('ENG-7: gleiche Priorität behält die Anmeldefolge (stabil)', () => {
  const welt = new World();
  const folge = [];
  const system = name => ({ update() { folge.push(name); } });
  welt.registerSystem('zuerst', system('zuerst'), 5);
  welt.registerSystem('danach', system('danach'), 5);
  welt.createEntity();
  welt.step();
  assert.deepEqual(folge, ['zuerst', 'danach']);
});

test('ENG-6: World.step reicht je System denselben Entity-Puffer wieder herein', () => {
  const welt = new World();
  registerDefaultComponents(welt.componentStore);
  const puffer = [];
  welt.registerSystem('leser', {
    signature: COMPONENT_SIGNATURES.POSITION,
    update(_world, entities) { puffer.push(entities); },
  });
  const a = welt.createEntity();
  welt.addComponent(a, 'Position', { x: 1, y: 2 });
  const b = welt.createEntity();
  welt.addComponent(b, 'Position', { x: 3, y: 4 });

  welt.step();
  welt.step();
  assert.equal(puffer.length, 2);
  assert.equal(puffer[0], puffer[1], 'jeder Tick legt eine neue Liste an');
  assert.deepEqual(puffer[0], [a, b]);
});

test('ENG-6: Signaturabfrage in einen vorhandenen Puffer leert und füllt ihn', () => {
  const welt = new World();
  registerDefaultComponents(welt.componentStore);
  const id = welt.createEntity();
  welt.addComponent(id, 'Position', { x: 0, y: 0 });
  welt.addComponent(id, 'Velocity', { x: 0, y: 0 });

  const ziel = [99, 98, 97];
  const zurueck = welt.getEntitiesBySignature(
    COMPONENT_SIGNATURES.POSITION | COMPONENT_SIGNATURES.VELOCITY,
    ziel,
  );
  assert.equal(zurueck, ziel, 'die Abfrage muss den übergebenen Puffer weitergeben');
  assert.deepEqual(ziel, [id]);
});

test('ENG-6: LootSystem sammelt in einem Tick mehrere Kisten mit derselben Figurenliste ein', () => {
  const welt = new World();
  registerDefaultComponents(welt.componentStore);
  const ereignisse = [];
  worldServicesSetzen(welt, { events: { emit: (typ, daten) => ereignisse.push({ typ, daten }) } });

  const fraktion = welt.createEntity();
  welt.addComponent(fraktion, 'Position', { x: 100, y: 300 });
  welt.addComponent(fraktion, 'Velocity', { x: 0, y: 0 });
  welt.addComponent(fraktion, 'Health', { current: 100, max: 100 });

  const kisten = [0, 1].map(i => {
    const id = welt.createEntity();
    welt.addComponent(id, 'Position', { x: 100 + i * 5, y: 300 });
    welt.addComponent(id, 'Velocity', { x: 0, y: 0 });
    welt.addComponent(id, 'Crate', {
      crateType: CRATE_TYPES.weapon, crateX: 100 + i * 5, crateY: 300, rarity: 0,
      weaponId: 1, picked: 0, ammo: 0, inFlight: 0, flightTicks: 0,
    });
    return id;
  });

  const loot = new LootSystem({ rng: { next: () => 0.5 } });
  loot.update(welt, kisten, 16.666);

  assert.equal(ereignisse.filter(e => e.typ === 'crate_pickup').length, 2);
  assert.equal(kisten.filter(id => welt.isActive(id)).length, 0, 'beide Kisten müssen aufgenommen sein');
});

test('ENG-1: ohne eigenen Kistenstrom zieht der Wurf weiter aus dem Match-Strom (Fassung 1)', () => {
  const folge = [];
  const rng = {
    nextBoolean() { folge.push('boolean'); return false; },
    nextFloat() { folge.push('float'); return 0.5; },
  };
  const wurf = rolleWurf({ rng });
  assert.deepEqual(folge, ['boolean', 'float', 'float'], 'Reihenfolge ist Teil der alten Fassung');
  assert.ok(Number.isFinite(wurf.vx) && Number.isFinite(wurf.vy));
});

test('ENG-12: renderer.js lässt sich in node --test laden', async () => {
  const modul = await import('../src/client/renderer.js');
  assert.equal(typeof modul.default, 'function');
  assert.equal(typeof modul.Renderer, 'function');
});

test('ENG-12: Kistenmarke und Farbe kommen aus der gemeinsamen Logik', () => {
  assert.equal(kistenMarke(CRATE_TYPES.weapon), 'gefuellt');
  assert.equal(kistenMarke(CRATE_TYPES.sustain), 'ring');
  assert.equal(kistenMarke(CRATE_TYPES.ammo), 'streifen');
  assert.equal(kistenMarke(CRATE_TYPES.trap), 'dreieck');
  assert.equal(kistenMarke(CRATE_TYPES.empty), 'leer');
  assert.equal(kistenMarke(999), 'leer', 'unbekannte Art fällt auf leer');

  assert.equal(kistenFarbe(0), LOOT_DROP_RULES.rarityColors[RARITY_IDS[0]]);
  assert.equal(kistenFarbe(999), LOOT_DROP_RULES.rarityColors.standard, 'unbekannte Stufe fällt auf standard');
});

test('ENG-12: Vite-Glob-Module werfen ohne Vite beim Import nicht', async () => {
  const roster = await import('../src/client/roster.js');
  assert.equal(roster.spriteUrl({ faction: 'x', sprite: 'y.png' }), null);
  assert.equal(roster.spriteCount(), 0);
  const kulissen = await import('../src/client/kulissenUrls.js');
  assert.equal(kulissen.kulissenUrl('gibt-es-nicht.webp'), undefined);
  const fraktionen = await import('../src/client/fraktionsIdentitaet.js');
  assert.equal(fraktionen.fraktionsIdentitaet('gibt-es-nicht'), null);
});

/** Kleiner Helfer: `World` hat kein öffentliches `services`-Feld in allen Fassungen. */
function worldServicesSetzen(welt, services) {
  welt.services = services;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameWorld } from '../src/engine/init.js';
import { EventBus } from '../src/engine/events.js';

test('DamageSystem emits one deterministic death and cleans up the entity', () => {
  const world = createGameWorld({ turnDuration: 1000 });
  const entity = world.createEntity();
  world.addComponent(entity, 'Health', { current: 10, max: 10 });
  const damage = world.getSystem('damage');
  const deaths = [];
  damage.onDeath((_world, id) => deaths.push(id));

  damage.applyDamage(world, entity, 10, 99);
  world.step();
  world.step();

  assert.deepEqual(deaths, [entity]);
  assert.equal(world.isActive(entity), false);

  // Das Kill-Feed führt seit Einführung der Schild-Absorption zusätzlich, wie
  // viel Schaden vom Schild abgefangen wurde. Hier gibt es kein Schild, der
  // Wert ist also 0 — geprüft wird er trotzdem, damit ein stiller Wegfall des
  // Feldes auffällt.
  assert.deepEqual(
    damage.killFeed,
    [{ target: entity, attacker: 99, damage: 10, absorbedByShield: 0, tick: 0 }],
  );
});

test('Die Schild-Absorption wird im Kill-Feed und im Ereignis gemeldet', () => {
  // Der Modifikator kommt normalerweise vom Match; hier wird er direkt gesetzt,
  // um das DamageSystem isoliert zu prüfen.
  const world = createGameWorld({ turnDuration: 1000 });
  const entity = world.createEntity();
  world.addComponent(entity, 'Health', { current: 100, max: 100 });

  // `createGameWorld` legt keine Services an — die kommen normalerweise vom
  // Match. Für den isolierten Test werden sie hier bereitgestellt.
  world.services = world.services ?? {};
  world.services.events = world.services.events ?? new EventBus();

  let schild = 30;
  world.services.damageModifier = (entityId, amount) => {
    if (entityId !== entity || schild <= 0) return { amount };
    const absorbed = Math.min(schild, amount);
    schild -= absorbed;
    return { amount: amount - absorbed };
  };

  const events = [];
  // `emit` puffert; erst `drain` verteilt die Ereignisse an die Handler.
  world.services.events.on('damage', payload => events.push(payload));

  const damage = world.getSystem('damage');
  damage.applyDamage(world, entity, 50, 7);
  world.services.events.drain();

  // 30 Schild, 20 treffen die Gesundheit.
  assert.equal(world.getComponent(entity, 'Health', 'current'), 80);
  const eintrag = damage.killFeed[damage.killFeed.length - 1];
  assert.equal(Math.round(eintrag.damage), 20);
  assert.equal(Math.round(eintrag.absorbedByShield), 30);
  assert.equal(schild, 0);

  // Das Ereignis muss denselben aufgeteilten Schaden melden, damit die Anzeige
  // „Schild absorbiert" darstellen kann.
  assert.equal(events.length, 1, 'Es muss genau ein Schadensereignis geben');
  assert.equal(Math.round(events[0].absorbedByShield), 30);
  assert.equal(Math.round(events[0].amount), 20);
  assert.equal(events[0].entityId, entity);
});

test('Ohne Modifikator bleibt der Schaden unverändert', () => {
  // Wichtig, weil Systeme auch ohne Match gebaut werden (Tests, Headless-Läufe).
  const world = createGameWorld({ turnDuration: 1000 });
  const entity = world.createEntity();
  world.addComponent(entity, 'Health', { current: 100, max: 100 });

  world.getSystem('damage').applyDamage(world, entity, 25, null);
  assert.equal(world.getComponent(entity, 'Health', 'current'), 75);
});
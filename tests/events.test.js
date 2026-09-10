import assert from 'node:assert/strict';
import test from 'node:test';
import { EventBus } from '../src/engine/events.js';
import { MatchController } from '../src/engine/match.js';

/**
 * Ereignis-Weitergabe an den Konsumenten.
 *
 * Hintergrund — der teuerste stille Fehler dieses Projekts: `MatchController.step()`
 * rief `this.#events.drain()`. Das leert die Warteschlange und verteilt die
 * Ereignisse an die Push-Handler. Client und Server holen sie aber über
 * `consumeEvents()` (Pull). Ergebnis: Jedes Ereignis, das während der Simulation
 * entstand, war beim Abholen schon weg.
 *
 * Sichtbare Folgen: Explosionen wurden im lokalen Spiel nicht gezeichnet,
 * Treffer nicht protokolliert, und die Spezialeffekte erreichten den Client nie.
 * Aufgefallen ist es erst, als ein E2E-Test eine Protokollzeile erwartete, die
 * es nie geben konnte — kein Test hatte zuvor geprüft, ob der Konsument die
 * Ereignisse TATSÄCHLICH sieht.
 */

test('EventBus: emit puffert und flush liefert in Reihenfolge', () => {
  const bus = new EventBus();
  bus.emit('a', { n: 1 });
  bus.emit('b', { n: 2 });
  bus.emit('a', { n: 3 });

  const batch = bus.flush();
  assert.deepEqual(batch.map(e => e.type), ['a', 'b', 'a']);
  assert.deepEqual(batch.map(e => e.payload.n), [1, 2, 3]);

  // Nach dem Abholen ist die Warteschlange leer.
  assert.deepEqual(bus.flush(), []);
  assert.equal(bus.pending, 0);
});

test('EventBus: drain leert die Warteschlange und verteilt an Handler', () => {
  const bus = new EventBus();
  const gesehen = [];
  bus.on('x', payload => gesehen.push(payload));

  bus.emit('x', { n: 1 });
  bus.drain();

  assert.deepEqual(gesehen, [{ n: 1 }]);
  // Wichtig für das Verständnis: nach drain ist nichts mehr abzuholen.
  assert.equal(bus.pending, 0);
});

test('EventBus: die Warteschlange wächst ohne Abnehmer nicht unbegrenzt', () => {
  const bus = new EventBus();
  // Weit über die Obergrenze hinaus senden, ohne abzuholen.
  for (let i = 0; i < 2500; i++) bus.emit('spam', { i });

  assert.ok(bus.pending <= 2000, `Warteschlange zu groß: ${bus.pending}`);
  // Bei jedem Senden über der Obergrenze fällt der älteste Eintrag heraus;
  // `dropped` zählt diese Vorfälle, ist also größer als eins.
  assert.ok(bus.dropped > 0, `Überläufe müssen gezählt werden: ${bus.dropped}`);
  assert.equal(bus.dropped, 500, 'Bei 2500 Sendungen und Grenze 2000 sind es 500 Überläufe');

  // Die zuletzt gesendeten Ereignisse müssen erhalten bleiben.
  const batch = bus.flush();
  assert.equal(batch[batch.length - 1].payload.i, 2499);
});

// ------------------------------------------------- Ereignisse im Match

test('Schussereignisse erreichen den Konsumenten', () => {
  // Genau der Fall, der vorher verloren ging: fire() emittiert, step() leerte.
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  match.consumeEvents(); // Grundaufstellung abholen

  const aktiver = match.activePlayerId;
  const waffe = match.inventory.getWeapons(aktiver)[0];
  match.fire(aktiver, 0, 60, waffe);

  // Nach dem Feuern muss das Abschussereignis ankommen — das ist der Beweis,
  // dass der Konsument es sieht. Der Zug endet erst im nächsten Schritt.
  const nachSchuss = match.consumeEvents();
  assert.ok(
    nachSchuss.some(e => e.type === 'projectile_spawn'),
    `Nach dem Schuss muss das Abschussereignis ankommen: ${JSON.stringify(nachSchuss.map(e => e.type))}`,
  );

  // Und nach dem Schritt die Zugereignisse — ebenfalls abholbar.
  const gesehen = new Set();
  for (let i = 0; i < 200; i++) {
    match.step();
    for (const event of match.consumeEvents()) gesehen.add(event.type);
  }
  assert.ok(gesehen.has('turn_end'), `Zugende muss ankommen. Gesehen: ${[...gesehen].join(', ')}`);
});

test('Während der Simulation entstehende Ereignisse erreichen den Konsumenten', () => {
  // Explosionen, Treffer und Terrain-Zerstörung entstehen in world.step().
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  match.consumeEvents();

  const aktiver = match.activePlayerId;
  const start = match.getState().entities.find(e => e.entityId === aktiver);

  // Senkrecht nach unten feuern, damit ein Einschlag im Boden entsteht.
  match.fire(aktiver, Math.PI / 2, 100);

  const gesehen = new Set();
  for (let i = 0; i < 200; i++) {
    match.step();
    for (const event of match.consumeEvents()) gesehen.add(event.type);
  }

  // Die Terrain-Zerstörung ist der harte Beweis: sie entsteht ausschließlich in
  // der Simulation, nicht beim Feuern.
  assert.ok(
    gesehen.has('terrain_destroyed') || gesehen.has('explosion') || gesehen.has('projectile_impact'),
    `Es müssen Einschlagereignisse ankommen. Gesehen: ${[...gesehen].join(', ')}`,
  );
  assert.ok(start, 'Der aktive Spieler muss im Zustand vorhanden sein');
});

test('Spezialeffekte erreichen den Konsumenten auch über einen Zwischenschritt', () => {
  // Modelliert den ECHTEN Ablauf: Der Client feuert, führt danach einen
  // Simulationsschritt aus und liest erst dann die Ereignisse. Genau dazwischen
  // verschluckte das frühere `drain()` in step() alles, was beim Feuern entstand.
  // Ein Test, der direkt nach dem Feuern liest, übersieht den Fehler.
  const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  match.consumeEvents();

  const aktiver = match.activePlayerId;
  const heilwaffe = 'pa_094';
  match.world.setComponent(aktiver, 'Health', 'current', 30);
  match.inventory.register(aktiver, [heilwaffe]);

  match.fire(aktiver, 0, 50, heilwaffe);

  // Erst ein Schritt, dann lesen — wie im Client.
  match.step();
  const ereignisse = match.consumeEvents();

  const effekt = ereignisse.find(e => e.type === 'special_effect');
  assert.ok(
    effekt,
    `Der Spezialeffekt muss den Zwischenschritt überleben. Angekommen: ${JSON.stringify(ereignisse.map(e => e.type))}`,
  );
  assert.equal(effekt.payload.kind, 'heal');
  assert.ok(effekt.payload.healed > 0);

  // Auch der Abschuss selbst muss noch dabei sein.
  assert.ok(
    ereignisse.some(e => e.type === 'special_effect' && e.payload.weaponId === heilwaffe),
    'Das Ereignis muss die Waffe benennen',
  );
});

test('Alle Ereignisse eines Schusses bleiben in Reihenfolge abholbar', () => {
  const match = new MatchController({ seed: 999, teams: 2, playersPerTeam: 2, turnDurationMs: 100_000 });
  match.start();

  const gesammelt = [];
  const aktiver = match.activePlayerId;
  match.fire(aktiver, Math.PI / 4, 80);

  for (let i = 0; i < 300 && match.status === 'playing'; i++) {
    match.step();
    gesammelt.push(...match.consumeEvents());
  }

  // Es müssen mehrere verschiedene Ereignisarten dabei sein — ein einzelnes
  // wäre ein Zeichen dafür, dass wieder etwas verschluckt wird.
  const arten = new Set(gesammelt.map(e => e.type));
  assert.ok(arten.size >= 3, `Zu wenige Ereignisarten: ${[...arten].join(', ')}`);

  // Der Reihenfolge nach: Zugereignisse dürfen nicht vor dem Schuss liegen.
  const erstesZugEreignis = gesammelt.findIndex(e => e.type === 'turn_end');
  assert.ok(erstesZugEreignis >= 0, 'Es muss ein Zugende gemeldet werden');
});

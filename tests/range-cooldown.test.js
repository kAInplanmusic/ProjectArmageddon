import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController, MAP_WIDTH } from '../src/engine/match.js';
import {
  WEAPONS,
  REFERENCE_PROJECTILE_SPEED,
  speedFactorFor,
  HITSCAN_RANGE_BY_CATEGORY,
} from '../src/shared/config/weapons.js';
import { buildEffect, SELF_TARGET_KINDS } from '../src/engine/specials.js';
import {
  simulateProjectileReach,
  deriveMaxRange,
  deriveCooldown,
} from '../scripts/build-weapon-catalog.mjs';

/**
 * Reichweite, Geschwindigkeit und Nachladezeit.
 *
 * Hintergrund: In den Quelldaten stand `maxRange` gar nicht, `projectile_speed`
 * wurde vom Motor ignoriert und `cooldown` war konstant 0. Alle 150 Waffen
 * flogen dadurch gleich schnell und gleich weit, und keine hatte eine Pause.
 * Diese Datei sichert die hergeleiteten Werte und ihre Wirkung im Spiel ab.
 */

// ------------------------------------------------------------- Geschwindigkeit

test('Jede Waffe hat einen Geschwindigkeitsfaktor im erlaubten Bereich', () => {
  for (const weapon of WEAPONS) {
    assert.ok(Number.isFinite(weapon.speedFactor),
      `${weapon.id}: kein Geschwindigkeitsfaktor`);
    assert.ok(weapon.speedFactor >= 0.6 && weapon.speedFactor <= 1.6,
      `${weapon.id}: Faktor außerhalb der Grenzen: ${weapon.speedFactor}`);
  }

  // Der Bezugswert ergibt genau Normaltempo.
  assert.equal(REFERENCE_PROJECTILE_SPEED, 70);
  assert.equal(speedFactorFor({ projectileSpeed: 70 }), 1);
  assert.equal(speedFactorFor({ projectileSpeed: 0 }), 1, 'Ohne Angabe Normaltempo');
  assert.equal(speedFactorFor({}), 1);
  // Ausreißer werden begrenzt, statt die Bahn unspielbar zu machen.
  assert.equal(speedFactorFor({ projectileSpeed: 100000 }), 1.6);
  assert.equal(speedFactorFor({ projectileSpeed: 1 }), 0.6);
});

test('Die Geschwindigkeit aus den Quelldaten ist nicht mehr tot', () => {
  // Vorher flog jedes Geschoss gleich schnell. Jetzt muss sich die tatsächliche
  // Anfangsgeschwindigkeit zwischen schnellen und langsamen Waffen unterscheiden.
  const unterschiedlich = new Set(WEAPONS.map(w => w.speedFactor));
  assert.ok(unterschiedlich.size >= 5,
    `Zu wenige verschiedene Geschwindigkeiten: ${unterschiedlich.size}`);

  // Schnelle Waffe -> größerer Faktor als langsame.
  const schnell = WEAPONS.reduce((a, b) => (b.projectileSpeed > a.projectileSpeed ? b : a));
  const langsam = WEAPONS.filter(w => w.projectileSpeed > 0)
    .reduce((a, b) => (b.projectileSpeed < a.projectileSpeed ? b : a));
  assert.ok(schnell.speedFactor > langsam.speedFactor,
    `Schnellste Waffe (${schnell.displayName}) muss einen höheren Faktor haben als die langsamste (${langsam.displayName})`);
});

test('Schnellere Waffen fliegen im Spiel tatsächlich weiter pro Tick', () => {
  // Wirkungsprüfung, nicht nur Datenprüfung: zwei Waffen mit unterschiedlichem
  // Geschwindigkeitsfaktor müssen unterschiedliche Anfangsgeschwindigkeit haben.
  const kandidaten = WEAPONS.filter(w => w.delivery === 'projectile' && w.damage > 0);
  const schnell = kandidaten.reduce((a, b) => (b.speedFactor > a.speedFactor ? b : a));
  const langsam = kandidaten.reduce((a, b) => (b.speedFactor < a.speedFactor ? b : a));
  assert.ok(schnell.speedFactor > langsam.speedFactor, 'Testannahme: verschiedene Faktoren');

  const messen = weapon => {
    const match = new MatchController({ seed: 7, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
    match.start();
    const spieler = match.activePlayerId;
    match.inventory.register(spieler, [weapon.id]);
    match.inventory.selectWeapon(spieler, weapon.id);
    match.fire(spieler, Math.PI / 4, 100, weapon.id);

    // Die Geschwindigkeit steht als Komponente in der Welt; der Zustand führt
    // sie nicht (der Client zeichnet Projektile an ihrer Position).
    const projektilId = match.getState().projectiles[0]?.entityId;
    assert.ok(projektilId !== undefined, `${weapon.id}: kein Projektil`);
    const vx = match.world.getComponent(projektilId, 'Velocity', 'x') ?? 0;
    const vy = match.world.getComponent(projektilId, 'Velocity', 'y') ?? 0;
    return Math.hypot(vx, vy);
  };

  const vSchnell = messen(schnell);
  const vLangsam = messen(langsam);
  assert.ok(vSchnell > vLangsam,
    `${schnell.displayName} (${vSchnell.toFixed(2)}) muss schneller fliegen als ${langsam.displayName} (${vLangsam.toFixed(2)})`);
});

// ----------------------------------------------------------------- Reichweite

test('maxRange ist für alle Waffen definiert und unterscheidet sich', () => {
  for (const weapon of WEAPONS) {
    assert.ok(Number.isInteger(weapon.maxRange), `${weapon.id}: maxRange keine Ganzzahl`);
    assert.ok(weapon.maxRange >= 110 && weapon.maxRange <= 1400,
      `${weapon.id}: maxRange außerhalb der Grenzen: ${weapon.maxRange}`);
  }

  // Vorher war der Wert bei allen 150 konstant 600 — das war der Fehler.
  const werte = new Set(WEAPONS.map(w => w.maxRange));
  assert.ok(werte.size >= 20,
    `Zu wenige verschiedene Reichweiten: ${werte.size} (vorher war es 1)`);
  assert.ok(!(werte.size === 1 && werte.has(600)), 'Der Konstantwert 600 darf nicht zurückkehren');
});

test('Nahkampf reicht am kürzesten, schweres Gerät am weitesten', () => {
  const spanne = kategorie => {
    const werte = WEAPONS.filter(w => w.category === kategorie).map(w => w.maxRange);
    return { min: Math.min(...werte), max: Math.max(...werte) };
  };

  const nahkampf = spanne('melee');
  const schwer = spanne('heavy_ranged');

  assert.ok(nahkampf.max < 250, `Nahkampf reicht zu weit: ${nahkampf.max} px`);
  assert.ok(schwer.max > 700, `Schweres Gerät reicht zu kurz: ${schwer.max} px`);
  assert.ok(schwer.max > nahkampf.max * 4,
    `Schweres Gerät muss deutlich weiter reichen als Nahkampf: ${schwer.max} vs ${nahkampf.max}`);
});

test('Die Reichweite von Projektilen folgt ihrer Physik', () => {
  // Ein schnelleres Geschoss muss weiter fliegen. Das ist genau der
  // Zusammenhang, der vorher fehlte, weil die Geschwindigkeit nicht wirkte.
  const proj = WEAPONS.filter(w => w.delivery === 'projectile' && w.damage > 0);
  const sortiert = [...proj].sort((a, b) => a.speedFactor - b.speedFactor);
  const langsamste = sortiert[0];
  const schnellste = sortiert[sortiert.length - 1];

  assert.ok(schnellste.maxRange > langsamste.maxRange,
    `${schnellste.displayName} (${schnellste.maxRange}) muss weiter reichen als ${langsamste.displayName} (${langsamste.maxRange})`);

  // Die Simulation muss zur gespeicherten Reichweite passen (mit Zuschlag).
  for (const weapon of [langsamste, schnellste]) {
    const simuliert = simulateProjectileReach(weapon);
    assert.ok(weapon.maxRange >= simuliert,
      `${weapon.id}: gespeicherte Reichweite ${weapon.maxRange} liegt unter der simulierten ${simuliert.toFixed(0)}`);
    assert.ok(weapon.maxRange <= simuliert * 1.3,
      `${weapon.id}: zu viel Zuschlag: ${weapon.maxRange} vs ${simuliert.toFixed(0)}`);
  }
});

test('Hitscan-Reichweiten folgen der Kategorie und dem Schaden', () => {
  for (const weapon of WEAPONS.filter(w => w.delivery === 'hitscan')) {
    const basis = HITSCAN_RANGE_BY_CATEGORY[weapon.category];
    assert.ok(basis, `${weapon.id}: keine Kategoriebasis für ${weapon.category}`);
    // Schaden skaliert die Basis (0.6 bis 2.0), dann Begrenzung.
    const erwartet = Math.round(Math.min(1400, Math.max(110, basis * Math.min(2, Math.max(0.6, weapon.damage / 45)))));
    assert.equal(weapon.maxRange, erwartet,
      `${weapon.id} (${weapon.category}, dmg ${weapon.damage}): ${weapon.maxRange} statt ${erwartet}`);
  }
});

test('deriveMaxRange und deriveCooldown sind reine Funktionen ihrer Eingabe', () => {
  // Determinismus: gleiche Waffe -> gleicher Wert, unabhängig von der Reihenfolge.
  for (const weapon of WEAPONS.slice(0, 30)) {
    assert.equal(deriveMaxRange(weapon), weapon.maxRange, `${weapon.id}: maxRange nicht reproduzierbar`);
    assert.equal(deriveCooldown(weapon), weapon.cooldown, `${weapon.id}: cooldown nicht reproduzierbar`);
  }
});

// ------------------------------------------------------------------ Nachladen

test('Nachladezeiten sind definiert, begrenzt und sinnvoll verteilt', () => {
  for (const weapon of WEAPONS) {
    assert.ok(Number.isInteger(weapon.cooldown), `${weapon.id}: cooldown keine Ganzzahl`);
    assert.ok(weapon.cooldown >= 0 && weapon.cooldown <= 3,
      `${weapon.id}: cooldown außerhalb 0..3: ${weapon.cooldown}`);
  }

  // Vorher war der Wert bei allen 150 konstant 0.
  const werte = new Set(WEAPONS.map(w => w.cooldown));
  assert.ok(werte.size >= 3, `Zu wenige verschiedene Nachladezeiten: ${werte.size}`);

  // Jede Stufe muss vorkommen, sonst ist die Abstufung wirkungslos.
  for (const stufe of [0, 1, 2, 3]) {
    assert.ok(WEAPONS.some(w => w.cooldown === stufe),
      `Stufe ${stufe} kommt nicht vor`);
  }
});

test('Schwere Waffen laden länger nach als leichte', () => {
  const leicht = WEAPONS.filter(w => w.damage > 0 && w.blastRadius === 0 && w.maxAmmo >= 5);
  const schwer = WEAPONS.filter(w => w.blastRadius >= 50);
  assert.ok(leicht.length > 0 && schwer.length > 0, 'Testannahme: beide Gruppen nicht leer');

  const mittel = gruppe => gruppe.reduce((s, w) => s + w.cooldown, 0) / gruppe.length;
  assert.ok(mittel(schwer) > mittel(leicht),
    `Schwere Waffen müssen im Mittel länger nachladen: ${mittel(schwer).toFixed(2)} vs ${mittel(leicht).toFixed(2)}`);
});

test('Die Nachladezeit blockiert den Schuss und läuft in Zügen ab', () => {
  const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.cooldown === 2 && w.damage > 0);
  assert.ok(waffe, 'Es muss eine Waffe mit Nachladezeit 2 geben');
  match.inventory.register(spieler, [waffe.id]);

  // Erster Schuss geht durch und setzt die Pause.
  const erst = match.fire(spieler, 0, 50, waffe.id);
  assert.equal(erst.ok, true, `Erster Schuss abgelehnt: ${erst.errors?.join(', ')}`);
  assert.equal(match.cooldownFor(spieler, waffe.id), 2, 'Zwei Züge Pause erwartet');

  // Zug zurück zum Spieler.
  const zugZurueck = () => {
    let guard = 0;
    match.endTurn();
    while (match.activePlayerId !== spieler && match.status === 'playing' && guard < 20) {
      match.endTurn();
      guard += 1;
    }
  };
  zugZurueck();
  assert.equal(match.cooldownFor(spieler, waffe.id), 1, 'Nach einem Zug noch ein Zug Pause');

  // Zweiter Versuch: abgelehnt, und zwar OHNE Munitionsverlust.
  const munitionVorher = match.inventory.getAmmo(spieler, waffe.id);
  const zweit = match.fire(spieler, 0, 50, waffe.id);
  assert.equal(zweit.ok, false, 'Der Schuss muss abgelehnt werden');
  assert.ok(zweit.errors.some(f => f.includes('lädt nach')), `Meldung fehlt: ${zweit.errors}`);
  assert.equal(match.inventory.getAmmo(spieler, waffe.id), munitionVorher,
    'Ein abgelehnter Schuss darf keine Munition kosten');

  // Nach dem zweiten Zug ist die Waffe frei.
  zugZurueck();
  assert.equal(match.cooldownFor(spieler, waffe.id), 0, 'Die Pause muss abgelaufen sein');
  const dritt = match.fire(spieler, 0, 50, waffe.id);
  assert.equal(dritt.ok, true, `Nach Ablauf muss der Schuss gehen: ${dritt.errors?.join(', ')}`);
});

test('Waffen ohne Nachladezeit sind nie gesperrt', () => {
  const match = new MatchController({ seed: 88, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.cooldown === 0 && w.damage > 0 && w.maxAmmo > 2);
  match.inventory.register(spieler, [waffe.id]);

  match.fire(spieler, 0, 50, waffe.id);
  assert.equal(match.cooldownFor(spieler, waffe.id), 0, 'Keine Pause erwartet');
});

test('Die Nachladezeit läuft auch bei ausgesetztem Zug ab', () => {
  // Eine eingefrorene Figur darf ihre Pause nicht einfrieren.
  const match = new MatchController({ seed: 606, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;

  const waffe = WEAPONS.find(w => w.cooldown === 1 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);
  match.fire(spieler, 0, 50, waffe.id);
  assert.equal(match.cooldownFor(spieler, waffe.id), 1);

  // Einfrieren für den nächsten Zug.
  match.statuses.freeze(spieler, 1);

  let guard = 0;
  match.endTurn();
  while (match.activePlayerId !== spieler && match.status === 'playing' && guard < 20) {
    match.endTurn();
    guard += 1;
  }

  assert.equal(match.cooldownFor(spieler, waffe.id), 0,
    'Der ausgesetzte Zug muss die Pause trotzdem ablaufen lassen');
});

test('Nachladezeiten sind im Zustand sichtbar', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.cooldown >= 2 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);

  // Vor dem Schuss: nichts angezeigt.
  let entity = match.getState().entities.find(e => e.entityId === spieler);
  assert.deepEqual(entity.cooldowns, {}, 'Vor dem Schuss keine Nachladezeit');

  match.fire(spieler, 0, 50, waffe.id);
  entity = match.getState().entities.find(e => e.entityId === spieler);
  assert.equal(entity.cooldowns[waffe.id], waffe.cooldown,
    `Nachladezeit muss im Zustand stehen: ${JSON.stringify(entity.cooldowns)}`);
});

test('Nachladezeiten überleben kein neues Match', () => {
  // Zustand darf nicht zwischen Matches auslaufen.
  const match = new MatchController({ seed: 1, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const spieler = match.activePlayerId;
  const waffe = WEAPONS.find(w => w.cooldown > 0 && w.damage > 0);
  match.inventory.register(spieler, [waffe.id]);
  match.fire(spieler, 0, 50, waffe.id);
  assert.ok(match.cooldownFor(spieler, waffe.id) > 0);

  match.clearCooldowns(spieler);
  assert.equal(match.cooldownFor(spieler, waffe.id), 0, 'Nach dem Räumen frei');
});

// ------------------------------------------------------------------ Flugdauer

test('Die Flugdauer passt zur Reichweite und Geschwindigkeit', () => {
  // Ein Geschoss darf nicht mitten in seiner Reichweite verfallen.
  const match = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
  match.start();
  const spieler = match.activePlayerId;

  // Nur Waffen, die tatsächlich ein Geschoss erzeugen: Selbstwirkungswaffen
  // (Flug, Teleport, Nachschub) verschießen bewusst nichts.
  const waffen = WEAPONS
    .filter(w => w.delivery === 'projectile' && w.damage > 0)
    .filter(w => {
      const effect = buildEffect(w);
      return !(effect && SELF_TARGET_KINDS.has(effect.kind));
    })
    .slice(0, 12);
  assert.ok(waffen.length >= 8, `Zu wenige Geschosswaffen: ${waffen.length}`);
  for (const waffe of waffen) {
    const eigenes = new MatchController({ seed: 2024, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000 });
    eigenes.start();
    const p = eigenes.activePlayerId;
    eigenes.inventory.register(p, [waffe.id]);
    eigenes.fire(p, Math.PI / 4, 100, waffe.id);

    const projektilId = eigenes.getState().projectiles[0]?.entityId;
    assert.ok(projektilId !== undefined, `${waffe.id}: kein Projektil erzeugt`);

    // `lifetime` und die Geschwindigkeit liegen als Komponenten vor.
    const lifetime = eigenes.world.getComponent(projektilId, 'Projectile', 'lifetime') ?? 0;
    const vx = eigenes.world.getComponent(projektilId, 'Velocity', 'x') ?? 0;
    const vy = eigenes.world.getComponent(projektilId, 'Velocity', 'y') ?? 0;
    assert.ok(lifetime > 0, `${waffe.id}: keine Lebensdauer`);

    // Die Lebensdauer muss für die eigene Reichweite reichen.
    const tempo = Math.max(1, Math.hypot(vx, vy));
    const zeitFuerReichweite = waffe.maxRange / tempo;
    assert.ok(lifetime >= zeitFuerReichweite * 0.9,
      `${waffe.id}: Lebensdauer ${lifetime} reicht nicht für ${Math.round(zeitFuerReichweite)} Ticks`);
  }
  assert.ok(spieler !== null);
});

// ------------------------------------------------------------------ Karte

test('Die Reichweiten passen zur Kartengröße', () => {
  // Eine Waffe, die weiter reicht als die Karte breit ist, kann ihr Ziel nie
  // verfehlen — das wäre kein Balancing, sondern ein Fehler.
  const zuWeit = WEAPONS.filter(w => w.maxRange > MAP_WIDTH * 1.1);
  assert.deepEqual(
    zuWeit.map(w => `${w.id} (${w.maxRange} px bei Kartenbreite ${MAP_WIDTH})`),
    [],
    'Diese Waffen reichen über die Karte hinaus',
  );
  // Und die kürzesten müssen noch brauchbar sein.
  const kuerzeste = Math.min(...WEAPONS.map(w => w.maxRange));
  assert.ok(kuerzeste >= 100, `Kürzeste Reichweite zu klein: ${kuerzeste} px`);
});

/**
 * Tests: Die Nahkampfwaffen wirken im MATCH.
 *
 * `tests/melee-throw.test.js` prüft die abgeleiteten Daten (Geschwindigkeit,
 * Reichweite, Zustellweg). Hier wird der eigentliche Beweis geführt: dass ein
 * Wurf im laufenden Match tatsächlich fliegt und Schaden verursacht.
 *
 * ## Warum diese Datei nötig ist
 *
 * Der erste Anlauf dieser Arbeit hatte die Daten korrekt gesetzt — und trotzdem
 * traf nichts. Zwei Fehler lagen hinter der Datenschicht:
 *
 *  1. Der Wurf stand in der Ableitungskette HINTER `speedFactorFor`, bekam also
 *     `speedFactor: 1` (Normaltempo) und flog mit 70 statt 27.
 *  2. Ein Testaufbau auf einer Steigung ließ den Wurf nach 6 px einschlagen —
 *     das wurde als „Abschuss zu tief" fehlgedeutet und führte zu einer falschen
 *     Korrektur an `#findMuzzle`, die den Wasserblaster brach.
 *
 * Beide Fälle waren nur in einer echten Messung sichtbar, nicht in den Daten.
 * Deshalb steht der Beweis hier und nicht bei den Ableitungstests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

/** Alle Wurfwaffen des Katalogs. */
const MELEE = WEAPONS.filter(w => w.category === 'melee');

/**
 * Wirft eine Waffe auf flacher Karte und gibt die größte erreichte Weite zurück.
 *
 * Karte `open`, weil eine Steigung das Ergebnis verfälscht: Ein Wurf in einen
 * Hang misst die Hanghöhe, nicht die Wurfweite.
 *
 * @returns {{weit:number, schaden:number, grad:number}}
 */
function wuerfeTesten(weaponId, abstand = 60) {
  let bester = { weit: 0, schaden: 0, grad: null };

  for (let grad = 5; grad <= 85; grad += 5) {
    const match = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    });
    match.start();

    const state = match.getState();
    const werfer = state.entities[0];
    const ziel = state.entities[1];
    // Beide auf dieselbe Höhe: eine Hanglage würde den Vergleich verfälschen.
    const boden = match.surfaceYAt(200);
    match.world.setComponent(werfer.entityId, 'Position', 'x', 200);
    match.world.setComponent(werfer.entityId, 'Position', 'y', boden - 12);
    match.world.setComponent(ziel.entityId, 'Position', 'x', 200 + abstand);
    match.world.setComponent(ziel.entityId, 'Position', 'y', boden - 12);
    const hpVorher = match.world.getComponent(ziel.entityId, 'Health', 'current');

    match.inventory.register(werfer.entityId, [weaponId]);
    match.inventory.selectWeapon(werfer.entityId, weaponId);

    const schuss = match.fire(werfer.entityId, (grad * Math.PI) / 180, 100, weaponId);
    if (!schuss.ok) continue;

    let weit = 0;
    let schutz = 0;
    while (match.activeProjectileCount > 0 && schutz < 600) {
      match.step();
      match.consumeEvents();
      const p = match.getState().projectiles?.find(x => x.entityId === schuss.projectileId);
      if (p) weit = Math.max(weit, p.x - 200);
      schutz += 1;
    }
    const schaden = hpVorher - match.world.getComponent(ziel.entityId, 'Health', 'current');

    // Bewertet wird der weiteste Wurf; der Schaden der besten Kombination.
    if (weit > bester.weit) bester = { weit, schaden: Math.max(bester.schaden, schaden), grad };
    if (schaden > bester.schaden) bester.schaden = schaden;
  }

  return bester;
}

test('Jede Wurfwaffe fliegt überhaupt — keine bleibt am Werfer liegen', () => {
  /*
   * Die Grundprüfung. Vor der Behebung startete der Wurf im Körper und schlug
   * nach wenigen Pixeln ein; gemessen erreichten alle 21 Waffen 15–30 px, und
   * auf der Messdistanz des Balance-Berichts (90 px) traf keine einzige.
   */
  const stecken = [];
  for (const waffe of MELEE) {
    const { weit } = wuerfeTesten(waffe.id);
    if (weit < 25) stecken.push(`${waffe.displayName} (${Math.round(weit)} px)`);
  }
  assert.deepEqual(stecken, [],
    'diese Wurfwaffen bleiben liegen oder fliegen kaum');
});

test('Die Wurfweite folgt der Wucht — leicht fliegt weiter', () => {
  /*
   * `knockback` ist der Ausdruck für die Wucht. Der Wurf ist DECKEND: Eine
   * schwere Waffe fliegt langsamer und damit kürzer. Ohne diese Ordnung wäre die
   * Differenzierung verloren, die `meleeThrowFor` herstellt.
   */
  const werte = MELEE.map(w => {
    const { weit } = wuerfeTesten(w.id);
    return { name: w.displayName, knockback: w.knockback, weit };
  }).sort((a, b) => a.knockback - b.knockback);

  const leichteste = werte[0];
  const schwerste = werte[werte.length - 1];
  assert.ok(leichteste.wurde === undefined || true); // Strukturhinweis, kein Vergleich
  assert.ok(leichteste.weit > schwerste.weit,
    `Die leichteste Waffe (${leichteste.name}, kb ${leichteste.knockback}) fliegt `
    + `${Math.round(leichteste.weit)} px, die schwerste (${schwerste.name}, kb `
    + `${schwerste.knockback}) ${Math.round(schwerste.weit)} px — die Ordnung ist verkehrt`);

  // Und es gibt mehr als eine Klasse — sonst wäre die Differenzierung Zufall.
  const weiten = new Set(werte.map(w => Math.round(w.weit)));
  assert.ok(weiten.size >= 3,
    `nur ${weiten.size} verschiedene Wurfweiten — die Wucht wirkt nicht`);
});

test('Ein Wurf verursacht Schaden am Ziel', () => {
  /*
   * Der Kern: Es geht nicht darum, dass etwas fliegt, sondern dass es wirkt.
   * Geprüft mit einem flachen Wurf auf kurze Distanz — dort muss ein Treffer
   * entstehen.
   */
  const katana = MELEE.find(w => w.displayName === 'Katana');
  assert.ok(katana, 'Vorbedingung: das Katana existiert');

  // Auf 60 px muss bei IRGENDEINEM Winkel ein Treffer entstehen.
  let besterSchaden = 0;
  for (let grad = 5; grad <= 85; grad += 5) {
    const match = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    });
    match.start();
    const state = match.getState();
    const werfer = state.entities[0];
    const ziel = state.entities[1];
    const boden = match.surfaceYAt(200);
    match.world.setComponent(werfer.entityId, 'Position', 'x', 200);
    match.world.setComponent(werfer.entityId, 'Position', 'y', boden - 12);
    match.world.setComponent(ziel.entityId, 'Position', 'x', 260);
    match.world.setComponent(ziel.entityId, 'Position', 'y', boden - 12);
    const vorher = match.world.getComponent(ziel.entityId, 'Health', 'current');

    match.inventory.register(werfer.entityId, [katana.id]);
    match.inventory.selectWeapon(werfer.entityId, katana.id);
    const schuss = match.fire(werfer.entityId, (grad * Math.PI) / 180, 100, katana.id);
    if (!schuss.ok) continue;

    let schutz = 0;
    while (match.activeProjectileCount > 0 && schutz < 600) {
      match.step();
      match.consumeEvents();
      schutz += 1;
    }
    besterSchaden = Math.max(
      besterSchaden,
      vorher - match.world.getComponent(ziel.entityId, 'Health', 'current'),
    );
  }

  assert.ok(besterSchaden > 0,
    'Das Katana verursacht auf 60 px bei keinem Winkel Schaden');
});

test('Der Werfer verletzt sich nicht selbst', () => {
  /*
   * GEGENPROBE zum vorigen Test. Beim ersten Anlauf traf der Baseballschläger
   * den WERFER (104 Schaden am Schützen, 0 am Ziel), weil `blastRadius || 24`
   * ihm ein 24-px-Trefferfenster gab, in dem er direkt nach dem Abwurf stand.
   *
   * Wurfwaffen haben jetzt KEIN Trefferfenster: Sie treffen direkt oder gar
   * nicht.
   */
  for (const waffe of MELEE.slice(0, 6)) {
    let eigenschaden = 0;
    for (let grad = 5; grad <= 85; grad += 20) {
      const match = new MatchController({
        seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
      });
      match.start();
      const werfer = match.getState().entities[0];
      const boden = match.surfaceYAt(200);
      match.world.setComponent(werfer.entityId, 'Position', 'x', 200);
      match.world.setComponent(werfer.entityId, 'Position', 'y', boden - 12);
      const vorher = match.world.getComponent(werfer.entityId, 'Health', 'current');

      match.inventory.register(werfer.entityId, [waffe.id]);
      match.inventory.selectWeapon(werfer.entityId, waffe.id);
      const schuss = match.fire(werfer.entityId, (grad * Math.PI) / 180, 100, waffe.id);
      if (!schuss.ok) continue;

      let schutz = 0;
      while (match.activeProjectileCount > 0 && schutz < 600) {
        match.step();
        match.consumeEvents();
        schutz += 1;
      }
      eigenschaden = Math.max(
        eigenschaden,
        vorher - match.world.getComponent(werfer.entityId, 'Health', 'current'),
      );
    }
    assert.equal(eigenschaden, 0,
      `${waffe.displayName}: der Werfer verliert ${eigenschaden} Leben — `
      + 'eine Wurfwaffe darf sich nicht selbst treffen');
  }
});

test('Wurfwaffen haben kein Trefferfenster', () => {
  /*
   * Warum der Test oben gilt: `match.js` gibt Waffen ohne Flächenwirkung ein
   * Mindest-Trefferfenster von 24 px (`blastRadius || 24`). Für ein Geschoss ist
   * das sinnvoll, für einen Wurf nicht — er startet direkt am Körper.
   *
   * Geprüft wird der Zustand des erzeugten Projektils: Sein Blast-Radius muss 0
   * sein.
   */
  const waffe = MELEE[0];
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
  });
  match.start();
  const werfer = match.getState().entities[0];
  match.inventory.register(werfer.entityId, [waffe.id]);
  match.inventory.selectWeapon(werfer.entityId, waffe.id);
  const schuss = match.fire(werfer.entityId, 1.0, 100, waffe.id);
  assert.equal(schuss.ok, true);

  const blast = match.world.getComponent(schuss.projectileId, 'Projectile', 'blastRadius');
  assert.equal(blast, 0,
    `${waffe.displayName}: Blast-Radius ${blast} — eine Wurfwaffe darf kein Trefferfenster haben`);

  // Gegenprobe: Ein Geschoss ohne Flächenwirkung bekommt es weiterhin.
  const geschoss = WEAPONS.find(w => w.category === 'ranged' && w.blastRadius === 0 && w.damage > 0);
  if (geschoss) {
    const m2 = new MatchController({
      seed: 4242, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000,
    });
    m2.start();
    const s2 = m2.getState().entities[0];
    m2.inventory.register(s2.entityId, [geschoss.id]);
    m2.inventory.selectWeapon(s2.entityId, geschoss.id);
    const r2 = m2.fire(s2.entityId, 1.0, 100, geschoss.id);
    if (r2.ok) {
      const blast2 = m2.world.getComponent(r2.projectileId, 'Projectile', 'blastRadius');
      assert.equal(blast2, 24,
        `${geschoss.displayName}: Geschosse brauchen das Trefferfenster weiterhin`);
    }
  }
});

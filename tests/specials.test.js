import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  StatusStore,
  SPECIAL_EFFECTS,
  EFFECT_KIND,
  SELF_TARGET_KINDS,
  buildEffect,
  effectFor,
  SPECIAL_DEFAULTS,
  RANDOM_EFFECT_POOL,
} from '../src/engine/specials.js';

/**
 * Spezialeffekte der Waffen.
 *
 * Ohne diese Wirkungen sind 25 Waffen mit `self_or_area`-Zielrichtung sowie die
 * Zustandswaffen (Einfrieren, Schaden über Zeit) im Spiel wirkungslos: sie
 * verbrauchen Munition und beenden den Zug, ohne etwas zu bewirken.
 */

/** Findet eine Waffe zu einem Effekt-Typ, damit Tests nicht auf IDs festgenagelt sind. */
function weaponWithKind(kind) {
  return WEAPONS.find(weapon => buildEffect(weapon)?.kind === kind) ?? null;
}

// ------------------------------------------------------------------ Registry

test('Registry ordnet Katalognamen normalisierten Wirkungen zu', () => {
  // Mehrere Namen teilen sich einen Effekt — das ist beabsichtigt.
  assert.equal(effectFor('instant_heal').kind, EFFECT_KIND.HEAL);
  assert.equal(effectFor('shield_heal').kind, EFFECT_KIND.SHIELD);
  assert.equal(effectFor('jetpack'), null, 'jetpack ist kein Katalogsname');

  for (const name of ['flight', 'teleport', 'ammo_drop', 'freeze', 'poison_cloud']) {
    assert.ok(effectFor(name), `${name} muss eine Wirkung haben`);
  }

  // Unbekannte Namen dürfen keinen Fehler werfen: der Katalog wächst.
  assert.equal(effectFor('voellig_unbekannt'), null);
  assert.equal(effectFor(null), null);
  assert.equal(effectFor(42), null);

  // Jeder registrierte Effekt muss eine bekannte Art haben.
  const bekannteArten = new Set(Object.values(EFFECT_KIND));
  for (const [name, effect] of Object.entries(SPECIAL_EFFECTS)) {
    assert.ok(bekannteArten.has(effect.kind), `${name} hat unbekannte Art ${effect.kind}`);
  }
});

test('buildEffect liefert Zahlenwerte und respektiert Obergrenzen', () => {
  for (const weapon of WEAPONS) {
    const effect = buildEffect(weapon);
    if (!effect) continue;
    assert.ok(effect.kind, `${weapon.id} ohne kind`);

    if (effect.kind === EFFECT_KIND.FREEZE) {
      assert.ok(effect.turns >= 1 && effect.turns <= SPECIAL_DEFAULTS.maxTurns,
        `${weapon.id}: Einfrierdauer außerhalb der Grenzen: ${effect.turns}`);
    }
    if (effect.kind === EFFECT_KIND.DAMAGE_OVER_TIME) {
      assert.ok(effect.damagePerTurn > 0);
      assert.ok(effect.turns >= 1 && effect.turns <= SPECIAL_DEFAULTS.maxTurns);
      assert.ok(['fire', 'poison', 'neutral'].includes(effect.element));
    }
    if (effect.kind === EFFECT_KIND.HEAL || effect.kind === EFFECT_KIND.SHIELD) {
      assert.ok(effect.amount > 0, `${weapon.id}: Wirkung ohne Betrag`);
    }
  }
});

test('Selbst- und Zielwirkungen sind sauber getrennt', () => {
  const selbst = ['heal', 'instant_heal', 'shield_heal', 'buff', 'area_buff', 'ammo_drop',
    'supply_drop', 'flight', 'teleport', 'mobility', 'grapple', 'camouflage', 'bunker',
    'target_scan', 'relic_buff', 'shield_freeze', 'guardian', 'blood_ritual', 'random_buff',
    'time_control', 'portal', 'portal_field', 'hologram_portal', 'teleport_platform',
    'dimension_orb', 'loop', 'guardian_ultimate'];
  const ziel = ['freeze', 'sleep', 'stun', 'burn', 'acid_dot', 'poison_cloud', 'poison_zone',
    'world_poison', 'corruption', 'curse', 'fire_pool', 'lava', 'tentacle_zone', 'void_spell',
    'flame_blade'];

  for (const name of selbst) {
    const effect = effectFor(name);
    if (!effect) continue;
    assert.ok(SELF_TARGET_KINDS.has(effect.kind),
      `${name} (${effect.kind}) muss als Selbstwirkung gelten`);
  }
  for (const name of ziel) {
    const effect = effectFor(name);
    if (!effect) continue;
    assert.ok(!SELF_TARGET_KINDS.has(effect.kind),
      `${name} (${effect.kind}) darf NICHT als Selbstwirkung gelten`);
  }
});

// --------------------------------------------------------------- StatusStore

test('StatusStore: Schild absorbiert und ist begrenzt', () => {
  const store = new StatusStore();
  store.addShield(1, 30);

  const erste = store.absorbWithShield(1, 20);
  assert.equal(erste.absorbed, 20);
  assert.equal(erste.rest, 0);

  const zweite = store.absorbWithShield(1, 20);
  assert.equal(zweite.absorbed, 10, 'Nur der Rest des Schilds wird absorbiert');
  assert.equal(zweite.rest, 10, 'Der überschießende Teil trifft die Gesundheit');
  assert.equal(store.shieldOf(1), 0);

  // Obergrenze: wiederholtes Hinzufügen stapelt nicht ins Unbegrenzte.
  for (let i = 0; i < 10; i++) store.addShield(1, 50);
  assert.equal(store.shieldOf(1), SPECIAL_DEFAULTS.maxShield);
});

test('StatusStore: Einfrieren zählt je Zug herunter', () => {
  const store = new StatusStore();
  assert.equal(store.isFrozen(1), false);

  store.freeze(1, 2);
  assert.equal(store.isFrozen(1), true);

  const erster = store.advanceTurn(1);
  assert.equal(erster.frozeThisTurn, true, 'Im ersten Zug ist die Figur eingefroren');
  assert.equal(store.isFrozen(1), true, 'Eine Runde Einfrieren verbleibt');

  const zweiter = store.advanceTurn(1);
  assert.equal(zweiter.frozeThisTurn, true);

  const dritter = store.advanceTurn(1);
  assert.equal(dritter.frozeThisTurn, false, 'Danach ist die Figur wieder frei');
  assert.equal(store.isFrozen(1), false);

  // Die stärkere Wirkung gewinnt, kürzere verlängern nicht.
  store.freeze(1, 3);
  store.freeze(1, 1);
  assert.equal(store.advanceTurn(1).frozeThisTurn, true);
  assert.equal(store.advanceTurn(1).frozeThisTurn, true);
  assert.equal(store.advanceTurn(1).frozeThisTurn, true);
  assert.equal(store.advanceTurn(1).frozeThisTurn, false);
});

test('StatusStore: Schaden über Zeit summiert und läuft ab', () => {
  const store = new StatusStore();
  store.addDot(1, { damagePerTurn: 10, turns: 2, element: 'fire' });
  store.addDot(1, { damagePerTurn: 5, turns: 1, element: 'poison' });
  assert.equal(store.dotCount(1), 2);

  const erster = store.advanceTurn(1);
  assert.equal(erster.damage, 15, 'Beide Effekte wirken im ersten Zug');
  assert.deepEqual(erster.elements.sort(), ['fire', 'poison']);

  const zweiter = store.advanceTurn(1);
  assert.equal(zweiter.damage, 10, 'Nur der länger laufende Effekt wirkt noch');
  assert.equal(store.dotCount(1), 0);

  const dritter = store.advanceTurn(1);
  assert.equal(dritter.damage, 0, 'Danach kein Schaden mehr');
});

test('StatusStore: Buff klingt ab und fällt auf 1 zurück', () => {
  const store = new StatusStore();
  assert.equal(store.damageMultiplier(1), 1);

  store.addBoost(1, 1.5, 2);
  assert.equal(store.damageMultiplier(1), 1.5);

  store.advanceTurn(1);
  assert.equal(store.damageMultiplier(1), 1.5, 'Nach einem Zug noch aktiv');
  store.advanceTurn(1);
  assert.equal(store.damageMultiplier(1), 1, 'Danach zurück auf normal');
});

test('StatusStore: Rüstung, Aufdeckung und Räumen', () => {
  const store = new StatusStore();
  store.addArmor(1, 0.3);
  assert.equal(store.armorOf(1), 0.3);
  // Der stärkere Wert gewinnt.
  store.addArmor(1, 0.1);
  assert.equal(store.armorOf(1), 0.3);
  // Kappung.
  store.addArmor(1, 0.95);
  assert.ok(store.armorOf(1) <= 0.8);

  store.reveal(1, 2);
  assert.equal(store.isRevealed(1), true);
  store.advanceTurn(1);
  store.advanceTurn(1);
  assert.equal(store.isRevealed(1), false);

  store.remove(1);
  assert.equal(store.shieldOf(1), 0);
  assert.equal(store.isFrozen(1), false);
});

// ------------------------------------------------------- Wirkung im Spiel

test('Heilung stellt Gesundheit wieder her, gedeckelt auf das Maximum', () => {
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const heilend = weaponWithKind(EFFECT_KIND.HEAL);
  assert.ok(heilend, 'Es muss eine Heilwaffe geben');

  const aktiver = match.activePlayerId;
  const max = match.world.getComponent(aktiver, 'Health', 'max');
  match.world.setComponent(aktiver, 'Health', 'current', 20);

  // Waffe ins Inventar und feuern.
  match.inventory.register(aktiver, [heilend.id]);
  match.inventory.selectWeapon(aktiver, heilend.id);

  const ergebnis = match.fire(aktiver, 0, 50, heilend.id);
  assert.equal(ergebnis.ok, true, `Schuss abgelehnt: ${ergebnis.errors?.join(', ')}`);
  assert.ok(ergebnis.special, 'Die Waffe muss eine Wirkung melden');
  assert.equal(ergebnis.special.kind, EFFECT_KIND.HEAL);
  assert.ok(ergebnis.special.healed > 0, 'Es muss geheilt werden');

  const danach = match.world.getComponent(aktiver, 'Health', 'current');
  assert.ok(danach > 20, `Gesundheit muss steigen: 20 → ${danach}`);
  assert.ok(danach <= max, 'Nie über das Maximum heilen');

  // Kein Projektil: eine Heilwaffe soll nichts verschießen.
  assert.equal(ergebnis.projectileId, null);
});

test('Heilung bei voller Gesundheit verschwendet nichts', () => {
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const heilend = weaponWithKind(EFFECT_KIND.HEAL);
  const aktiver = match.activePlayerId;
  const max = match.world.getComponent(aktiver, 'Health', 'max');
  match.world.setComponent(aktiver, 'Health', 'current', max);

  match.inventory.register(aktiver, [heilend.id]);
  const ergebnis = match.fire(aktiver, 0, 50, heilend.id);

  assert.equal(ergebnis.special.healed, 0, 'Bei voller Gesundheit nichts heilen');
  assert.equal(match.world.getComponent(aktiver, 'Health', 'current'), max);
});

test('Schild absorbiert Schaden, bevor Gesundheit sinkt', () => {
  const match = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const schild = weaponWithKind(EFFECT_KIND.SHIELD);
  assert.ok(schild, 'Es muss eine Schildwaffe geben');
  const aktiver = match.activePlayerId;

  match.inventory.register(aktiver, [schild.id]);
  const gesetzt = match.fire(aktiver, 0, 50, schild.id);
  assert.ok(gesetzt.special.shield > 0);

  const gesundheitVorher = match.world.getComponent(aktiver, 'Health', 'current');
  const schildVorher = match.statuses.shieldOf(aktiver);

  // Weniger Schaden als Schild: die Gesundheit darf sich nicht ändern.
  match.world.getSystem('damage').applyDamage(match.world, aktiver, schildVorher - 5, null);
  assert.equal(match.world.getComponent(aktiver, 'Health', 'current'), gesundheitVorher,
    'Schild muss den Schaden vollständig abfangen');
  assert.equal(match.statuses.shieldOf(aktiver), 5);

  // Mehr Schaden als Schild: der Rest trifft die Gesundheit.
  match.world.getSystem('damage').applyDamage(match.world, aktiver, 25, null);
  assert.equal(match.statuses.shieldOf(aktiver), 0);
  assert.ok(match.world.getComponent(aktiver, 'Health', 'current') < gesundheitVorher,
    'Der Rest muss die Gesundheit treffen');
});

test('Rüstung reduziert Schaden', () => {
  const match = new MatchController({ seed: 501, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const ziel = match.activePlayerId;

  match.world.setComponent(ziel, 'Health', 'current', 500);
  match.world.getSystem('damage').applyDamage(match.world, ziel, 100, null);
  const ohneRuestung = 500 - match.world.getComponent(ziel, 'Health', 'current');

  match.world.setComponent(ziel, 'Health', 'current', 500);
  match.statuses.addArmor(ziel, 0.3);
  match.world.getSystem('damage').applyDamage(match.world, ziel, 100, null);
  const mitRuestung = 500 - match.world.getComponent(ziel, 'Health', 'current');

  assert.equal(Math.round(ohneRuestung), 100);
  assert.equal(Math.round(mitRuestung), 70, '30 % Reduktion');
  assert.ok(mitRuestung < ohneRuestung);
});

test('Munitionsnachschub füllt auf, ohne die Kapazität zu überschreiten', () => {
  const match = new MatchController({ seed: 313, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const nachschub = weaponWithKind(EFFECT_KIND.AMMO);
  assert.ok(nachschub, 'Es muss eine Nachschubwaffe geben');
  const aktiver = match.activePlayerId;

  const zielwaffe = WEAPONS.find(w => w.id !== nachschub.id && w.maxAmmo > 1 && w.damage > 0);
  match.inventory.register(aktiver, [zielwaffe.id, nachschub.id]);
  match.inventory.selectWeapon(aktiver, nachschub.id);

  // Verbrauch simulieren: Munition auf 0 setzen.
  while (match.inventory.consume(aktiver, zielwaffe.id, 1)) { /* leerlaufen */ }
  assert.equal(match.inventory.getAmmo(aktiver, zielwaffe.id), 0);

  const ergebnis = match.fire(aktiver, 0, 50, nachschub.id);
  assert.ok(ergebnis.special.restored > 0, `Es muss Munition nachgefüllt werden: ${JSON.stringify(ergebnis.special)}`);

  const nachher = match.inventory.getAmmo(aktiver, zielwaffe.id);
  assert.ok(nachher > 0);
  assert.ok(nachher <= zielwaffe.maxAmmo, `Kapazität überschritten: ${nachher} > ${zielwaffe.maxAmmo}`);
});

test('Sprungwaffe versetzt die Figur auf festes Gelände', () => {
  const match = new MatchController({ seed: 8080, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const sprung = weaponWithKind(EFFECT_KIND.MOVE);
  assert.ok(sprung, 'Es muss eine Bewegungswaffe geben');
  const aktiver = match.activePlayerId;

  match.inventory.register(aktiver, [sprung.id]);
  const xVorher = match.world.getComponent(aktiver, 'Position', 'x');

  const ergebnis = match.fire(aktiver, 0, 50, sprung.id);
  assert.ok(ergebnis.special.moved);
  assert.equal(ergebnis.special.moved.dx !== 0 || ergebnis.special.moved.dy !== 0, true,
    'Die Figur muss sich bewegt haben');

  const xNachher = match.world.getComponent(aktiver, 'Position', 'x');
  const yNachher = match.world.getComponent(aktiver, 'Position', 'y');

  // Die neue Position muss auf festem Gelände liegen, nicht darin oder daneben.
  const zelle = { x: Math.floor(xNachher), y: Math.floor(yNachher) };
  assert.equal(match.terrain.isSolid(zelle.x, zelle.y), true,
    'Nach dem Sprung muss die Figur auf dem Boden stehen');
  assert.equal(Number.isFinite(yNachher), true);
  assert.notEqual(xNachher, xVorher);
});

test('Bewegungswaffe verlässt die Karte nicht', () => {
  const match = new MatchController({ seed: 6060, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const sprung = weaponWithKind(EFFECT_KIND.MOVE);
  const aktiver = match.activePlayerId;

  // Ans linke Ende stellen: der Sprung nach vorne darf nicht aus der Karte führen.
  match.world.setComponent(aktiver, 'Position', 'x', 8);
  match.inventory.register(aktiver, [sprung.id]);
  match.fire(aktiver, 0, 50, sprung.id);

  const x = match.world.getComponent(aktiver, 'Position', 'x');
  assert.ok(x >= 0 && x <= 1280, `Position außerhalb der Karte: ${x}`);
});

test('Schadensbonus erhöht den Schaden tatsächlich', () => {
  const match = new MatchController({ seed: 1212, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const schuetze = match.activePlayerId;
  const ziel = match.players.find(p => p.entityId !== schuetze).entityId;

  match.world.setComponent(ziel, 'Health', 'current', 900);
  match.world.setComponent(ziel, 'Health', 'max', 900);
  match.world.getSystem('damage').applyDamage(match.world, ziel, 50, null);
  const normal = 900 - match.world.getComponent(ziel, 'Health', 'current');

  match.world.setComponent(ziel, 'Health', 'current', 900);
  match.statuses.addBoost(schuetze, 2, 2);
  assert.equal(match.statuses.damageMultiplier(schuetze), 2);
  match.world.getSystem('damage').applyDamage(match.world, ziel, 50 * match.statuses.damageMultiplier(schuetze), null);
  const gebufft = 900 - match.world.getComponent(ziel, 'Health', 'current');

  assert.equal(Math.round(normal), 50);
  assert.equal(Math.round(gebufft), 100, 'Der Bonus muss sich im Schaden niederschlagen');
});

// ------------------------------------------------------- Zustandswirkungen

test('Einfrieren lässt den Zug aussetzen', () => {
  const match = new MatchController({ seed: 4711, teams: 2, playersPerTeam: 1, turnDurationMs: 60_000 });
  match.start();

  const aktiver = match.activePlayerId;
  match.statuses.freeze(aktiver, 1);

  // Zug beenden: der nächste Spieler ist dran, und beim Zurückkommen setzt der
  // eingefrorene Spieler einen Zug aus.
  match.endTurn();
  const zweiter = match.activePlayerId;
  assert.notEqual(zweiter, aktiver);

  match.endTurn();
  // Jetzt ist wieder der eingefrorene Spieler an der Reihe: er setzt aus und
  // die Reihe geht direkt weiter.
  const danach = match.activePlayerId;
  assert.notEqual(danach, aktiver, 'Der eingefrorene Spieler darf nicht am Zug sein');
  assert.equal(match.statuses.isFrozen(aktiver), false, 'Das Einfrieren ist verbraucht');
});

test('Einfrieren erzeugt ein Ereignis und endet von selbst', () => {
  const match = new MatchController({ seed: 161, teams: 2, playersPerTeam: 2, turnDurationMs: 60_000 });
  match.start();

  const aktiver = match.activePlayerId;
  match.statuses.freeze(aktiver, 2);

  // Zwei volle Runden durchlaufen lassen.
  let skips = 0;
  let guard = 0;
  while (guard < 20 && skips < 2) {
    match.endTurn();
    for (const event of match.consumeEvents()) {
      if (event.type === 'turn_skipped' && event.payload.playerId === aktiver) skips += 1;
    }
    guard += 1;
  }

  assert.equal(skips, 2, `Es müssen genau zwei Züge ausgesetzt werden: ${skips}`);
  assert.equal(match.statuses.isFrozen(aktiver), false);
  assert.equal(match.status, 'playing', 'Das Match läuft weiter');
});

test('Schaden über Zeit wirkt bei jedem Zugbeginn', () => {
  const match = new MatchController({ seed: 7331, teams: 2, playersPerTeam: 1, turnDurationMs: 60_000 });
  match.start();

  const aktiver = match.activePlayerId;
  match.world.setComponent(aktiver, 'Health', 'current', 200);
  match.world.setComponent(aktiver, 'Health', 'max', 200);
  match.statuses.addDot(aktiver, { damagePerTurn: 12, turns: 3, element: 'fire' });

  // Eine volle Runde, bis der Spieler wieder am Zug ist.
  match.endTurn();
  const vorTick = match.world.getComponent(aktiver, 'Health', 'current');
  match.endTurn();

  const danach = match.world.getComponent(aktiver, 'Health', 'current');
  assert.ok(danach < vorTick, `Der Schaden muss wirken: ${vorTick} → ${danach}`);
  assert.equal(Math.round(vorTick - danach), 12, 'Genau der Schaden pro Zug');
});

test('Schaden über Zeit kann nicht unbegrenzt andauern', () => {
  const match = new MatchController({ seed: 8282, teams: 2, playersPerTeam: 1, turnDurationMs: 60_000 });
  match.start();

  const aktiver = match.activePlayerId;
  match.world.setComponent(aktiver, 'Health', 'current', 5000);
  match.world.setComponent(aktiver, 'Health', 'max', 5000);
  match.statuses.addDot(aktiver, { damagePerTurn: 1, turns: SPECIAL_DEFAULTS.maxTurns, element: 'poison' });

  // Deutlich mehr Züge als die Dauer.
  let guard = 0;
  while (guard < 40) {
    match.endTurn();
    guard += 1;
  }

  assert.equal(match.statuses.dotCount(aktiver), 0, 'Der Effekt muss abgelaufen sein');
  const abgelaufen = match.world.getComponent(aktiver, 'Health', 'current');
  match.endTurn();
  match.endTurn();
  assert.equal(match.world.getComponent(aktiver, 'Health', 'current'), abgelaufen,
    'Nach dem Ablauf darf kein Schaden mehr entstehen');
});

test('Zufallswaffe wählt reproduzierbar aus dem Match-Seed', () => {
  // "Zufällig" darf hier nicht Math.random bedeuten, sonst wäre kein Replay
  // reproduzierbar. Geprüft wird: gleicher Seed → gleiche Reihenfolge der
  // gewählten Wirkungen, und die Wahl stammt aus der erlaubten Liste.
  const wuerfel = WEAPONS_BY_ID.pa_100;
  assert.ok(wuerfel, 'Testannahme: pa_100 ist die Zufallswaffe');
  assert.equal(buildEffect(wuerfel).kind, EFFECT_KIND.RANDOM);

  const wahlen = [];
  for (const seed of [4242, 4242, 9999]) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
    match.start();
    const aktiver = match.activePlayerId;

    const abfolge = [];
    // Mehrere Züge: die Waffe darf mehrfach gewählt werden.
    for (let i = 0; i < 6; i++) {
      match.inventory.register(aktiver, [wuerfel.id]);
      match.inventory.selectWeapon(aktiver, wuerfel.id);
      const ergebnis = match.fire(aktiver, 0, 50, wuerfel.id);
      if (ergebnis.ok && ergebnis.special) abfolge.push(ergebnis.special.randomKind);
      // Bis der Spieler wieder am Zug ist.
      let guard = 0;
      while (match.activePlayerId !== aktiver && guard < 20) { match.endTurn(); guard += 1; }
      if (match.status !== 'playing') break;
    }
    wahlen.push(abfolge);
  }

  assert.ok(wahlen[0].length > 0, 'Es muss mindestens eine Wahl stattgefunden haben');

  for (const gewaehlt of wahlen[0]) {
    assert.ok(RANDOM_EFFECT_POOL.includes(gewaehlt), `Ungültige Wahl: ${gewaehlt}`);
  }

  // Gleicher Seed → identische Folge. Das ist die eigentliche Zusicherung.
  assert.deepEqual(wahlen[0], wahlen[1],
    'Gleicher Seed muss dieselbe Folge ergeben — kein Math.random in der Simulation');
});

test('Zufallswaffe wirkt tatsächlich, nicht nur nominell', () => {
  const wuerfel = WEAPONS_BY_ID.pa_100;
  const match = new MatchController({ seed: 31415, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();
  const aktiver = match.activePlayerId;

  // Gesundheit senken, damit Heilung sichtbar wäre.
  match.world.setComponent(aktiver, 'Health', 'current', 30);
  match.inventory.register(aktiver, [wuerfel.id]);

  const vorher = {
    health: match.world.getComponent(aktiver, 'Health', 'current'),
    shield: match.statuses.shieldOf(aktiver),
    boost: match.statuses.damageMultiplier(aktiver),
    armor: match.statuses.armorOf(aktiver),
  };

  const ergebnis = match.fire(aktiver, 0, 50, wuerfel.id);
  assert.equal(ergebnis.ok, true);
  assert.ok(ergebnis.special?.randomKind, 'Es muss eine Wirkung gewählt worden sein');

  const nachher = {
    health: match.world.getComponent(aktiver, 'Health', 'current'),
    shield: match.statuses.shieldOf(aktiver),
    boost: match.statuses.damageMultiplier(aktiver),
    armor: match.statuses.armorOf(aktiver),
  };

  const etwasPassiert = nachher.health > vorher.health
    || nachher.shield > vorher.shield
    || nachher.boost > vorher.boost
    || nachher.armor > vorher.armor
    || ergebnis.special.moved?.dx !== 0
    || ergebnis.special.moved?.dy !== 0
    || ergebnis.special.restored > 0;

  assert.equal(etwasPassiert, true,
    `Die Zufallswaffe muss etwas bewirken. Zustand: ${JSON.stringify({ vorher, nachher, special: ergebnis.special })}`);
});

// ------------------------------------------------------- Gesamtauswirkung

test('Die meisten zuvor wirkungslosen Waffen haben jetzt eine Wirkung', () => {
  // Genau die Waffen, die in der Balance-Messung als wirkungslos galten, weil
  // ihre Wirkung nicht implementiert war.
  const erwartet = [
    'pa_076', 'pa_079', 'pa_084', 'pa_087', 'pa_088', 'pa_089', 'pa_093', 'pa_094',
    'pa_095', 'pa_099', 'pa_100', 'pa_107', 'pa_110', 'pa_111', 'pa_112', 'pa_114',
    'pa_119', 'pa_122', 'pa_125', 'pa_126', 'pa_127', 'pa_128', 'pa_130', 'pa_131',
  ];

  const ohneWirkung = [];
  for (const id of erwartet) {
    const weapon = WEAPONS_BY_ID[id];
    assert.ok(weapon, `Waffe ${id} fehlt im Katalog`);
    if (!buildEffect(weapon)) ohneWirkung.push(`${id} (${weapon.special})`);
  }

  assert.deepEqual(ohneWirkung, [],
    `Diese Waffen haben weiterhin keine Wirkung: ${ohneWirkung.join(', ')}`);
});

test('Eine Wirkung wird nur einmal angewendet und beendet den Zug', () => {
  const match = new MatchController({ seed: 191, teams: 2, playersPerTeam: 1, turnDurationMs: 100_000 });
  match.start();

  const nachschub = weaponWithKind(EFFECT_KIND.AMMO);
  const aktiver = match.activePlayerId;
  const zielwaffe = WEAPONS.find(w => w.id !== nachschub.id && w.maxAmmo > 1 && w.damage > 0);
  match.inventory.register(aktiver, [zielwaffe.id, nachschub.id]);

  const vorher = match.activePlayerId;
  const ergebnis = match.fire(aktiver, 0, 50, nachschub.id);
  assert.equal(ergebnis.ok, true);
  assert.equal(ergebnis.projectileId, null, 'Keine Wirkung als Geschoss');

  // Der Zug muss beendet sein — sonst könnte man Wirkungen mehrfach auslösen.
  assert.notEqual(match.activePlayerId, vorher, 'Der Zug muss nach der Wirkung enden');

  // Ein zweiter Schuss im selben Zug ist nicht möglich.
  const zweiter = match.fire(vorher, 0, 50, nachschub.id);
  assert.equal(zweiter.ok, false, 'Kein zweiter Schuss im selben Zug');
});

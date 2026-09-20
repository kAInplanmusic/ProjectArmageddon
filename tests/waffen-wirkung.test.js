/**
 * Wirkfelder, die vorher KEINEN Leser hatten — jetzt mit Wirkung.
 *
 * FUND (belegt, 2026-09-20): Die Designdatei nennt `homing` (2 Waffen) und
 * `piercing` (6 Waffen), der erzeugte Katalog führte beide Felder — aber kein
 * Stück Motorlas sie. Ein „Scharfschützengewehr" schoss nicht durch, ein
 * „Fliegendes Superschaf" flog nicht (es war als Hitscan eingestuft, weil die
 * Quelldatei `projectileSpeed: 0` nennt).
 *
 * Diese Datei hält fest, was jetzt GESCHIEHT — und zwar als Gegenprobe: Neben
 * jeder Wirkung steht der Fall OHNE sie. Eine Zusicherung, die nur „es gibt ein
 * Ereignis" prüft, wäre auch von einem Zufall erfüllt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { HOMING_TURN_PER_TICK } from '../src/engine/systems/projectileSystem.js';
import { PROJECTILE_GRAVITY } from '../src/shared/ballistics.js';

/** Ein Match mit einer Figur je Team und praktisch unendlicher Zugzeit. */
function matchMitZweiFiguren(seed = 4242) {
  const match = new MatchController({
    seed, teams: 2, playersPerTeam: 1, turnDurationMs: 1_000_000,
  });
  match.start();
  match.consumeEvents();
  return match;
}

/** Der Gegner als SPIELER-Figur (nicht eine Kiste: die hat auch Position+Health). */
function gegner(match, schuetze) {
  const anderer = match.players.find(spieler => spieler.entityId !== schuetze);
  assert.ok(anderer, 'Es muss eine zweite Spielerfigur geben');
  return anderer.entityId;
}

const pos = (match, id, feld) => match.world.getComponent(id, 'Position', feld) || 0;
const proj = (match, id, feld) => match.world.getComponent(id, 'Projectile', feld);
const setze = (match, id, komponente, feld, wert) =>
  match.world.setComponent(id, komponente, feld, wert);

test('Ein Durchschlag-Geschoss trifft eine Figur, wirkt voll — und fliegt WEITER', () => {
  const waffe = WEAPONS.find(w => w.piercing > 0 && w.delivery === 'projectile'
    && w.blastRadius === 0 && w.damage > 0);
  assert.ok(waffe, 'Es muss eine Durchschlagwaffe ohne Flächenwirkung geben');

  const match = matchMitZweiFiguren();
  const schuetze = match.activePlayerId;
  const opfer = gegner(match, schuetze);

  match.inventory.register(schuetze, [waffe.id]);
  const schuss = match.fire(schuetze, Math.PI / 2, 40, waffe.id);
  assert.equal(schuss.ok, true, `Schuss abgelehnt: ${schuss.errors?.join(', ')}`);
  const pid = schuss.projectileId;
  assert.equal(proj(match, pid, 'pierce'), 1,
    'Die Waffe trägt `piercing: 1` — das Geschoss muss einen Durchschlag frei haben');

  // Einen Schritt fliegen lassen, dann das Opfer in die BAHN setzen. So hängt
  // der Test nicht an der Karte: Er prüft den Durchschlag, nicht das Gelände.
  match.step();
  const x = pos(match, pid, 'x') + (match.world.getComponent(pid, 'Velocity', 'x') || 0) * 3;
  const y = pos(match, pid, 'y') + (match.world.getComponent(pid, 'Velocity', 'y') || 0) * 3;
  setze(match, opfer, 'Position', 'x', x);
  setze(match, opfer, 'Position', 'y', y);
  const lebenVorher = match.world.getComponent(opfer, 'Health', 'current');
  const schaden = proj(match, pid, 'damage');

  let durchschlagen = false;
  let flogDanach = null;
  for (let i = 0; i < 12; i += 1) {
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'projectile_pierced') {
        durchschlagen = true;
        // Der Puffer liefert { type, payload } — die Nutzlast liegt darunter.
        assert.equal(ereignis.payload.target, opfer, 'Der Durchschlag muss das Opfer nennen');
        assert.equal(ereignis.payload.verbleibend, 0, 'Ein Durchschlag ist danach verbraucht');
      }
    }
    if (durchschlagen && flogDanach === null) flogDanach = proj(match, pid, 'alive');
  }

  assert.equal(durchschlagen, true, 'Es muss ein Durchschlag gemeldet werden');
  const lebenNachher = match.world.getComponent(opfer, 'Health', 'current');
  assert.ok(lebenNachher < lebenVorher, 'Das Opfer muss Schaden genommen haben');
  assert.ok(Math.abs((lebenVorher - lebenNachher) - schaden) < 0.001,
    `Voller Schaden erwartet (${schaden}), gemessen ${(lebenVorher - lebenNachher).toFixed(2)}`);
  assert.equal(flogDanach, 1,
    'Nach dem Durchschlag muss das Geschoss WEITERFLIEGEN — kein Krater, kein Ende');
});

test('Ohne Durchschlag endet das Geschoss an der Figur — die Gegenprobe', () => {
  const waffe = WEAPONS.find(w => w.piercing === 0 && w.delivery === 'projectile'
    && w.blastRadius === 0 && w.damage > 0 && w.fuseTime === 0);
  assert.ok(waffe, 'Es muss eine Aufprallwaffe ohne Durchschlag geben');

  const match = matchMitZweiFiguren(4242);
  const schuetze = match.activePlayerId;
  const opfer = gegner(match, schuetze);
  match.inventory.register(schuetze, [waffe.id]);
  const schuss = match.fire(schuetze, Math.PI / 2, 40, waffe.id);
  const pid = schuss.projectileId;
  assert.equal(proj(match, pid, 'pierce'), 0, 'Diese Waffe hat keinen Durchschlag');

  match.step();
  setze(match, opfer, 'Position', 'x', pos(match, pid, 'x') + 3 * (match.world.getComponent(pid, 'Velocity', 'x') || 0));
  setze(match, opfer, 'Position', 'y', pos(match, pid, 'y') + 3 * (match.world.getComponent(pid, 'Velocity', 'y') || 0));

  let durchschlagen = false;
  let ende = null;
  for (let i = 0; i < 12; i += 1) {
    match.step();
    for (const ereignis of match.consumeEvents()) {
      if (ereignis.type === 'projectile_pierced') durchschlagen = true;
    }
    if (ende === null && !match.world.isActive(pid)) ende = i;
  }

  assert.equal(durchschlagen, false, 'Ohne `piercing` darf kein Durchschlag gemeldet werden');
  assert.ok(ende !== null, 'Das Geschoss muss an der Figur enden (Wirkung beim Aufprall)');
});

test('Zielsuche krümmt die Bahn zum Gegner — und nur mit `homing`', () => {
  const waffe = WEAPONS.find(w => w.homing > 0 && w.delivery === 'projectile');
  assert.ok(waffe, 'Es muss eine zielsuchende Waffe geben');
  assert.ok(waffe.projectileSpeed > 0,
    'Wer zielt, fliegt: Der Generator muss die Geschwindigkeit gesetzt haben');

  /*
   * Senkrecht nach OBEN schießen, während der Gegner seitlich steht. Ohne
   * Zielsuche bleibt die waagerechte Geschwindigkeit ~0 (die Schwerkraft ändert
   * nur die senkrechte); mit Zielsuche muss vx ins Positive drehen.
   */
  const fliege = (mitZielsuche) => {
    const match = matchMitZweiFiguren(777);
    const schuetze = match.activePlayerId;
    const opfer = gegner(match, schuetze);
    // Den Gegner klar seitlich setzen — sonst ist „dorthin drehen" nicht messbar.
    setze(match, opfer, 'Position', 'x',
      pos(match, schuetze, 'x') + 220);
    setze(match, opfer, 'Position', 'y',
      pos(match, schuetze, 'y') - 30);
    match.inventory.register(schuetze, [waffe.id]);
    const schuss = match.fire(schuetze, Math.PI / 2, 40, waffe.id);
    const pid = schuss.projectileId;
    if (!mitZielsuche) setze(match, pid, 'Projectile', 'homing', 0);
    let winkelSumme = 0;
    let vorher = Math.atan2(
      match.world.getComponent(pid, 'Velocity', 'y'),
      match.world.getComponent(pid, 'Velocity', 'x'),
    );
    /**
     * Je Tick die beobachtete Richtungsänderung MIT dem Tempo, bei dem sie
     * auftrat. Das Tempo ist nötig, weil die Schwerkraft die Richtung umso
     * stärker dreht, je langsamer das Geschoss ist (`g / |v|`).
     */
    const drehungen = [];
    for (let i = 0; i < 18; i += 1) {
      match.step();
      if (!match.world.isActive(pid)) break;
      const vxJetzt = match.world.getComponent(pid, 'Velocity', 'x');
      const vyJetzt = match.world.getComponent(pid, 'Velocity', 'y');
      const tempo = Math.hypot(vxJetzt, vyJetzt);
      const jetzt = Math.atan2(vyJetzt, vxJetzt);
      let delta = jetzt - vorher;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      // Am Scheitel (|v| ~ 0) springt atan2 — das ist ein Messartefakt.
      if (tempo > 1) {
        winkelSumme += Math.abs(delta);
        drehungen.push({ delta: Math.abs(delta), tempo });
      }
      vorher = jetzt;
    }
    return { match, pid, winkelSumme, drehungen };
  };

  const mit = fliege(true);
  const ohne = fliege(false);

  const vxMit = mit.match.world.isActive(mit.pid)
    ? mit.match.world.getComponent(mit.pid, 'Velocity', 'x') : null;
  assert.ok(vxMit !== null, 'Das zielsuchende Geschoss muss noch fliegen');
  assert.ok(vxMit > 1,
    `Zielsuche muss waagerecht zum Gegner drehen — vx ist ${vxMit}`);

  const vxOhne = ohne.match.world.isActive(ohne.pid)
    ? ohne.match.world.getComponent(ohne.pid, 'Velocity', 'x') : 0;
  assert.ok(Math.abs(vxOhne) < Math.abs(vxMit),
    `Ohne Zielsuche darf die Bahn nicht zum Gegner drehen — vx ist ${vxOhne}`);

  /*
   * Und die Wendigkeit ist BEGRENZT — je Tick um höchstens
   * `homing × HOMING_TURN_PER_TICK` PLUS dem, was die Schwerkraft dreht.
   *
   * Die Schwerkraft muss mit: Sie krümmt JEDE Bahn nach unten, um `g/|v|` je
   * Tick, und das ist Ballistik statt Wendigkeit. Gemessen wird deshalb gegen
   * die Summe beider Anteile — eine feste Schranke ohne den zweiten Anteil wäre
   * bei einem langsamen Geschoss schon von der Schwerkraft gerissen.
   */
  const zielsucheJeTick = waffe.homing * HOMING_TURN_PER_TICK;
  const gravitation = PROJECTILE_GRAVITY * (waffe.gravityScale || 1);
  let groessteAbweichung = 0;
  for (const { delta, tempo } of mit.drehungen) {
    const erlaubt = zielsucheJeTick + gravitation / tempo + 0.003;
    if (delta > erlaubt) {
      groessteAbweichung = Math.max(groessteAbweichung, delta - erlaubt);
    }
  }
  assert.equal(groessteAbweichung, 0,
    `Die Zielsuche dreht stärker als erlaubt: ${zielsucheJeTick.toFixed(4)} rad (Zielsuche) `
    + `+ g/|v| — die größte Überschreitung war ${groessteAbweichung.toFixed(4)} rad je Tick`);

  // Und sie tut überhaupt etwas: Der Unterschied zum Lauf OHNE Zielsuche ist die
  // Wirkung der Zielsuche selbst.
  assert.ok(mit.winkelSumme > ohne.winkelSumme,
    `Mit Zielsuche muss die Bahn stärker drehen als ohne `
    + `(${mit.winkelSumme.toFixed(3)} gegen ${ohne.winkelSumme.toFixed(3)} rad)`);
});

test('Durchschlag und Zielsuche bleiben deterministisch', () => {
  const durchschlag = WEAPONS.find(w => w.piercing > 0 && w.delivery === 'projectile');
  const zielsuchend = WEAPONS.find(w => w.homing > 0 && w.delivery === 'projectile');

  const lauf = () => {
    const match = matchMitZweiFiguren(31337);
    const schuetze = match.activePlayerId;
    match.inventory.register(schuetze, [durchschlag.id, zielsuchend.id]);
    match.fire(schuetze, Math.PI / 2 - 0.3, 55, durchschlag.id);
    for (let i = 0; i < 40; i += 1) match.step();
    match.consumeEvents();
    match.fire(schuetze, Math.PI / 2, 70, zielsuchend.id);
    for (let i = 0; i < 60; i += 1) match.step();
    match.consumeEvents();
    return match.stateHash();
  };

  assert.equal(lauf(), lauf(),
    'Zwei Läufe mit gleichem Seed und gleichen Schüssen müssen denselben Zustand ergeben');
});

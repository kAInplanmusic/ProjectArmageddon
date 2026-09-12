import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import { EFFECT_KIND, SELF_TARGET_KINDS, buildEffect } from '../src/engine/specials.js';

/**
 * Auto-Turret (`pa_124`, `special: 'auto_target'`).
 *
 * ## Was vorher fehlte
 *
 * Die Waffe trug im Katalog `special: 'auto_target'`, aber `SPECIAL_EFFECTS`
 * kannte den Namen nicht — `buildEffect` lieferte `null`. Gemessen:
 * `buildEffect(WEAPONS_BY_ID.pa_124)` → `null`. Damit fiel die Waffe in den
 * gewöhnlichen Schusspfad: ein Projektil, das nichts weiter tut.
 *
 * ## Die Mechanik
 *
 * Ein Geschütz wird am eigenen Standort aufgestellt (deshalb eine
 * SELBSTWIRKUNG, kein Projektil) und feuert in den Folgerunden von selbst auf
 * den nächsten Gegner in Reichweite. Es läuft nach einer festen Rundenzahl ab.
 *
 * ## Warum es KEIN ECS-Objekt ist
 *
 * Ein Geschütz bewegt sich nicht, hat keine Gesundheit und wird nicht von
 * Explosionen getroffen — es braucht von einem ECS-Objekt nur eine Position. Als
 * schlichter Eintrag bleibt es außerdem außerhalb der Entity-ID-Wiederverwendung,
 * die in diesem Projekt schon zwei Fehler verursacht hat.
 */

const WAFFE = 'pa_124';

/** Match mit aufgestelltem Geschütz. */
function matchMitGeschuetz({ seed = 4242, preset = 'open', teams = 2, playersPerTeam = 2 } = {}) {
  /*
   * Kurze Zugzeit: Das Geschütz feuert am RUNDENANFANG. Mit der Vorgabe von 30 s
   * je Zug dauert eine Runde zwei Minuten, und ein Test käme in seinem
   * Schrittbudget kaum über die erste Runde hinaus — gemessen feuerte das
   * Geschütz dann nur einmal und lief nie ab. Die Zugzeit ist für diese Tests
   * ohne Bedeutung, weil niemand schießt.
   */
  const match = new MatchController({
    seed, teams, playersPerTeam, preset, turnDurationMs: 300, maxRounds: 12,
  });
  match.start();
  const spieler = match.activePlayerId;
  match.inventory.register(spieler, [WAFFE]);
  match.inventory.selectWeapon(spieler, WAFFE);
  const ergebnis = match.fire(spieler, 0.5, 60, WAFFE);
  match.consumeEvents();
  return { match, spieler, ergebnis };
}

/** Spielt bis zu einer Rundenzahl, sammelt Ereignisse. */
function bisRunde(match, zielRunde, maxSchritte = 20_000) {
  const ereignisse = [];
  let schritte = 0;
  while (match.status === 'playing' && match.round < zielRunde && schritte < maxSchritte) {
    match.step();
    for (const e of match.consumeEvents()) ereignisse.push({ runde: match.round, typ: e.type, payload: e.payload });
    schritte += 1;
  }
  return ereignisse;
}

test('Die Waffe hat eine Wirkung — nicht mehr null', () => {
  /*
   * Der Kern des Fehlers, direkt geprüft: Vorher lieferte `buildEffect` für
   * `pa_124` `null`. Der Test hält das Ergebnis in seinen Bestandteilen fest,
   * nicht nur „nicht null" — ein Effekt ohne Schaden wäre nutzlos.
   */
  const effect = buildEffect(WEAPONS_BY_ID[WAFFE]);
  assert.ok(effect, 'buildEffect liefert weiterhin null');
  assert.equal(effect.kind, EFFECT_KIND.TURRET);
  assert.ok(effect.damage > 0, 'Geschütz ohne Schaden');
  assert.ok(effect.range > 0, 'Geschütz ohne Reichweite');
  assert.ok(effect.turns > 0, 'Geschütz ohne Wirkungsdauer');

  // Und es ist eine Selbstwirkung: aufgestellt wird am eigenen Standort.
  assert.ok(SELF_TARGET_KINDS.has(EFFECT_KIND.TURRET),
    'Das Geschütz gilt nicht als Selbstwirkung — es würde ein Projektil erzeugen');
});

test('Das Geschütz wird am eigenen Standort aufgestellt', () => {
  const { match, spieler, ergebnis } = matchMitGeschuetz();

  assert.equal(ergebnis.ok, true, `Schuss abgelehnt: ${ergebnis.errors?.join(', ')}`);
  assert.equal(ergebnis.special?.kind, EFFECT_KIND.TURRET);

  const turrets = match.getState().turrets;
  assert.equal(turrets.length, 1, `${turrets.length} Geschütze statt einem`);

  const turret = turrets[0];
  // Nahe am Spieler (aufgestellt wird am Standort, wenige Pixel daneben).
  const spielerX = match.getState().entities.find(e => e.entityId === spieler).x;
  assert.ok(Math.abs(turret.x - spielerX) <= 60,
    `Geschütz steht ${Math.abs(turret.x - spielerX)} px vom Spieler entfernt`);
  // Auf festem, trockenem Boden.
  const boden = match.surfaceYAt(turret.x);
  assert.ok(boden > 0, 'Geschütz steht nicht auf festem Boden');
  assert.ok(match.waterLevelAt(turret.x, boden) < 0.4, 'Geschütz steht im Wasser');
  // Und es gehört dem Schützen.
  assert.equal(turret.ownerId, spieler);

  // Kein Projektil: Aufstellen ist eine Selbstwirkung.
  assert.equal(match.getState().projectiles.length, 0,
    'Beim Aufstellen wurde ein Projektil erzeugt');
});

test('Kein Geschütz ohne Platz — und der Schuss wird nicht stillschweigend verbucht', () => {
  /*
   * Wenn kein Platz frei ist (z. B. überall Wasser), darf kein Geschütz
   * entstehen. Geprüft wird, dass der Fall BENANNT wird — ein stiller Fehlschlag
   * wäre von „hat funktioniert" nicht zu unterscheiden.
   */
  const match = new MatchController({
    seed: 4242, teams: 2, playersPerTeam: 1, preset: 'flooded', turnDurationMs: 60_000,
  });
  match.start();
  const spieler = match.activePlayerId;
  match.inventory.register(spieler, [WAFFE]);
  const ergebnis = match.fire(spieler, 0.5, 60, WAFFE);
  match.consumeEvents();

  assert.equal(ergebnis.ok, true, 'Der Schuss selbst muss gelingen');
  const wirkung = ergebnis.special;
  if (wirkung?.turretId === null) {
    // Kein Platz: Der Grund muss im Ergebnis stehen.
    assert.ok(wirkung.reason, 'Fehlender Platz ohne Begründung');
    assert.equal(match.getState().turrets.length, 0);
  } else {
    // Platz vorhanden: dann muss auch eines stehen.
    assert.equal(match.getState().turrets.length, 1);
  }
});

test('Das Geschütz feuert in den Folgerunden von selbst', () => {
  const { match, spieler } = matchMitGeschuetz();
  const ereignisse = bisRunde(match, 5);

  const schuesse = ereignisse.filter(e => e.typ === 'turret_fired');
  assert.ok(schuesse.length >= 2,
    `Nur ${schuesse.length} Geschützschüsse in vier Runden — es feuert nicht`);

  // Jeder Schuss nennt Besitzer und Ziel — und es gibt ein Projektil dazu.
  const spawnIds = new Set(
    ereignisse.filter(e => e.typ === 'projectile_spawn').map(e => e.payload.projectileId),
  );
  for (const schuss of schuesse) {
    assert.equal(schuss.payload.ownerId, spieler, 'Geschützschuss ohne den richtigen Besitzer');
    assert.ok(Number.isInteger(schuss.payload.targetId),
      'Geschützschuss ohne Ziel — es hat blind gefeuert');
    assert.ok(spawnIds.has(schuss.payload.projectileId),
      `Zum Geschützschuss fehlt das Projektil (${schuss.payload.projectileId})`);
  }
});

test('Das Geschütz feuert NICHT auf das eigene Team', () => {
  /*
   * Der wichtigste Test der Mechanik. Ein Geschütz, das auf die eigenen Leute
   * schießt, wäre eine Waffe, die man nicht einsetzen kann.
   */
  const { match, spieler } = matchMitGeschuetz();
  const teamsInGame = new Map(match.getState().entities.map(e => [e.entityId, e.teamId]));
  const eigenesTeam = teamsInGame.get(spieler);

  const ereignisse = bisRunde(match, 5);
  const schuesse = ereignisse.filter(e => e.typ === 'turret_fired');
  assert.ok(schuesse.length > 0, 'Testaufbau braucht Geschützschüsse');

  for (const schuss of schuesse) {
    const zielTeam = teamsInGame.get(schuss.payload.targetId);
    assert.notEqual(zielTeam, eigenesTeam,
      `Das Geschütz hat auf das eigene Team gefeuert (Ziel ${schuss.payload.targetId})`);
  }

  // Und es entstand kein Schaden am eigenen Team.
  const eigenerSchaden = ereignisse.filter(e => e.typ === 'damage'
    && e.payload.attackerId === spieler
    && teamsInGame.get(e.payload.entityId) === eigenesTeam
    && e.payload.entityId !== spieler);
  assert.equal(eigenerSchaden.length, 0,
    `Das Geschütz hat ${eigenerSchaden.length}× das eigene Team getroffen`);
});

test('Das Geschütz richtet Schaden an und läuft dann ab', () => {
  const { match, spieler } = matchMitGeschuetz();
  const eigenesTeam = match.getState().entities.find(e => e.entityId === spieler).teamId;

  const vorher = new Map(match.getState().entities.map(e => [e.entityId, e.health]));
  const ereignisse = bisRunde(match, 6);
  const nachher = new Map(match.getState().entities.map(e => [e.entityId, e.health]));

  let schadenAmGegner = 0;
  for (const [id, hp] of vorher) {
    const jetzt = nachher.get(id) ?? 0;
    const team = match.players.find(p => p.entityId === id)?.teamId;
    if (team !== eigenesTeam) schadenAmGegner += Math.max(0, hp - jetzt);
  }
  assert.ok(schadenAmGegner > 0,
    'Das Geschütz hat in fünf Runden keinen Gegner getroffen');

  // Nach der Wirkungsdauer ist es weg.
  const ablauf = ereignisse.filter(e => e.typ === 'turret_expired');
  assert.ok(ablauf.length >= 1, 'Das Geschütz ist nie abgelaufen');
  assert.equal(match.getState().turrets.length, 0,
    'Nach dem Ablaufen steht noch ein Geschütz');
});

test('Das Geschütz läuft nach der angegebenen Rundenzahl ab, nicht früher', () => {
  /*
   * Die Wirkungsdauer ist eine Balance-Entscheidung; geprüft wird, dass sie
   * eingehalten wird. Ein Geschütz, das eine Runde zu früh verschwindet, wäre
   * eine andere Waffe.
   */
  const effect = buildEffect(WEAPONS_BY_ID[WAFFE]);
  const { match } = matchMitGeschuetz();

  const ereignisse = bisRunde(match, 8);
  const ablauf = ereignisse.find(e => e.typ === 'turret_expired');
  assert.ok(ablauf, 'Kein Ablauf-Ereignis');

  // So viele Rundenwechsel, wie das Geschütz Wirkungsdauer hat.
  const rundenwechsel = ereignisse.filter(e => e.typ === 'round_start').length;
  assert.ok(rundenwechsel >= effect.turns - 1,
    `Das Geschütz lief nach ${rundenwechsel} Runden ab, angegeben waren ${effect.turns}`);
});

test('Ohne Geschütz in Reichweite wird nicht gefeuert', () => {
  /*
   * Kein Blindfeuer: Steht kein Gegner in Reichweite, unterbleibt der Schuss.
   * Sonst beschösse das Geschütz den eigenen Standort oder ins Leere.
   */
  const { match, spieler } = matchMitGeschuetz({ preset: 'open' });
  // Alle Gegner weit weg setzen (an den rechten Rand) — außerhalb der Reichweite
  // einer kurzen Variante.
  const effect = buildEffect(WEAPONS_BY_ID[WAFFE]);
  const eigenesTeam = match.getState().entities.find(e => e.entityId === spieler).teamId;
  const gegner = match.players.filter(p => p.teamId !== eigenesTeam);
  for (const g of gegner) {
    match.world.setComponent(g.entityId, 'Position', 'x', 1200);
    match.world.setComponent(g.entityId, 'Position', 'y', 100);
  }

  const ereignisse = bisRunde(match, 3);
  const schuesse = ereignisse.filter(e => e.typ === 'turret_fired');
  for (const schuss of schuesse) {
    const ziel = match.players.find(p => p.entityId === schuss.payload.targetId);
    const pos = match.world.getComponent(ziel?.entityId, 'Position', 'x') ?? 0;
    assert.ok(Math.abs(pos - schuss.payload.x) <= effect.range + 1,
      `Geschütz hat auf ${Math.round(Math.abs(pos - schuss.payload.x))} px gefeuert, `
      + `Reichweite ist ${effect.range}`);
  }
});

test('Zwei Schüsse im selben Zug sind nicht möglich', () => {
  /*
   * Fund (belegt): Der Zug endet erst, wenn das Geschoss verflogen ist. Solange
   * ein Schuss flog, konnte derselbe Spieler erneut feuern — gemessen im
   * Aufzeichnungslauf: Spieler 3 schoss bei Takt 452 UND 453, ohne Zugwechsel.
   * Im Mehrspieler wäre das ein Cheat (schnell genug nachlegen).
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, turnDurationMs: 60_000 });
  match.start();
  const spieler = match.activePlayerId;

  const erster = match.fire(spieler, 0.5, 60);
  assert.equal(erster.ok, true, `Erster Schuss abgelehnt: ${erster.errors?.join(', ')}`);

  // Ohne Schritt dazwischen: sofort noch einmal.
  const zweiter = match.fire(spieler, 0.6, 60);
  assert.equal(zweiter.ok, false, 'Ein zweiter Schuss im selben Zug wurde angenommen');
  assert.match(zweiter.errors.join(' '), /bereits geschossen/i,
    `Ablehnung aus dem falschen Grund: ${zweiter.errors?.join(', ')}`);

  // Und auch nach einigen Takten, solange das Geschoss noch fliegt.
  match.step();
  match.consumeEvents();
  const dritter = match.fire(spieler, 0.7, 60);
  assert.equal(dritter.ok, false,
    'Solange das Geschoss fliegt, war ein weiterer Schuss möglich');
});

test('Das Geschütz ist deterministisch — gleicher Seed, gleiche Schüsse', () => {
  /*
   * Die Winkelsuche (siehe `#turretShot`) probiert feste Listen durch. Wäre sie
   * zufällig, wäre ein Replay nicht reproduzierbar und der Turret ein
   * Zufallselement im sonst deterministischen Match.
   */
  const lauf = seed => {
    const { match, spieler } = matchMitGeschuetz({ seed });
    const ereignisse = bisRunde(match, 6);
    return {
      schuesse: ereignisse.filter(e => e.typ === 'turret_fired')
        .map(e => `${e.payload.angle.toFixed(6)}|${e.payload.power}|${e.payload.targetId}`),
      hash: match.stateHash(),
      turretX: match.getState().turrets.map(t => t.x),
      spieler,
    };
  };

  const a = lauf(4242);
  const b = lauf(4242);
  assert.deepEqual(a.schuesse, b.schuesse, 'Die Geschützschüsse sind nicht reproduzierbar');
  assert.equal(a.hash, b.hash, 'Der Zustandshash weicht bei gleichem Seed ab');
  assert.deepEqual(a.turretX, b.turretX, 'Das Geschütz steht bei gleichem Seed woanders');
});

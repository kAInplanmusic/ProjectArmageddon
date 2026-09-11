import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';

/**
 * Sieg durch Ausschaltung — und die Tücke wiederverwendeter Entity-IDs.
 *
 * ## Der Fund
 *
 * Das ECS vergibt die IDs entfernter Entities neu. Starb eine Spielfigur, erbte
 * eine neu erzeugte Kiste (oder ein Geschoss) ihren Platz — und damit ihre ID.
 * Die Siegprüfung fragte aber `world.isActive(entityId)` und hielt die gefallene
 * Figur deshalb für lebendig, weil unter derselben ID wieder etwas lag.
 *
 * Nachgestellt mit Seed 5150: alle vier Figuren gefallen, Status weiterhin
 * „playing", Runde 8 — das Match lief bis zur Rundengrenze (30) weiter, und die
 * Anzeige meldete tote Figuren als lebendig mit 0 Leben.
 *
 * Der Fehler war latent: Ob eine ID vor der Siegprüfung wiederverwendet wurde,
 * hing am Timing der Kisten. Er wurde erst sichtbar, als die klassenabhängigen
 * Startloadouts das Kampfgeschehen verschoben.
 *
 * ## Die Regel
 *
 * Der Lebensstatus gehört an den SPIELER (`entry.alive`), nicht an einen
 * wiederverwendbaren Platz im ECS. Diese Datei hält das fest.
 */

/** Spielt ein Match, indem jede Runde geschossen wird. Gibt den Endzustand. */
function matchMitDauerfeuer({ seed, teams = 2, playersPerTeam = 2, maxTicks = 4000 }) {
  const match = new MatchController({ seed, teams, playersPerTeam });
  match.start();
  let ticks = 0;
  while (match.getState().status === 'playing' && ticks < maxTicks) {
    const state = match.getState();
    if (state.turnElapsedMs < 20) match.fire(state.activePlayerId, Math.PI / 4, 60 + (ticks % 30));
    match.step();
    match.consumeEvents();
    ticks += 1;
  }
  return { match, ticks };
}

test('Ein Match endet durch Ausschaltung, nicht erst an der Rundengrenze', () => {
  // Der Seed, mit dem der Fehler reproduzierbar auftrat.
  const { match, ticks } = matchMitDauerfeuer({ seed: 5150 });
  const state = match.getState();

  assert.equal(state.status, 'gameover', 'Das Match läuft nach 4000 Schritten noch');
  assert.notEqual(state.winnerTeamId, null, 'Kein Sieger ermittelt');
  assert.ok(ticks < 4000, `Erst nach ${ticks} Schritten beendet`);
});

test('Eine gefallene Figur wird nicht als lebendig gemeldet', () => {
  const { match } = matchMitDauerfeuer({ seed: 5150 });
  const state = match.getState();

  for (const entity of state.entities) {
    if (entity.alive) {
      assert.ok(entity.health > 0,
        `Figur ${entity.entityId} gilt als lebendig, hat aber ${entity.health} Leben`);
      assert.ok(entity.maxHealth > 0, 'Lebende Figur ohne Maximalleben');
    } else {
      assert.equal(entity.health, 0, 'Gefallene Figur mit Restleben');
    }
  }

  // Mindestens ein Spieler ist gefallen — sonst prüfte der Test nichts.
  assert.ok(state.entities.some(e => !e.alive), 'Niemand ist gefallen');
  assert.ok(state.entities.some(e => e.alive), 'Der Sieger muss übrig sein');

  // Der öffentliche Zugang sagt dasselbe.
  for (const entity of state.entities) {
    assert.equal(match.isPlayerAlive(entity.entityId), entity.alive);
  }
});

test('Eine wiederverwendete Entity-ID täuscht den Lebensstatus nicht', () => {
  /*
   * Der Kern des Fehlers, direkt geprüft: Nach dem Tod einer Figur wird eine
   * neue Entity erzeugt. Bekommt sie dieselbe ID, ist `world.isActive` wahr —
   * `isPlayerAlive` muss trotzdem falsch bleiben.
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 1 });
  match.start();

  const opfer = match.getState().entities[1];
  assert.equal(match.isPlayerAlive(opfer.entityId), true, 'Die Figur lebt zu Beginn');

  // Tödlicher Schaden.
  const tot = match.world.getSystem('damage');
  tot.applyDamage(match.world, opfer.entityId, 10_000, null);
  match.step();
  match.consumeEvents();

  assert.equal(match.isPlayerAlive(opfer.entityId), false, 'Die Figur muss gefallen sein');
  assert.equal(match.getState().entities.find(e => e.entityId === opfer.entityId).alive, false);

  // Jetzt eine neue Entity erzeugen. Egal, ob sie die freie ID erbt: Der
  // Lebensstatus darf sich nicht ändern.
  const neueId = match.world.createEntity();
  const erbte = neueId === opfer.entityId;

  assert.equal(match.isPlayerAlive(opfer.entityId), false,
    `Die Figur gilt nach dem Erzeugen einer Entity (ID ${neueId}) wieder als lebendig`);
  assert.equal(match.getState().entities.find(e => e.entityId === opfer.entityId).alive, false);

  // Und wenn sie die ID geerbt hat, ist genau das die Falle, die `isActive`
  // gestellt hätte.
  if (erbte) {
    assert.equal(match.world.isActive(opfer.entityId), true,
      'Die ID wurde nicht wiederverwendet — der scharfe Fall ist nicht eingetreten');
  }
});

test('Das Ende durch Ausschaltung nennt Sieger und Grund', () => {
  const match = new MatchController({ seed: 9001, teams: 2, playersPerTeam: 1 });
  match.start();

  const ueberlebender = match.players.find(p => p.teamId === 0);
  const gegner = match.players.find(p => p.teamId === 1);

  const ereignisse = [];
  match.world.getSystem('damage').applyDamage(match.world, gegner.entityId, 10_000, null);
  match.step();
  for (const e of match.consumeEvents()) ereignisse.push(e);

  const ende = ereignisse.find(e => e.type === 'match_over');
  assert.ok(ende, 'Kein match_over-Ereignis nach der Ausschaltung');
  assert.equal(ende.payload.winnerTeamId, 0);
  assert.equal(ende.payload.reason, 'elimination');
  assert.equal(match.getState().status, 'gameover');

  // Der Zug darf nicht an den Gefallenen gehen.
  assert.equal(match.isPlayerAlive(gegner.entityId), false);
  assert.equal(match.isPlayerAlive(ueberlebender.entityId), true);
});

test('Ein gefallener Spieler kann nicht mehr handeln', () => {
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 1 });
  match.start();

  const gegner = match.players.find(p => p.teamId === 1);
  match.world.getSystem('damage').applyDamage(match.world, gegner.entityId, 10_000, null);
  match.step();
  match.consumeEvents();

  // Kommandos eines Toten werden abgelehnt — auch wenn eine Kiste seine ID trägt.
  for (const ergebnis of [
    match.fire(gegner.entityId, Math.PI / 4, 50),
    match.dropWeapon(gegner.entityId, match.inventory.getWeapons(gegner.entityId)[0]),
    match.jump(gegner.entityId, 1),
  ]) {
    assert.equal(ergebnis.ok, false, 'Ein Gefallener konnte handeln');
    assert.ok(ergebnis.errors?.length > 0, 'Ablehnung ohne Begründung');
  }

  assert.deepEqual(match.aimPreview(gegner.entityId, Math.PI / 4, 50), []);
});

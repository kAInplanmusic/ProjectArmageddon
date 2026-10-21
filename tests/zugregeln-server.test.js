/**
 * Zugregeln online (Fassung 2): Der Server prüft Überspringen und Aufgeben — die Identität kommt aus dem Token,
 * nur der aktive Spieler darf überspringen, Aufgeben gilt nur für den eigenen Sitz, und beides ist je Sitz
 * rate-begrenzt. Bots und Client dürfen dem Server nichts vorgeben.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTROL } from '../src/shared/protocol.js';
import { starteServer, erstelleLobby, trittBei } from './helfer/server-testclient.js';

async function zweiSpieler() {
  const { server, url, wsUrl } = await starteServer();
  const lobby = await erstelleLobby(url, { teams: 2, playersPerTeam: 1, seed: 31 });
  const a = await trittBei(wsUrl, lobby.lobby.id, { name: 'A', token: lobby.player.token });
  const b = await trittBei(wsUrl, lobby.lobby.id, { name: 'B' });
  return { server, a, b };
}

async function aktiver(spieler) {
  const [x, y] = spieler;
  const snap = await x.client.warteAufSnapshot();
  assert.ok(snap, 'es fließen Snapshots');
  const idX = x.welcome.entityId;
  return snap.activePlayerId === idX ? { am: x, andere: y } : { am: y, andere: x };
}

test('Überspringen: der Fremde wird abgelehnt, der Aktive kommt durch, der Zug wechselt', async () => {
  const { server, a, b } = await zweiSpieler();
  try {
    const { am, andere } = await aktiver([a, b]);
    andere.client.send(CONTROL.SKIP_TURN);
    const fehler = await andere.client.warte(CONTROL.ERROR);
    assert.ok(fehler, 'wer nicht am Zug ist, bekommt einen Grund');
    const vorher = (await am.client.warteAufSnapshot()).activePlayerId;
    am.client.send(CONTROL.SKIP_TURN);
    const snap = await am.client.warteAufTakt((await am.client.warteAufSnapshot()).tick);
    const bis = Date.now() + 4000;
    let aktuell = snap.activePlayerId;
    while (aktuell === vorher && Date.now() < bis) {
      await new Promise(r => setTimeout(r, 30));
      aktuell = am.client.snapshots[am.client.snapshots.length - 1].activePlayerId;
    }
    assert.notEqual(aktuell, vorher, 'der Zug ist weitergegangen');
  } finally { a.client.close(); b.client.close(); await server.close?.(); }
});

test('Überspringen: zwei Nachrichten in kurzem Abstand — die zweite wird je Sitz gedrosselt', async () => {
  const { server, a, b } = await zweiSpieler();
  try {
    const { am } = await aktiver([a, b]);
    am.client.send(CONTROL.SKIP_TURN);
    am.client.send(CONTROL.SKIP_TURN);
    const fehler = await am.client.warte(CONTROL.ERROR);
    assert.ok(fehler, 'die Wiederholung im selben Atemzug wird abgelehnt');
  } finally { a.client.close(); b.client.close(); await server.close?.(); }
});

test('Aufgeben: nur der eigene Sitz; der Gegner gewinnt, das Match endet', async () => {
  const { server, a, b } = await zweiSpieler();
  try {
    await a.client.warteAufSnapshot();
    b.client.send(CONTROL.SURRENDER);
    const meldung = await a.client.warte('aufgegeben');
    assert.ok(meldung, 'alle Clients erfahren vom Aufgeben');
    assert.equal(meldung.playerId, b.welcome.entityId, 'es traf den Sitz, der gesendet hat — nicht den anderen');
    const ende = await a.client.warte('match_over');
    assert.ok(ende, 'das Match endet wie nach jedem Tod');
    const tod = await a.client.warte('death');
    assert.equal(tod?.entityId, b.welcome.entityId);
  } finally { a.client.close(); b.client.close(); await server.close?.(); }
});

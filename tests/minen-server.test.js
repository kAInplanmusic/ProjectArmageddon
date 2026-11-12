/**
 * Minen am Server (Auftrag `docs/auftraege/minen-faesser.md`, §6 „Server lehnt ab“, §7 „Integration“).
 *
 * Die Mine ist keine eigene Nachricht `lege_mine`, sondern eine Selbstwirkung der Waffe `pa_127`
 * (Waffenfassung 12): Der Client schickt einen gewöhnlichen Schuss (`INPUT`) mit dieser Waffe. Die
 * Ablehnungen sind deshalb die des Schusswegs, hier für die Mine einzeln belegt — gegen einen ECHTEN
 * Server mit zwei verbundenen Spielern, über `GameSession#handleInput` (derselbe Weg wie die Nachricht):
 *
 *  - nicht am Zug → abgelehnt, keine Mine;
 *  - ohne Munition → abgelehnt, keine Mine;
 *  - nach dem Ende der Partie (Simulation steht) → abgelehnt, keine Mine;
 *  - Karte voll (kein freier Platz, Obergrenze `MINEN.maximum`) → nichts gelegt (der Grund steht im `special_effect`,
 *    siehe `tests/minen.test.js`, „Ohne Bodenobjektfassung …“);
 *  - Gegenprobe: am Zug, mit Munition → angenommen, eine Mine liegt im Zustand, der Zug ist zu Ende.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTROL } from '../src/shared/protocol.js';
import { MINEN } from '../src/shared/config/bodenobjekte.js';
import { getWaffe } from '../src/shared/config/waffen-fassung.js';
import { starteServer, erstelleLobby, trittBei } from './helfer/server-testclient.js';

const MINE = 'pa_127';

async function partie() {
  const { server, url, wsUrl } = await starteServer();
  const lobby = await erstelleLobby(url, { teams: 2, playersPerTeam: 1, seed: 31 });
  const a = await trittBei(wsUrl, lobby.lobby.id, { name: 'A', token: lobby.player.token });
  const b = await trittBei(wsUrl, lobby.lobby.id, { name: 'B' });
  a.client.send(CONTROL.START_MATCH, {});
  await a.client.warteAufSnapshot();
  const session = server.getSession(lobby.lobby.id);
  assert.ok(session?.match, 'die Sitzung hat ein laufendes Match');
  const bis = Date.now() + 6000;
  while (session.match.activePlayerId === null && Date.now() < bis) await new Promise(r => setTimeout(r, 20));
  const sitze = session.lobby.seats.filter(s => s.entityId !== null);
  const am = sitze.find(s => s.entityId === session.match.activePlayerId);
  const andere = sitze.find(s => s !== am);
  assert.ok(am && andere, 'zwei Sitze, einer am Zug');
  const schliessen = async () => { a.client.close(); b.client.close(); await server.close?.(); };
  return { server, session, match: session.match, am, andere, schliessen };
}

const eigeneMinen = (match, ownerId) => (match.getState().bodenobjekte ?? []).filter(o => o.typ !== 'fass' && o.ownerId === ownerId);
const schuss = (session, token) => session.handleInput(token, { angle: 0, power: 60, weaponId: MINE, tick: session.match.world.tickCount });

test('Server: neue Partien legen mit pa_127 eine Mine (Waffenfassung und Bodenobjektfassung des Servers)', async () => {
  const p = await partie();
  try {
    assert.ok(getWaffe(MINE, p.match.waffen).special === 'mine' || getWaffe(MINE, p.match.waffen).landetAls === 'mine', `Waffenfassung ${p.match.waffen}: pa_127 ist die Mine`);
    assert.ok(p.match.bodenobjekte >= 2, `Bodenobjektfassung ${p.match.bodenobjekte} kennt Minen`);
    p.match.inventory.register(p.am.entityId, [MINE]);
    const ergebnis = schuss(p.session, p.am.token);
    assert.equal(ergebnis.ok, true, `Gegenprobe abgelehnt: ${ergebnis.errors?.join(', ')}`);
    // Fassung 22: die Mine fliegt im Bogen und liegt erst nach dem Aufprall; ältere Fassungen legen sie sofort.
    const gelegt = [];
    for (let i = 0; i < 400; i += 1) { p.match.step(); for (const e of p.match.consumeEvents()) if (e.type === 'mine_placed') gelegt.push(e.payload); }
    assert.equal(gelegt.filter(m => m.ownerId === p.am.entityId).length, 1, 'genau eine Mine des Werfers wurde gelegt (sie kann danach schon ausgelöst haben)');
  } finally { await p.schliessen(); }
});

test('Server lehnt die Mine ab, wer nicht am Zug ist — es entsteht keine Mine', async () => {
  const p = await partie();
  try {
    p.match.inventory.register(p.andere.entityId, [MINE]);
    const ergebnis = schuss(p.session, p.andere.token);
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.errors.join(' '), /nicht am Zug/);
    assert.equal(eigeneMinen(p.match, p.andere.entityId).length, 0);
  } finally { await p.schliessen(); }
});

test('Server lehnt die Mine ohne Munition ab — es entsteht keine Mine', async () => {
  const p = await partie();
  try {
    assert.ok(!(p.match.inventory.getAmmo(p.am.entityId, MINE) > 0), 'Startinventar ohne Minen (sonst prüft der Test nichts)');
    const ergebnis = schuss(p.session, p.am.token);
    assert.equal(ergebnis.ok, false, 'ohne Munition angenommen');
    assert.equal(eigeneMinen(p.match, p.am.entityId).length, 0);
  } finally { await p.schliessen(); }
});

test('Server lehnt die Mine ab, wenn die Partie zu Ende ist (Simulation steht)', async () => {
  const p = await partie();
  try {
    p.match.inventory.register(p.am.entityId, [MINE]);
    p.session.handleSurrender(p.andere.token);
    for (let i = 0; i < 120 && p.match.status === 'playing'; i += 1) p.session.stepSimulation(1);
    assert.notEqual(p.match.status, 'playing', 'nach dem Aufgeben läuft die Partie nicht mehr');
    const ergebnis = schuss(p.session, p.am.token);
    assert.equal(ergebnis.ok, false, 'nach dem Ende angenommen');
    assert.equal(eigeneMinen(p.match, p.am.entityId).length, 0);
  } finally { await p.schliessen(); }
});

test('Volle Karte (kein freier Platz): der Server legt keine Mine über der Obergrenze', async () => {
  const p = await partie();
  try {
    const system = p.match.bodenobjektSystem;
    while (system.lege(10 + system.anzahl, 5, { art: 'liegend' })) { /* bis zur Obergrenze füllen */ }
    assert.equal(system.anzahl, MINEN.maximum);
    p.match.inventory.register(p.am.entityId, [MINE]);
    // Den Grund liefert die Selbstwirkung im Ergebnis des Motors (`special_effect`, `reason`); hier zählt: nichts entsteht.
    schuss(p.session, p.am.token);
    assert.equal(eigeneMinen(p.match, p.am.entityId).length, 0, 'keine Mine über der Obergrenze');
    assert.equal(system.anzahl, MINEN.maximum, 'die Obergrenze hält');
  } finally { await p.schliessen(); }
});

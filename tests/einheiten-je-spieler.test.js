/**
 * Ein Mensch führt ein TEAM — nicht eine Figur.
 *
 * ## Warum es diese Datei gibt
 *
 * Die Matcharten (MASTERDOTO, „Matcharten") kennen **keinen** Modus mit einer
 * Einheit je Spieler: klein nennt 3, groß 4, Krieg 5 Einheiten JE SPIELER
 * (2–4 × 3 = 6–12, 4 × 4 = 16, 6–8 × 5 = 30–40 Figuren). Der Server gab einem
 * Beitritt aber GENAU EINEN Platz — ein Mensch steuerte also eine einzige Figur.
 * Eine frühere Fassung dieses Projekts hat diese Lücke sogar als „bewusst nicht
 * gebaut" dokumentiert; das widersprach dem Modell.
 *
 * Umgesetzt ist jetzt: Mit `unitsPerPlayer` (3/4/5) besetzt ein Beitritt ein
 * GANZES TEAM. Freie Teams übernimmt die Bot-KI. Die Zugreihenfolge bleibt „jede
 * Einheit einzeln" (S1E1, S2E1, S1E2 …) — der Motor erzeugt die Figuren bereits
 * verschränkt (`teamId = index % teams`), sodass nie dieselbe Seite zweimal
 * hintereinander zieht.
 *
 * ## Was hier geprüft wird
 *
 *  1. Ein Beitritt besitzt `unitsPerPlayer` Plätze EINES Teams, alle mit einem Token.
 *  2. Die Figur-Slots (`figureIndex`) folgen dem MOTOR, nicht der Sitzreihenfolge.
 *  3. Die Beschreibung zählt Menschen, nicht Plätze (sonst „voll" bei einem Spieler).
 *  4. Ohne `unitsPerPlayer` bleibt die alte Aufteilung erhalten (Werkzeuge, Tests).
 *  5. Die Grenzen: 1…6 Einheiten je Team, höchstens 40 Figuren je Lobby.
 *  6. Der Client erkennt ALLE eigenen Figuren als „mein Zug".
 *  7. Die Kennzahlen eines Menschen mit drei Einheiten werden SUMIERT.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LobbyManager, MAX_LOBBY_FIGURES } from '../src/server/lobby.js';
import { LobbySession } from '../src/server/gameServer.js';
import { istEigenerZug } from '../src/client/networkClient.js';
import { MatchStats } from '../src/shared/stats.js';
import { CONTROL, parseControlMessage } from '../src/shared/protocol.js';

/** Ein Socket, der nur mitschreibt — für die Sitzungsprüfungen. */
function fakeSocket() {
  return {
    readyState: 1,
    gesendet: [],
    send(daten) { this.gesendet.push(daten); },
  };
}

test('Ein Beitritt besetzt ein ganzes Team — drei Plätze mit einem Token', () => {
  const manager = new LobbyManager();
  // teams=2, unitsPerPlayer=3 → klein: 2 Spieler × 3 Einheiten = 6 Figuren.
  const { lobby, player } = manager.create({ teams: 2, unitsPerPlayer: 3 });

  assert.equal(lobby.playersPerTeam, 3, 'der Motor braucht die Figuren je Team');
  assert.equal(lobby.unitsPerPlayer, 3);
  assert.equal(lobby.capacity, 6, '2 Teams × 3 Einheiten');

  assert.equal(player.seats.length, 3, 'ein Beitritt belegt drei Plätze');
  assert.equal(new Set(player.seats.map(s => s.token)).size, 1,
    'alle Plätze eines Menschen tragen denselben Token');
  assert.deepEqual(player.seats.map(s => s.teamId), [0, 0, 0]);
  assert.deepEqual(player.seats.map(s => s.unitIndex), [0, 1, 2]);
  /*
   * Die Slots folgen dem MOTOR: `teamId = index % teams` erzeugt bei zwei Teams
   * die Reihenfolge T0E1, T1E1, T0E2, T1E2, T0E3, T1E3. Team 0 liegt deshalb auf
   * 0, 2, 4 — NICHT auf 0, 1, 2.
   */
  assert.deepEqual(player.seats.map(s => s.figureIndex), [0, 2, 4]);
});

test('Das zweite Team geht an den zweiten Menschen — ein dritter findet keinen Platz', () => {
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, unitsPerPlayer: 3 });

  const zweiter = manager.join(lobby.id, { name: 'Zweiter' });
  assert.deepEqual(zweiter.seats.map(s => s.teamId), [1, 1, 1]);
  assert.deepEqual(zweiter.seats.map(s => s.figureIndex), [1, 3, 5]);
  assert.notEqual(zweiter.token, player.token);

  assert.throws(() => manager.join(lobby.id, { name: 'Dritter' }), /Teams sind besetzt/);
});

test('Die Beschreibung zählt MENSCHEN, nicht Plätze', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, unitsPerPlayer: 3 });

  const eins = manager.describe(lobby.id);
  assert.equal(eins.occupied, 1, 'ein Mensch ist da — nicht drei');
  assert.equal(eins.seatsOccupied, 3, 'belegt sind trotzdem drei Plätze');
  assert.equal(eins.seatsTotal, 2, 'zwei Menschen passen hinein');
  assert.equal(eins.unitsPerPlayer, 3);

  manager.join(lobby.id, { name: 'Zweiter' });
  const zwei = manager.describe(lobby.id);
  assert.equal(zwei.occupied, 2);
  assert.equal(zwei.seatsOccupied, 6);
});

test('Ohne unitsPerPlayer bleibt die alte Aufteilung erhalten', () => {
  /*
   * Werkzeuge, Tests und Replays aus älteren Fassungen setzen `playersPerTeam`
   * ohne `unitsPerPlayer`. Dort muss ein Beitritt weiterhin EINEN Platz belegen —
   * sonst änderte sich jedes bestehende Match stillschweigend.
   */
  const manager = new LobbyManager();
  const { lobby } = manager.create({ teams: 2, playersPerTeam: 2 });

  assert.equal(lobby.unitsPerPlayer, null);
  assert.equal(lobby.capacity, 4);

  // `create` belegt den Platz des Gastgebers — der ist der zweite Beitritt.
  const zweiter = manager.join(lobby.id, { name: 'A' });
  assert.equal(zweiter.seats.length, 1);
  assert.equal(zweiter.seatIndex, 1);
  assert.equal(zweiter.figureIndex, 1);

  manager.join(lobby.id, { name: 'B' });
  const vierter = manager.join(lobby.id, { name: 'D' });
  assert.equal(vierter.seatIndex, 3);
  assert.throws(() => manager.join(lobby.id, { name: 'E' }), /Lobby ist voll/);

  // Und die Beschreibung zählt hier Plätze, weil ein Platz ein Mensch ist.
  assert.equal(manager.describe(lobby.id).occupied, 4);
  assert.equal(manager.describe(lobby.id).seatsTotal, 4);
});

test('Die Grenzen der Matcharten werden geprüft', () => {
  const manager = new LobbyManager();

  assert.throws(() => manager.create({ teams: 2, unitsPerPlayer: 0 }), /unitsPerPlayer/);
  assert.throws(() => manager.create({ teams: 2, unitsPerPlayer: 7 }), /unitsPerPlayer/);
  // Zwei Angaben für dieselbe Zahl müssen übereinstimmen.
  assert.throws(
    () => manager.create({ teams: 2, playersPerTeam: 3, unitsPerPlayer: 4 }),
    /widersprechen sich/,
  );

  // Krieg: 8 Teams × 5 Einheiten = 40 Figuren — genau die Grenze.
  const krieg = manager.create({ teams: 8, unitsPerPlayer: 5 });
  assert.equal(krieg.lobby.capacity, MAX_LOBBY_FIGURES);
  // 8 × 6 wäre 48 und damit über der Grenze.
  assert.throws(() => manager.create({ teams: 8, unitsPerPlayer: 6 }), /Kapazität/);
});

test('Die Figuren eines Menschen sind die seines Teams — nicht die des Gegners', () => {
  /*
   * Die Zuordnung Platz → Figur geht über `figureIndex`. Genau hier saß der
   * Fehler, den die Umstellung aufdeckte: Mit der ARRAY-POSITION bekäme ein
   * Beitritt (drei Plätze hintereinander) die Figuren von Team 1 und 2.
   */
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, unitsPerPlayer: 3, seed: 4711 });
  /*
   * `create` liefert die BESCHREIBUNG der Lobby (eine Ansicht ohne Token); die
   * Sitzung arbeitet mit dem LIVE-Objekt. Genau das ist der Unterschied, an dem
   * ein Test sonst scheitert: In der Ansicht findet `filter(token)` nichts.
   */
  const live = manager.get(lobby.id);
  const session = new LobbySession(live);
  session.syncSeats();

  const teams = session.match.getState().entities.map(e => [e.entityId, e.teamId]);
  const teamVon = new Map(teams);

  const eigene = live.seats.filter(s => s.token === player.token).map(s => s.entityId);
  assert.equal(eigene.length, 3, 'drei Figuren für einen Menschen');
  assert.equal(new Set(eigene).size, 3, 'drei VERSCHIEDENE Figuren');
  for (const id of eigene) {
    assert.equal(teamVon.get(id), 0, `Figur ${id} muss in Team 0 stehen`);
  }

  // Und es sind die Slot-Positionen des Motors, nicht die ersten drei Spieler.
  const spieler = session.match.getState().entities;
  assert.deepEqual(eigene, [spieler[0].entityId, spieler[2].entityId, spieler[4].entityId]);

  // Die andere Seite steht dem Bot zu: sie hat keinen Platz mit Token.
  const gegner = live.seats.filter(s => s.teamId === 1);
  assert.equal(gegner.length, 0, 'das zweite Team ist frei — der Bot übernimmt es');
});

test('Die Platzmitteilung nennt alle eigenen Figuren', () => {
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, unitsPerPlayer: 3 });

  const session = new LobbySession(manager.get(lobby.id));
  session.syncSeats();
  const socket = fakeSocket();
  session.attach(player.token, socket);

  const platz = socket.gesendet
    .map(buf => parseControlMessage(buf))
    .find(m => m && m.t === CONTROL.LOBBY_STATE);
  assert.ok(platz, 'die Sitzung muss den Platz melden');
  assert.equal(platz.entityIds.length, 3,
    'drei eigene Figuren — sonst hielte der Client zwei für fremd');
  assert.equal(platz.entityId, platz.entityIds[0], '`entityId` bleibt die erste Figur');
});

test('Ein Mensch kann JEDE seiner Einheiten ziehen — auch die zweite', () => {
  /*
   * Der alte Code nahm den ERSTEN Platz des Tokens. Ist die zweite Einheit am
   * Zug, wäre `playerId` die erste Figur gewesen — der Server hätte abgelehnt
   * („nicht am Zug") und der Mensch könnte zwei Drittel seiner Einheiten nie
   * bewegen.
   */
  const manager = new LobbyManager();
  const { lobby, player } = manager.create({ teams: 2, unitsPerPlayer: 3, seed: 99 });
  const session = new LobbySession(manager.get(lobby.id));
  session.syncSeats();

  const live = manager.get(lobby.id);
  const eigeneIds = live.seats.filter(s => s.token === player.token).map(s => s.entityId);
  assert.equal(eigeneIds.length, 3);

  // Die erste Einheit ist am Zug: Schuss wird angenommen.
  assert.equal(session.match.activePlayerId, eigeneIds[0]);
  const eins = session.handleInput(player.token, { angle: 1, power: 50 });
  assert.equal(eins.ok, true, `Schuss 1: ${eins.errors?.join(', ')}`);

  /*
   * Bis zur ZWEITEN eigenen Einheit weiterschalten. Die Zugordnung ist
   * T0E1 → T1E1 → T0E2 …, die zweite eigene Einheit ist also der dritte Zug.
   */
  for (let i = 0; i < 12 && session.match.activePlayerId !== eigeneIds[1]; i += 1) {
    session.match.endTurn();
  }
  assert.equal(session.match.activePlayerId, eigeneIds[1],
    'die zweite eigene Einheit muss an die Reihe kommen');

  const zwei = session.handleInput(player.token, { angle: 1, power: 50 });
  assert.equal(zwei.ok, true, `Schuss der zweiten Einheit: ${zwei.errors?.join(', ')}`);
});

test('Der Client erkennt ALLE eigenen Figuren als „mein Zug"', () => {
  const eigene = [11, 12, 13];

  assert.equal(istEigenerZug(12, eigene), true, 'die zweite eigene Figur ist meine');
  assert.equal(istEigenerZug(12, new Set(eigene)), true, 'auch als Set');
  assert.equal(istEigenerZug(99, eigene), false, 'fremde Figur');
  assert.equal(istEigenerZug(null, eigene), false, 'kein Zug');
  assert.equal(istEigenerZug(12, null), false, 'keine eigenen Figuren bekannt');
  assert.equal(istEigenerZug(12, []), false);
});

test('Die Kennzahlen eines Menschen mit drei Einheiten werden summiert', () => {
  /*
   * Summiert, nicht gemittelt: Ein Mensch mit drei Einheiten schießt dreimal so
   * oft. Gemittelt sähe er aus wie jemand, der ein Drittel tut — und die Erfolge
   * („300 Schaden in einer Partie") wären für ihn unerreichbar.
   */
  const teams = new Map([[1, 0], [2, 0], [3, 0], [4, 1]]);
  const stats = new MatchStats({ teams });

  for (const eigener of [1, 2, 3]) {
    stats.feed({ type: 'shot', payload: { playerId: eigener, weaponId: 'pa_001' } });
    /*
     * `absorbedByShield` — der absorbierte Schaden zählt beim ANGREIFER (siehe
     * MatchStats.feed): Der Schild fängt Treffer ab, die er ausgeteilt hätte.
     */
    stats.feed({
      type: 'damage',
      payload: { entityId: 4, attackerId: eigener, amount: 30, absorbedByShield: 5 },
    });
  }

  const partie = stats.zusammenfassung([1, 2, 3]);
  assert.equal(partie.eigener.schuesse, 3, 'drei Schüsse sind drei Schüsse');
  assert.equal(partie.eigener.treffer, 3);
  assert.equal(partie.eigener.schaden, 90, '30 je Figur, summiert');
  assert.equal(partie.eigener.absorbierterSchaden, 15, '5 je Figur, summiert');
  assert.deepEqual(partie.eigener.figuren, [1, 2, 3]);
  assert.equal(partie.eigener.playerId, 1, 'die erste Figur benennt den Platz');

  // Eine einzelne Kennung verhält sich wie vorher.
  const einzeln = stats.zusammenfassung(1);
  assert.equal(einzeln.eigener.schuesse, 1);
  assert.deepEqual(einzeln.eigener.figuren, [1]);
  assert.equal(einzeln.eigener.schaden, 30);
});

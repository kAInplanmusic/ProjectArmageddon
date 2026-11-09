/**
 * Tests: Zugzeit nach Kartengröße (Entscheidung 2026-11-05, Paket A1).
 *
 * Bisher entschied die SPIELERZAHL: 30 s bei ≤2, 20 s bei 3–4, fest 15 s ab 5.
 * Jetzt entscheidet die KARTENGRÖSSE: klein 30 s, mittel 40 s, groß 50 s. Eine
 * ausdrückliche Angabe `turnDurationMs` schlägt weiterhin alles, und die
 * Spielerzahl darf nichts mehr ändern.
 *
 * Geprüft wird die ganze Kette — Konfiguration → Motor → Lobby → Replay-Kopf —
 * denn genau dort laufen die Ableitungen auseinander, wenn es zwei Quellen gibt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MATCH_RULES, ZUGZEIT_FASSUNG } from '../src/shared/config/match.js';
import { getTurnDurationForSize, getTurnDurationForPlayerCount } from '../src/engine/systems/turnSystem.js';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { LobbyManager } from '../src/server/lobby.js';
import { starteServer } from './helfer/server-testclient.js';

const ERWARTET = Object.freeze({ klein: 30_000, kompakt: 35_000, mittel: 40_000, weit: 45_000, gross: 50_000 });

test('Zugzeit je Größenstufe — die eine Quelle', () => {
  for (const [stufe, ms] of Object.entries(ERWARTET)) {
    assert.equal(getTurnDurationForSize(stufe), ms, `${stufe}: falsche Zugzeit`);
    assert.equal(MATCH_RULES.turnTimers[stufe].seconds * 1000, ms,
      `${stufe}: Konfiguration und Ableitung widersprechen sich`);
  }
  assert.equal(getTurnDurationForSize('unbekannt'), ERWARTET.mittel,
    'eine unbekannte Stufe fällt auf die Vorgabe zurück');
  assert.equal(getTurnDurationForSize(undefined), ERWARTET.mittel);
  assert.equal(getTurnDurationForSize('krieg'), ERWARTET.gross,
    'die Altstufe `krieg` bleibt lesbar und bekommt die größte Zeit');
});

test('Die Spielerzahl beeinflusst die Zugzeit im Motor nicht mehr', () => {
  /*
   * Der Kern der neuen Regel. Vier Besetzungen derselben Stufe müssen dieselbe
   * Zugzeit ergeben — vorher waren es 30 s (2 Spieler), 20 s (4) und 15 s (6).
   */
  for (const stufe of Object.keys(ERWARTET)) {
    const dauern = new Set();
    for (const [teams, playersPerTeam] of [[2, 1], [2, 2], [2, 3], [3, 2]]) {
      const match = new MatchController({ seed: 7, teams, playersPerTeam, groesse: stufe });
      dauern.add(match.turnDurationMs);
      assert.equal(match.getState().turnDurationMs, ERWARTET[stufe],
        `${stufe}/${teams}×${playersPerTeam}: Zustand meldet eine andere Zugzeit`);
    }
    assert.equal(dauern.size, 1, `${stufe}: die Zugzeit hängt noch an der Spielerzahl (${[...dauern]})`);
  }
});

test('Eine ausdrückliche Angabe `turnDurationMs` schlägt die Kartengröße', () => {
  const match = new MatchController({ seed: 7, teams: 2, playersPerTeam: 2, groesse: 'gross', turnDurationMs: 1234 });
  assert.equal(match.turnDurationMs, 1234);
  assert.equal(match.getState().turnDurationMs, 1234);
  assert.equal(new MatchController({ seed: 7, teams: 2, playersPerTeam: 2, groesse: 'klein', turnDurationMs: 60_000 }).turnDurationMs, 60_000);
});

test('Der Zug wechselt nach der Zugzeit der Stufe, nicht nach der Spielerzahl', () => {
  /*
   * Mittel = 40 s = 2400 Ticks bei 60 Hz. Nach 1800 Ticks (30 s) darf noch
   * KEIN Wechsel stehen, nach 2401 muss einer da sein — mit 4 Spielern wäre die
   * alte Regel (20 s = 1200 Ticks) längst durchgewesen.
   */
  const match = new MatchController({ seed: 4242, teams: 2, playersPerTeam: 2, groesse: 'mittel' });
  match.start();
  const erster = match.activePlayerId;
  for (let i = 0; i < 1800; i += 1) { match.step(); match.consumeEvents(); }
  assert.equal(match.activePlayerId, erster, 'nach 30 s ist der Zug schon gewechselt — es gilt noch die alte Regel');
  for (let i = 0; i < 601; i += 1) { match.step(); match.consumeEvents(); }
  assert.notEqual(match.activePlayerId, erster, 'nach 40 s muss der Zug gewechselt haben');
});

test('Lobby: Zugzeit kommt aus der Größe und steht in der Beschreibung', () => {
  const lobbies = new LobbyManager();
  for (const [stufe, ms] of Object.entries(ERWARTET)) {
    const { lobby } = lobbies.create({ teams: 2, unitsPerPlayer: 2, mapSize: stufe });
    assert.equal(lobby.mapSize, stufe);
    assert.equal(lobby.turnDurationMs, ms, `${stufe}: Lobby führt eine andere Zugzeit`);
    assert.equal(lobbies.describe(lobby.id).turnDurationMs, ms,
      `${stufe}: die Beschreibung (HUD/Menü) weicht vom Motor ab`);
  }

  // Dieselbe Größe, andere Besetzung: gleiche Zugzeit.
  const klein = lobbies.create({ teams: 2, unitsPerPlayer: 1, mapSize: 'klein' }).lobby;
  const gross = lobbies.create({ teams: 4, unitsPerPlayer: 2, mapSize: 'klein' }).lobby;
  assert.equal(klein.turnDurationMs, gross.turnDurationMs, 'die Spielerzahl ändert die Zugzeit wieder');
});

test('Lobby: unbekannte Größe/Form fällt auf die Vorgabe zurück (tolerant)', () => {
  const lobbies = new LobbyManager();
  const { lobby } = lobbies.create({ teams: 2, mapSize: 'riesig', mapFormat: 'schraeg' });
  assert.equal(lobby.mapSize, 'mittel', 'unbekannte Stufe wird nicht auf die Vorgabe gesetzt');
  assert.equal(lobby.mapFormat, '16:9', 'unbekannte Form wird nicht auf die Vorgabe gesetzt');
  assert.equal(lobby.turnDurationMs, ERWARTET.mittel);
});

test('Lobby: Form und Größe werden durchgereicht (auch Hochformate und `krieg`)', () => {
  const lobbies = new LobbyManager();
  const hoch = lobbies.create({ teams: 2, mapFormat: '9:16', mapSize: 'gross' }).lobby;
  assert.equal(hoch.mapFormat, '9:16');
  assert.equal(hoch.orientation, 'portrait', 'die Ausrichtung bleibt für den Altcode abgeleitet');
  assert.equal(hoch.turnDurationMs, ERWARTET.gross);

  const quadrat = lobbies.create({ teams: 2, mapFormat: '1:1' }).lobby;
  assert.equal(quadrat.mapFormat, '1:1');
  assert.equal(quadrat.turnDurationMs, ERWARTET.mittel);

  const krieg = lobbies.create({ teams: 2, mapSize: 'krieg' }).lobby;
  assert.equal(krieg.mapSize, 'krieg', 'die Altstufe bleibt lesbar');
  assert.equal(krieg.turnDurationMs, ERWARTET.gross);
});

test('Lobby: ohne Formangabe bleibt die alte Ausrichtungsprüfung bestehen', () => {
  const lobbies = new LobbyManager();
  assert.throws(() => lobbies.create({ teams: 2, orientation: 'portrait' }), /Hochformat/,
    'ohne ausdrückliche Form darf Hochformat nicht still durchgehen');
});

test('Replay-Kopf: neue Aufzeichnungen tragen die Zugzeitfassung und die Stufe', () => {
  const match = new MatchController({ seed: 77, teams: 2, playersPerTeam: 2, groesse: 'gross', format: '4:3' });
  match.start();
  const recorder = new ReplayRecorder({
    seed: 77, teams: 2, playersPerTeam: 2, groesse: match.groesse, format: match.mapFormat,
    turnDurationMs: match.turnDurationMs,
  });
  recorder.finalize(10);

  const kopf = JSON.parse(recorder.serialize()).config;
  assert.equal(kopf.zugzeitFassung, ZUGZEIT_FASSUNG);
  assert.equal(kopf.mapSize, 'gross');
  assert.equal(kopf.mapFormat, '4:3');
  assert.equal(kopf.turnDurationMs, ERWARTET.gross);

  // Wiedergabe: Karte, Zugzeit und Zustand stimmen mit dem Live-Lauf überein.
  const spieler = new ReplayPlayer(Recorder(recorder));
  assert.equal(spieler.match.turnDurationMs, ERWARTET.gross);
  assert.equal(spieler.match.mapFormat, '4:3');
  assert.equal(spieler.match.groesse, 'gross');
  assert.equal(spieler.match.width, 3328, 'die Form aus dem Kopf muss die Maße bestimmen');
});

/** Kleine Hilfe: der Player erwartet den Recorder oder dessen JSON. */
function Recorder(recorder) {
  return ReplayRecorder.fromJSON(recorder.serialize());
}

test('Replay-Kopf ohne Zugzeitmarke spielt mit der ALTEN Ableitung (bitgleich)', () => {
  /*
   * AGENTS.md §2: Eine Aufzeichnung von vor dem 2026-11-05 trägt weder
   * `zugzeitFassung` noch (in seltenen Fällen) `turnDurationMs`. Sie muss mit
   * der damaligen Spielerzahl-Regel laufen — 20 s bei 4 Spielern —, nicht mit
   * den 40 s der mittleren Karte. Sonst änderten sich ihre Zugwechsel und ihr
   * Zustands-Hash.
   */
  const alt = {
    format: 1,
    seed: 4242,
    config: { teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 },
    totalTicks: 10,
    entries: [],
    rounds: [],
  };
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(alt));
  assert.equal(spieler.match.turnDurationMs, getTurnDurationForPlayerCount(4));
  assert.equal(spieler.match.turnDurationMs, 20_000);
  assert.equal(spieler.match.mapFormat, '16:9', 'ohne Formangabe gilt die alte Querformat-Karte');
  assert.equal(spieler.match.width, 2560);
});

test('Neue Aufzeichnung ohne `turnDurationMs`: Zugzeit folgt der Stufe im Kopf', () => {
  const recorder = new ReplayRecorder({ seed: 9, teams: 2, playersPerTeam: 1, groesse: 'klein' });
  recorder.finalize(5);
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(recorder.serialize()));
  assert.equal(spieler.match.turnDurationMs, ERWARTET.klein);
});

test('HTTP: Form und Größe kommen durch die Lobby-API, Unbekanntes fällt zurück', async () => {
  const { server, url } = await starteServer();
  try {
    const anlegen = body => fetch(`${url}/api/lobby/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teams: 2, ...body }),
    });

    const antwort = await anlegen({ mapFormat: '4:3', mapSize: 'gross' });
    assert.equal(antwort.status, 201);
    const { lobby } = await antwort.json();
    assert.equal(lobby.mapFormat, '4:3');
    assert.equal(lobby.mapSize, 'gross');
    assert.equal(lobby.turnDurationMs, ERWARTET.gross, 'die API meldet eine andere Zugzeit als der Motor');

    const tolerant = await anlegen({ mapFormat: 'schraeg', mapSize: 'riesig' });
    assert.equal(tolerant.status, 201, 'eine unbekannte Angabe darf das Anlegen nicht verhindern');
    const fallback = (await tolerant.json()).lobby;
    assert.equal(fallback.mapFormat, '16:9');
    assert.equal(fallback.mapSize, 'mittel');
    assert.equal(fallback.turnDurationMs, ERWARTET.mittel);
  } finally {
    await server.close();
  }
});

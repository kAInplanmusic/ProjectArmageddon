import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchController } from '../src/engine/match.js';
import { LobbyManager } from '../src/server/lobby.js';
import { serializeLobby, restoreLobby } from '../src/server/persistence.js';
import { MATCH_RULES } from '../src/shared/config/match.js';

/*
 * Testlücken aus dem Mutationsaudit vom 2026-10-13 (57 Mutanten; hier die Überlebenden mit Wirkung):
 * Pausensperre beim Springen, Verdrahtung von Mahlstrom-Tempo und Rückstoß, Wiederholung über mehrere
 * Züge, Spawn-Mindestabstand, Lobby-Sicherung (sidegrades/loadouts/unitsPerPlayer).
 */
const schritte = (m, n) => { for (let i = 0; i < n; i += 1) { m.step(); m.consumeEvents(); } };

test('Springen ist in der Zugpause gesperrt — auch wenn die Figur auf dem Boden steht', () => {
  const m = new MatchController({ seed: 6, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 20_000, turnPauseTicks: 300 });
  m.start();
  const id = m.activePlayerId;
  schritte(m, 40); // die Figur setzt auf; die Pause läuft weiter (300 Takte)
  assert.ok(m.isGrounded(id), 'Vorbedingung: die Figur steht');
  assert.ok(m.turnPauseMs > 0, 'Vorbedingung: die Pause läuft noch');
  const gesperrt = m.jump(id, 1);
  assert.equal(gesperrt.ok, false);
  assert.match((gesperrt.errors ?? []).join(' '), /Zugpause/);
  schritte(m, 270);
  assert.equal(m.turnPauseMs, 0);
  assert.equal(m.jump(id, 1).ok, true, 'nach der Pause geht der Sprung');
});

test('Wiederholung gilt nur für den Zug direkt nach einem Schuss, nicht für den übernächsten', () => {
  const m = new MatchController({ seed: 6, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 1_000, turnPauseTicks: 10, turnReplayTicks: 120 });
  m.start();
  schritte(m, 20);
  const a = m.activePlayerId;
  assert.equal(m.fire(a, 0.8, 60, m.inventory.getActiveWeaponId(a)).ok, true);
  const folgen = [];
  for (let i = 0; i < 4000 && folgen.length < 3; i += 1) {
    m.step();
    for (const e of m.consumeEvents()) if (e.type === 'turn_start') folgen.push((e.payload ?? e).replayTicks);
  }
  assert.deepEqual(folgen, [120, 0, 0], 'nur der erste Zug nach dem Schuss bekommt die Wiederholung');
});

test('Mahlstrom: jede in der Vorrunde gefallene Figur gibt einen Schritt mehr; der Rückstoß wächst je Sturmrunde', () => {
  const m = new MatchController({ seed: 11, teams: 4, playersPerTeam: 2, preset: 'hills', turnDurationMs: 4_000, maxRounds: 300 });
  m.start();
  for (let i = 0; i < 60 * 60 * 14 && !m.maelstrom.isActive; i += 1) { m.step(); m.consumeEvents(); }
  assert.ok(m.maelstrom.isActive, 'Valhalla begann');
  const schritt = MATCH_RULES.suddenDeath.terrainContractionPixelsPerRound;
  const bisRundenwechsel = () => {
    const vorher = m.maelstrom.inset;
    const start = m.round;
    for (let i = 0; i < 60 * 60 && m.round === start && m.status === 'playing'; i += 1) { m.step(); m.consumeEvents(); }
    return { zuwachs: m.maelstrom.inset - vorher, rueckstoss: m.world.services.match.knockbackMultiplier };
  };
  const r1 = bisRundenwechsel();
  const r2 = bisRundenwechsel();
  assert.ok(r1.zuwachs >= schritt && r2.zuwachs >= schritt);
  assert.ok(r2.rueckstoss > r1.rueckstoss, `Rückstoß wächst je Sturmrunde (${r1.rueckstoss} → ${r2.rueckstoss})`);

  // Ohne Gefallene (die Runde davor): genau ein Schritt — nur prüfbar, solange niemand sonst fällt.
  // Eine Figur fällt jetzt; die nächste Rundengrenze rechnet sie ein: mindestens zwei Schritte.
  const lebendVorher = m.players.filter(p => p.alive).length;
  const opfer = m.players.find(p => p.alive && p.entityId !== m.activePlayerId).entityId;
  m.world.getSystem('damage').applyDamage(m.world, opfer, 100000, null);
  const r3 = bisRundenwechsel();
  assert.equal(m.status, 'playing');
  assert.ok(m.players.filter(p => p.alive).length <= lebendVorher - 1);
  assert.ok(r3.zuwachs >= 2 * schritt, `eine Gefallene ⇒ mindestens zwei Schritte (war ${r3.zuwachs / schritt})`);
  assert.ok(r3.zuwachs <= MATCH_RULES.suddenDeath.maxContractionSteps * schritt);
});

test('Spawn: Mindestabstand 22 px zwischen allen Figuren (Kartentyp autonom, viele Teams)', () => {
  for (const [teams, spieler] of [[3, 5], [4, 4], [2, 5]]) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const m = new MatchController({ seed, teams, playersPerTeam: spieler, preset: 'hills', kartentyp: 'autonom' });
      m.start();
      const xs = m.getState().entities.map(e => e.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i += 1) {
        assert.ok(xs[i] - xs[i - 1] >= 22, `Seed ${seed}, ${teams}×${spieler}: Abstand ${xs[i] - xs[i - 1]} px`);
      }
    }
  }
});

test('Lobby-Sicherung: sidegrades, loadouts und unitsPerPlayer überleben Speichern und Wiederherstellen', () => {
  const manager = new LobbyManager();
  const { lobby } = manager.create({
    teams: 2, unitsPerPlayer: 3, preset: 'hills', kartentyp: 'autonom', seed: 31, hostName: 'A',
    sidegrades: [null, 'hardened_hull', null, null, null, null],
    loadouts: [{ classId: 'heavy', archetypeId: 'brawler' }, null, null, null, null, null],
  });
  const roh = manager.get(lobby.id);
  const gespeichert = JSON.parse(JSON.stringify(serializeLobby(roh, null)));
  assert.equal(gespeichert.unitsPerPlayer, roh.unitsPerPlayer);
  assert.deepEqual(gespeichert.sidegrades, roh.sidegrades);
  assert.deepEqual(gespeichert.loadouts, roh.loadouts);
  const frisch = new LobbyManager();
  const { lobby: wieder } = restoreLobby(gespeichert, { lobbyManager: frisch, createSession: () => null });
  assert.equal(wieder.unitsPerPlayer, roh.unitsPerPlayer);
  assert.deepEqual(wieder.sidegrades, roh.sidegrades);
  assert.deepEqual(wieder.loadouts, roh.loadouts);
});

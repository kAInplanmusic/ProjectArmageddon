/**
 * Zugregeln (Fassung 2, `config/zugregeln.js`, `systems/zugSystem.js`): Rückzugszeit nach dem Schuss, Zug
 * überspringen, Aufgeben. Gehalten wird: (1) ohne Marke bleibt alles beim Alten, (2) der Rückzug lässt Gehen und
 * Springen zu, sperrt den zweiten Schuss und endet nach der Frist, bei Schaden oder Tod früher, (3) Überspringen ist
 * auf den aktiven Spieler und zwei in Folge begrenzt, (4) Aufgeben zählt als besiegt und beendet das Match wie sonst,
 * (5) die Aufzeichnung spielt alles exakt nach.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { BEWEGUNG_GEHEN } from '../src/shared/config/bewegung.js';
import { ZUGREGELN, ZUGREGELN_ALT, ZUGREGELN_RUECKZUG, ZUGREGELN_STANDARD, normalisiereZugregeln } from '../src/shared/config/zugregeln.js';

const KONFIG = { seed: 77, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, maxRounds: 99, bewegung: BEWEGUNG_GEHEN };
const RUECKZUG_TICKS = ZUGREGELN.rueckzugSekunden * 60;

function neu(extra = {}) {
  const m = new MatchController({ ...KONFIG, zugregeln: ZUGREGELN_RUECKZUG, ...extra });
  m.start();
  return m;
}
function los(m, ticks) { for (let i = 0; i < ticks; i += 1) m.step(); }
function schiesse(m) {
  const id = m.activePlayerId;
  assert.equal(m.fire(id, Math.PI / 4, 30).ok, true);
  let schutz = 0;
  while (m.activeProjectileCount > 0 && schutz < 2000) { m.step(); schutz += 1; }
  return id;
}
const ereignisse = m => m.consumeEvents();

test('Marke: Standard ist Fassung 2, Unbekanntes fällt auf den Standard, der Motor ohne Angabe bleibt beim Altverhalten', () => {
  assert.equal(ZUGREGELN_STANDARD, ZUGREGELN_RUECKZUG);
  assert.equal(normalisiereZugregeln(1), ZUGREGELN_ALT);
  assert.equal(normalisiereZugregeln('x'), ZUGREGELN_STANDARD);
  const alt = new MatchController(KONFIG);
  assert.equal(alt.zugregeln, ZUGREGELN_ALT);
  assert.equal(alt.zug, null);
});

test('Altverhalten: Der Zug endet gleich nach dem Schuss, es gibt keine Rückzugsfrist', () => {
  const m = new MatchController({ ...KONFIG });
  m.start();
  const erster = m.activePlayerId;
  schiesse(m);
  los(m, 2);
  assert.notEqual(m.activePlayerId, erster, 'ohne Marke wechselt der Zug sofort');
  assert.equal(m.getState().rueckzugMs, 0);
});

test('Rückzug: Nach dem Schuss bleibt der Zug für die Frist aktiv, Gehen geht, ein zweiter Schuss nicht', () => {
  const m = neu();
  los(m, 30);
  ereignisse(m);
  const id = schiesse(m);
  los(m, 2);
  assert.equal(m.activePlayerId, id, 'der Zug läuft in der Rückzugsfrist weiter');
  const start = ereignisse(m).find(e => e.type === 'rueckzug' || e.event === 'rueckzug');
  assert.ok(start, 'das Ereignis `rueckzug` meldet den Beginn');
  const rest = m.getState().rueckzugMs;
  assert.ok(rest > 0 && rest <= ZUGREGELN.rueckzugSekunden * 1000, `Restzeit ${rest} liegt in der Frist`);
  assert.equal(m.fire(id, 1, 30).ok, false, 'kein zweiter Schuss im Rückzug');

  const x0 = m.world.getComponent(id, 'Position', 'x');
  assert.equal(m.gehen.setzeRichtung(id, 1).ok, true);
  los(m, 60);
  assert.notEqual(m.world.getComponent(id, 'Position', 'x'), x0, 'die Figur geht im Rückzug');

  los(m, RUECKZUG_TICKS);
  assert.notEqual(m.activePlayerId, id, 'nach der Frist ist der nächste Spieler dran');
  assert.equal(m.getState().rueckzugMs, 0);
});

test('Rückzug endet früher, wenn die aktive Figur Schaden nimmt', () => {
  const m = neu();
  const id = schiesse(m);
  los(m, 5);
  assert.equal(m.activePlayerId, id);
  m.world.getSystem('damage').applyDamage(m.world, id, 5, null);
  los(m, 2);
  assert.notEqual(m.activePlayerId, id, 'Schaden beendet den Rückzug sofort');
});

test('Rückzug endet, wenn die aktive Figur stirbt', () => {
  const m = neu({ teams: 3 });
  const id = schiesse(m);
  los(m, 5);
  m.world.getSystem('damage').applyDamage(m.world, id, 100000, null);
  los(m, 3);
  assert.notEqual(m.activePlayerId, id);
  assert.equal(m.isPlayerAlive(id), false);
});

test('Zug überspringen: nur der aktive Spieler, höchstens zweimal in Folge, ein Schuss setzt den Zähler zurück', () => {
  const m = neu();
  los(m, 10);
  const [a, b] = [m.activePlayerId, null];
  assert.equal(m.zug.ueberspringen(a + 99).ok, false, 'ein Fremder darf nicht');
  const gegner = m.getState().entities.find(e => e.entityId !== a).entityId;
  assert.equal(m.zug.ueberspringen(gegner).ok, false, 'der Gegner ist nicht am Zug');
  void b;
  // Zweimal in Folge über volle Runden.
  assert.equal(m.zug.ueberspringen(a).ok, true);
  assert.equal(m.activePlayerId, gegner);
  assert.equal(m.zug.ueberspringen(gegner).ok, true);
  assert.equal(m.activePlayerId, a);
  assert.equal(m.zug.ueberspringen(a).ok, true);
  assert.equal(m.zug.ueberspringen(gegner).ok, true);
  assert.equal(m.activePlayerId, a);
  const dritte = m.zug.ueberspringen(a);
  assert.equal(dritte.ok, false, 'ein dritter Verzicht in Folge wird abgelehnt');
  schiesse(m);
  los(m, RUECKZUG_TICKS + 2);
  // Der Gegner kommt dran; er hat selbst schon zweimal verzichtet und darf nicht, schießt also. Danach hat a wieder Verzichte frei.
  assert.equal(m.activePlayerId, gegner);
  assert.equal(m.zug.ueberspringen(gegner).ok, false);
  schiesse(m);
  los(m, RUECKZUG_TICKS + 2);
  assert.equal(m.activePlayerId, a);
  assert.equal(m.zug.ueberspringen(a).ok, true, 'der Schuss von a hat seinen Zähler gelöscht');
});

test('Zug überspringen: nicht nach dem Schuss und nicht in der Zugpause', () => {
  const m = neu();
  const id = schiesse(m);
  assert.equal(m.zug.ueberspringen(id).ok, false, 'nach dem Schuss gilt der Rückzug, kein Überspringen');
  const p = neu({ turnPauseTicks: 120 });
  assert.equal(p.zug.ueberspringen(p.activePlayerId).ok, false, 'in der Zugpause nicht');
});

test('Aufgeben: die Figur zählt als besiegt, bei zwei Teams endet das Match mit dem Sieg des anderen', () => {
  const m = neu();
  const a = m.activePlayerId;
  const gegner = m.getState().entities.find(e => e.entityId !== a);
  assert.equal(m.zug.aufgeben(gegner.entityId).ok, true, 'auch außerhalb des eigenen Zugs');
  los(m, 3);
  assert.equal(m.isPlayerAlive(gegner.entityId), false);
  assert.equal(m.status, 'gameover');
  assert.equal(m.getState().winnerTeamId, m.getState().entities.find(e => e.entityId === a).teamId);
  assert.equal(m.zug.aufgeben(gegner.entityId).ok, false, 'ein zweites Mal geht nicht');
});

test('Aufgeben der aktiven Figur: der Zug geht weiter, das Match läuft mit den übrigen', () => {
  const m = neu({ teams: 3 });
  const a = m.activePlayerId;
  assert.equal(m.zug.aufgeben(a).ok, true);
  los(m, 3);
  assert.equal(m.status, 'playing');
  assert.notEqual(m.activePlayerId, a);
  assert.equal(m.isPlayerAlive(a), false);
});

test('Aufzeichnung: Rückzug, Überspringen und Aufgeben spielen exakt nach; die Marke steht im Kopf', () => {
  const kopf = { ...KONFIG, zugregeln: ZUGREGELN_RUECKZUG, teams: 3 };
  const m = new MatchController(kopf);
  m.start();
  const rec = new ReplayRecorder(kopf);
  assert.equal(rec.toJSON().config.zugregeln, ZUGREGELN_RUECKZUG);
  const eintrag = (kind, id) => rec.recordInput({ tick: m.world.tickCount, playerId: id, kind });
  los(m, 30);
  const a = m.activePlayerId;
  assert.equal(m.zug.ueberspringen(a).ok, true); eintrag('skip_turn', a);
  los(m, 20);
  const b = m.activePlayerId;
  const schuss = { tick: m.world.tickCount, playerId: b, angle: Math.PI / 4, power: 30, weaponId: null };
  assert.equal(m.fire(b, schuss.angle, schuss.power).ok, true); rec.recordInput(schuss);
  los(m, 200);
  const c = m.getState().entities.find(e => e.entityId !== a && e.entityId !== b).entityId;
  assert.equal(m.zug.aufgeben(c).ok, true); eintrag('surrender', c);
  los(m, RUECKZUG_TICKS + 100);
  rec.finalize(m.world.tickCount);
  const dok = JSON.parse(JSON.stringify(rec.toJSON()));
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(dok).toJSON());
  while (spieler.step());
  assert.equal(spieler.match.stateHash(), m.stateHash());
  assert.equal(spieler.match.isPlayerAlive(c), false);
});

test('Altaufzeichnung ohne Marke: Kopf trägt Marke 1 nach dem Laden, kein Rückzug', () => {
  const rec = new ReplayRecorder({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'open' });
  const dok = rec.toJSON();
  delete dok.config.zugregeln;
  const geladen = ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(dok)));
  assert.equal(geladen.toJSON().config.zugregeln, ZUGREGELN_ALT);
  assert.equal(new ReplayPlayer(geladen.toJSON()).match.zug, null);
});

test('Bot-Partien mit Rückzug terminieren (kein Soft-Lock) und enden mit einem Ausgang', async () => {
  const { spiele } = await import('../scripts/bot-partien.mjs');
  for (const seed of [7000, 7131, 7262]) {
    const b = spiele(seed, 4, { extra: { zugregeln: ZUGREGELN_RUECKZUG, bewegung: BEWEGUNG_GEHEN } });
    assert.notEqual(b.ausgang, 'offen', `Seed ${seed}: die Partie endet`);
    assert.ok(b.schuesse > 0, `Seed ${seed}: es wird geschossen`);
  }
});

/**
 * Gehen am Boden (Bewegungsfassung 2, `config/bewegung.js`, `systems/bewegungSystem.js`).
 *
 * Gehalten wird: (1) Die Figur geht wirklich, nur die aktive im eigenen Zug, nur am Boden und nicht nach dem
 * Schuss. (2) Stufen und Hänge bis zur Konfigurationsgrenze, Wände blockieren, Kanten lassen fallen. (3) Die
 * Aufzeichnung (`kind: 'move'`) spielt exakt nach; ohne Marke bleibt das Altverhalten bit-identisch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { gehSchritt } from '../src/engine/systems/bewegungSystem.js';
import { BEWEGUNG, BEWEGUNG_ALT, BEWEGUNG_GEHEN, BEWEGUNG_STANDARD, normalisiereBewegung } from '../src/shared/config/bewegung.js';
import { PLAYER_HALF_HEIGHT as H } from '../src/shared/config/player.js';

const KONFIG = { seed: 77, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, maxRounds: 99 };

/** Ein Gelände aus einer Höhenfunktion: fest ab Zeile `hoehe(x)`. */
function gelaende(hoehe, width = 400, height = 300) {
  return { width, height, isSolid: (x, y) => x < 0 || x >= width || y >= height || y >= hoehe(Math.floor(x)) };
}

function los(match, ticks) { for (let i = 0; i < ticks; i += 1) match.step(); }
function position(match, id) {
  return { x: match.world.getComponent(id, 'Position', 'x'), y: match.world.getComponent(id, 'Position', 'y') };
}

test('Marke: Standard ist Gehen, Unbekanntes fällt auf den Standard, der Motor startet ohne Angabe im Altverhalten', () => {
  assert.equal(BEWEGUNG_STANDARD, BEWEGUNG_GEHEN);
  assert.equal(normalisiereBewegung(1), BEWEGUNG_ALT);
  assert.equal(normalisiereBewegung('x'), BEWEGUNG_STANDARD);
  const alt = new MatchController(KONFIG);
  assert.equal(alt.bewegung, BEWEGUNG_ALT);
  assert.equal(alt.gehen, null);
});

test('gehSchritt: ebener Boden, Stufe bis maxStufe, Wand darüber, Kante', () => {
  const eben = gelaende(() => 200);
  const fussY = 200 - H;
  let r = gehSchritt(eben, 100, fussY, 1, 1.2);
  assert.equal(r.blockiert, false); assert.ok(Math.abs(r.x - 101.2) < 1e-9); assert.equal(r.y, fussY);

  const stufe = gelaende(x => (x >= 110 ? 200 - BEWEGUNG.maxStufe : 200));
  r = gehSchritt(stufe, 109.5, fussY, 1, 1.2);
  assert.equal(r.blockiert, false); assert.equal(r.y, 200 - BEWEGUNG.maxStufe - H, 'die Figur steigt auf die Stufe');

  const wand = gelaende(x => (x >= 110 ? 200 - BEWEGUNG.maxStufe - 1 : 200));
  r = gehSchritt(wand, 109.5, fussY, 1, 1.2);
  assert.equal(r.blockiert, true, 'höher als maxStufe ist eine Wand');

  const kante = gelaende(x => (x >= 110 ? 260 : 200));
  r = gehSchritt(kante, 109.5, fussY, 1, 1.2);
  assert.equal(r.abgrund, true); assert.equal(r.y, fussY, 'an der Kante bleibt y; die Schwerkraft zieht sie danach');

  const rand = gehSchritt(eben, 7, fussY, -1, 1.2);
  assert.equal(rand.x >= 7, true, 'nie über den Kartenrand hinaus');

  const abstieg = gelaende(x => (x >= 110 ? 200 + BEWEGUNG.maxAbstieg : 200));
  r = gehSchritt(abstieg, 109.5, fussY, 1, 1.2);
  assert.equal(r.abgrund, false); assert.equal(r.y, 200 + BEWEGUNG.maxAbstieg - H, 'kleiner Abstieg: folgt dem Boden');

  const decke = gelaende(x => (x >= 110 ? 200 : 200), 400, 300);
  const tunnel = { ...decke, isSolid: (x, y) => decke.isSolid(x, y) || (x >= 110 && y >= 200 - 2 * H + 4 && y < 200 - 2 * H + 8) };
  assert.equal(gehSchritt(tunnel, 109.5, fussY, 1, 1.2).blockiert, true, 'zu niedrige Decke blockiert');
});

test('Gehen im Motor: nur aktive Figur, nur Absicht, Absicht endet mit dem Zug und nach der Frist', () => {
  const m = new MatchController({ ...KONFIG, bewegung: BEWEGUNG_GEHEN });
  m.start();
  const aktiv = m.activePlayerId;
  const andere = m.players.find(p => p.entityId !== aktiv).entityId;
  los(m, 90); // aufsetzen lassen
  assert.equal(m.gehen.setzeRichtung(andere, 1).ok, false, 'nur der aktive Spieler');
  assert.equal(m.gehen.setzeRichtung(aktiv, 2).ok, false, 'streng typgeprüft');
  assert.equal(m.gehen.setzeRichtung(aktiv, 0.5).ok, false);
  const vorher = position(m, aktiv);
  const fremd = position(m, andere);
  assert.equal(m.gehen.setzeRichtung(aktiv, 1).ok, true);
  los(m, 30);
  const nachher = position(m, aktiv);
  assert.ok(nachher.x - vorher.x > 20, `Figur geht nach rechts (${nachher.x - vorher.x})`);
  assert.deepEqual(position(m, andere), fremd, 'die andere Figur bleibt stehen');
  m.gehen.setzeRichtung(aktiv, 0);
  const halt = position(m, aktiv).x;
  los(m, 30);
  assert.equal(position(m, aktiv).x, halt, 'Stopp hält an');

  // Frist: ohne Erneuerung verfällt die Absicht.
  m.gehen.setzeRichtung(aktiv, 1);
  los(m, BEWEGUNG.haltedauer + 40);
  const nachFrist = position(m, aktiv).x;
  los(m, 30);
  assert.equal(position(m, aktiv).x, nachFrist, 'verlorene Stopp-Nachricht lässt die Figur nicht ewig laufen');

  // Zugwechsel löscht die Absicht.
  m.gehen.setzeRichtung(aktiv, 1);
  m.endTurn();
  assert.notEqual(m.activePlayerId, aktiv);
  los(m, 5);
  assert.equal(m.gehen.absicht, null);
});

test('Tempo: Klassenbeweglichkeit wirkt, Grundtempo ist die Obergrenze der Mitte', () => {
  const m = new MatchController({ ...KONFIG, bewegung: BEWEGUNG_GEHEN });
  m.start();
  const tempi = m.players.map(p => m.gehen.tempoFuer(p.entityId));
  for (const t of tempi) assert.ok(t >= BEWEGUNG.tempo * BEWEGUNG.minFaktor - 1e-9 && t <= BEWEGUNG.tempo * BEWEGUNG.maxFaktor + 1e-9);
});

test('Kante: Abgehen führt in den Sturz, Fallschaden-Regel gilt unverändert', () => {
  const m = new MatchController({ ...KONFIG, bewegung: BEWEGUNG_GEHEN, preset: 'hills' });
  m.start();
  const aktiv = m.activePlayerId;
  los(m, 120);
  const id = aktiv;
  // Auf eine Klippe setzen: 120 px hoher Absatz direkt rechts neben der Figur.
  const { x } = position(m, id);
  const t = m.terrain;
  const boden = m.surfaceYAt(x);
  for (let sx = Math.floor(x) + 3; sx < Math.floor(x) + 60 && sx < t.width; sx += 1) {
    for (let sy = Math.floor(boden) - 2; sy < Math.min(t.height, boden + 160); sy += 1) {
      if (t.isSolid(sx, sy)) t.setPixel(sx, sy, false);
    }
  }
  m.gehen.setzeRichtung(id, 1);
  const lebenVorher = m.getState().entities.find(e => e.entityId === id).health;
  los(m, 200);
  const nachher = position(m, id);
  assert.ok(nachher.y > boden, 'die Figur ist gefallen');
  assert.ok(m.getState().entities.find(e => e.entityId === id).health < lebenVorher, "Sturz von der Klippe kostet Leben (Fallschaden-Regel)");
});

test('Aufzeichnung: Gehen wird mit Takt aufgezeichnet und exakt wiedergegeben', () => {
  const kopf = { ...KONFIG, turnDurationMs: 4000, bewegung: BEWEGUNG_GEHEN };
  const m = new MatchController(kopf);
  m.start();
  const rec = new ReplayRecorder(kopf);
  const aktiv = m.activePlayerId;
  los(m, 60);
  const tue = (richtung) => {
    assert.equal(m.gehen.setzeRichtung(aktiv, richtung).ok, true);
    rec.recordInput({ tick: m.world.tickCount, playerId: aktiv, richtung, kind: 'move' });
  };
  tue(1); los(m, 45); tue(1); los(m, 45); tue(-1); los(m, 40); tue(0); los(m, 30);
  rec.finalize(m.world.tickCount);
  const dok = JSON.parse(JSON.stringify(rec.toJSON()));
  assert.equal(dok.config.bewegung, BEWEGUNG_GEHEN);
  assert.ok(dok.entries.every(e => e.kind === 'move' && Number.isInteger(e.richtung)));
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(dok).toJSON());
  while (spieler.step());
  assert.equal(spieler.match.stateHash(), m.stateHash());
  assert.deepEqual(position(spieler.match, aktiv), position(m, aktiv));
});

test('Altaufzeichnung ohne Marke: kein Gehen, Kopf trägt die Marke 1 nach dem Laden', () => {
  const rec = new ReplayRecorder({ seed: 5, teams: 2, playersPerTeam: 1, preset: 'open' });
  const dok = rec.toJSON();
  delete dok.config.bewegung;
  const geladen = ReplayRecorder.fromJSON(JSON.parse(JSON.stringify(dok)));
  assert.equal(geladen.toJSON().config.bewegung, BEWEGUNG_ALT);
  const spieler = new ReplayPlayer(geladen.toJSON());
  assert.equal(spieler.match.bewegung, BEWEGUNG_ALT);
  assert.equal(spieler.match.gehen, null);
});

test('Rückwärtssalto: höher und weiter als der Sprung, nur vom Boden und nur mit Gehfassung', () => {
  const hoehe = (salto, fassung) => {
    const m = new MatchController({ ...KONFIG, bewegung: fassung });
    m.start();
    const id = m.activePlayerId;
    los(m, 90);
    const start = position(m, id);
    const r = m.jump(id, -1, salto);
    assert.equal(r.ok, true);
    let oben = start.y;
    for (let i = 0; i < 120; i += 1) { m.step(); oben = Math.min(oben, position(m, id).y); }
    return { hub: start.y - oben, dx: Math.abs(position(m, id).x - start.x), leben: m.getState().entities.find(e => e.entityId === id).health };
  };
  const normal = hoehe(false, BEWEGUNG_GEHEN);
  const salto = hoehe(true, BEWEGUNG_GEHEN);
  assert.ok(salto.hub > normal.hub * 1.1, `Salto höher (${salto.hub} gegen ${normal.hub})`);
  assert.ok(salto.dx > normal.dx * 1.5, 'und weiter');
  assert.equal(salto.leben, normal.leben, 'hoher Sprung bleibt unter der Fallschaden-Schwelle');
  const alt = hoehe(true, BEWEGUNG_ALT);
  assert.ok(Math.abs(alt.hub - normal.hub) < 1e-9, 'ohne Gehfassung wirkt das Salto-Flag nicht');
  const m = new MatchController({ ...KONFIG, bewegung: BEWEGUNG_GEHEN });
  m.start();
  los(m, 90);
  assert.equal(m.jump(m.activePlayerId, 0).ok, true);
  m.step(); m.step(); m.step();
  assert.equal(m.jump(m.activePlayerId, 1, true).ok, false, 'Salto nicht in der Luft');
});

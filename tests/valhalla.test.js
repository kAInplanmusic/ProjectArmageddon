import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchController } from '../src/engine/match.js';
import { MATCH_RULES, computeMaelstromDamage, drawValhallaTick, drawValhallaOmen } from '../src/shared/config/match.js';
import { SIMULATION_HZ } from '../src/shared/config/network.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { omenZustand, OMEN_DAUER } from '../src/client/valhallaOmen.js';
import { EreignisSendefilter } from '../src/shared/protocol.js';

/**
 * Valhalla (Entscheidung des Auftraggebers, 2026-10-13):
 *   - der Mahlstrom beginnt ZUFÄLLIG zwischen 6 und 12 Minuten Spielzeit,
 *   - das Match läuft, bis es entschieden ist (kein Rundenlimit im Spiel).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN = MATCH_RULES.suddenDeath.valhallaMinSeconds * SIMULATION_HZ;
const MAX = MATCH_RULES.suddenDeath.valhallaMaxSeconds * SIMULATION_HZ;

test('Die Konfiguration nennt 6 bis 12 Minuten', () => {
  assert.equal(MATCH_RULES.suddenDeath.valhallaMinSeconds, 6 * 60);
  assert.equal(MATCH_RULES.suddenDeath.valhallaMaxSeconds, 12 * 60);
  assert.equal(MATCH_RULES.suddenDeath.roundBreakpoint, undefined, 'die feste Runde ist entfallen');
});

test('Der gezogene Zeitpunkt liegt immer in 6–12 min, ist breit gestreut und je Seed fest', () => {
  const zeiten = [];
  for (let seed = 1; seed <= 400; seed += 1) {
    const tick = drawValhallaTick(new MatchSeedManager(seed).getSubRng('VALHALLA'));
    assert.ok(tick >= MIN && tick <= MAX, `Seed ${seed}: ${tick} liegt außerhalb`);
    assert.equal(tick % SIMULATION_HZ, 0, 'ganze Sekunden');
    // Derselbe Seed -> derselbe Zeitpunkt (Replay und Wiederherstellung bleiben exakt).
    assert.equal(tick, drawValhallaTick(new MatchSeedManager(seed).getSubRng('VALHALLA')));
    zeiten.push(tick / SIMULATION_HZ / 60);
  }
  assert.ok(Math.min(...zeiten) < 6.5 && Math.max(...zeiten) > 11.5, 'beide Ränder des Fensters werden genutzt');
  assert.ok(new Set(zeiten.map(z => z.toFixed(1))).size > 40, 'wirklich zufällig, nicht fast konstant');
  const mittel = zeiten.reduce((a, b) => a + b, 0) / zeiten.length;
  assert.ok(mittel > 8.5 && mittel < 9.5, `Mittel ${mittel.toFixed(2)} min liegt nahe 9`);
});

test('Die Ziehung verschiebt keinen anderen Zufallsstrom', () => {
  const a = new MatchSeedManager(4242);
  const b = new MatchSeedManager(4242);
  drawValhallaTick(a.getSubRng('VALHALLA'));
  assert.equal(a.getSubRng('LOOT').next(), b.getSubRng('LOOT').next());
  assert.equal(a.getSubRng('GUENTHER').next(), b.getSubRng('GUENTHER').next());
});

test('Der Motor startet den Sturm zum ersten Rundenbeginn NACH dem gezogenen Zeitpunkt', () => {
  let geprueft = 0;
  for (const seed of [11, 4242, 20260927, 99, 31337]) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, turnDurationMs: 20_000 });
    match.start();
    const rundenbeginne = [];
    let aktivAb = null;
    let ticks = 0;
    while (match.status === 'playing' && aktivAb === null && ticks < 60 * 3600) {
      match.step();
      ticks += 1;
      for (const e of match.consumeEvents()) {
        if (e.type === 'round_start') rundenbeginne.push({ tick: match.world.tickCount, aktiv: match.getState().maelstrom.active });
      }
      if (match.getState().maelstrom.active) aktivAb = match.world.tickCount;
    }
    // Ein Match ohne Schüsse kann vor Valhalla entschieden sein (Wasser, Günther): dann
    // gibt es nichts zu prüfen — aber es muss VOR dem gezogenen Zeitpunkt geendet haben.
    if (aktivAb === null) {
      assert.equal(match.status, 'gameover');
      assert.ok(match.world.tickCount < match.valhallaTick + 60 * 600, `Seed ${seed}: Ende ohne Sturm trotz später Zeit`);
      continue;
    }
    geprueft += 1;
    assert.ok(aktivAb >= match.valhallaTick, `Seed ${seed}: nicht vor dem Zeitpunkt (${aktivAb} < ${match.valhallaTick})`);
    const erster = rundenbeginne.find(r => r.tick >= match.valhallaTick);
    assert.ok(erster?.aktiv, `Seed ${seed}: der erste Rundenbeginn danach startet den Sturm`);
    assert.equal(aktivAb, erster.tick);
    for (const r of rundenbeginne.filter(r => r.tick < match.valhallaTick)) {
      assert.equal(r.aktiv, false, `Seed ${seed}: vor dem Zeitpunkt (Tick ${r.tick}) ist der Sturm aus`);
    }
  }
  assert.ok(geprueft >= 2, `mindestens zwei Seeds müssen den Sturm erreichen (waren ${geprueft})`);
});

test('Zwei Matches mit demselben Seed beginnen den Sturm im selben Tick', () => {
  const lauf = () => {
    const m = new MatchController({ seed: 777, teams: 2, playersPerTeam: 1, turnDurationMs: 20_000 });
    m.start();
    let t = 0;
    while (m.status === 'playing' && !m.getState().maelstrom.active && t < 60 * 3600) { m.step(); m.consumeEvents(); t += 1; }
    return { tick: m.world.tickCount, hash: m.stateHash() };
  };
  assert.deepEqual(lauf(), lauf());
});

test('Das Match wird nicht mehr nach einer festen Rundenzahl abgebrochen', () => {
  assert.ok(MATCH_RULES.roundLimitBackstop >= 100, 'das Netz liegt weit über einem normalen Match');
  const match = new MatchController({ seed: 31337, teams: 2, playersPerTeam: 1, turnDurationMs: 2_000 });
  assert.equal(match.maxRounds, MATCH_RULES.roundLimitBackstop);
  match.start();
  let t = 0;
  let abbruch = null;
  while (match.status === 'playing' && match.getState().round <= 45 && t < 60 * 3600) {
    match.step();
    for (const e of match.consumeEvents()) if (e.type === 'match_over') abbruch = e.payload;
    t += 1;
  }
  assert.ok(match.getState().round > 31 || match.status === 'gameover', 'Runde 31 wurde überschritten oder das Match ist entschieden');
  assert.notEqual(abbruch?.reason, 'round_limit', 'kein Abbruch durch die frühere Rundengrenze 30');
});

test('Ein Match ohne jeden Schuss endet durch den Sturm — das Netz greift nicht', { timeout: 120_000 }, () => {
  // Seed 5: ohne Schüsse hält die Partie bis weit nach Valhalla (gemessen 29,5 min, Runde 45).
  const match = new MatchController({ seed: 5, teams: 2, playersPerTeam: 1, turnDurationMs: 2_000 });
  match.start();
  let grund = null;
  let t = 0;
  while (match.status === 'playing' && t < 60 * 60 * 60) {
    match.step();
    for (const e of match.consumeEvents()) if (e.type === 'match_over') grund = e.payload?.reason ?? null;
    t += 1;
  }
  assert.equal(match.status, 'gameover', 'das Match endet von selbst');
  assert.equal(match.world.services.maelstrom.isActive, true, 'der Sturm lief, als es endete');
  assert.ok(match.world.tickCount > match.valhallaTick);
  assert.notEqual(grund, 'round_limit', 'nicht über das Notnetz');
  assert.ok(match.getState().round < MATCH_RULES.roundLimitBackstop);
});

test('Günthers Auftritte nutzen weiter den Planungshorizont, nicht die Rundengrenze', () => {
  const quelltext = fs.readFileSync(path.join(ROOT, 'src/engine/match.js'), 'utf8');
  assert.match(quelltext, /maxRounds:\s*GUENTHER_PLANUNGSHORIZONT/);
});

test('Mahlstrom-Schaden wächst mit den Runden UNTER dem Sturm', () => {
  const basis = MATCH_RULES.suddenDeath.outOfZoneDamageBase;
  assert.equal(computeMaelstromDamage(0), basis, 'in der ersten Runde unter dem Sturm gilt der Grundschaden');
  assert.ok(computeMaelstromDamage(2) > computeMaelstromDamage(1));
  assert.equal(computeMaelstromDamage(-1), 0);
  assert.equal(computeMaelstromDamage(Number.NaN), 0);
});

test('Der Online-Client leitet den Sturm nicht aus der Rundenzahl her', () => {
  const quelltext = fs.readFileSync(path.join(ROOT, 'src/client/main.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(quelltext, /maelstromActiveFromRound/);
  assert.match(quelltext, /maelstrom:\s*\{\s*active:\s*\(this\.remoteInset\s*\?\?\s*0\)\s*>\s*0/);
});

test('Vorzeichen: 1–60 s vor Valhalla, je Seed fest, beide Ränder genutzt', () => {
  const leads = new Set();
  for (let seed = 1; seed <= 400; seed += 1) {
    const mk = () => {
      const rng = new MatchSeedManager(seed).getSubRng('VALHALLA');
      const tick = drawValhallaTick(rng);
      return { tick, omen: drawValhallaOmen(rng, tick) };
    };
    const { tick, omen } = mk();
    assert.ok(omen.vorlaufSekunden >= 1 && omen.vorlaufSekunden <= 60);
    assert.equal(omen.tick, tick - omen.vorlaufSekunden * SIMULATION_HZ);
    assert.deepEqual(omen, mk().omen);
    leads.add(omen.vorlaufSekunden);
  }
  assert.ok(Math.min(...leads) <= 3 && Math.max(...leads) >= 58 && leads.size > 40);
});

test('Die Engine meldet das Vorzeichen genau einmal, vor Valhalla', () => {
  const match = new MatchController({ seed: 6, teams: 2, playersPerTeam: 1, preset: 'hills', turnDurationMs: 20_000 });
  match.start();
  const omenTick = match.valhallaOmenTick;
  assert.ok(omenTick <= match.valhallaTick);
  const treffer = [];
  while (match.world.tickCount <= omenTick + 5 && match.status === 'playing') {
    match.step();
    for (const e of match.consumeEvents()) if (e.type === 'valhalla_omen') treffer.push({ tick: match.world.tickCount, e });
  }
  assert.equal(treffer.length, 1);
  assert.ok(treffer[0].tick >= omenTick && treffer[0].tick <= omenTick + 1);
  assert.ok(Number.isInteger((treffer[0].e.data ?? treffer[0].e.payload ?? treffer[0].e).bildSeed));
});

test('Der Sendefilter lässt valhalla_omen immer durch', () => {
  const f = new EreignisSendefilter();
  assert.equal(f.drosselt('valhalla_omen'), false);
});

test('omenZustand: rein, begrenzt, ruhige Variante ohne Blitze', () => {
  assert.equal(omenZustand(-1, 5), null);
  assert.equal(omenZustand(OMEN_DAUER + 0.1, 5), null);
  assert.deepEqual(omenZustand(2, 5), omenZustand(2, 5));
  const ruhig = omenZustand(3, 5, { reducedMotion: true });
  assert.equal(ruhig.blitzlicht, 0);
  assert.equal(ruhig.blitze.length, 0);
  assert.ok(ruhig.raben.alpha > 0);
  assert.equal(omenZustand(NaN, 5), null);
});

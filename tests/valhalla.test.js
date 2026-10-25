import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatchController } from '../src/engine/match.js';
import { MATCH_RULES, computeMaelstromDamage, drawValhallaRound, valhallaTickForRound, drawValhallaOmen } from '../src/shared/config/match.js';
import { SIMULATION_HZ } from '../src/shared/config/network.js';
import { MatchSeedManager } from '../src/shared/seed.js';
import { omenZustand, OMEN_DAUER } from '../src/client/valhallaOmen.js';
import { EreignisSendefilter } from '../src/shared/protocol.js';

/**
 * Valhalla (Entscheidung des Auftraggebers, 2026-10-25):
 *   - der Mahlstrom beginnt ZUFÄLLIG in Runde 8–14,
 *   - in großen Partien (mehr als 8 Spieler, Karte „gross"/„krieg") Runde 12–20,
 *   - das Match läuft, bis es entschieden ist (kein Rundenlimit im Spiel).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_RUNDE = MATCH_RULES.suddenDeath.valhallaMinRound;
const MAX_RUNDE = MATCH_RULES.suddenDeath.valhallaMaxRound;

test('Die Konfiguration nennt Runde 8 bis 14, für große Partien 12 bis 20', () => {
  assert.equal(MIN_RUNDE, 8);
  assert.equal(MAX_RUNDE, 14);
  assert.equal(MATCH_RULES.suddenDeath.valhallaMinRoundGross, 12);
  assert.equal(MATCH_RULES.suddenDeath.valhallaMaxRoundGross, 20);
  assert.equal(MATCH_RULES.suddenDeath.roundBreakpoint, undefined, 'keine feste Runde');
  assert.equal(MATCH_RULES.suddenDeath.valhallaMinSeconds, undefined, 'die zeitbasierte Fassung ist abgelöst');
});

test('Die gezogene Runde liegt im Fenster, ist breit gestreut und je Seed fest', () => {
  const runden = [];
  for (let seed = 1; seed <= 400; seed += 1) {
    const runde = drawValhallaRound(new MatchSeedManager(seed).getSubRng('VALHALLA'));
    assert.ok(runde >= MIN_RUNDE && runde <= MAX_RUNDE, `Seed ${seed}: Runde ${runde} liegt außerhalb`);
    // Derselbe Seed -> dieselbe Runde (Replay und Wiederherstellung bleiben exakt).
    assert.equal(runde, drawValhallaRound(new MatchSeedManager(seed).getSubRng('VALHALLA')));
    runden.push(runde);
  }
  assert.equal(Math.min(...runden), MIN_RUNDE, 'die untere Grenze wird genutzt');
  assert.equal(Math.max(...runden), MAX_RUNDE, 'die obere Grenze wird genutzt');
  assert.equal(new Set(runden).size, MAX_RUNDE - MIN_RUNDE + 1, 'jede Runde des Fensters kommt vor');
  const mittel = runden.reduce((a, b) => a + b, 0) / runden.length;
  assert.ok(mittel > 10.2 && mittel < 11.8, `Mittel ${mittel.toFixed(2)} liegt nahe 11`);
});

test('Große Partien ziehen aus dem weiteren Fenster 12–20', () => {
  const gross = [];
  for (let seed = 1; seed <= 400; seed += 1) {
    const runde = drawValhallaRound(new MatchSeedManager(seed).getSubRng('VALHALLA'), { gross: true });
    assert.ok(runde >= 12 && runde <= 20, `Seed ${seed}: Runde ${runde} liegt außerhalb`);
    gross.push(runde);
  }
  assert.equal(Math.min(...gross), 12, 'die untere Grenze wird genutzt');
  assert.equal(Math.max(...gross), 20, 'die obere Grenze wird genutzt');
});

test('Die Ziehung verschiebt keinen anderen Zufallsstrom', () => {
  const a = new MatchSeedManager(4242);
  const b = new MatchSeedManager(4242);
  drawValhallaRound(a.getSubRng('VALHALLA'));
  assert.equal(a.getSubRng('LOOT').next(), b.getSubRng('LOOT').next());
  assert.equal(a.getSubRng('GUENTHER').next(), b.getSubRng('GUENTHER').next());
});

test('Der Motor startet den Sturm genau in der gezogenen Runde', () => {
  let geprueft = 0;
  for (const seed of [11, 4242, 20260927, 99, 31337]) {
    const match = new MatchController({ seed, teams: 2, playersPerTeam: 1, turnDurationMs: 20_000 });
    match.start();
    const rundenbeginne = [];
    let sturmAbRunde = null;
    let ticks = 0;
    while (match.status === 'playing' && sturmAbRunde === null && ticks < 60 * 3600) {
      match.step();
      ticks += 1;
      for (const e of match.consumeEvents()) {
        if (e.type === 'round_start') {
          rundenbeginne.push({ runde: match.getState().round, aktiv: match.getState().maelstrom.active });
        }
      }
      if (match.getState().maelstrom.active) sturmAbRunde = match.getState().round;
    }
    // Ein Match ohne Schüsse kann vor Valhalla entschieden sein (Wasser, Günther): dann
    // gibt es nichts zu prüfen — es muss aber VOR der gezogenen Runde geendet haben.
    if (sturmAbRunde === null) {
      assert.equal(match.status, 'gameover');
      assert.ok(match.getState().round < match.valhallaRound,
        `Seed ${seed}: ohne Sturm in Runde ${match.getState().round} geendet, gezogen war ${match.valhallaRound}`);
      continue;
    }
    geprueft += 1;
    assert.equal(sturmAbRunde, match.valhallaRound,
      `Seed ${seed}: Sturm ab Runde ${sturmAbRunde}, gezogen war ${match.valhallaRound}`);
    const erster = rundenbeginne.find(r => r.runde >= match.valhallaRound);
    assert.ok(erster?.aktiv, `Seed ${seed}: der Rundenbeginn der gezogenen Runde startet den Sturm`);
    for (const r of rundenbeginne.filter(r => r.runde < match.valhallaRound)) {
      assert.equal(r.aktiv, false, `Seed ${seed}: vor der gezogenen Runde (Runde ${r.runde}) ist der Sturm aus`);
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
  // Seed 5: ohne Schüsse entscheidet die Partie erst der Sturm (früher: 29,5 min, Runde 45;
  // seit der Rundenregel greift er in Runde 8–14).
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
  assert.ok(match.world.services.maelstrom.isActive, true, 'der Sturm lief, als es endete');
  assert.ok(match.getState().round >= match.valhallaRound, 'der Sturm begann in der gezogenen Runde');
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
      const runde = drawValhallaRound(rng);
      const tick = valhallaTickForRound(runde, { spieler: 4, ticksJeZug: 1200 });
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

test('Tempo: 1 + Gefallene Schritte (höchstens 4), Rückstoß wächst mit jeder Sturmrunde', async () => {
  const { computeContractionSteps, computeKnockbackBonusPercent } = await import('../src/shared/config/match.js');
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(n => computeContractionSteps(n)), [1, 2, 3, 4, 4, 4]);
  assert.equal(computeKnockbackBonusPercent(0), 100);
  assert.equal(computeKnockbackBonusPercent(2), 150);
  assert.equal(computeKnockbackBonusPercent(999), 300);
});

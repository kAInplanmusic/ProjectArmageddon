/**
 * Tests: Minen (Bodenobjektfassung 2, `config/bodenobjekte.js`, `systems/bodenobjektSystem.js`).
 *
 * Regeln des Auftraggebers (2026-10-29): sofort scharf, Friendly Fire, je Auslösung 80 % normal /
 * 5 % Superexplosion (doppelter Schaden) / 15 % Blindgänger, Kettenreaktion.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchController } from '../src/engine/match.js';
import { BodenobjektSystem, MINEN_ART } from '../src/engine/systems/bodenobjektSystem.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { SeededRandom } from '../src/shared/prng.js';
import {
  BODENOBJEKTE_ALT, BODENOBJEKTE_MINEN, BODENOBJEKTE_STANDARD, MINEN, MINEN_AUSGANG,
  minenAusgang, normalisiereBodenobjekte,
} from '../src/shared/config/bodenobjekte.js';
import { SEED_OFFSETS } from '../src/shared/seed.js';

// ----------------------------------------------------------------- Konfiguration

test('Marke: unbekannte Werte fallen auf den Standard, ALT bleibt ALT', () => {
  assert.equal(normalisiereBodenobjekte(1), BODENOBJEKTE_ALT);
  assert.equal(normalisiereBodenobjekte(2), BODENOBJEKTE_MINEN);
  assert.equal(normalisiereBodenobjekte(undefined), BODENOBJEKTE_STANDARD);
  assert.equal(normalisiereBodenobjekte('x'), BODENOBJEKTE_STANDARD);
});

test('Ausgang: Grenzen der drei Bereiche liegen bei 15 % und 20 %', () => {
  assert.equal(MINEN.blindgaengerChance, 0.15);
  assert.equal(MINEN.superChance, 0.05);
  assert.equal(minenAusgang(0), MINEN_AUSGANG.BLINDGAENGER);
  assert.equal(minenAusgang(0.1499), MINEN_AUSGANG.BLINDGAENGER);
  assert.equal(minenAusgang(0.15), MINEN_AUSGANG.SUPER);
  assert.equal(minenAusgang(0.1999), MINEN_AUSGANG.SUPER);
  assert.equal(minenAusgang(0.2), MINEN_AUSGANG.NORMAL);
  assert.equal(minenAusgang(0.9999), MINEN_AUSGANG.NORMAL);
});

test('Der Seed-Zweig der Minen ist eigen und wird nicht von anderen Zweigen geteilt', () => {
  const alle = Object.values(SEED_OFFSETS);
  assert.equal(new Set(alle).size, alle.length, 'zwei Zweige teilen sich einen Offset');
  assert.ok('BODENOBJEKTE' in SEED_OFFSETS);
});

// ----------------------------------------------------------------- Attrappe der Welt

/** Kleine Welt: Figuren mit Ort und Leben, Schadensdienst, Ereignisse. Genug für das Minensystem. */
function baueAttrappe(figuren) {
  const schaden = [];
  const ereignisse = [];
  const orte = new Map(figuren.map(f => [f.id, { x: f.x, y: f.y }]));
  const welt = {
    services: { events: { emit: (typ, nutzlast) => ereignisse.push({ typ, ...nutzlast }) }, match: { knockbackMultiplier: 1 } },
    getEntitiesBySignature: () => figuren.map(f => f.id),
    isActive: () => true,
    getComponent: (id, komponente, feld) => {
      if (komponente === 'Position') return orte.get(id)[feld];
      if (komponente === 'Health') return feld === 'current' ? 100 : 100;
      return 0;
    },
    setComponent: () => {},
    getSystem: name => (name === 'damage'
      ? { applyDamage: (_w, id, betrag, urheber) => schaden.push({ id, betrag, urheber }) }
      : null),
  };
  return { welt, schaden, ereignisse, orte };
}

function baueSystem(figuren, seed = 1, rng = null) {
  const a = baueAttrappe(figuren);
  const system = new BodenobjektSystem({
    rng: rng ?? new SeededRandom(seed + SEED_OFFSETS.BODENOBJEKTE),
    world: a.welt,
    events: a.welt.services.events,
    q: {
      breite: 2560,
      surfaceYAt: () => 800,
      bodenNahe: () => 800,
      waterLevelAt: () => 0,
      startplaetze: () => figuren.map(f => ({ x: f.x, y: f.y })),
    },
  });
  return { system, ...a };
}

// ----------------------------------------------------------------- Auslösen

test('Sofort scharf: eine Mine unter einer Figur löst im ersten Takt aus', () => {
  const { system, ereignisse } = baueSystem([{ id: 1, x: 500, y: 790 }]);
  system.lege(500, 800, { ownerId: 2, teamId: 1, art: MINEN_ART.ABGEWORFEN });
  system.update();
  const ausgang = ereignisse.filter(e => e.typ === 'mine_exploded' || e.typ === 'mine_dud');
  assert.equal(ausgang.length, 1, 'genau eine Auslösung im ersten Takt, keine Schonzeit');
});

test('Außerhalb des Auslöseradius passiert nichts', () => {
  const { system, ereignisse } = baueSystem([{ id: 1, x: 500 + MINEN.ausloeseRadius + 1, y: 790 }]);
  system.lege(500, 800, { ownerId: 2, teamId: 1, art: MINEN_ART.LIEGEND });
  for (let i = 0; i < 5; i += 1) system.update();
  assert.equal(ereignisse.filter(e => e.typ !== 'mine_placed').length, 0);
  assert.equal(system.anzahl, 1);
});

test('Friendly Fire: Die eigene Figur des Werfers löst aus und wird getroffen', () => {
  // Werfer und Figur sind dieselbe Entity (1): Die Mine ist nicht „befreundet“.
  let getroffen = null;
  for (let seed = 1; seed < 40 && !getroffen; seed += 1) {
    const { system, schaden } = baueSystem([{ id: 1, x: 500, y: 790 }], seed);
    system.lege(500, 800, { ownerId: 1, teamId: 0, art: MINEN_ART.ABGELEGT });
    system.update();
    getroffen = schaden.find(s => s.id === 1) ?? null;
  }
  assert.ok(getroffen, 'Die eigene Figur muss Schaden nehmen (in keinem von 39 Seeds geschah es)');
  assert.equal(getroffen.urheber, 1, 'der Schaden wird dem Werfer zugerechnet');
});

// ----------------------------------------------------------------- Zufall 80 / 5 / 15

test('Ausgang je Auslösung: Verteilung nahe 80 / 5 / 15 % und Superschaden genau doppelt', () => {
  const zahl = { normal: 0, super: 0, blindgaenger: 0 };
  let normalSchaden = null;
  let superSchaden = null;
  const AUSLOESUNGEN = 6000;
  // EIN Zufallsstrom für alle Auslösungen. Blindgänger bleiben liegen und füllen die Karte; deshalb wird das
  // System regelmäßig neu gebaut (der Strom bleibt derselbe).
  const rng = new SeededRandom(20261029 + SEED_OFFSETS.BODENOBJEKTE);
  let { system, ereignisse, schaden } = baueSystem([{ id: 1, x: 500, y: 790 }], 1, rng);
  for (let i = 0; i < AUSLOESUNGEN; i += 1) {
    if (i % 40 === 0) ({ system, ereignisse, schaden } = baueSystem([{ id: 1, x: 500, y: 790 }], 1, rng));
    ereignisse.length = 0;
    schaden.length = 0;
    system.lege(500, 800, { ownerId: null, art: MINEN_ART.LIEGEND });
    system.update();
    const e = ereignisse.find(x => x.typ === 'mine_exploded' || x.typ === 'mine_dud');
    assert.ok(e, `Auslösung ${i} ohne Ausgang`);
    if (e.typ === 'mine_dud') {
      zahl.blindgaenger += 1;
    } else {
      zahl[e.ausgang] += 1;
      const betrag = schaden.find(s => s.id === 1)?.betrag;
      if (e.ausgang === 'normal' && normalSchaden === null) normalSchaden = betrag;
      if (e.ausgang === 'super' && superSchaden === null) superSchaden = betrag;
    }
  }
  const anteil = k => zahl[k] / AUSLOESUNGEN;
  // Etwa fünf Sigma einer Binomialverteilung bei n = 6000: normal ±0,026, super ±0,014, blind ±0,023.
  assert.ok(Math.abs(anteil('normal') - 0.8) < 0.03, `normal ${anteil('normal')}`);
  assert.ok(Math.abs(anteil('super') - 0.05) < 0.016, `super ${anteil('super')}`);
  assert.ok(Math.abs(anteil('blindgaenger') - 0.15) < 0.025, `blindgaenger ${anteil('blindgaenger')}`);
  assert.ok(normalSchaden > 0 && superSchaden > 0, 'beide Ausgänge mit Schaden beobachtet');
  assert.equal(superSchaden, normalSchaden * MINEN.superFaktor, 'Superexplosion = doppelter Schaden, gleicher Ort und Radius');
});

test('Blindgänger: bleibt liegen, löst nie wieder aus, explodiert auch nicht in einer Kette', () => {
  const { system, ereignisse } = baueSystem([{ id: 1, x: 500, y: 790 }]);
  // Gegen den Zufall: Mine so lange legen, bis ein Blindgänger entsteht (der Strom ist fest, die Zahl endlich).
  let mine = null;
  for (let i = 0; i < 200 && !mine; i += 1) {
    ereignisse.length = 0;
    const m = system.lege(500, 800, { art: MINEN_ART.LIEGEND });
    system.update();
    if (ereignisse.some(e => e.typ === 'mine_dud')) mine = m;
  }
  assert.ok(mine, 'in 200 Versuchen entstand kein Blindgänger');
  const vorher = system.snapshot().find(m => m.id === mine.id);
  assert.equal(vorher.blindgaenger, true);
  ereignisse.length = 0;
  for (let i = 0; i < 30; i += 1) system.update();
  assert.equal(ereignisse.filter(e => e.typ === 'mine_exploded' || e.typ === 'mine_dud').length, 0,
    'ein Blindgänger löst nicht erneut aus');
  // Kette: eine normale Explosion daneben darf ihn nicht auslösen.
  system.lege(520, 800, { art: MINEN_ART.LIEGEND });
  for (let i = 0; i < 5; i += 1) system.update();
  assert.ok(system.snapshot().some(m => m.id === mine.id && m.blindgaenger), 'der Blindgänger liegt noch');
});

// ----------------------------------------------------------------- Kette

test('Kettenreaktion: Minen im Wirkradius lösen mit aus, in fester Reihenfolge', () => {
  let geprueft = false;
  for (let seed = 1; seed <= 60 && !geprueft; seed += 1) {
    const { system, ereignisse } = baueSystem([{ id: 1, x: 300, y: 790 }], seed);
    // Zuerst die Mine unter der Figur, dann zwei in Reichweite der Explosion, eine weit weg.
    const a = system.lege(300, 800, { art: MINEN_ART.LIEGEND });
    const b = system.lege(300 + MINEN.radius - 5, 800, { art: MINEN_ART.LIEGEND });
    const c = system.lege(300 - MINEN.radius + 5, 800, { art: MINEN_ART.LIEGEND });
    const weit = system.lege(300 + 5 * MINEN.radius, 800, { art: MINEN_ART.LIEGEND });
    system.update();
    const aus = ereignisse.filter(e => e.typ === 'mine_exploded' || e.typ === 'mine_dud');
    // Die Kette läuft nur, wenn A tatsächlich explodiert (bei einem Blindgänger bleibt es bei A): nächster Seed.
    if (aus[0]?.mineId !== a.id || aus[0].typ !== 'mine_exploded') continue;
    const ids = aus.map(e => e.mineId);
    assert.ok(ids.includes(b.id) && ids.includes(c.id), `Seed ${seed}: die Nachbarminen im Radius wurden nicht mit ausgelöst`);
    assert.ok(!ids.includes(weit.id), 'die weit entfernte Mine bleibt');
    assert.deepEqual(ids.slice(0, 3), [a.id, b.id, c.id], 'feste Reihenfolge: Ausgelöste zuerst, dann nach Kennung');
    geprueft = true;
  }
  assert.ok(geprueft, 'in 60 Seeds explodierte die erste Mine nie');
});

test('Kettenreaktion ist je Takt begrenzt, der Rest läuft im nächsten Takt weiter (keine Endlosschleife)', () => {
  const { system, ereignisse } = baueSystem([{ id: 1, x: 300, y: 790 }]);
  const N = MINEN.kettenProTakt + 6;
  // Eng gepackt, damit jede Explosion die übrigen erreicht.
  for (let i = 0; i < N; i += 1) system.lege(300 + (i % 5), 800, { art: MINEN_ART.LIEGEND });
  system.update();
  const ersterTakt = ereignisse.filter(e => e.typ === 'mine_exploded' || e.typ === 'mine_dud').length;
  assert.ok(ersterTakt <= MINEN.kettenProTakt, `${ersterTakt} Auslösungen im ersten Takt, Grenze ${MINEN.kettenProTakt}`);
  for (let i = 0; i < 10; i += 1) system.update();
  const rest = system.snapshot().filter(m => !m.blindgaenger);
  assert.equal(rest.length, 0, 'nach wenigen Takten sind alle scharfen Minen ausgelöst');
});

test('Obergrenze der Minen auf der Karte', () => {
  const { system } = baueSystem([{ id: 1, x: 100, y: 100 }]);
  for (let i = 0; i < MINEN.maximum; i += 1) assert.ok(system.lege(2000 + i, 800, { art: MINEN_ART.LIEGEND }));
  assert.equal(system.lege(100, 800, { art: MINEN_ART.LIEGEND }), null);
});

test('Ablegen setzt die Mine mit Mindestabstand vor die Figur', () => {
  const { system } = baueSystem([{ id: 1, x: 1000, y: 790 }]);
  const mine = system.legeAb(1000, 790, 1, { ownerId: 1, teamId: 0 });
  assert.ok(mine);
  assert.ok(mine.x - 1000 >= MINEN.ablegeAbstand - 1, `Abstand ${mine.x - 1000}`);
  assert.ok(MINEN.ablegeAbstand > MINEN.ausloeseRadius, 'ablegen darf nicht sofort sich selbst sprengen');
  assert.equal(mine.art, MINEN_ART.ABGELEGT);
});

// ----------------------------------------------------------------- im echten Match

test('Altmarke: ohne Bodenobjektfassung gibt es weder System noch Schlüssel im Zustand', () => {
  const m = new MatchController({ seed: 7, teams: 2, playersPerTeam: 1, preset: 'hills' });
  m.start();
  assert.equal(m.bodenobjekte, BODENOBJEKTE_ALT);
  assert.equal(m.bodenobjektSystem, null);
  assert.equal('bodenobjekte' in m.getState(), false, 'der Schlüsselsatz alter Zustände bleibt gleich');
});

test('Mit Marke 2 stehen liegende Minen im Zustand: Anzahl, Abstände, trocken', () => {
  let mitMinen = 0;
  for (let seed = 1; seed <= 24; seed += 1) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, preset: 'hills', bodenobjekte: 2 });
    m.start();
    const s = m.getState();
    const minen = s.bodenobjekte;
    assert.ok(Array.isArray(minen), `Seed ${seed}: Liste fehlt`);
    assert.ok(minen.length >= MINEN.liegendMin && minen.length <= MINEN.liegendMax, `Seed ${seed}: ${minen.length} Minen`);
    if (minen.length > 0) mitMinen += 1;
    for (const mine of minen) {
      assert.equal(mine.art, MINEN_ART.LIEGEND);
      assert.equal(mine.blindgaenger, false);
      for (const e of s.entities) {
        assert.ok(Math.abs(e.x - mine.x) >= MINEN.liegendAbstandStart, `Seed ${seed}: Mine ${mine.id} zu nah an Figur ${e.entityId}`);
      }
      assert.ok(m.waterLevelAt(mine.x, mine.y) < 0.5, `Seed ${seed}: Mine im Wasser`);
    }
    for (let i = 0; i < minen.length; i += 1) {
      for (let j = i + 1; j < minen.length; j += 1) {
        assert.ok(Math.abs(minen[i].x - minen[j].x) >= MINEN.liegendAbstandUntereinander, `Seed ${seed}: Minen zu dicht`);
      }
    }
  }
  assert.ok(mitMinen >= 12, `nur ${mitMinen} von 24 Seeds haben liegende Minen — der Zufall wäre fast immer 0`);
});

test('Determinismus: gleicher Seed, gleiche Takte — gleicher Zustandshash und gleiche Minen', () => {
  const lauf = () => {
    const m = new MatchController({ seed: 424242, teams: 2, playersPerTeam: 2, preset: 'hills', bodenobjekte: 2 });
    m.start();
    for (let i = 0; i < 600; i += 1) { m.step(); m.consumeEvents(); }
    return { hash: m.stateHash(), minen: JSON.stringify(m.getState().bodenobjekte) };
  };
  const a = lauf();
  const b = lauf();
  assert.equal(a.hash, b.hash);
  assert.equal(a.minen, b.minen);
});

test('Eine Mine im echten Match löst aus, wenn eine Figur dort steht', () => {
  const m = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, preset: 'hills', bodenobjekte: 2 });
  m.start();
  m.consumeEvents();
  const figur = m.getState().entities[0];
  const lebenVorher = figur.health;
  let ausgang = null;
  // Mine direkt unter die Figur; je Seed anderer Ausgang. Bei Blindgänger neue Mine, bis etwas passiert.
  for (let i = 0; i < 40 && !(ausgang === 'normal' || ausgang === 'super'); i += 1) {
    m.bodenobjektSystem.lege(figur.x, figur.y + 4, { ownerId: null, teamId: null, art: MINEN_ART.LIEGEND });
    m.step();
    for (const e of m.consumeEvents()) if (e.type === 'mine_exploded') ausgang = e.payload.ausgang;
  }
  assert.ok(ausgang === 'normal' || ausgang === 'super', 'in 40 Minen keine einzige Explosion');
  const nachher = m.getState().entities.find(e => e.entityId === figur.entityId);
  assert.ok(nachher.health < lebenVorher || !nachher.alive, 'die Figur hat Schaden genommen');
});

// ----------------------------------------------------------------- Replay-Kopf

test('Replay: ohne Feld ist die Datei ALT, mit Marke 2 trägt der Kopf sie', () => {
  const neu = new ReplayRecorder({ seed: 5, bodenobjekte: 2 });
  assert.equal(neu.toJSON().config.bodenobjekte, 2);
  const altDatei = JSON.parse(new ReplayRecorder({ seed: 5 }).serialize());
  delete altDatei.config.bodenobjekte;
  const geladen = ReplayRecorder.fromJSON(altDatei);
  assert.equal(geladen.toJSON().config.bodenobjekte, BODENOBJEKTE_ALT, 'eine Datei aus der Zeit davor spielt ohne Minen');
  const rund = ReplayRecorder.fromJSON(neu.serialize());
  assert.equal(rund.toJSON().config.bodenobjekte, 2);
});

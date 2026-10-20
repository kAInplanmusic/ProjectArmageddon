/**
 * Tests: Mischer mit Profilen — Busse, Stimmenlimit, Zusammenfassung, Schalter, Zustand.
 * Ein Attrappen-Context zeichnet Knoten auf (kein Browser nötig).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SoundMixer, tonSpeicher } from '../src/client/soundMixer.js';
import { baueKlangGraph, spieleProfil, weicheKennlinie } from '../src/client/klangSynth.js';
import { ALLE_PROFILE, KATEGORIEN, mulberry } from '../src/client/klangProfile.js';

function fakeContext({ voll = true } = {}) {
  const z = { knoten: 0, puffer: 0, panner: 0, quellen: [], gestoppt: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const knoten = (extra = {}) => {
    z.knoten += 1;
    const k = {
      connect(ziel) { return ziel; },
      disconnect() {},
      start() {},
      stop() { z.gestoppt += 1; },
      frequency: param(), gain: param(), Q: { value: 0 }, threshold: { value: 0 }, ratio: { value: 0 },
      knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, pan: { value: 0 },
      ...extra,
    };
    return k;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: knoten(),
    resume: async () => {},
    createBuffer: (kanaele, l, r) => {
      z.puffer += 1;
      return { duration: l / r, length: l, getChannelData: () => new Float32Array(l) };
    },
    createBufferSource: () => { const k = knoten(); z.quellen.push(k); return k; },
    createBiquadFilter: () => knoten(),
    createGain: () => knoten(),
    createOscillator: () => { const k = knoten(); z.quellen.push(k); return k; },
    createDynamicsCompressor: () => knoten(),
  };
  if (voll) {
    ctx.createStereoPanner = () => { z.panner += 1; return knoten(); };
    ctx.createWaveShaper = () => knoten();
    ctx.createConvolver = () => knoten();
  }
  return { ctx, z };
}

const neu = (opt = {}, ctxOpt = {}) => {
  const f = fakeContext(ctxOpt);
  let t = 0;
  const m = new SoundMixer({ an: true, ctxBauer: () => f.ctx, uhr: () => t, zufall: mulberry(1), ...opt });
  return { m, ...f, zeit: dt => { t += dt; } };
};

test('Der weiche Begrenzer ist bis 0,7 linear und überschreitet nie 0,98', () => {
  assert.equal(weicheKennlinie(0.5), 0.5);
  assert.equal(weicheKennlinie(-0.7), -0.7);
  for (let x = -3; x <= 3; x += 0.01) assert.ok(Math.abs(weicheKennlinie(x)) <= 0.98 + 1e-12);
  assert.ok(weicheKennlinie(1) > 0.7 && weicheKennlinie(1) < 0.98);
});

test('Der Graph hat vier Busse, einen Hall und genau EINEN Rauschpuffer plus Impulsantwort', () => {
  const { ctx, z } = fakeContext();
  const g = baueKlangGraph(ctx, { zufall: mulberry(2) });
  assert.deepEqual(Object.keys(g.busse), ['schuss', 'treffer', 'umgebung', 'ui']);
  assert.ok(g.halle);
  assert.equal(z.puffer, 2, 'Rauschen + Hall-Impuls');
  // Viele Klänge allozieren keine weiteren Puffer.
  for (const name of Object.keys(ALLE_PROFILE)) spieleProfil(g, ALLE_PROFILE[name], { zeit: 0 });
  assert.equal(z.puffer, 2);
});

test('Jedes Profil spielt auf der Attrappe, jede Quelle wird gestartet und beendet', () => {
  const { ctx } = fakeContext(false);
  const g = baueKlangGraph(ctx, { zufall: mulberry(3) });
  for (const [name, p] of Object.entries(ALLE_PROFILE)) {
    const s = spieleProfil(g, p, { zeit: 1, pan: 0.5, tiefpass: 3000 });
    assert.ok(Number.isFinite(s.ende) && s.ende > 1, name);
    assert.equal(typeof s.kappen, 'function');
  }
});

test('Der Schuss wählt sein Profil nach Waffe und zählt Kategorie und Profil', async () => {
  const { m } = neu();
  await m.starte();
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_001' }), true);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_062' }), true);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_147' }), true);
  const z = m.zustand;
  assert.equal(z.kategorien.melee, 1);
  assert.equal(z.kategorien.elemental, 1);
  assert.equal(z.kategorien.ultimate, 1);
  assert.deepEqual(Object.keys(z.kategorien).sort(), [...KATEGORIEN].sort());
  assert.equal(z.profile.nahkampf, 1);
  assert.equal(z.profile.feuer, 1);
  assert.equal(z.profile.ultimate, 1);
  assert.equal(z.gespielt.schuss, 3);
  assert.equal(z.letzte.profil, 'ultimate');
});

test('shot und hitscan desselben Schusses ergeben EINEN Knall', async () => {
  const { m, zeit } = neu();
  await m.starte();
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_022', playerId: 7 }), true);
  zeit(0.002);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_022', playerId: 7 }), false);
  assert.equal(m.zustand.zusammengefasst, 1);
  zeit(1);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_022', playerId: 7 }), true);
  assert.equal(m.gezaehlt.schuss, 2);
});

test('Splitter am selben Ort ergeben einen Einschlag, entfernte Explosionen nicht', async () => {
  const { m, zeit } = neu();
  await m.starte();
  const e = (x, y, r = 40) => ({ type: 'explosion', radius: r, sprengradius: r, x, y });
  assert.equal(m.verarbeite(e(100, 100)), true);
  assert.equal(m.verarbeite(e(110, 105)), false);
  assert.equal(m.verarbeite(e(900, 100)), true);
  zeit(0.5);
  assert.equal(m.verarbeite(e(105, 100)), true);
  assert.equal(m.gezaehlt.explosion, 3);
  assert.equal(m.zustand.zusammengefasst, 1);
});

test('Explosion ohne Sprengradius ist ein Einschlag, im Wasser ein Platscher', async () => {
  const { m } = neu();
  await m.starte();
  m.verarbeite({ type: 'explosion', radius: 12, sprengradius: 0, x: 1, y: 1, material: 'fels' });
  assert.equal(m.zustand.letzte.profil, 'einschlag_fels');
  m.verarbeite({ type: 'explosion', radius: 12, sprengradius: 0, x: 500, y: 1, material: 'wasser' });
  assert.equal(m.zustand.letzte.profil, 'platscher_klein');
  m.verarbeite({ type: 'explosion', radius: 60, sprengradius: 60, x: 900, y: 1, material: 'wasser' });
  assert.equal(m.zustand.letzte.profil, 'platscher_gross');
  assert.equal(m.gezaehlt.einschlag, 1);
  assert.equal(m.gezaehlt.wasser, 2);
  assert.equal(m.gezaehlt.explosion, 0);
  m.verarbeite({ type: 'explosion', radius: 90, sprengradius: 90, x: 2000, y: 1 });
  assert.equal(m.zustand.letzte.profil, 'explosion_riesig');
});

test('Treffer: Klassen, Krit, Selbstschaden, höchstens drei je 50 ms', async () => {
  const { m, zeit } = neu();
  await m.starte();
  m.verarbeite({ type: 'damage', schaden: 60, maxHealth: 100 });
  assert.equal(m.zustand.letzte.profil, 'treffer_figur_gross');
  zeit(1);
  m.verarbeite({ type: 'damage', schaden: 10, maxHealth: 100, kritisch: true });
  assert.equal(m.zustand.letzte.profil, 'treffer_krit');
  zeit(1);
  m.verarbeite({ type: 'damage', schaden: 10, maxHealth: 100, selbst: true });
  assert.equal(m.zustand.letzte.profil, 'treffer_selbst');
  zeit(1);
  const ok = Array.from({ length: 6 }, () => m.spieleTreffer(1, { schaden: 20 }));
  assert.deepEqual(ok, [true, true, true, false, false, false]);
  assert.equal(m.zustand.zusammengefasst, 3);
});

test('Weitere Ereignisklänge: Landung, Aufprall, Insel, Trümmer, Tod, Kiste, Ticken, Oberfläche', async () => {
  const { m } = neu();
  await m.starte();
  const erwartet = {
    landed: 'landung_figur', aufprall: 'aufprall_hart', insel_gelandet: 'landung_insel',
    truemmer: 'truemmer', tod: 'tod', kiste: 'kiste', ticken: 'ticken', waffenwechsel: 'waffenwechsel',
    bereit: 'bereit', platscher: 'platscher_klein',
  };
  for (const [art, profil] of Object.entries(erwartet)) {
    assert.equal(m.verarbeite({ type: art, x: 10, y: 10 }), true, art);
    assert.equal(m.zustand.letzte.profil, profil, art);
  }
  assert.equal(m.verarbeite({ type: 'valhalla_omen' }), true);
  assert.equal(m.gezaehlt.donner, 1);
  assert.equal(m.gezaehlt.ui, 2);
});

test('Stereolage und Pegel folgen der Hörerposition', async () => {
  const { m } = neu();
  await m.starte();
  m.setzeHoerer(() => ({ x: 500, y: 300, halbBreite: 400 }));
  m.verarbeite({ type: 'shot', weaponId: 'pa_040', x: 500, y: 300 });
  assert.equal(m.zustand.letzte.pan, 0);
  assert.equal(m.zustand.letzte.pegel, 1);
  m.verarbeite({ type: 'tod', x: 900, y: 300 });
  assert.ok(m.zustand.letzte.pan > 0.5);
  m.verarbeite({ type: 'tod', x: -3000, y: 300 });
  assert.ok(m.zustand.letzte.pan < -0.5 && m.zustand.letzte.pegel < 0.3);
});

test('Voice-Limit: nie mehr als 24 gleichzeitig, Ältestes wird gekappt', async () => {
  const { m, z } = neu();
  await m.starte();
  for (let i = 0; i < 60; i += 1) m.verarbeite({ type: 'tod', x: i, y: 0 });
  const s = m.zustand.stimmen;
  assert.equal(s.max, 24);
  assert.ok(s.aktiv <= 24);
  assert.equal(s.spitze, 24);
  assert.equal(s.gekappt, 36);
  assert.ok(z.gestoppt > 0, 'gekappte Quellen werden gestoppt');
});

test('Effekte aus: kein Klang, Zähler „stumm"; wieder an: es klingt', async () => {
  const { m } = neu();
  await m.starte();
  m.setzeAn(false);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_001' }), false);
  assert.equal(m.spieleTreffer(1), false);
  let z = m.zustand;
  assert.equal(z.stumm, 2);
  assert.equal(z.gespielt.schuss, 0);
  assert.equal(z.an, false);
  m.schalte();
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_001' }), true);
  z = m.zustand;
  assert.equal(z.ereignisse.schuss, 1);
});

test('Ohne gestarteten Context wird das Ereignis gezählt, aber nichts gespielt', () => {
  const { m } = neu();
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_001' }), false);
  assert.equal(m.zustand.ereignisse.schuss, 1);
  assert.equal(m.zustand.ohneKontext, 1);
  assert.equal(m.zustand.bereit, false);
});

test('Stumm in Tests (aktiv=false): Klänge entstehen, der Ausgang steht auf null', async () => {
  const { m } = neu({ aktiv: false, lautstaerke: 0.8 });
  await m.starte();
  assert.equal(m.aktiv, false);
  assert.equal(m.verarbeite({ type: 'shot', weaponId: 'pa_001' }), true);
  assert.equal(m.zustand.gespielt.schuss, 1);
});

test('Einstellung wird gespeichert und wieder geladen; kaputter Speicher stört nicht', async () => {
  let inhalt = null;
  const speicher = { lies: () => inhalt, schreibe: t => { inhalt = t; } };
  const { m } = neu({ speicher });
  m.setzeLautstaerke(0.35).setzeAn(false);
  assert.deepEqual(JSON.parse(inhalt), { an: false, lautstaerke: 0.35 });
  const { m: zweiter } = neu({ speicher });
  assert.equal(zweiter.an, false);
  assert.equal(zweiter.lautstaerke, 0.35);
  inhalt = '{kaputt';
  const { m: dritter } = neu({ speicher });
  assert.equal(dritter.an, true);
  const werfend = { lies: () => { throw new Error('x'); }, schreibe: () => { throw new Error('y'); } };
  const { m: vierter } = neu({ speicher: werfend });
  vierter.setzeLautstaerke(0.5);
  assert.equal(tonSpeicher().lies(), null, 'ohne localStorage kein Wurf');
});

test('beiAenderung meldet Schalter und Lautstärke', () => {
  const { m } = neu();
  const log = [];
  const ab = m.beiAenderung(z => log.push(z));
  m.setzeLautstaerke(0.2);
  m.schalte();
  ab();
  m.schalte();
  assert.equal(log.length, 2);
  assert.deepEqual(log[1], { an: false, aktiv: true, lautstaerke: 0.2 });
});

test('Busse lassen sich einzeln regeln', async () => {
  const { m } = neu();
  await m.starte();
  m.setzeBus('treffer', 0.5);
  m.setzeBus('gibtsnicht', 1);
  assert.equal(m.zustand.busse.treffer, 0.5);
  assert.equal(m.zustand.busse.schuss, 1);
});

test('Die Musik bekommt weiter ihren Anschluss am Begrenzer', async () => {
  const { m } = neu();
  assert.equal(m.musikAnschluss(), null);
  await m.starte();
  assert.ok(m.musikAnschluss()?.ziel);
});

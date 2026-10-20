/**
 * Feuerfassung 2 (`config/feuer.js`, `engine/systems/feuerSystem.js`): Brand, Lava, Ragnarök.
 * Das System läuft hier gegen eine kleine Stoffkarte und eine Maske aus Stubs; ein Match-Test
 * prüft Verdrahtung, Altverhalten und Replay-Kopf.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeuerSystem } from '../src/engine/systems/feuerSystem.js';
import { FEUER, FEUER_ALT, FEUER_ENTFACHT, FEUER_STANDARD, normalisiereFeuer, feuerfestFaktor } from '../src/shared/config/feuer.js';
import { STOFF } from '../src/shared/config/stoffe.js';
import { stoffAm } from '../src/shared/stoffkarte.js';
import { SeededRandom } from '../src/shared/prng.js';
import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder } from '../src/engine/replay.js';

const SP = 40;
const ZE = 20;

/** Karte 40 × 20 Zellen: unten Erde (ab Zeile 12), darin ein Holzblock (Zeilen 12 bis 13, Spalten 5 bis 20). */
function bauKarte(stoffAnpassung = () => {}) {
  const feld = new Uint8Array(SP * ZE).fill(STOFF.ERDE);
  for (let gy = 12; gy < 14; gy += 1) for (let gx = 5; gx < 21; gx += 1) feld[gy * SP + gx] = STOFF.HOLZ;
  stoffAnpassung(feld);
  return { feld, spalten: SP, zeilen: ZE, zelle: 8, breite: SP * 8, hoehe: ZE * 8, geschuetzt: null };
}

function bauMaske(karte) {
  const fest = new Set();
  for (let y = 12 * 8; y < karte.hoehe; y += 1) for (let x = 0; x < karte.breite; x += 1) fest.add(y * karte.breite + x);
  return {
    width: karte.breite, height: karte.hoehe,
    isSolid: (x, y) => fest.has(Math.floor(y) * karte.breite + Math.floor(x)),
    setPixel: (x, y, v) => { if (v) fest.add(y * karte.breite + x); else fest.delete(y * karte.breite + x); },
    logEintrag: () => {},
  };
}

function bauSystem({ ragnarok = false, sonderbiom = null, figuren = [], wasserY = 1e9, seed = 7, stoffAnpassung, oberflaeche = 12 * 8 } = {}) {
  const karte = bauKarte(stoffAnpassung);
  const maske = bauMaske(karte);
  const ereignisse = [];
  const schaeden = [];
  const kratern = [];
  const sys = new FeuerSystem({
    rng: new SeededRandom(seed), karte, terrain: maske, events: { emit: (typ, daten) => ereignisse.push({ typ, daten }) },
    zerstoerung: { krater: (...a) => { kratern.push(a); } }, sonderbiom,
    q: {
      figuren: () => figuren, waterLevelAt: (x, y) => (y >= wasserY ? 1 : 0), surfaceYAt: () => oberflaeche,
      ragnarok: () => ragnarok, schaden: (id, betrag, art) => schaeden.push({ id, betrag, art }), mali: () => {},
    },
  });
  return { sys, karte, maske, ereignisse, schaeden, kratern };
}

const tick = (sys, n) => { for (let i = 0; i < n; i += 1) sys.update(); };

test('Fassung: Standard ist 2, Unbekanntes fällt darauf, Altwert bleibt', () => {
  assert.equal(FEUER_STANDARD, FEUER_ENTFACHT);
  assert.equal(normalisiereFeuer(FEUER_ALT), FEUER_ALT);
  assert.equal(normalisiereFeuer(undefined), FEUER_STANDARD);
  assert.equal(normalisiereFeuer(99), FEUER_STANDARD);
});

test('Hitze entzündet Holz im Radius, das Feuer breitet sich aus und brennt zu Asche aus', () => {
  const { sys, karte, ereignisse } = bauSystem();
  sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
  const anfang = sys.brennendeZellen;
  assert.ok(anfang > 0, 'Einschlag entzündet');
  tick(sys, FEUER.takt * 6);
  const maximum = ereignisse.filter(e => e.typ === 'feuer_schritt').reduce((s, e) => s + e.daten.neu.length, anfang);
  assert.ok(maximum > anfang, 'das Feuer greift auf Nachbarzellen über');
  tick(sys, FEUER.takt * 40);
  assert.equal(sys.brennendeZellen, 0, 'alles ausgebrannt');
  const asche = [...karte.ueber].filter(v => v === STOFF.ASCHE + 1).length;
  assert.ok(asche >= anfang, 'ausgebrannte Zellen sind Asche');
  const i = karte.ueber.findIndex(v => v === STOFF.ASCHE + 1);
  assert.equal(stoffAm(karte, (i % SP) * 8 + 4, Math.floor(i / SP) * 8 + 4), STOFF.ASCHE, 'stoffAm liest die Überlagerung');
  assert.equal(karte.feld[i], STOFF.HOLZ, 'die Stoffkarte selbst bleibt unverändert (Hash)');
});

test('Erde brennt nicht; Hitze auf Erde ändert nichts', () => {
  const { sys } = bauSystem();
  sys.einschlag(30 * 8, 14 * 8, 20, 'hitze');
  assert.equal(sys.brennendeZellen, 0);
});

test('Wasser löscht und macht nass: Nasses entzündet sich nicht wieder', () => {
  const { sys } = bauSystem();
  sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
  assert.ok(sys.brennendeZellen > 0);
  sys.einschlag(12 * 8, 12 * 8 + 4, 14, 'nass');
  assert.equal(sys.brennendeZellen, 0, 'Wasserwaffe löscht');
  sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
  assert.equal(sys.brennendeZellen, 0, 'nasse Zellen brennen nicht');
  tick(sys, FEUER.takt * (FEUER.nassSchritte + 2));
  sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
  assert.ok(sys.brennendeZellen > 0, 'nach der Trockenzeit brennt es wieder');
});

test('Unter dem Wasserspiegel brennt nichts', () => {
  const { sys } = bauSystem({ wasserY: 12 * 8 });
  sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
  assert.equal(sys.brennendeZellen, 0);
});

test('Figur in Flammen nimmt Feuerschaden, ein Feuerfester weniger', () => {
  const figur = { id: 4, x: 12 * 8 + 4, y: 12 * 8 + 2, archetyp: 0 };
  const { sys, schaeden } = bauSystem({ figuren: [figur] });
  sys.einschlag(figur.x, figur.y, 12, 'hitze');
  tick(sys, FEUER.takt);
  assert.ok(schaeden.length > 0 && schaeden[0].id === 4);
  assert.equal(schaeden[0].betrag, FEUER.schadenFlamme * feuerfestFaktor('brawler'));
  assert.ok(feuerfestFaktor('artillerist') < 1 && feuerfestFaktor('brawler') === 1);
});

test('Das Feuer ist deterministisch: gleicher Seed, gleiche Zellen', () => {
  const lauf = seed => {
    const { sys, karte } = bauSystem({ seed });
    sys.einschlag(12 * 8, 12 * 8 + 4, 10, 'hitze');
    tick(sys, FEUER.takt * 30);
    return `${sys.zustand().brennt}|${[...karte.ueber]}`;
  };
  assert.equal(lauf(3), lauf(3));
  assert.notEqual(lauf(3), lauf(4));
});

test('Lava im Vulkan: Ausbruch, Lavazellen mit Schaden, Erstarren zu Basalt oder Obsidian', () => {
  const figur = { id: 2, x: 5, y: 12 * 8 - 40, archetyp: 0 };
  const { sys, karte, ereignisse } = bauSystem({ sonderbiom: 'vulkan', figuren: [figur] });
  tick(sys, FEUER.lava.ersterAusbruch + FEUER.lava.pauseTicks[1] + 10);
  const ausbruch = ereignisse.find(e => e.typ === 'lava_ausbruch');
  assert.ok(ausbruch && ausbruch.daten.n > 0, 'Lava bricht aus');
  assert.ok(sys.lavaZellen > 0);
  tick(sys, FEUER.laveTakt * (FEUER.lava.leben[1] + 20));
  assert.ok(ereignisse.some(e => e.typ === 'lava_erstarrt'), 'Lava erstarrt');
  const erstarrt = [...karte.ueber].filter(v => v === STOFF.BASALT + 1 || v === STOFF.OBSIDIAN + 1);
  assert.ok(erstarrt.length > 0, 'erstarrte Zellen sind Basalt oder Obsidian');
  assert.ok(ereignisse.some(e => e.typ === 'terrain_added'), 'erstarrte Lava füllt das Gelände');
});

test('Lava neben Wasser erstarrt zu Obsidian', () => {
  const { sys, karte, ereignisse } = bauSystem({ sonderbiom: 'vulkan', wasserY: 12 * 8 - 6, oberflaeche: 12 * 8 - 16 });
  tick(sys, FEUER.lava.ersterAusbruch + FEUER.lava.pauseTicks[1] + FEUER.laveTakt * 200);
  assert.ok(ereignisse.some(e => e.typ === 'lava_erstarrt'));
  const obsidian = [...karte.ueber].filter(v => v === STOFF.OBSIDIAN + 1).length;
  assert.ok(obsidian > 0, 'Wasser kühlt zu Obsidian');
});

test('Ragnarök: ab Valhalla kommen Flammenwände und Lavarisse in kürzeren Abständen', () => {
  const { sys, ereignisse } = bauSystem({ ragnarok: true });
  tick(sys, 60 * 120);
  assert.ok(ereignisse.some(e => e.typ === 'ragnarok_beginnt'));
  const wand = ereignisse.filter(e => e.typ === 'flammenwand');
  const riss = ereignisse.filter(e => e.typ === 'lava_ausbruch' && e.daten.riss);
  assert.ok(wand.length >= 2 && riss.length >= 2);
});

test('Ohne Ragnarök und ohne Vulkan bleibt es still', () => {
  const { sys, ereignisse } = bauSystem();
  tick(sys, 60 * 120);
  assert.equal(ereignisse.length, 0);
});

test('Match: FEUER_ALT hat kein System und ändert den Zustand nicht, Fassung 2 trägt eines', () => {
  const lauf = feuer => {
    const m = new MatchController({ seed: 21, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom: 'vulkan', maxRounds: 3, feuer });
    m.start();
    for (let i = 0; i < 300; i += 1) m.step();
    return m;
  };
  const alt = lauf(FEUER_ALT);
  const standardOhne = new MatchController({ seed: 21, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom: 'vulkan', maxRounds: 3 });
  standardOhne.start();
  for (let i = 0; i < 300; i += 1) standardOhne.step();
  assert.equal(alt.feuerSystem, null);
  assert.equal(alt.stateHash(), standardOhne.stateHash(), 'ohne Angabe gilt FEUER_ALT');
  assert.ok(lauf(FEUER_ENTFACHT).feuerSystem);
});

test('Replay-Kopf: neue Aufzeichnung trägt feuer, ein Kopf ohne Feld ist FEUER_ALT', () => {
  const r = new ReplayRecorder({ seed: 5, kartentyp: 'autonom', feuer: FEUER_ENTFACHT });
  const json = JSON.parse(JSON.stringify(r.toJSON()));
  assert.equal(json.config.feuer, FEUER_ENTFACHT);
  delete json.config.feuer;
  assert.equal(ReplayRecorder.fromJSON(json).toJSON().config.feuer, FEUER_ALT);
});

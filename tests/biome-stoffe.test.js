/**
 * Sonderbiome und Stoffkarte (Etappen A bis C): Determinismus, Client-Nachbau,
 * Vollständigkeit der Tabellen, Replay-Rundlauf, Altköpfe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder } from '../src/engine/replay.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { stoffHash, zaehleStoffe } from '../src/shared/stoffkarte.js';
import { NEUE_BIOME, SONDERBIOM_IDS } from '../src/shared/config/biome-neu.js';
import { rezeptFuer, ALTE_REZEPTE } from '../src/shared/config/stoff-rezepte.js';
import { STOFFE, STOFF, HAERTEN, CHARAKTER_FAKTOR, stoffById, stoffByKey, stoffWirkung } from '../src/shared/config/stoffe.js';
import { GELAENDE_ALT, GELAENDE_BIOME } from '../src/shared/config/gelaende.js';
import { ZERSTOERUNG_STOFF } from '../src/shared/config/zerstoerung.js';
import { BACKDROP_BIOMES } from '../src/shared/config/backdrops.js';

const FASSUNG = { gelaende: GELAENDE_BIOME, zerstoerung: ZERSTOERUNG_STOFF };

function client(seed, biom) {
  return buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { ...FASSUNG, biom });
}

test('Mindestens sechs Sonderbiome, thematisch verschieden', () => {
  assert.ok(SONDERBIOM_IDS.length >= 6);
  const labels = new Set(SONDERBIOM_IDS.map(id => NEUE_BIOME[id].label));
  const rezepte = new Set(SONDERBIOM_IDS.map(id => JSON.stringify(NEUE_BIOME[id].stoffe)));
  const formen = new Set(SONDERBIOM_IDS.map(id => JSON.stringify(NEUE_BIOME[id].form)));
  assert.equal(labels.size, SONDERBIOM_IDS.length);
  assert.equal(rezepte.size, SONDERBIOM_IDS.length);
  assert.equal(formen.size, SONDERBIOM_IDS.length);
  for (const id of SONDERBIOM_IDS) {
    const b = NEUE_BIOME[id];
    for (const f of ['label', 'sky', 'water', 'landmarks', 'ambient', 'ground', 'form', 'stoffe', 'pflanzen']) {
      assert.ok(b[f], `${id}: ${f} fehlt`);
    }
  }
});

test('Materialtabelle vollständig: jeder Stoff hat Härte, Schlüssel und Faktoren; jedes Rezept nennt bekannte Stoffe', () => {
  const ids = new Set();
  for (const s of STOFFE) {
    assert.ok(!ids.has(s.id), `doppelte Id ${s.key}`);
    ids.add(s.id);
    assert.ok(HAERTEN.includes(s.haerte), `${s.key}: Härte`);
    assert.equal(stoffByKey(s.key).id, s.id);
    assert.equal(stoffById(s.id).key, s.key);
    for (const art of Object.keys(CHARAKTER_FAKTOR)) {
      const w = stoffWirkung(s.id, art, 'wucht');
      assert.ok(Number.isFinite(w.radius) && Number.isFinite(w.tiefe), `${s.key}/${art}`);
    }
  }
  // Die benannten Kennungen (STOFF) sind der Basiskatalog; die Biom-Materialien hängen dahinter (stoffe.js, tests/stoffe-katalog.test.js).
  assert.ok(ids.size >= Object.keys(STOFF).length);
  const rezepte = { ...ALTE_REZEPTE, ...Object.fromEntries(SONDERBIOM_IDS.map(id => [id, rezeptFuer(id)])) };
  for (const [biom, r] of Object.entries(rezepte)) {
    const keys = [...r.deck.map(d => d[0]), r.kern, ...(r.adern ?? []).map(a => a.stoff), ...(r.platten ? [r.platten.stoff] : [])];
    for (const k of keys) assert.ok(stoffByKey(k), `${biom}: unbekannter Stoff ${k}`);
  }
  for (const b of BACKDROP_BIOMES) assert.ok(rezeptFuer(b.id), b.id);
});

test('Unzerstörbarer Stoff lässt den Krater aus, brüchiger vergrößert ihn', () => {
  const weich = stoffWirkung(STOFF.ERDE, 'sprengung', 'wucht');
  const metall = stoffWirkung(STOFF.GRUNDGESTEIN, 'sprengung', 'wucht');
  assert.ok(metall.radius < 1 || metall.radius === 0);
  assert.ok(weich.radius >= 1);
});

test('Karte und Stoffkarte sind deterministisch (zweimal gleicher Hash) und der Client baut zellengleich nach', () => {
  for (const id of SONDERBIOM_IDS) {
    const seed = 4242 + id.length;
    const a = client(seed, id);
    const b = client(seed, id);
    assert.equal(stoffHash(a.stoffkarte), stoffHash(b.stoffkarte), id);
    assert.deepEqual(a.stoffkarte.feld, b.stoffkarte.feld, id);
    assert.deepEqual(a.bitmap, b.bitmap, id);
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', biom: id, maxRounds: 2, ...FASSUNG });
    m.start();
    assert.equal(m.sonderbiom, id);
    assert.equal(stoffHash(m.stoffkarte), stoffHash(a.stoffkarte), `${id}: Server gegen Client`);
    assert.ok(m.erreichbarkeit.ok, `${id}: ${m.erreichbarkeit.grund}`);
    const z = zaehleStoffe(a.stoffkarte, a.bitmap);
    assert.ok(z.size >= 2, `${id}: nur ein Stoff`);
  }
});

test('Fassung 1 hat keine Stoffkarte und keinen Sonderbiom-Zug', () => {
  const m = new MatchController({ seed: 99, teams: 2, playersPerTeam: 1, kartentyp: 'autonom', maxRounds: 2, gelaende: GELAENDE_ALT, zerstoerung: 4 });
  m.start();
  assert.equal(m.sonderbiom, null);
  assert.equal(m.stoffkarte ?? null, null);
});

test('Replay-Kopf: neue Fassung rundläuft, ein Kopf ohne Feld ist GELAENDE_ALT', () => {
  const r = new ReplayRecorder({ seed: 5, kartentyp: 'autonom', gelaende: GELAENDE_BIOME, zerstoerung: ZERSTOERUNG_STOFF, biom: 'riff' });
  const kopf = JSON.parse(JSON.stringify(r.toJSON?.() ?? r.toObject?.() ?? {}));
  const cfg = kopf.config ?? kopf;
  assert.equal(cfg.gelaende, GELAENDE_BIOME);
  assert.equal(cfg.biom, 'riff');
  assert.equal(cfg.zerstoerung, ZERSTOERUNG_STOFF);
  delete cfg.gelaende;
  delete cfg.biom;
  const alt = ReplayRecorder.fromJSON(JSON.stringify(kopf));
  const cfg2 = JSON.parse(JSON.stringify(alt.toJSON?.() ?? alt.toObject?.())).config;
  assert.equal(cfg2.gelaende, GELAENDE_ALT);
  assert.equal(cfg2.biom, undefined);
});

test('30 zufällige Seed×Biom-Karten: gültig, Wasseranteil und Land im Rahmen', () => {
  const ids = [...SONDERBIOM_IDS, 'klassisch'];
  for (let i = 0; i < 30; i += 1) {
    const biom = ids[i % ids.length];
    const t = client(1000 + i * 7919, biom);
    const fest = t.bitmap.reduce((s, v) => s + (v ? 1 : 0), 0) / t.bitmap.length;
    assert.ok(fest > 0.1 && fest < 0.85, `${biom} #${i}: Landanteil ${fest.toFixed(2)}`);
    if (biom !== 'klassisch') assert.ok(t.stoffkarte && t.stoffkarte.feld.length > 0);
    assert.ok(t.waterLevel > 0 && t.waterLevel < t.bitmap.length, `${biom}: Wasserstand`);
  }
});

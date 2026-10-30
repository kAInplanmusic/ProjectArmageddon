/**
 * Gelände-Fassung 7: die Biome 15 bis 20 der Biom-SSOT (Schlackeschmiede, Kristallines Schwebearchipel, Bio-Alien-Tempelstadt,
 * Abyssale Tiefsee, Dimensionsriss, Versteinerter Kristallwald) sind spielbar.
 *
 * Geprüft wird (1) die Marke und die Ziehung, (2) die Definition je Biom, (3) die Spielbarkeit je Biom und Determinismus,
 * (4) die Kulissen und (5) dass alle älteren Fassungen Bit für Bit gleich bleiben: Die Goldwerte stammen aus einer Messung
 * auf `main` VOR der Fassung 7 (Zustands- und Stoffhash nach 240 Ticks; Replay über 2400 Ticks).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { MatchController } from '../src/engine/match.js';
import { ReplayRecorder, ReplayPlayer } from '../src/engine/replay.js';
import { buildTerrainForSeed } from '../src/client/terrainPreview.js';
import { stoffHash, zaehleStoffe } from '../src/shared/stoffkarte.js';
import { SeededRandom } from '../src/shared/prng.js';
import {
  GELAENDE_KOMPOSITION, GELAENDE_BIOME_20, GELAENDE_STANDARD, normalisiereGelaende, normalisiereBiomWahl, waehleSonderbiom, loeseGelaende,
} from '../src/shared/config/gelaende.js';
import {
  NEUE_BIOME, BIOM_IDS_FASSUNG_7, SONDERBIOM_IDS_FASSUNG_4, SONDERBIOM_IDS_FASSUNG_7,
} from '../src/shared/config/biome-neu.js';
import { BIOME_FASSUNG_7 } from '../src/shared/config/biome-fassung-7.js';
import { REZEPTE_MATERIAL } from '../src/shared/config/stoff-rezepte-material.js';
import { rezeptFuer } from '../src/shared/config/stoff-rezepte.js';
import { stoffByKey, STOFF } from '../src/shared/config/stoffe.js';
import {
  SCENERY_BIOMES, SKY_KINDS, WATER_KINDS, LANDMARK_KINDS, AMBIENT_KINDS, pickScenery,
} from '../src/shared/config/scenery.js';
import { getFaction } from '../src/shared/config/factions.js';
import { CHARAKTER_ACHSEN } from '../src/shared/terrainGen3.js';
import { BACKDROPS_NEU, getBackdropNeu, PALETTEN_NEU, STIMMUNGEN_NEU } from '../src/shared/config/backdrops-neu.js';
import { paletteFor, ALL_BACKDROPS } from '../src/shared/config/backdrops.js';
import { SONDER_KULISSEN, sonderKulisseFuer } from '../src/client/sonderKulissen.js';

const NEU = ['schlackeschmiede', 'kristallarchipel', 'tempelstadt', 'tiefsee', 'dimensionsriss', 'kristallwald'];
const BASIS = Object.keys(STOFF).length;
const wurzel = resolve(import.meta.dirname, '..');

// ----------------------------------------------------------------------------- Marke und Ziehung

test('Marke: Fassung 7 ist gültig und der Standard, 1 bis 6 bleiben gültig, Unbekanntes fällt auf den Standard', () => {
  assert.equal(GELAENDE_BIOME_20, 7);
  assert.equal(GELAENDE_STANDARD, GELAENDE_BIOME_20);
  for (const f of [1, 2, 3, 4, 5, 6, 7]) assert.equal(normalisiereGelaende(f), f);
  assert.equal(normalisiereGelaende(8), GELAENDE_STANDARD);
  assert.equal(normalisiereGelaende(undefined), GELAENDE_STANDARD);
});

test('Die sechs Biome sind erst ab Fassung 7 wählbar und ziehbar; die Liste hat zwanzig Plätze', () => {
  assert.deepEqual([...BIOM_IDS_FASSUNG_7], NEU);
  assert.equal(SONDERBIOM_IDS_FASSUNG_4.length, 14);
  assert.equal(SONDERBIOM_IDS_FASSUNG_7.length, 20);
  for (const id of NEU) {
    assert.equal(normalisiereBiomWahl(id, GELAENDE_KOMPOSITION), null, `${id}: Fassung 6 kennt es nicht`);
    assert.equal(normalisiereBiomWahl(id, GELAENDE_BIOME_20), id, `${id}: Fassung 7 wählt es`);
    assert.equal(loeseGelaende(GELAENDE_KOMPOSITION, id, 5).sonderbiom !== id, true);
    assert.equal(loeseGelaende(GELAENDE_BIOME_20, id, 5).sonderbiom, id);
  }
});

test('Ziehung: Fassung 6 zieht nie ein neues Biom und bleibt die alte; Fassung 7 zieht alle sechs, Zufall nur aus dem Seed-Zweig', () => {
  const ids4 = SONDERBIOM_IDS_FASSUNG_4;
  const gesehen = new Set();
  for (let seed = 1; seed < 6000; seed += 1) {
    // Die Ziehung der Fassung 6 nachgerechnet (Zweig „BIO“ 0x42494F, 40 %, dann Gleichverteilung über 14 Plätze).
    const rng = new SeededRandom(((seed >>> 0) + 0x42494F) >>> 0);
    const gezogen = rng.next() >= 0.4 ? null : ids4[Math.floor(rng.next() * ids4.length)];
    const alt = waehleSonderbiom(seed, null, GELAENDE_KOMPOSITION);
    assert.ok(!NEU.includes(alt), `Seed ${seed}: Fassung 6 zog ${alt}`);
    if (gezogen !== 'planet') assert.equal(alt, gezogen, `Seed ${seed}: Fassung 6 weicht ab`);
    const neu = waehleSonderbiom(seed, null, GELAENDE_BIOME_20);
    assert.equal(neu, waehleSonderbiom(seed, null, GELAENDE_BIOME_20), `Seed ${seed}: nicht deterministisch`);
    if (neu) gesehen.add(neu);
  }
  for (const id of NEU) assert.ok(gesehen.has(id), `${id} wird in Fassung 7 gezogen`);
});

test('Neue Dateien nutzen weder Math.random noch Date.now (AGENTS.md §2)', () => {
  for (const datei of ['src/shared/config/biome-fassung-7.js', 'src/shared/config/backdrops-neu.js']) {
    const text = readFileSync(resolve(wurzel, datei), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random|Date\.now/.test(text), datei);
  }
});

// ----------------------------------------------------------------------------- Definition je Biom

for (const id of NEU) {
  test(`${id}: vollständiger Eintrag, nur bekannte Bausteine, Rezept nach Manifest`, () => {
    const b = NEUE_BIOME[id];
    assert.equal(b, BIOME_FASSUNG_7[id]);
    assert.equal(SCENERY_BIOMES[id], b, 'Kulisse liest denselben Eintrag');
    for (const f of ['label', 'beschreibung', 'fraktion', 'mapPreset', 'sky', 'water', 'landmarks', 'ambient', 'ground', 'groundVarianten', 'form', 'stoffe', 'pflanzen']) assert.ok(b[f], `${id}.${f}`);
    assert.ok(getFaction(b.fraktion), `${id}: Fraktion`);
    assert.ok(b.sky.length >= 3 && b.water.length >= 1 && b.groundVarianten.length >= 2);
    const himmel = new Set(SKY_KINDS.map(s => s.id));
    const wasser = new Set(WATER_KINDS.map(w => w.id));
    const landmarken = new Set(LANDMARK_KINDS);
    const ambiente = new Set(Object.keys(AMBIENT_KINDS));
    for (const s of b.sky) assert.ok(himmel.has(s), `${id}: Himmel ${s}`);
    for (const w of b.water) assert.ok(wasser.has(w), `${id}: Wasser ${w}`);
    for (const l of b.landmarks) assert.ok(landmarken.has(l), `${id}: Landmarke ${l}`);
    for (const a of b.ambient) assert.ok(ambiente.has(a), `${id}: Ambiente ${a}`);
    for (const [achse, [lo, hi]] of Object.entries(b.form)) {
      assert.ok(CHARAKTER_ACHSEN[achse], `${id}: Achse ${achse}`);
      assert.ok(lo <= hi && lo >= CHARAKTER_ACHSEN[achse][0] - 1e-9 && hi <= CHARAKTER_ACHSEN[achse][1] + 1e-9, `${id}: ${achse} außerhalb der Achse`);
    }
  });

  test(`${id}: Fassung-7-Rezept nutzt nur Katalogstoffe und Biom-Materialien, das Rückfallrezept nur Basisstoffe`, () => {
    const schluessel = r => [...r.deck.map(d => d[0]), r.kern, ...(r.adern ?? []).map(a => a.stoff), ...(r.platten ? [r.platten.stoff] : [])];
    const material = REZEPTE_MATERIAL[id];
    assert.equal(rezeptFuer(id, GELAENDE_BIOME_20), material);
    for (const k of schluessel(material)) assert.ok(stoffByKey(k), `${id}: unbekannter Stoff ${k}`);
    assert.ok(schluessel(material).filter(k => stoffByKey(k).id >= BASIS).length >= 4, `${id}: zu wenige Biom-Materialien`);
    assert.equal(rezeptFuer(id, 0), NEUE_BIOME[id].stoffe);
    for (const k of schluessel(NEUE_BIOME[id].stoffe)) assert.ok(stoffByKey(k).id < BASIS, `${id}: Rückfallrezept nutzt ${k}`);
  });
}

test('Materialmix je Biom nach dem Manifest (Deck, Kern, Leitadern) und alle sechs Rezepte verschieden', () => {
  const erwartet = {
    schlackeschmiede: { deck: 'schlacke', kern: 'basalt', adern: ['keramik'], platten: 'metallschienen' },
    kristallarchipel: { deck: 'firnschnee', kern: 'massivfels', adern: ['klareiskristall', 'magnetgestein'] },
    tempelstadt: { deck: 'humus', kern: 'tempelstein', adern: ['alienharz', 'pilzmyzel'] },
    tiefsee: { deck: 'tiefseeschlamm', kern: 'tiefseebasalt', adern: ['korrodiertes_metall', 'koralle'] },
    dimensionsriss: { deck: 'instabiler_boden', kern: 'phasen_fels', adern: ['zeitkristall', 'glasfragmente'] },
    kristallwald: { deck: 'moos', kern: 'versteinertes_holz', adern: ['kristalladern'] },
  };
  const rezepte = new Set();
  for (const [id, e] of Object.entries(erwartet)) {
    const r = REZEPTE_MATERIAL[id];
    rezepte.add(JSON.stringify(r));
    assert.equal(r.deck[0][0], e.deck, `${id}: Deckschicht`);
    assert.equal(r.kern, e.kern, `${id}: Kern`);
    for (const a of e.adern) assert.ok(r.adern.some(x => x.stoff === a), `${id}: Ader ${a}`);
    if (e.platten) assert.equal(r.platten.stoff, e.platten);
  }
  assert.equal(rezepte.size, 6);
  assert.equal(new Set(NEU.map(id => NEUE_BIOME[id].label)).size, 6);
});

// ----------------------------------------------------------------------------- Spielbarkeit und Determinismus

for (const id of NEU) {
  test(`${id}: spielbar (Spawn erreichbar, Stoffkarte mit Biom-Materialien, Server = Client) und deterministisch`, () => {
    for (const seed of [11, 4242]) {
      const mk = () => new MatchController({ seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', biom: id, maxRounds: 2, gelaende: GELAENDE_BIOME_20, zerstoerung: 5 });
      const m = mk();
      m.start();
      assert.equal(m.gelaende, GELAENDE_BIOME_20);
      assert.equal(m.sonderbiom, id);
      assert.ok(m.erreichbarkeit?.ok, `${id}/${seed}: ${m.erreichbarkeit?.grund}`);
      assert.ok(m.stoffkarte, `${id}/${seed}: Stoffkarte`);
      const stoffe = zaehleStoffe(m.stoffkarte, m.bitmap);
      assert.ok(stoffe.size >= 3, `${id}/${seed}: nur ${stoffe.size} Stoffe`);
      assert.ok([...stoffe.keys()].some(k => stoffByKey(k).id >= BASIS), `${id}/${seed}: kein Biom-Material`);
      const c = buildTerrainForSeed(seed, 'hills', 'landscape', 'autonom', { gelaende: GELAENDE_BIOME_20, zerstoerung: 5, biom: id });
      assert.equal(stoffHash(m.stoffkarte), stoffHash(c.stoffkarte), `${id}/${seed}: Server gegen Client`);
      // Gleicher Seed, zweiter Lauf: derselbe Zustand.
      const m2 = mk();
      m2.start();
      for (let i = 0; i < 120; i += 1) { m.step(); m.consumeEvents(); m2.step(); m2.consumeEvents(); }
      assert.equal(m.stateHash(), m2.stateHash(), `${id}/${seed}: Zustandshash`);
      assert.equal(stoffHash(m.stoffkarte), stoffHash(m2.stoffkarte), `${id}/${seed}: Stoffhash`);
    }
  });
}

test('Die sechs Biome sehen verschieden aus: Stoffkarten, Himmel und Bodenfarben unterscheiden sich', () => {
  const hashes = new Set();
  const boeden = new Set();
  for (const id of NEU) {
    const c = buildTerrainForSeed(4242, 'hills', 'landscape', 'autonom', { gelaende: GELAENDE_BIOME_20, zerstoerung: 5, biom: id });
    hashes.add(stoffHash(c.stoffkarte));
    boeden.add(JSON.stringify(pickScenery(4242, 'hills', id).ground));
    assert.equal(pickScenery(4242, 'hills', id).biomeId, id);
  }
  assert.equal(hashes.size, 6);
  assert.equal(boeden.size, 6);
});

test('Ohne Wahl zieht Fassung 7 über viele Seeds jedes der sechs Biome und baut daraus eine spielbare Karte', () => {
  const gezogen = new Map();
  for (let seed = 1; seed < 3000 && gezogen.size < 6; seed += 1) {
    const id = waehleSonderbiom(seed, null, GELAENDE_BIOME_20);
    if (NEU.includes(id) && !gezogen.has(id)) gezogen.set(id, seed);
  }
  assert.equal(gezogen.size, 6);
  for (const [id, seed] of gezogen) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', maxRounds: 2, gelaende: GELAENDE_BIOME_20, zerstoerung: 5 });
    m.start();
    assert.equal(m.sonderbiom, id, `Seed ${seed}`);
    assert.ok(m.erreichbarkeit?.ok, `${id}/${seed}: ${m.erreichbarkeit?.grund}`);
  }
});

// ----------------------------------------------------------------------------- Kulissen

test('Kulissen: 24 Bilder, alle Dateien vorhanden, jede Zuordnung zeigt auf einen Eintrag, Ragnarök nur im Katalog', () => {
  assert.equal(STIMMUNGEN_NEU.length, 4);
  assert.equal(BACKDROPS_NEU.length, 24);
  const klassisch = new Set(ALL_BACKDROPS.map(b => b.key));
  for (const b of BACKDROPS_NEU) {
    assert.ok(!klassisch.has(b.key), `${b.key}: kollidiert mit dem klassischen Katalog`);
    for (const datei of [b.file, b.fileHoch]) assert.ok(existsSync(resolve(wurzel, 'src/client/assets/backdrops-neu', datei)), `${datei} fehlt`);
    assert.equal(getBackdropNeu(b.biomeId, b.id), b);
    assert.ok(PALETTEN_NEU[b.key], `${b.key}: Bodenfarbe`);
    assert.deepEqual(paletteFor(b).surface, NEUE_BIOME[b.biomeId].ground.surface);
  }
  assert.equal(getBackdropNeu('tiefsee', 'gibtsnicht'), null);
  for (const id of NEU) {
    const liste = SONDER_KULISSEN[id];
    assert.ok(liste && liste.length === 3, `${id}: Kulissen`);
    for (const k of liste) assert.ok(BACKDROPS_NEU.some(b => b.key === k), `${id}: ${k}`);
    assert.ok(!liste.some(k => k.endsWith('/ragnarok')));
    const gesehen = new Set();
    for (let s = 1; s <= 200; s += 1) {
      assert.equal(sonderKulisseFuer(id, s), sonderKulisseFuer(id, s));
      gesehen.add(sonderKulisseFuer(id, s));
    }
    assert.equal(gesehen.size, 3, `${id}: nicht alle Bilder kommen vor`);
  }
});

// ----------------------------------------------------------------------------- Alte Fassungen bleiben Bit für Bit gleich

/** [Fassung, Seed, Biomwahl, Sonderbiom, Zustandshash nach 240 Ticks, Stoffhash] — gemessen auf `main` vor Fassung 7. */
const GOLD_ALT = [
  [1, 11, null, null, '5360c279', null],
  [1, 4242, null, null, '88b6bd9b', null],
  [1, 777, null, null, '8f585dd1', null],
  [2, 11, null, null, '5360c279', 1652390693],
  [2, 4242, null, null, '88b6bd9b', 174116215],
  [2, 777, null, null, '8f585dd1', 1497216855],
  [3, 11, null, null, '5360c279', 1652390693],
  [3, 4242, null, null, '88b6bd9b', 174116215],
  [3, 777, null, null, '8f585dd1', 1497216855],
  [4, 11, null, null, '5360c279', 1652390693],
  [4, 4242, null, null, '88b6bd9b', 174116215],
  [4, 777, null, null, '8f585dd1', 1497216855],
  [5, 11, null, null, '5360c279', 1652390693],
  [5, 4242, null, null, '88b6bd9b', 174116215],
  [5, 777, null, null, '8f585dd1', 1497216855],
  [6, 11, null, null, '872ea1c0', 3407668184],
  [6, 4242, null, null, '944e6ef2', 3835963664],
  [6, 777, null, null, '84f4ea09', 429462079],
  [6, 4242, 'vulkan', 'vulkan', '944e6ef2', 1301965849],
  [6, 4242, 'burg', 'burg', '944e6ef2', 220073291],
  [6, 4242, 'planet', 'planet_stein', '9240bf10', 989170906],
  [6, 4242, 'planet_eis', 'planet_eis', '9ddada57', 3960027304],
  [6, 4242, 'riff', 'riff', '944e6ef2', 1243582813],
  [6, 1, null, 'planet_eis', 'd2f36e65', 2828411522],
  [6, 3, null, 'pilzwald', '9fb05a46', 2136741992],
  [6, 4, null, 'dschungel', '6046cd63', 3121496366],
  [6, 6, null, 'pilzwald', '7df96353', 2686281592],
];

test('Alte Karten: Fassungen 1 bis 6 liefern denselben Zustands- und Stoffhash wie vor Fassung 7 (inkl. von selbst gezogener Sonderbiome)', () => {
  assert.equal(GOLD_ALT.length, 27);
  for (const [g, seed, biom, sonder, hash, stoff] of GOLD_ALT) {
    const m = new MatchController({ seed, teams: 2, playersPerTeam: 2, kartentyp: 'autonom', biom, maxRounds: 2, gelaende: g, zerstoerung: 5 });
    m.start();
    for (let i = 0; i < 240; i += 1) { m.step(); m.consumeEvents(); }
    const kennung = `Fassung ${g}, Seed ${seed}, Biom ${biom}`;
    assert.equal(m.gelaende, g, kennung);
    assert.equal(m.sonderbiom, sonder, kennung);
    assert.equal(m.stateHash(), hash, `${kennung}: Zustandshash`);
    assert.equal(m.stoffkarte ? stoffHash(m.stoffkarte) : null, stoff, `${kennung}: Stoffhash`);
  }
});

/** Spielt live, zeichnet auf, spielt die Aufzeichnung ab (Seed 4242, 2x2, hills, 2400 Ticks). */
function aufzeichnenUndAbspielen(extra) {
  const kopf = { seed: 4242, teams: 2, playersPerTeam: 2, preset: 'hills', maxRounds: 5 };
  const live = new MatchController({ ...kopf, ...extra });
  live.start();
  const rec = new ReplayRecorder({ ...kopf, ...extra, turnDurationMs: live.turnDurationMs, kit: live.kit, schaden: live.schaden, zerstoerung: live.zerstoerung, waffen: live.waffen, kisten: live.kisten });
  let schuesse = 0;
  for (let tick = 0; tick < 2400; tick += 1) {
    if (live.activeProjectileCount === 0 && tick % 120 === 0) {
      const id = live.activePlayerId;
      const winkel = 0.5 + (schuesse % 9) * 0.15;
      const kraft = 40 + ((schuesse * 13) % 50);
      const waffe = live.inventory.getActiveWeaponId(id);
      if (live.fire(id, winkel, kraft, waffe).ok) rec.recordInput({ tick: live.world.tickCount, playerId: id, angle: winkel, power: kraft, weaponId: waffe });
      schuesse += 1;
    }
    live.step();
    live.consumeEvents();
  }
  rec.finalize(live.world.tickCount);
  const json = rec.serialize();
  const spieler = new ReplayPlayer(ReplayRecorder.fromJSON(json));
  while (!spieler.finished) spieler.advance?.() ?? spieler.step?.();
  return { live: live.stateHash(), replay: spieler.match.stateHash(), kopf: JSON.parse(json).config, sonder: live.sonderbiom };
}

test('Alter Replay (Marke 6): Kopf behält die 6, Wiedergabe endet im Goldwert von vor Fassung 7', () => {
  const gold = [
    [{ gelaende: 6 }, '4913d98d', null],
    [{ gelaende: 6, kartentyp: 'autonom', biom: 'vulkan' }, 'c49352ec', 'vulkan'],
    [{ gelaende: 6, kartentyp: 'autonom', biom: 'planet' }, 'bf3659a9', 'planet_stein'],
  ];
  for (const [extra, hash, sonder] of gold) {
    const r = aufzeichnenUndAbspielen(extra);
    assert.equal(r.kopf.gelaende, 6, 'die Marke wird nicht auf 7 angehoben');
    assert.equal(r.sonder, sonder);
    assert.equal(r.live, hash, `${JSON.stringify(extra)}: Live-Hash`);
    assert.equal(r.replay, hash, `${JSON.stringify(extra)}: Wiedergabe-Hash`);
  }
});

test('Neuer Replay (Marke 7): Kopf trägt die 7 und das gewählte Biom, Wiedergabe endet im Live-Hash; Kopf ohne Marke bleibt Fassung 1', () => {
  for (const biom of NEU) {
    const r = aufzeichnenUndAbspielen({ kartentyp: 'autonom', biom });
    assert.equal(r.kopf.gelaende, GELAENDE_BIOME_20, biom);
    assert.equal(r.kopf.biom, biom);
    assert.equal(r.sonder, biom);
    assert.equal(r.replay, r.live, `${biom}: Wiedergabe gegen live`);
  }
  const ohneMarke = aufzeichnenUndAbspielen({ gelaende: 1 });
  assert.equal(ohneMarke.kopf.gelaende, 1);
  assert.equal(ohneMarke.replay, ohneMarke.live);
});

/**
 * Integrationstest: der komplette Ereignisablauf einer Mini-Partie, ohne Browser.
 *
 * Kette: Schuss → Projektil → Einschlag/Explosion → Schaden und Statusänderung (Schadensart-Mali,
 * `config.schaden` Fassung 2) → Terrainreaktion (`terrain_destroyed`) → Übersetzung in Klang und
 * Anzeige durch die reinen Funktionen des Clients.
 *
 * Ergänzt `event-coverage.test.js` (Tabelle vollständig) und `online-einschlag.test.js` (Einschlag
 * lokal = online) um den Lauf an echten Engine-Ereignissen: Zu JEDEM erzeugten Ereignis gibt es
 * eine eindeutige Zuordnung oder einen definierten Fallback (keine Wirkung, kein Wurf).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MatchController } from '../src/engine/match.js';
import { KIT_FLAECHE } from '../src/shared/config/loadouts.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { CHARACTERS } from '../src/shared/config/factions.js';
import { MALUS, ZAHL_FAMILIE, familieVonArt, SCHADEN_STATUS } from '../src/shared/config/schaden.js';
import { klassifiziereEinschlag } from '../src/shared/einschlag.js';
import { EREIGNIS_WIRKUNGEN, verarbeiteLokal } from '../src/client/ereignisse.js';
import { SoundMixer } from '../src/client/soundMixer.js';
import {
  ALLE_PROFILE, SCHUSS_PROFILE, KATEGORIEN, schussProfilFuer, einschlagProfil, mulberry,
} from '../src/client/klangProfile.js';
import { FIGUR_TYPEN, TYP_JE_CHARAKTER, typFuer, parameterFuer } from '../src/client/figurTypen.js';
import { waffenParameter, KATEGORIEN as ANIM_KATEGORIEN } from '../src/client/waffenAnimation.js';

/** Reine Buchführung ohne Anzeige (Begründung: `bewusstStumm` in event-coverage.test.js). */
const OHNE_EINTRAG = ['round_crates', 'turn_end', 'weapon_cooldown'];
const WAFFEN = ['pa_072', 'pa_071', 'pa_070', 'pa_097', 'pa_129'];

/** Mini-Partie: Seed fest, zwei Teams, Kit „Fläche“; Schütze (x 300) und Gegner (x 330) auf ebenem Boden. */
function lauf(waffeId) {
  const match = new MatchController({
    seed: 31337, teams: 2, playersPerTeam: 1, preset: 'open', turnDurationMs: 1_000_000, kit: KIT_FLAECHE,
    schaden: SCHADEN_STATUS, loadouts: [0, 1].map(() => ({ classId: 'scout', archetypeId: 'brawler' })),
  });
  match.start();
  const schuetze = match.activePlayerId;
  const opfer = match.getState().entities.find(e => e.entityId !== schuetze).entityId;
  const boden = match.surfaceYAt(300);
  match.world.setComponent(schuetze, 'Position', 'x', 300);
  match.world.setComponent(schuetze, 'Position', 'y', boden - 12);
  match.world.setComponent(opfer, 'Position', 'x', 330);
  match.world.setComponent(opfer, 'Position', 'y', boden - 12);
  match.world.setComponent(opfer, 'Health', 'max', 1000);
  match.world.setComponent(opfer, 'Health', 'current', 1000);
  match.inventory.grantWeapon(schuetze, waffeId);
  match.inventory.grantAmmo(schuetze, waffeId, 99);
  match.inventory.selectWeapon(schuetze, waffeId);

  const ereignisse = [];
  const sammle = () => { for (const e of match.consumeEvents()) ereignisse.push({ tick: match.world.tickCount, ...e }); };
  sammle();
  assert.ok(match.fire(schuetze, 0.05, 80, waffeId).ok, waffeId);
  for (let g = 0; match.activeProjectileCount > 0 && g < 900; g += 1) { match.step(); sammle(); }
  for (let i = 0; i < 20; i += 1) { match.step(); sammle(); }
  for (let i = 0; i < 6; i += 1) { match.endTurn(); sammle(); }
  return { match, ereignisse, schuetze, opfer, hash: match.stateHash() };
}

const alle = Object.fromEntries(WAFFEN.map(id => [id, lauf(id)]));

test('Die Kette Schuss → Projektil → Einschlag → Schaden → Status ist vorhanden und reihenfolgestabil', () => {
  const { ereignisse } = alle.pa_072;
  const art = ereignisse.map(e => e.type);
  const erster = t => art.indexOf(t);
  for (const t of ['shot', 'projectile_spawn', 'explosion', 'projectile_impact', 'damage', 'terrain_destroyed', 'malus_angewendet']) {
    assert.ok(erster(t) >= 0, `Ereignis ${t} fehlt`);
  }
  assert.ok(erster('shot') < erster('projectile_spawn') && erster('projectile_spawn') < erster('explosion'));
  assert.ok(erster('explosion') < erster('projectile_impact') && erster('explosion') < erster('malus_angewendet'));
  for (const alleEreignisse of Object.values(alle)) {
    const ticks = alleEreignisse.ereignisse.map(e => e.tick);
    assert.deepEqual(ticks, [...ticks].sort((a, b) => a - b), 'Ereignisse sind nach Tick sortiert');
  }
  const brand = ereignisse.find(e => e.type === 'malus_angewendet');
  assert.equal(brand.payload.art, 'brand', 'Feuer setzt den Malus Brand (Schadensart-Mali, Fassung 2)');
  assert.ok(ereignisse.some(e => e.type === 'dot_tick'), 'Der Brand tickt am Zugbeginn');
});

test('Zwei Läufe mit gleichem Seed liefern dieselbe Ereignisfolge und denselben Zustandshash', () => {
  for (const id of WAFFEN) {
    const b = lauf(id);
    assert.equal(b.hash, alle[id].hash, `${id}: Hash`);
    assert.equal(JSON.stringify(b.ereignisse), JSON.stringify(alle[id].ereignisse), `${id}: Ereignisfolge`);
  }
});

test('Zu jedem erzeugten Ereignis gibt es einen Eintrag in der Wirkungstabelle; fremde Arten wirken nicht und werfen nicht', () => {
  const arten = new Set();
  for (const { ereignisse } of Object.values(alle)) for (const e of ereignisse) arten.add(e.type);
  assert.ok(arten.size >= 10, `Die Mini-Partie soll viele Arten abdecken (${arten.size})`);
  const ohneEintrag = [...arten].filter(art => !Object.hasOwn(EREIGNIS_WIRKUNGEN, art)).sort();
  assert.deepEqual(ohneEintrag, OHNE_EINTRAG, 'nur die in event-coverage.test.js begründeten Arten haben keinen Eintrag');
  const k = kontext();
  assert.doesNotThrow(() => verarbeiteLokal(k.k, { type: 'gibt_es_nicht', payload: {} }));
  assert.doesNotThrow(() => verarbeiteLokal(k.k, { type: undefined, payload: undefined }));
  assert.equal(k.log.length, 0, 'Fallback: keine Wirkung');
});

/** Kontext mit echtem Mischer (Attrappen-AudioContext) und mitschreibendem Renderer. */
function kontext() {
  const log = [];
  const knoten = () => ({
    connect: z => z, disconnect() {}, start() {}, stop() {},
    frequency: param(), gain: param(), Q: { value: 0 }, threshold: { value: 0 }, ratio: { value: 0 },
    knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, pan: { value: 0 },
  });
  function param() {
    return {
      value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; }, cancelScheduledValues() { return this; },
    };
  }
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: knoten(), resume: async () => {},
    createBuffer: (c, l, r) => ({ duration: l / r, length: l, getChannelData: () => new Float32Array(l) }),
    createBufferSource: knoten, createBiquadFilter: knoten, createGain: knoten, createOscillator: knoten,
    createDynamicsCompressor: knoten, createStereoPanner: knoten, createWaveShaper: knoten, createConvolver: knoten,
  };
  let t = 0;
  const sound = new SoundMixer({ an: true, ctxBauer: () => ctx, uhr: () => (t += 1000), zufall: mulberry(1) });
  const k = {
    renderer: new Proxy({}, { get: (_, name) => (...a) => log.push(['renderer', String(name), a]) }),
    sound,
    karte: null,
    hud: { log() {} },
    material: () => 'erde',
    figurNah: () => false,
    nameOf: () => 'P',
    findEntity: () => null,
    shotPredictor: { resolve() {} },
    drawHitscanBeam() {},
    logSpecialEffect() {},
    showGuentherWheel() {},
    showEndScreen() {},
    fernzustand: { status: () => 'playing', setzeStatus() {}, setzeSieger() {}, setzeEinschnitt() {} },
    match: { players: [] },
  };
  return { k, log, sound };
}

test('Einschlag, Krater und Selbstschaden kommen genau einmal in Klang und Anzeige an', async () => {
  const { match, ereignisse } = alle.pa_072;
  const { k, log, sound } = kontext();
  await sound.starte();
  for (const e of ereignisse) verarbeiteLokal(k, { type: e.type, payload: e.payload });

  const explosionen = ereignisse.filter(e => e.type === 'explosion');
  const krater = ereignisse.filter(e => e.type === 'terrain_destroyed');
  // Krater aus `explosion` und aus `terrain_destroyed`: je ein Aufruf, den Doppelabtrag fängt der Renderer ab.
  assert.equal(log.filter(z => z[1] === 'applyCrater').length, explosionen.length + krater.length);
  assert.ok(krater.length >= 1);

  for (const e of explosionen) {
    const { x, y, radius, material } = e.payload;
    assert.equal(klassifiziereEinschlag(match.terrain, match.water, x, y, { biomId: match.biomId }), material,
      'Klassifikation der Engine = reine Funktion des Clients');
    assert.ok(ALLE_PROFILE[einschlagProfil({ radius, material })], 'Einschlagprofil vorhanden');
  }
  const z = sound.zustand;
  assert.equal(z.gespielt.explosion + z.gespielt.einschlag + z.gespielt.wasser, explosionen.length, 'ein Klang je Einschlag');

  // Selbstschaden (Quelle = Ziel): `treffer_selbst` landet im Klangzähler. Der Schütze steht im Feuer.
  const selbst = ereignisse.filter(e => e.type === 'damage' && e.payload.selfDamage === true);
  assert.ok(selbst.length >= 1, 'Vorbedingung: Selbstschaden entstanden');
  assert.equal(z.profile.treffer_selbst, selbst.length);
  assert.equal(z.gespielt.treffer, selbst.length, 'gewöhnliche Treffer klingen über den Schuss, nicht doppelt');
  // Krit: Die Engine setzt `isCritical` nie auf true (kein Signal) — also kein `treffer_krit`. Bewusst nicht erfunden.
  assert.ok(ereignisse.filter(e => e.type === 'damage').every(e => e.payload.isCritical === false));
  assert.equal(z.profile.treffer_krit ?? 0, 0);
});

test('Schadensart und Mali haben Farbe, Symbol und Zahlfamilie; jeder erzeugte Malus ist bekannt', () => {
  const arten = new Set();
  for (const { ereignisse } of Object.values(alle)) {
    for (const e of ereignisse) {
      if (e.type === 'damage' && e.payload.damageTypeName) {
        const fam = familieVonArt(e.payload.damageTypeName);
        assert.ok(ZAHL_FAMILIE[fam], `${e.payload.damageTypeName}: Familie ${fam}`);
      }
      if (e.type === 'malus_angewendet') arten.add(e.payload.art);
    }
  }
  assert.ok(arten.size >= 1);
  for (const a of arten) {
    assert.ok(MALUS[a]?.symbol && MALUS[a]?.farbe && MALUS[a]?.label, `Malus ${a}`);
    assert.ok(ZAHL_FAMILIE[familieVonArt(MALUS[a].schadensart)], `Malus ${a}: Zahlfamilie`);
  }
  assert.equal(familieVonArt('unbekannt'), 'koerper', 'Fallback der Zahlfamilie');
});

test('Waffe → Klangprofil und Animationsparameter: eindeutig, mit definiertem Fallback', () => {
  for (const w of WEAPONS) {
    assert.ok(SCHUSS_PROFILE[schussProfilFuer(w)], `${w.id}: Schussprofil`);
    assert.ok(ANIM_KATEGORIEN.includes(w.category) && KATEGORIEN.includes(w.category), `${w.id}: Kategorie ${w.category}`);
    assert.ok(waffenParameter(w.category), `${w.id}: Animationsparameter`);
  }
  assert.equal(schussProfilFuer(null), 'pistole', 'Fallback Schussprofil');
  assert.deepEqual(waffenParameter('gibt_es_nicht'), waffenParameter('ranged'), 'Fallback Animationsparameter');
});

test('Figuren: jede Fraktionsfigur hat einen Typ und Parameter, unbekannte fallen auf humanoid', () => {
  for (const c of CHARACTERS) {
    assert.ok(Object.hasOwn(TYP_JE_CHARAKTER, c.id), `${c.id}: Typ fehlt`);
    assert.ok(FIGUR_TYPEN.includes(typFuer(c.id)), c.id);
    assert.ok(parameterFuer(c.id), c.id);
  }
  assert.equal(typFuer('gibt_es_nicht'), 'humanoid');
});

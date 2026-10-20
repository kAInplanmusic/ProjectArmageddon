/**
 * Tests: Einschlagklang nach Schadensart, Profil für `crate_pickup_blocked`.
 * Die Zuordnung ist eine reine Funktion in `shared/einschlag.js` (lokal und online dieselbe).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SoundMixer } from '../src/client/soundMixer.js';
import { ALLE_PROFILE, KLANG_ARTEN, einschlagProfil, mulberry } from '../src/client/klangProfile.js';
import { klassifiziereSchadensklang, KLANG_ART_VON_SCHADENSART } from '../src/shared/einschlag.js';
import { MALUS } from '../src/shared/config/schaden.js';
import { DAMAGE_TYPE_IDS } from '../src/engine/damageTypes.js';
import { EREIGNIS_KATALOG } from '../src/shared/ereigniskatalog.js';

test('klassifiziereSchadensklang: Feuer, Gift, Eis, Säure, Elektro; sonst null', () => {
  assert.equal(klassifiziereSchadensklang('fire'), 'feuer');
  assert.equal(klassifiziereSchadensklang('poison'), 'gift');
  assert.equal(klassifiziereSchadensklang('ice'), 'eis');
  assert.equal(klassifiziereSchadensklang('acid'), 'saeure');
  assert.equal(klassifiziereSchadensklang('electric'), 'elektro');
  for (const n of ['physical', 'explosive', 'impact', 'arcane', 'water', undefined, null, 'gibtsnicht']) {
    assert.equal(klassifiziereSchadensklang(n), null, String(n));
  }
});

test('Jede Schadensart, die einen Malus auslöst (config.schaden), hat eine Klangfarbe — und nur echte Arten', () => {
  for (const [schluessel, m] of Object.entries(MALUS)) {
    if (['fluch', 'nass'].includes(schluessel)) continue; // Schatten und Wasser behalten den Grundklang
    assert.ok(klassifiziereSchadensklang(m.schadensart), `${schluessel} (${m.schadensart}) ohne Klangfarbe`);
  }
  for (const art of Object.keys(KLANG_ART_VON_SCHADENSART)) assert.ok(DAMAGE_TYPE_IDS.includes(art), art);
});

test('einschlagProfil: Art färbt den Klang; Wasser hat Vorrang; ohne Art alles wie bisher', () => {
  for (const art of KLANG_ARTEN) {
    for (const radius of [0, 20, 40, 60, 90]) {
      const name = einschlagProfil({ radius, material: 'erde', art });
      assert.match(name, new RegExp(`^explosion_${art}_(klein|mittel|gross)$`));
      assert.ok(ALLE_PROFILE[name], name);
    }
    assert.equal(einschlagProfil({ radius: 40, material: 'wasser', art }), 'platscher_klein');
  }
  assert.equal(einschlagProfil({ radius: 40, material: 'erde', art: null }), 'explosion_mittel');
  assert.equal(einschlagProfil({ radius: 0, material: 'fels' }), 'einschlag_fels');
  assert.equal(einschlagProfil({ radius: 40, material: 'erde', art: 'unbekannt' }), 'explosion_mittel');
});

test('Der Mischer spielt das Artprofil aus dem Ereignis (Einschlag mit und ohne Sprengsatz)', async () => {
  const param = () => ({ value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, cancelScheduledValues() { return this; } });
  const kn = () => ({ connect: x => x, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: { value: 0 }, threshold: { value: 0 }, ratio: { value: 0 }, knee: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, pan: { value: 0 } });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: kn(), resume: async () => {},
    createBuffer: (c, l, r) => ({ duration: l / r, length: l, getChannelData: () => new Float32Array(l) }),
    createBufferSource: kn, createBiquadFilter: kn, createGain: kn, createOscillator: kn,
    createDynamicsCompressor: kn, createStereoPanner: kn, createWaveShaper: kn, createConvolver: kn,
  };
  let t = 0;
  const m = new SoundMixer({ an: true, ctxBauer: () => ctx, uhr: () => t, zufall: mulberry(1) });
  await m.starte();
  m.verarbeite({ type: 'explosion', radius: 60, sprengradius: 60, material: 'erde', art: 'feuer', x: 10, y: 10 });
  assert.equal(m.zustand.letzte.profil, 'explosion_feuer_gross');
  t += 5;
  m.verarbeite({ type: 'explosion', radius: 12, sprengradius: 0, material: 'erde', art: 'eis', x: 10, y: 10 });
  assert.equal(m.zustand.letzte.profil, 'explosion_eis_klein');
  t += 5;
  m.verarbeite({ type: 'explosion', radius: 40, sprengradius: 40, material: 'erde', x: 10, y: 10 });
  assert.equal(m.zustand.letzte.profil, 'explosion_mittel');
  t += 5;
  m.verarbeite({ type: 'kiste_voll', x: 1, y: 1 });
  assert.equal(m.zustand.letzte.profil, 'kiste_voll');
});

test('crate_pickup_blocked hat im Ereigniskatalog den Klang kiste_voll; das Profil ist vorhanden', () => {
  assert.deepEqual(EREIGNIS_KATALOG.crate_pickup_blocked.klang, ['kiste_voll']);
  assert.equal(ALLE_PROFILE.kiste_voll.bus, 'ui');
});

test('kammArt: Bewuchs der fernen Hügel folgt dem Biom (keine Palmen im Asteroidenfeld)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/client/sceneryPainter.js', import.meta.url), 'utf8');
  assert.match(src, /KAMM_ZACKEN = new Set\(\[[^\]]*'kosmos'/);
  assert.match(src, /KAMM_MASTEN = new Set\(\[[^\]]*'fabrik'/);
});

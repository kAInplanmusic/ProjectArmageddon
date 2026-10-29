/**
 * Tests: Schadensarten der Waffen nach der Artendurchsicht (2026-10-28).
 *
 * Befund und Maßnahmen: `docs/audit-waffen-2026-10-28.md`, Abschnitt C. Gesichert wird:
 *  - kein Katalogeintrag trägt den stillgelegten Alias `temporal` (er heißt `time`);
 *  - Alias und gültige Art sind in Familie und Regel gleich geregelt (kein Auseinanderlaufen);
 *  - der tote Schlüssel `plasma` ist aus den Wirkgruppen verschwunden;
 *  - bekannte Waffen tragen die zu ihnen passende Art;
 *  - die Waffenfassungen 1 bis 4 behalten die alten Arten (AGENTS.md §2), Fassung 5 hat die neuen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPONS_BY_ID } from '../src/shared/config/weapons.js';
import {
  DAMAGE_TYPE_IDS, DAMAGE_TYPE_ALIASES, canonicalDamageType, damageTypeId, isKnownDamageType,
} from '../src/engine/damageTypes.js';
import { ART_REGEL, FAMILIE_VON_ART, familieVonArt } from '../src/shared/config/schaden.js';
import { wirkgruppe } from '../src/shared/config/stoffe.js';
import {
  getWaffe, ARTEN_BIS_F4, WAFFEN_ALT, WAFFEN_BALANCE, WAFFEN_KORREKTUR, WAFFEN_FEIN, WAFFEN_FAIR,
} from '../src/shared/config/waffen-fassung.js';

test('Kein Katalogeintrag trägt einen stillgelegten Alias', () => {
  for (const w of WEAPONS) {
    assert.equal(canonicalDamageType(w.damageType), w.damageType,
      `${w.id} ${w.displayName}: "${w.damageType}" ist ein Alias von "${canonicalDamageType(w.damageType)}"`);
  }
});

test('Der Alias temporal ist wie time geregelt und bleibt im Zahlenindex belegt', () => {
  assert.deepEqual(DAMAGE_TYPE_ALIASES, { temporal: 'time' });
  assert.ok(isKnownDamageType('temporal'), 'die Kennung 21 bleibt belegt (nur anhängen, nie umordnen)');
  assert.equal(damageTypeId('temporal'), 21);
  assert.equal(familieVonArt('temporal'), familieVonArt('time'));
  assert.equal(FAMILIE_VON_ART.temporal, FAMILIE_VON_ART.time);
  assert.deepEqual(ART_REGEL.temporal, ART_REGEL.time, 'Alias und Art müssen gleich geregelt sein');
});

test('Jede Schadensart des Motors hat Familie und Regel (kein Schlüssel ohne Art)', () => {
  for (const art of DAMAGE_TYPE_IDS) {
    assert.ok(FAMILIE_VON_ART[art], `${art}: keine Familie`);
    assert.ok(ART_REGEL[art], `${art}: keine Regel`);
  }
  for (const art of Object.keys(FAMILIE_VON_ART)) assert.ok(DAMAGE_TYPE_IDS.includes(art), `Familie für unbekannte Art ${art}`);
  for (const art of Object.keys(ART_REGEL)) assert.ok(DAMAGE_TYPE_IDS.includes(art), `Regel für unbekannte Art ${art}`);
});

test('Der tote Schlüssel plasma wirkt nicht mehr als Hitze (keine Art des Motors)', () => {
  assert.ok(!isKnownDamageType('plasma'));
  assert.equal(wirkgruppe('plasma'), 'wucht');
  assert.equal(wirkgruppe('energy'), 'hitze');
  assert.equal(wirkgruppe('fire'), 'hitze');
});

test('Waffe und Schadensart passen zusammen (Stichproben aus allen Gruppen)', () => {
  const erwartet = {
    Feuerfaust: 'fire', Eispickel: 'ice', Fackel: 'fire', Flammenwerfer: 'fire', Molotowcocktail: 'fire',
    Eisschlag: 'ice', Eisschild: 'ice', Wasserwerfer: 'water', Giftwolke: 'poison', Säurekanone: 'acid',
    Tesla: 'electric', Impulsbombe: 'electric', Magnetkanone: 'magnetic', Plasmawerfer: 'energy',
    Energiefaust: 'energy', Raketenwerfer: 'explosive', Salvengeber: 'explosive', Handgranate: 'explosive',
    Haubitze: 'explosive', Luftangriff: 'explosive', Meteorregen: 'impact', Erdspalter: 'impact',
    Runenschwert: 'arcane', Zauberbolzen: 'arcane', Astralkugel: 'astral', Glutelixier: 'astral',
    Astralkrieger: 'astral', Frostsanduhr: 'time', Endlosschleife: 'time', Portalring: 'spatial',
    Dimensionssprung: 'spatial', Raketenrucksack: 'utility', Düsenrucksack: 'utility',
    Gleitschirm: 'utility', Enterhaken: 'utility', Bunker: 'defense', Heilzauber: 'holy',
    Heilspritze: 'medical', Giftbaum: 'nature', Tornado: 'wind', Weltendrache: 'dragon',
    Baseballschläger: 'physical', Katana: 'physical', Schrotflinte: 'physical',
  };
  for (const [name, art] of Object.entries(erwartet)) {
    const w = WEAPONS.find(x => x.displayName === name || x.displayName === `${name}-Turm`);
    assert.ok(w, `Vorbedingung: "${name}" existiert`);
    assert.equal(w.damageType, art, `${name}: erwartet ${art}, ist ${w.damageType}`);
  }
});

test('Fluggeräte, Teleporter und Schutz richten keinen Schaden an und tragen eine Selbstwirkungs-Art', () => {
  const selbst = new Set(['utility', 'defense', 'medical', 'spatial', 'holy', 'time', 'nature', 'astral', 'arcane', 'chaos', 'dark', 'ice']);
  for (const w of WEAPONS.filter(x => x.damage === 0)) {
    assert.ok(selbst.has(w.damageType), `${w.id} ${w.displayName}: Art ${w.damageType} für eine Waffe ohne Schaden`);
  }
});

test('Waffenfassungen 1 bis 4 behalten die alten Arten, Fassung 5 liest die neuen (AGENTS.md §2)', () => {
  assert.deepEqual(Object.keys(ARTEN_BIS_F4).sort(), ['pa_032', 'pa_041', 'pa_084', 'pa_122']);
  for (const [id, alt] of Object.entries(ARTEN_BIS_F4)) {
    assert.notEqual(WEAPONS_BY_ID[id].damageType, alt.damageType, `${id}: Katalog trägt noch die alte Art`);
    for (const fassung of [WAFFEN_ALT, WAFFEN_BALANCE, WAFFEN_KORREKTUR, WAFFEN_FEIN]) {
      assert.equal(getWaffe(id, fassung).damageType, alt.damageType, `${id} Fassung ${fassung}`);
    }
    assert.equal(getWaffe(id, WAFFEN_FAIR).damageType, WEAPONS_BY_ID[id].damageType, `${id} Fassung 5`);
  }
  // Sonst bleiben die Fassungen unberührt (gleiche Instanz, wenn nichts zu überlagern ist).
  assert.equal(getWaffe('pa_028', WAFFEN_FEIN), WEAPONS_BY_ID.pa_028);
  assert.equal(getWaffe('pa_028', WAFFEN_ALT).damageType, WEAPONS_BY_ID.pa_028.damageType);
  // Fassung 4 trägt von Fassung 3 weiterhin keine Werte (nur die Art wird überlagert).
  // (Katalog: Spielwert 48 der Fassung 5 seit der Auslese; Fassung 4 sieht den Altwert 22 aus `WAFFEN_F4_WERTE`.)
  assert.equal(getWaffe('pa_041', WAFFEN_FEIN).damage, 22);
});

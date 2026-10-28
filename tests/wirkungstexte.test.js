/**
 * Tests: deutsche Bezeichnungen und Erklärtexte für Schadensarten, Wirkungen, Mali und Zustandsmarken
 * (`src/shared/config/wirkungstexte.js`) und die Hilfeseite „Schaden und Wirkungen".
 *
 * Gesichert wird, dass die Texte VOLLSTÄNDIG gegen den Motor sind (jede Schadensart, jede Wirkungsart,
 * jeder Malus hat einen Text), dass sie keine Zahlen nennen (Spielwerte stehen in den Configs) und dass
 * die Hilfeseite jede Schadensart genau einmal zeigt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE_TYPE_IDS, DAMAGE_TYPE_ALIASES } from '../src/engine/damageTypes.js';
import { EFFECT_KIND, SPECIAL_EFFECTS } from '../src/engine/specials.js';
import { MALUS_SCHLUESSEL, FAMILIE_VON_ART } from '../src/shared/config/schaden.js';
import {
  ART_TEXT, WIRKUNG_TEXT, MALUS_TEXT, STATUS_TEXT, FAMILIE_LABEL,
  artLabel, artText, wirkungLabel, wirkungText, statusTooltip,
} from '../src/shared/config/wirkungstexte.js';
import { baueWirkungsSeite } from '../src/client/hilfeWirkungen.js';
import { WEAPONS } from '../src/shared/config/weapons.js';

const alleTexte = () => [
  ...Object.values(ART_TEXT).flatMap(e => [e.label, e.text]),
  ...Object.values(WIRKUNG_TEXT).flatMap(e => [e.label, e.text]),
  ...Object.values(STATUS_TEXT).flatMap(e => [e.label, e.text]),
  ...Object.values(FAMILIE_LABEL),
  ...Object.values(MALUS_TEXT),
];

test('Jede Schadensart des Motors hat Bezeichnung und Erklärung (und nur diese)', () => {
  assert.deepEqual(Object.keys(ART_TEXT).sort(), [...DAMAGE_TYPE_IDS].sort());
  for (const art of DAMAGE_TYPE_IDS) {
    assert.ok(ART_TEXT[art].label.length >= 3, art);
    assert.ok(ART_TEXT[art].text.endsWith('.'), `${art}: Satz endet ohne Punkt`);
  }
  // Der Alias heißt wie seine gültige Art.
  for (const [alt, gueltig] of Object.entries(DAMAGE_TYPE_ALIASES)) assert.equal(ART_TEXT[alt].label, ART_TEXT[gueltig].label);
});

test('Jede Wirkungsart, die eine Waffe auslösen kann, hat einen deutschen Namen', () => {
  const arten = new Set([...Object.values(EFFECT_KIND), ...Object.values(SPECIAL_EFFECTS).map(e => e.kind)]);
  for (const kind of arten) assert.ok(WIRKUNG_TEXT[kind], `Wirkung ${kind} ohne Text — das Protokoll zeigte sonst den Schlüssel`);
  for (const kind of Object.keys(WIRKUNG_TEXT)) assert.ok(arten.has(kind), `Text für unbekannte Wirkung ${kind}`);
  assert.equal(wirkungLabel('turret'), 'Geschütz');
  assert.equal(wirkungLabel('gibtsnicht'), 'Wirkung');
});

test('Jeder Malus und jede Zustandsmarke hat einen Text; Familien sind beschriftet', () => {
  assert.deepEqual(Object.keys(MALUS_TEXT).sort(), [...MALUS_SCHLUESSEL].sort());
  assert.deepEqual(Object.keys(FAMILIE_LABEL).sort(), [...new Set(Object.values(FAMILIE_VON_ART))].sort());
  assert.deepEqual(Object.keys(STATUS_TEXT).sort(), ['boost', 'dots', 'frozen', 'shield']);
  assert.match(statusTooltip('shield'), /^Schild: /);
  assert.equal(statusTooltip('gibtsnicht'), '');
});

test('Die Erklärtexte nennen keine Zahlen (Spielwerte stehen in den Configs)', () => {
  for (const t of alleTexte()) assert.doesNotMatch(t, /\d/, `Zahl im Text: ${t}`);
  for (const w of WEAPONS) assert.doesNotMatch(w.description, /\d/);
});

test('Hilfeseite: jede Schadensart genau einmal (Alias nicht), alle Mali und Wirkungen', () => {
  const seite = baueWirkungsSeite();
  const arten = seite.familien.flatMap(f => f.arten.map(a => a.art));
  assert.equal(new Set(arten).size, arten.length, 'Art doppelt');
  assert.deepEqual([...arten].sort(), DAMAGE_TYPE_IDS.filter(a => !DAMAGE_TYPE_ALIASES[a]).sort());
  for (const f of seite.familien) for (const a of f.arten) assert.equal(FAMILIE_VON_ART[a.art], f.schluessel);
  assert.equal(seite.mali.length, MALUS_SCHLUESSEL.length);
  assert.equal(seite.wirkungen.length, Object.keys(WIRKUNG_TEXT).length);
  assert.equal(seite.status.length, 4);
  assert.equal(artLabel('fire'), 'Feuer');
  assert.equal(artLabel('unbekannt'), 'unbekannt');
  assert.equal(artText('unbekannt'), '');
  assert.equal(wirkungText('heal'), WIRKUNG_TEXT.heal.text);
});

/**
 * Tests: Beschreibungstexte der 150 Waffen (Auftrag „Beschreibungen", 2026-10-28).
 *
 * Form: ein Satz, ohne Zahlen (Spielwerte stehen im Katalog, ein Wert im Text wäre eine zweite
 * Quelle). Inhalt: nur, was Katalog und Motor wirklich tun. Die Gegenproben unten prüfen, dass der Text
 * zu den DATEN der Waffe passt (Wirkungsart aus `SPECIAL_EFFECTS`, Schadensart, Sichtlinie, Anflug,
 * Zünder, Zielsuche, Durchschlag), damit ein Text nichts verspricht, was die Waffe nicht hat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { effectFor, EFFECT_KIND } from '../src/engine/specials.js';

test('Jede Waffe hat eine eigene Beschreibung: ein Satz, ohne Zahlen', () => {
  const gesehen = new Map();
  for (const w of WEAPONS) {
    const t = w.description;
    assert.equal(typeof t, 'string', `${w.id} ${w.displayName}: keine Beschreibung`);
    assert.ok(t.length >= 15 && t.length <= 110, `${w.id} ${w.displayName}: ${t.length} Zeichen`);
    assert.match(t, /^[A-ZÄÖÜ]/, `${w.id}: beginnt nicht mit einem Großbuchstaben`);
    assert.ok(t.endsWith('.'), `${w.id}: endet nicht mit einem Punkt`);
    assert.equal((t.match(/[.!?]/g) ?? []).length, 1, `${w.id}: mehr als ein Satz: ${t}`);
    assert.doesNotMatch(t, /\d/, `${w.id} ${w.displayName}: Zahl im Text: ${t}`);
    assert.equal(t, t.trim(), `${w.id}: Leerraum am Rand`);
    assert.ok(!gesehen.has(t), `${w.id} und ${gesehen.get(t)} haben denselben Text`);
    gesehen.set(t, w.id);
  }
});

test('Der Text nennt die Wirkung, die der Motor der Waffe zuordnet', () => {
  const erwartet = new Map([
    [EFFECT_KIND.HEAL, /heil/i],
    [EFFECT_KIND.SHIELD, /Schild/],
    [EFFECT_KIND.DAMAGE_BOOST, /verstärk/i],
    [EFFECT_KIND.ARMOR, /mindert/],
    [EFFECT_KIND.AMMO, /Munition/],
    [EFFECT_KIND.MOVE, /versetz|springt|Sprung/],
    [EFFECT_KIND.MOUNT, /trägt/],
    [EFFECT_KIND.PULL, /anzieh|heranzieh/],
    [EFFECT_KIND.TURRET, /Geschütz|Krieger/],
    [EFFECT_KIND.FREEZE, /einfrier|betäub|aussetz/],
    [EFFECT_KIND.CHAIN, /überspring/],
    [EFFECT_KIND.DRILL, /Tunnel/],
    [EFFECT_KIND.WATER_PUSH, /Wasser/],
    [EFFECT_KIND.RANDOM, /zufällig/],
    [EFFECT_KIND.REVEAL, /aufgedeckt/],
  ]);
  let geprueft = 0;
  for (const w of WEAPONS) {
    const e = effectFor(w.special);
    const muster = e && erwartet.get(e.kind);
    if (!muster) continue;
    assert.match(w.description, muster, `${w.id} ${w.displayName} (${e.kind}): ${w.description}`);
    geprueft += 1;
  }
  assert.ok(geprueft >= 50, `nur ${geprueft} Waffen mit Wirkung geprüft`);
});

test('Der Text passt zur Schadensart und zu den Flugdaten der Waffe', () => {
  const art = {
    fire: /Brand|brenn|Feuer|Flamm|Lava|sengt/i,
    dragon: /Brand|Feuer|sengt/i,
    poison: /vergift|Gift/i,
    acid: /Säure/,
    ice: /Eis|einfrier|eisig/i,
    water: /Wasser|nass/i,
  };
  for (const w of WEAPONS) {
    if (art[w.damageType]) assert.match(w.description, art[w.damageType], `${w.id} ${w.displayName} (${w.damageType}): ${w.description}`);
    if (w.requiresLineOfSight) assert.match(w.description, /Sicht/, `${w.id}: verlangt Sichtlinie, Text schweigt: ${w.description}`);
    else assert.doesNotMatch(w.description, /Sicht/, `${w.id}: Text verlangt Sicht, die Waffe nicht: ${w.description}`);
    if (w.strikeStyle === 'sky') assert.match(w.description, /von oben/, `${w.id}: Anflug von oben fehlt`);
    if (w.strikeStyle === 'flank') assert.match(w.description, /Seite/, `${w.id}: Anflug von der Seite fehlt`);
    if (w.fuseTime > 0) assert.match(w.description, /Verzögerung|Zünder/, `${w.id}: Zünder fehlt: ${w.description}`);
    if (w.homing > 0) assert.match(w.description, /verfolgt|lenkbar/, `${w.id}: Zielsuche fehlt`);
    if (w.piercing > 0) assert.match(w.description, /durchschl/, `${w.id}: Durchschlag fehlt`);
  }
});

test('Waffen ohne Schaden versprechen keinen Treffer', () => {
  for (const w of WEAPONS.filter(x => x.damage === 0)) {
    assert.doesNotMatch(w.description, /trifft|Treffer|Schaden richtet|zerreißt/i, `${w.id} ${w.displayName}: ${w.description}`);
  }
});

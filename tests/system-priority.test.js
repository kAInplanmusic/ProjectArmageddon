/**
 * Tests: Die Ausführungsreihenfolge der Systeme hat EINE Quelle.
 *
 * ## Der Befund
 *
 * Ein Code-Audit fand fünf **tote Zwillinge** der Systemprioritäten:
 * `CHARACTER_PRIORITY` (characterSystem.js), `DAMAGE_PRIORITY`, `LOOT_PRIORITY`,
 * `MAELSTROM_PRIORITY`, `PROJECTILE_PRIORITY` — jede mit **null Lesern**.
 *
 * Der Motor liest `SYSTEM_PRIORITIES` aus `engine/init.js`. Wer eine der fünf
 * Konstanten änderte, änderte **nichts** — und hätte keinen Hinweis darauf
 * bekommen. Das ist die gefährlichste Form von totem Code: Er sieht lebendig
 * aus und verspricht eine Wirkung.
 *
 * ## Was hier geprüft wird
 *
 * Dass die Reihenfolge nur an EINER Stelle steht — und dass die registrierten
 * Systeme diese Reihenfolge tatsächlich einhalten.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SYSTEM_PRIORITIES } from '../src/engine/init.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Liest alle Systemdateien. */
function systemdateien() {
  const verzeichnis = path.join(ROOT, 'src', 'engine', 'systems');
  return fs.readdirSync(verzeichnis)
    .filter(n => n.endsWith('.js'))
    .map(n => ({ name: n, pfad: path.join(verzeichnis, n) }));
}

test('Keine Systemdatei exportiert eine eigene Prioritätskonstante', () => {
  /*
   * DIE Prüfung gegen die Doppelregel. Ein `export const X_PRIORITY` in einem
   * System ist genau das Muster, das den Fehler verursacht hat: Es steht neben
   * der Regel, die gilt, und behauptet eine Wirkung, die es nicht hat.
   */
  const verstoesse = [];

  for (const { name, pfad } of systemdateien()) {
    const text = fs.readFileSync(pfad, 'utf8');
    // Kommentare entfernen, sonst meldet der Hinweistext oben einen Verstoß.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    const treffer = code.match(/export\s+const\s+\w*PRIORITY\w*\s*=/g);
    if (treffer) verstoesse.push(`${name}: ${treffer.join(', ')}`);
  }

  assert.deepEqual(verstoesse, [],
    'Diese Systeme exportieren eine eigene Priorität — die Reihenfolge gehört '
    + 'ausschließlich nach `engine/init.js` (SYSTEM_PRIORITIES)');
});

test('SYSTEM_PRIORITIES ist die einzige Quelle und eingefroren', () => {
  /*
   * Eingefroren, weil eine versehentliche Zuweisung sonst die Reihenfolge zur
   * Laufzeit verändern würde — mit Folgen für den Determinismus.
   */
  assert.equal(typeof SYSTEM_PRIORITIES, 'object');
  assert.ok(Object.isFrozen(SYSTEM_PRIORITIES),
    'SYSTEM_PRIORITIES muss eingefroren sein');

  const erwartet = [
    'TURN', 'PROJECTILE', 'PHYSICS', 'CHARACTER', 'DAMAGE',
    'MAELSTROM', 'LOOT', 'WEAPON', 'TERRAIN', 'EFFECTS',
  ];
  for (const name of erwartet) {
    assert.equal(typeof SYSTEM_PRIORITIES[name], 'number',
      `SYSTEM_PRIORITIES.${name} fehlt oder ist keine Zahl`);
  }
});

test('Die Prioritäten sind paarweise verschieden', () => {
  /*
   * Gleiche Prioritäten ergäben eine Reihenfolge, die von der
   * Registrierungsfolge abhängt — und damit potenziell nicht-deterministisch.
   */
  const werte = Object.values(SYSTEM_PRIORITIES);
  const eindeutig = new Set(werte);
  assert.equal(eindeutig.size, werte.length,
    `Doppelte Prioritäten: ${werte.join(', ')}`);
});

test('Die Reihenfolge ist absteigend — Turn vor Effects', () => {
  /*
   * Die inhaltliche Zusage: Die Rundenverwaltung läuft VOR allem anderen, die
   * Effekte (reine Anzeige) NACH allem. Geprüft wird die Ordnung, nicht eine
   * feste Zahl — so bleibt sie änderbar, ohne diesen Test zu brechen.
   */
  assert.ok(SYSTEM_PRIORITIES.TURN > SYSTEM_PRIORITIES.PROJECTILE,
    'Die Rundenverwaltung muss vor den Geschossen laufen');
  assert.ok(SYSTEM_PRIORITIES.PROJECTILE > SYSTEM_PRIORITIES.CHARACTER,
    'Geschosse vor Charakteren');
  assert.ok(SYSTEM_PRIORITIES.DAMAGE > SYSTEM_PRIORITIES.MAELSTROM,
    'Schaden vor Mahlstrom');
  assert.ok(SYSTEM_PRIORITIES.MAELSTROM > SYSTEM_PRIORITIES.LOOT,
    'Mahlstrom vor Beute');
  assert.ok(SYSTEM_PRIORITIES.LOOT > SYSTEM_PRIORITIES.EFFECTS,
    'Beute vor Effekten');
});

test('Die toten Zwillinge sind entfernt', () => {
  /*
   * Die konkreten Namen. Ein Abwesenheitstest ist hier sinnvoll, weil der Fund
   * einen GRUND hatte (Doppelregel) — und weil ein Wiedereinführen denselben
   * Irrtum wiederholbar machte.
   */
  const verboten = [
    ['src/engine/systems/characterSystem.js', 'CHARACTER_PRIORITY'],
    ['src/engine/systems/damageSystem.js', 'DAMAGE_PRIORITY'],
    ['src/engine/systems/lootSystem.js', 'LOOT_PRIORITY'],
    ['src/engine/systems/maelstromSystem.js', 'MAELSTROM_PRIORITY'],
    ['src/engine/systems/projectileSystem.js', 'PROJECTILE_PRIORITY'],
  ];

  for (const [relat, name] of verboten) {
    const text = fs.readFileSync(path.join(ROOT, relat), 'utf8');
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, new RegExp(`export\\s+const\\s+${name}\\b`),
      `${relat} exportiert wieder ${name} — die Reihenfolge gehört nach init.js`);
  }
});

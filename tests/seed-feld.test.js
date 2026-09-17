/**
 * Tests: Das Seed-Feld erklärt sich selbst.
 *
 * ## Der Befund
 *
 * Ein User-Flow-Audit stellte fest: Das Seed-Feld ist standardmäßig **leer**
 * („leer = zufällig") — das Match ist damit nicht reproduzierbar, obwohl
 * Determinismus das Kernversprechen des Projekts ist. Der Platzhalter
 * (`z. B. 20260910`) nannte eine Zahl, aber nicht, wozu sie gut ist.
 *
 * ## Was nachgeprüft wurde
 *
 * Der gezogene Seed steht nach dem Start im Ereignisprotokoll
 * (`main.js:670`: „Lokales Match — Seed 4242") — er ist also **ablesbar** und
 * zum Nachspielen geeignet. Das leere Feld ist damit ein durchdachter
 * Kompromiss, kein Versäumnis:
 *
 *   - Ein fest eingetragener Wert erzeugte bei jedem Start dieselbe Karte — für
 *     ein Spiel, das man öfter beginnt, eine schlechtere Vorgabe.
 *   - Der Hilfetext nennt jetzt beide Seiten, damit die Wahl eine ist.
 *
 * ## Was hier geprüft wird
 *
 * Dass der Hinweis existiert, verständlich ist und nicht in Großbuchstaben
 * erscheint (`label` setzt `text-transform: uppercase` — ein ganzer Satz darin
 * wäre schwer zu lesen).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');

test('Das Seed-Feld nennt seine Wirkung', () => {
  /*
   * Der Platzhalter allein reichte nicht: „z. B. 20260910" nennt eine Zahl,
   * aber nicht, wozu sie gut ist.
   */
  const feld = html.match(/<label>\s*Seed[\s\S]{0,600}?<\/label>/);
  assert.ok(feld, 'das Seed-Feld wurde nicht gefunden');

  assert.match(feld[0], /gleicher Seed/i,
    'Der Hinweis muss erklären, was der Seed bewirkt');
  assert.match(feld[0], /gleiche Karte|gleicher Verlauf/i,
    'und was die Folge ist');
});

test('Der Hinweis verspricht nichts Falsches', () => {
  /*
   * Die Aussage muss zur Wirklichkeit passen. Geprüft wird gegen den Code:
   * Der Seed wird tatsächlich für die Karte verwendet.
   */
  assert.match(main, /buildTerrainForSeed/,
    'der Seed muss in die Kartenerzeugung eingehen');

  // Und er wird im Protokoll genannt — das ist die Zusage „steht im Protokoll".
  assert.match(main, /hud\.log\(`Lokales Match — Seed \$\{/,
    'der gezogene Seed muss im Protokoll stehen, sonst ist die Zusage falsch');
});

test('Der Hinweis erscheint nicht in Großbuchstaben', () => {
  /*
   * FUND (belegt, beim Einbau): `label` setzt `text-transform: uppercase` für
   * die Beschriftung. Ohne Aufhebung stünde der ganze Satz in Großbuchstaben —
   * schwer zu lesen und optisch falsch gewichtet.
   */
  const regel = html.match(/\.field-hint\s*\{([^}]*)\}/);
  assert.ok(regel, 'die CSS-Regel für den Feldhinweis fehlt');
  assert.match(regel[1], /text-transform:\s*none/,
    'Der Hinweis braucht `text-transform: none` — label setzt uppercase');

  // Die Gegenprobe: `label` setzt tatsächlich uppercase.
  const label = html.match(/\n    label\s*\{([^}]*)\}/);
  assert.ok(label, 'die CSS-Regel für label fehlt');
  assert.match(label[1], /text-transform:\s*uppercase/,
    'Testannahme: label setzt uppercase');
});

test('Der Platzhalter nennt keine Zahl mehr', () => {
  /*
   * „z. B. 20260910" sah aus wie eine Empfehlung. Der neue Platzhalter sagt,
   * was passiert, wenn man nichts einträgt.
   */
  const feld = html.match(/<input[^>]*id="cfg-seed"[^>]*>/);
  assert.ok(feld, 'das Eingabefeld wurde nicht gefunden');

  assert.match(feld[0], /placeholder="[^"]*leer/i,
    'Der Platzhalter muss das Leer-Verhalten nennen');
  assert.doesNotMatch(feld[0], /20260910/,
    'Der alte Platzhalter sah wie eine Empfehlung aus');
});

test('Leer bleibt zufällig — die Vorgabe wurde nicht geändert', () => {
  /*
   * Wichtig: Dieser Zug ändert nur die ERKLÄRUNG, nicht das Verhalten. Ein
   * `value`-Attribut am Feld würde bei jedem Start dieselbe Karte erzeugen —
   * das wäre eine Design-Änderung, keine Textverbesserung.
   */
  const feld = html.match(/<input[^>]*id="cfg-seed"[^>]*>/);
  assert.ok(feld, 'das Eingabefeld wurde nicht gefunden');
  assert.doesNotMatch(feld[0], /\svalue="/,
    'Das Feld darf keinen Vorgabewert tragen — leer bedeutet zufällig');

  // Und der Code behandelt leer weiterhin als „kein Seed".
  assert.match(main, /rawSeed === ''[\s\S]{0,60}\? undefined/,
    'Ein leeres Feld muss weiterhin `undefined` ergeben');
});

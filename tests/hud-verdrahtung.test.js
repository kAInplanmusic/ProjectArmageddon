/**
 * Tests: die HUD-Liste bekommt keine Parameter, die `Hud#update` nicht liest.
 *
 * ## Der Befund (B-4 im Befundregister, belegt)
 *
 * Ein `hud.update(...)`-Aufruf in `main.js` übergab `onWeaponDrop` und `onJump`.
 * `Hud#update` destrukturiert nur `{ aim, onWeaponSelect }` — die zwei anderen
 * wurden nie gelesen: toter Draht, eine Absicht ohne Wirkung. Die
 * Sprung-/Abwurf-Eingabe läuft längst über den `InputController`, nicht über die
 * HUD-Liste.
 *
 * ## Warum das ein Strukturtest sein muss
 *
 * ESLint sieht den Fehler nicht: Die überzähligen Schlüssel werden gar nicht erst
 * deklariert (die Destrukturierung nennt sie nicht), es gibt also keine
 * „unbenutzte Variable". Nur ein Textvergleich fängt den Rückfall.
 *
 * ## Die Messung
 *
 * `onWeaponDrop` und `onJump` sind die Steuerschlüssel des `InputController` —
 * DORT gehören sie hin (die Eingabe läuft über den Controller, nicht über die
 * HUD-Liste). In `main.js` darf jeder der beiden Schlüssel deshalb GENAU EINMAL
 * als Objektfeld stehen: in den `InputController`-Optionen des Konstruktors.
 * Jedes WEITERE Vorkommen ist ein toter Parameter in einem anderen Aufruf
 * (historisch: `hud.update`). Kommentare werden vorher entfernt, damit die
 * Fundstelle im Fix-Kommentar nicht als Draht zählt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

const main = ohneKommentare(fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8'));
const hud = fs.readFileSync(path.join(ROOT, 'src', 'client', 'hud.js'), 'utf8');

test('Hud#update kennt genau aim und onWeaponSelect', () => {
  /*
   * Die eine Seite der Kette: Die Signatur ist die Wahrheit darüber, was die
   * Liste verdrahtet. Liest sie mehr, ist dieser Wächter veraltet; liest sie
   * weniger, gibt es toten Draht.
   */
  const signatur = hud.match(/update\(state,\s*\{\s*([^}]*)\}\s*=\s*\{\}\)/);
  assert.ok(signatur, 'die Signatur von Hud#update wurde nicht gefunden');

  const felder = signatur[1];
  assert.match(felder, /aim\s*=\s*null/,
    'Hud#update muss `aim` lesen');
  assert.match(felder, /onWeaponSelect\s*=\s*null/,
    'Hud#update muss `onWeaponSelect` lesen');
  assert.ok(!felder.includes('onWeaponDrop'), 'Hud#update liest onWeaponDrop — dann wäre dieser Test veraltet');
  assert.ok(!felder.includes('onJump'), 'Hud#update liest onJump — dann wäre dieser Test veraltet');
});

test('onWeaponDrop und onJump sind NUR im InputController verdrahtet', () => {
  /*
   * Die andere Seite: Jeder Steuerschlüssel gehört in die Optionen des
   * `InputController` (dort liest ihn die Eingabe). Genau EIN Vorkommen als
   * Objektfeld — ein zweites wäre ein toter Draht in einem anderen Aufruf.
   */
  const drops = (main.match(/onWeaponDrop\s*:/g) ?? []).length;
  const jumps = (main.match(/onJump\s*:/g) ?? []).length;

  assert.equal(drops, 1,
    `onWeaponDrop steht ${drops}× als Feld in main.js — erwartet genau 1 (nur InputController)`);
  assert.equal(jumps, 1,
    `onJump steht ${jumps}× als Feld in main.js — erwartet genau 1 (nur InputController)`);
});

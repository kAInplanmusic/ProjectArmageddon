/**
 * Tests: Profil- und Erfolgsanzeige sind reine Darstellungsfunktionen.
 *
 * ## Der Auftrag (2026-10-01)
 *
 * `#zeigeProfil()` und `#zeigeErfolge()` standen in `Game` (`src/client/main.js`)
 * und bauten aus Profil, Statistik und Erfolgen DOM-Zeilen — Darstellung, keine
 * Orchestrierung. Beide griffen auf keinen privaten Helfer der Klasse zu. Sie
 * liegen jetzt als reine Funktionen in `client/profilanzeige.js`
 * (`baueProfilAnzeige`, `baueErfolgsAnzeige`), die Klasse behält Delegatoren.
 *
 * Geprüft werden drei Zusagen:
 *
 *   1. **Kein `this`** in `profilanzeige.js` — sonst wäre die Darstellung eine
 *      verkappte Methode, nicht eine reine Funktion über eine Quelle.
 *   2. **Die Delegatoren** — `#zeigeProfil()` und `#zeigeErfolge()` rufen die
 *      ausgelagerten Funktionen; die DOM-Logik darf nicht mehr dort stehen.
 *   3. **Keine Doppelregel mehr** — die Stufenreihenfolge kommt aus `TIERS`
 *      (`shared/achievements.js`), nicht aus einer lokalen Kopie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');

function quelle(datei) {
  return readFileSync(resolve(WURZEL, datei), 'utf8');
}

test('profilanzeige.js enthält kein `this`', () => {
  const code = ohneKommentare(quelle('src/client/profilanzeige.js'));
  const treffer = code.match(/\bthis\b/g) ?? [];

  assert.deepEqual(treffer, [],
    `profilanzeige.js greift ${treffer.length}-mal auf \`this\` zu — die Darstellung `
    + 'muss über die Quelle (Parameter) laufen, nicht über die Instanz');
});

test('#zeigeProfil() ist ein reiner Delegator', () => {
  const code = ohneKommentare(quelle('src/client/main.js'));
  const rumpf = /#zeigeProfil\(\)\s*\{([\s\S]*?)\n {2}}/.exec(code);

  assert.ok(rumpf, 'die Methode #zeigeProfil() wurde nicht gefunden');
  const inhalt = rumpf[1];

  assert.match(inhalt, /baueProfilAnzeige\(\{/,
    `#zeigeProfil() ruft baueProfilAnzeige nicht auf: ${inhalt}`);
  // Die DOM-Logik ist draußen — kein getElementById im Delegator.
  assert.ok(!inhalt.includes('getElementById'),
    `#zeigeProfil() baut noch DOM: ${inhalt}`);
});

test('#zeigeErfolge() ist ein reiner Delegator', () => {
  const code = ohneKommentare(quelle('src/client/main.js'));
  const rumpf = /#zeigeErfolge\(\)\s*\{([\s\S]*?)\n {2}}/.exec(code);

  assert.ok(rumpf, 'die Methode #zeigeErfolge() wurde nicht gefunden');
  const inhalt = rumpf[1];

  assert.match(inhalt, /baueErfolgsAnzeige\(\{/,
    `#zeigeErfolge() ruft baueErfolgsAnzeige nicht auf: ${inhalt}`);
  assert.ok(!inhalt.includes('erfolgsKennzahlen'),
    `#zeigeErfolge() rechnet noch Kennzahlen: ${inhalt}`);
});

test('Die Stufenreihenfolge kommt aus EINER Quelle — `TIERS`, nicht einer Kopie', () => {
  /*
   * FUND (belegt, eigener Fund beim Umbau): `main.js` führte
   * `TIER_REIHENFOLGE = ['leicht', 'mittel', 'schwer', 'sehr schwer']` — wortgleich
   * mit `TIERS` aus `shared/achievements.js`. Zwei Definitionen derselben
   * Reihenfolge sind die Doppelregel, die dieses Projekt sonst verbietet: Wer
   * eine ändert, lässt die andere stehen, und die Erfolgs-Sortierung läuft
   * gegen die Schwellen-Definition auseinander.
   *
   * Die Reihenfolge gehört zur Erfolgs-Definition; der Client liest `TIERS`.
   */
  const main = ohneKommentare(quelle('src/client/main.js'));
  const anzeige = ohneKommentare(quelle('src/client/profilanzeige.js'));

  assert.ok(!main.includes('TIER_REIHENFOLGE'),
    'main.js definiert weiterhin eine zweite Stufenreihenfolge');
  assert.match(anzeige, /TIERS/,
    'profilanzeige.js liest die Stufenreihenfolge nicht aus `TIERS`');
});

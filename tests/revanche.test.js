/**
 * Tests: „Revanche" startet ein neues Match (UI-4).
 *
 * ## Der Befund
 *
 * Der Knopf öffnete nur das Menü. Die alte Partie lief weiter: `match` und
 * `mode` blieben stehen, und die Taste R fragte im Menü „Match verlassen?".
 *
 * ## Die Entscheidung (docs/plan-produktion.md §1)
 *
 * Echter Neustart auf derselben Karte: Zustand leeren, dann sofort ein neues
 * Match mit dem Seed aus `#seedFuerRevanche`.
 *
 * ## Was hier geprüft wird
 *
 * Der Ablauf selbst (`revanche.js`) mit Platzhaltern — inklusive Reihenfolge —
 * und die Verdrahtung in `main.js`. Der Klick im Browser gehört nach
 * `tests/e2e/sieg-dialog.spec.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { revancheAblauf } from '../src/client/revanche.js';
import { ohneKommentare } from './helfer/ohne-kommentare.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'client', 'main.js'), 'utf8');
const code = ohneKommentare(main);

/** Der Rumpf einer Methode bis zur schließenden Klammer auf Klassenebene. */
function rumpf(name) {
  const treffer = code.match(new RegExp(`${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n  \\}`));
  assert.ok(treffer, `die Methode \`${name}\` wurde nicht gefunden`);
  return treffer[1];
}

test('Der Revanche-Knopf ruft die Revanche — er öffnet nicht mehr nur das Menü', () => {
  const zeile = code.match(/rematch-button[^\n]*addEventListener\([^\n]*/);
  assert.ok(zeile, 'der Revanche-Knopf wurde nicht verdrahtet');
  assert.match(zeile[0], /this\.revanche\(\)/, 'der Knopf muss `revanche()` rufen');
  assert.doesNotMatch(zeile[0], /menuOverlay\.hidden\s*=\s*false/,
    'der Knopf darf das Menü nicht mehr selbst öffnen — das tut `#verlasseMatch`');
});

test('Der Ablauf liest den Seed, räumt auf und startet — in dieser Reihenfolge', () => {
  const reihenfolge = [];
  let gestartet = null;
  const ergebnis = revancheAblauf({
    seedLesen: () => { reihenfolge.push('seed'); return 4; },
    aufraeumen: () => reihenfolge.push('aufraeumen'),
    starten: konfig => { reihenfolge.push('starten'); gestartet = konfig; return { ok: true, mode: 'local' }; },
    konfiguration: { teams: 2, playersPerTeam: 3, biom: null },
  });

  assert.deepEqual(reihenfolge, ['seed', 'aufraeumen', 'starten'],
    'der Seed muss VOR dem Aufräumen gelesen werden — danach ist `match` weg');
  assert.equal(ergebnis.ok, true);
  assert.equal(gestartet.seed, 4, 'das neue Match spielt dieselbe Karte');
  assert.equal(gestartet.teams, 2, 'die Konfiguration der Vorpartie bleibt');
  assert.equal(gestartet.playersPerTeam, 3);
});

test('Ohne bekannten Seed bleibt es beim Zufall — kein NaN', () => {
  let gestartet = null;
  revancheAblauf({
    seedLesen: () => null,
    aufraeumen: () => {},
    starten: konfig => { gestartet = konfig; return { ok: true }; },
    konfiguration: { teams: 2 },
  });
  assert.equal(gestartet.seed, undefined,
    'ohne Seed muss `undefined` übergeben werden (neuer Zufalls-Seed), nicht null/NaN');
});

test('Online: aufräumen, dann ins Menü — der Server entscheidet über die neue Partie', () => {
  const reihenfolge = [];
  const ergebnis = revancheAblauf({
    seedLesen: () => { reihenfolge.push('seed'); return 7; },
    aufraeumen: () => reihenfolge.push('aufraeumen'),
    starten: () => { reihenfolge.push('starten'); return { ok: true }; },
    konfiguration: { teams: 2 },
    nurMenue: true,
  });
  assert.deepEqual(reihenfolge, ['seed', 'aufraeumen'],
    'online darf kein lokales Match starten');
  assert.deepEqual(ergebnis, { ok: true, mode: 'menu' },
    'online führt die Revanche ins Menü');
});

test('Ohne Konfiguration wird trotzdem aufgeräumt — kein hängendes Match', () => {
  let aufgeraeumt = false;
  const ergebnis = revancheAblauf({
    seedLesen: () => 4,
    aufraeumen: () => { aufgeraeumt = true; },
    starten: () => { throw new Error('darf nicht starten'); },
    konfiguration: null,
  });
  assert.equal(aufgeraeumt, true, 'der alte Zustand muss auch dann weg');
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.errors[0], 'Keine Match-Konfiguration');
});

test('`main.js` übergibt genau diese Zugänge', () => {
  const koerper = rumpf('revanche');
  assert.match(koerper, /revancheAblauf\(\{/);
  assert.match(koerper, /seedLesen: \(\) => this\.#seedFuerRevanche\(\)/);
  assert.match(koerper, /aufraeumen: \(\) => this\.#verlasseMatch\(\)/);
  assert.match(koerper, /starten: konfig => this\.startMatch\(konfig\)/);
  assert.match(koerper, /konfiguration: this\.letzteMatchKonfiguration/);
});

test('`startMatch` merkt sich die Konfiguration für die Revanche', () => {
  const koerper = rumpf('startMatch');
  assert.match(koerper, /this\.letzteMatchKonfiguration\s*=\s*\{/,
    '`startMatch` muss die Konfiguration dieser Partie merken');
  for (const feld of ['teams', 'playersPerTeam', 'fraktionen', 'loadouts', 'biom', 'kartenart']) {
    assert.match(koerper, new RegExp(`letzteMatchKonfiguration[\\s\\S]{0,300}\\b${feld}\\b`),
      `die gemerkte Konfiguration muss \`${feld}\` enthalten`);
  }
});

test('Das Aufräumen leert `match` und `mode` — R fragt danach nicht mehr', () => {
  const koerper = rumpf('#verlasseMatch');
  assert.match(koerper, /this\.match = null/, '`#verlasseMatch` muss die Simulation entfernen');
  assert.match(koerper, /this\.mode = 'local'/, '`#verlasseMatch` muss den Modus zurücksetzen');
  assert.match(koerper, /this\.menuOverlay\.hidden = false/, '`#verlasseMatch` zeigt das Menü');
});

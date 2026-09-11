import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Grenzen zwischen Client und Server.
 *
 * `src/shared/` wird von beiden Seiten genutzt. Node-Builtins wie `node:fs` gibt
 * es im Browser nicht — ein Import dort bricht den Client zur Laufzeit, und zwar
 * erst dann, wenn der Pfad tatsächlich durchlaufen wird. Beim Einbringen des
 * Archivstands kam genau so ein Fall mit herein (`src/shared/data/index.js`).
 *
 * Deshalb wird hier die Regel festgehalten statt nur einmal korrigiert.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/** Dateiendungen, die für den Browser gebaut werden. */
const ENDUNGEN = ['.js', '.mjs'];

/**
 * Bekannte Ausnahme.
 *
 * `src/shared/data/index.js` liest seine JSON-Dateien über `node:fs`. Das Modul
 * ist damit ausschließlich serverseitig nutzbar. Es ist bewusst NICHT aus dem
 * gemeinsamen Balken `src/shared/index.js` re-exportiert — siehe ARCHIVED.md.
 */
const AUSNAHMEN = new Set(['src/shared/data/index.js']);

function dateienUnter(ordner) {
  const ergebnis = [];
  for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
    const voll = path.join(ordner, eintrag.name);
    if (eintrag.isDirectory()) ergebnis.push(...dateienUnter(voll));
    else if (ENDUNGEN.includes(path.extname(eintrag.name))) ergebnis.push(voll);
  }
  return ergebnis;
}

test('src/shared enthält keine Node-Builtins', () => {
  const verstoesse = dateienUnter(path.join(ROOT, 'src', 'shared'))
    .map(datei => ({ datei, relativ: path.relative(ROOT, datei).split(path.sep).join('/') }))
    .filter(({ relativ }) => !AUSNAHMEN.has(relativ))
    .filter(({ datei }) => /(from|import)\s*['"]node:/.test(fs.readFileSync(datei, 'utf8')))
    .map(({ relativ }) => relativ);

  assert.deepEqual(verstoesse, [],
    `Diese Dateien unter src/shared laden Node-Builtins: ${verstoesse.join(', ')}. `
    + 'src/shared wird auch für den Browser gebaut. Entweder nach src/server verschieben '
    + 'oder in AUSNAHMEN aufnehmen und begründen.');
});

test('Der gemeinsame Balken re-exportiert keine Node-Builtin-Module', () => {
  // Der Balken ist der Weg, über den so etwas versehentlich in den Client gelangt.
  const quelle = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'index.js'), 'utf8');

  // Nur ECHTE Export-Anweisungen zählen. Ein Vorkommen im Kommentar ist gerade
  // gewollt: Dort steht, warum der Ordner nicht re-exportiert wird.
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(zeile => !zeile.trim().startsWith('//'))
    .join('\n');

  const reexportiert = [...ohneKommentare.matchAll(/export\s+\*\s+from\s+'([^']+)'|export\s*\{[^}]*\}\s*from\s+'([^']+)'/g)]
    .map(m => m[1] ?? m[2]);

  for (const ausnahme of AUSNAHMEN) {
    const modul = './' + ausnahme.replace(/^src\/shared\//, '');
    assert.ok(!reexportiert.includes(modul),
      `src/shared/index.js re-exportiert ${modul}, das Node-Builtins lädt`);
  }
});

test('src/client lädt keine Node-Builtins', () => {
  const verstoesse = dateienUnter(path.join(ROOT, 'src', 'client'))
    .filter(datei => /(from|import)\s*['"]node:/.test(fs.readFileSync(datei, 'utf8')))
    .map(datei => path.relative(ROOT, datei));

  assert.deepEqual(verstoesse, [],
    `Client-Dateien mit Node-Builtins: ${verstoesse.join(', ')}`);
});

test('Die Ausnahmeliste bleibt begründet', () => {
  // Eine Ausnahme, die niemand mehr braucht, ist eine vergessene Regel.
  for (const ausnahme of AUSNAHMEN) {
    const voll = path.join(ROOT, ausnahme);
    assert.ok(fs.existsSync(voll), `Ausnahme ${ausnahme} existiert nicht mehr`);
    assert.match(fs.readFileSync(voll, 'utf8'), /node:/,
      `Ausnahme ${ausnahme} lädt keine Node-Builtins mehr und gehört aus der Liste entfernt`);
  }
});

test('Der Archivstand ist dokumentiert', () => {
  // Übernommene Fremdstände ohne Beschreibung sind später nicht mehr einzuordnen.
  const doc = fs.readFileSync(path.join(ROOT, 'ARCHIVED.md'), 'utf8');
  assert.match(doc, /archive\/copilot-explore-and-extract-files/,
    'ARCHIVED.md nennt die Herkunft nicht');
  assert.match(doc, /50efbae/, 'ARCHIVED.md nennt den Commit nicht');

  for (const pfad of ['uploaded', 'src/shared/data', 'src/engine/weapons']) {
    assert.ok(doc.includes(pfad), `ARCHIVED.md erwähnt ${pfad} nicht`);
  }
});

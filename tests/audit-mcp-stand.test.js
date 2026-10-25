import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALT_CODE_MELDUNG,
  ALT_CODE_MELDUNG_ASCII,
  NEUSTART_HINWEIS,
  PROZESS_STAND,
  messeStand,
  quellDateien,
  standBericht,
  standFeld,
  vergleiche,
} from '../tools/audit-mcp/lib/stand.mjs';

/*
 * Der Wächter gegen die WERKZEUGFALLE (bgworker-todo.json, O10).
 *
 * Belegter Fehler (2026-09-26): Ein langlaufender MCP-Server antwortete nach der
 * Reparatur seiner eigenen Detektor-Datei weiter mit der Welt von VOR der
 * Reparatur — 27 angeblich undokumentierte stumme Ereignisse, die einen ganzen
 * Arbeitsdurchgang gekostet haben. Der Server hat damals nicht gelogen, er hat
 * seine Module nur einmal geladen.
 *
 * `lib/stand.mjs` hängt seitdem einen Fingerabdruck an jede Antwort. Dieser Test
 * belegt, dass der Vergleich wirklich anschlägt: bei geänderter Datei, bei
 * neuer Datei, bei gelöschter Datei und bei unlesbarer Datei (fail-safe).
 * Ohne diesen Test wäre die Warnung eine Behauptung im Kommentar.
 */

/** Ein Stand-Objekt in der Form, die `messeStand()` liefert. */
function stand(dateien, unlesbar = []) {
  return {
    hash: 'hash-' + Object.keys(dateien).sort().join(','),
    prozessStart: '2026-10-23T00:00:00.000Z',
    gemessenAm: '2026-10-23T00:00:00.000Z',
    dateien,
    unlesbar,
    anzahl: Object.keys(dateien).length,
    geprueft: Object.keys(dateien).sort(),
    vollstaendig: unlesbar.length === 0,
  };
}

const A = { sha256: 'aaa', bytes: 10 };
const B = { sha256: 'bbb', bytes: 12 };

test('Unveränderter Code: der Vergleich meldet Gleichstand', () => {
  const v = vergleiche(stand({ 'lib/x.mjs': A }), stand({ 'lib/x.mjs': A }));
  assert.equal(v.abweichung, false);
  assert.equal(v.gleich, true);
  assert.deepEqual(v.gruende, []);
  assert.ok(!v.meldung.includes(ALT_CODE_MELDUNG));
});

test('Geänderte Datei: Abweichung, und die Datei wird beim Namen genannt', () => {
  const v = vergleiche(stand({ 'lib/x.mjs': A }), stand({ 'lib/x.mjs': B }));
  assert.equal(v.abweichung, true);
  assert.equal(v.geaendert.length, 1);
  assert.equal(v.geaendert[0].datei, 'lib/x.mjs');
  assert.equal(v.geaendert[0].prozessSha256, 'aaa');
  assert.equal(v.geaendert[0].platteSha256, 'bbb');
  assert.equal(v.geaendert[0].prozessBytes, 10);
  assert.equal(v.geaendert[0].platteBytes, 12);
  assert.match(v.meldung, /^Dieser Server läuft mit altem Code/);
  assert.match(v.meldungAscii, /^Dieser Server laeuft mit altem Code/);
});

test('Neue Datei auf der Platte zählt als Abweichung (neues Modul rutscht nicht durch)', () => {
  const v = vergleiche(stand({ 'lib/x.mjs': A }), stand({ 'lib/x.mjs': A, 'lib/y.mjs': B }));
  assert.equal(v.abweichung, true);
  assert.deepEqual(v.neuAufDerPlatte, ['lib/y.mjs']);
});

test('Im Prozess vorhandene, auf der Platte gelöschte Datei zählt als Abweichung', () => {
  const v = vergleiche(stand({ 'lib/x.mjs': A, 'lib/y.mjs': B }), stand({ 'lib/x.mjs': A }));
  assert.equal(v.abweichung, true);
  assert.deepEqual(v.nurImProzess, ['lib/y.mjs']);
});

test('Unlesbare Datei ist eine Abweichung, auch wenn die Hashes gleich sind (fail-safe)', () => {
  const v = vergleiche(
    stand({ 'lib/x.mjs': A }),
    stand({ 'lib/x.mjs': A }, [{ datei: 'lib/x.mjs', fehler: 'EACCES' }]),
  );
  assert.equal(v.abweichung, true);
  assert.equal(v.unlesbar.length, 1);
  assert.equal(v.unlesbar[0].seite, 'jetzt');
  assert.match(v.meldung, /NICHT messbar/);
});

test('Der Neustart-Hinweis steht bereit, die ASCII-Fassung ist ohne Umlaute', () => {
  assert.match(NEUSTART_HINWEIS, /server\.mjs/);
  // Nur ASCII: eine Warnung, die in einer falsch kodierten Konsole als "laeuft"
  // ankommt, wäre keine Warnung.
  assert.equal(ALT_CODE_MELDUNG_ASCII, ALT_CODE_MELDUNG
    .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue')
    .replaceAll('—', '-'));
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[^\x00-\x7F]/.test(ALT_CODE_MELDUNG_ASCII));
});

test('messeStand() hasht JEDE Datei aus quellDateien() und ist bei zwei Messungen gleich', () => {
  const liste = quellDateien();
  const erst = messeStand();
  const zweit = messeStand();

  assert.deepEqual(erst.geprueft, liste);
  assert.equal(erst.anzahl, liste.length);
  assert.equal(erst.vollstaendig, true);
  assert.equal(erst.unlesbar.length, 0);
  // server.mjs gehört dazu: sonst änderte ein Umbau des Servers den Stand nicht.
  assert.ok(liste.includes('server.mjs'));
  // Ohne Änderung an der Platte derselbe Fingerabdruck — der Hash hängt am
  // INHALT, nicht an der Uhrzeit.
  assert.equal(erst.hash, zweit.hash);
});

test('Fingerabdruck ändert sich, wenn sich der Inhalt einer Datei ändert', () => {
  const basis = messeStand();
  const kopie = {
    ...basis,
    dateien: { ...basis.dateien, 'lib/stand.mjs': { sha256: 'manipuliert', bytes: 1 } },
  };
  const v = vergleiche(basis, kopie);
  assert.equal(v.abweichung, true);
  assert.deepEqual(v.geaendert.map((g) => g.datei), ['lib/stand.mjs']);
});

test('standFeld() trägt den Stand und den Vergleich in jede Antwort', () => {
  const feld = standFeld();
  assert.equal(feld.hash, PROZESS_STAND.hash);
  assert.equal(feld.dateienGehasht, quellDateien().length);
  assert.equal(feld.veraltet, false, 'frischer Prozess auf unverändertem Code');
  assert.equal(feld.platteHash, messeStand().hash);
  assert.match(feld.urteil, /läuft mit dem Code, der jetzt auf der Platte liegt/);
});

test('standBericht() nennt die gepruesften Dateien, die Regel und den Neustart-Weg', () => {
  const bericht = standBericht();
  assert.deepEqual(bericht.fingerabdruckUeber, quellDateien());
  assert.equal(bericht.abweichung, false);
  assert.equal(bericht.neustart, NEUSTART_HINWEIS);
  assert.match(bericht.regel, /eingefrorene Sicht/);
});

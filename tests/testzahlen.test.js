// OPT-5: erzeugte Testzahlen-Blöcke statt handgepflegter Tabellenzeilen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  BLOCK_ENDE, BLOCK_START, leseBlock, parseNodeTestAusgabe, parsePlaywrightListe,
  pruefeTestlauf, renderBlock, setzeBlock,
} from '../scripts/lib/testzahlen.mjs';

const gut = {
  unit: { tests: 10, bestanden: 8, rot: 1, uebersprungen: 1, dateien: 3, datum: '2026-11-12', commit: 'abc1234' },
  e2e: { tests: 5, spezifikationen: 2, datum: '2026-11-12', commit: 'abc1234' },
};

test('OPT-5: node --test-Zusammenfassung (spec und TAP) wird gelesen, unvollständige Läufe nicht', () => {
  const spec = 'ℹ tests 12\nℹ suites 0\nℹ pass 10\nℹ fail 1\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\n';
  assert.deepEqual(parseNodeTestAusgabe(spec), { tests: 12, bestanden: 10, rot: 1, uebersprungen: 1 });
  const tap = '# tests 12\n# pass 9\n# fail 1\n# cancelled 1\n# skipped 1\n';
  assert.deepEqual(parseNodeTestAusgabe(tap), { tests: 12, bestanden: 9, rot: 2, uebersprungen: 1 });
  assert.equal(parseNodeTestAusgabe('ok 1 - irgendein Test\n'), null, 'ohne Zusammenfassung keine Zahl');
  assert.deepEqual(parsePlaywrightListe('Total: 397 tests in 78 files'), { tests: 397, spezifikationen: 78 });
  assert.equal(parsePlaywrightListe('nichts'), null);
});

test('OPT-5: Form der Erfassung wird geprüft', () => {
  assert.deepEqual(pruefeTestlauf(gut), []);
  assert.match(pruefeTestlauf({ ...gut, unit: { ...gut.unit, tests: 11 } }).join(), /ergibt nicht 11/);
  assert.match(pruefeTestlauf({ e2e: gut.e2e }).join(), /unit/);
  assert.match(pruefeTestlauf({ unit: gut.unit }).join(), /e2e/);
  assert.match(pruefeTestlauf({ ...gut, e2e: { ...gut.e2e, commit: '' } }).join(), /e2e\.commit/);
});

test('OPT-5: Block wird erzeugt, ersetzt und gelesen; ohne Markierung kein Eingriff', () => {
  const inhalt = renderBlock(gut);
  assert.match(inhalt, /\*\*10 Tests\*\*, 8 grün, 1 übersprungen, \*\*1 rot\*\*; 3 Testdateien/);
  assert.match(inhalt, /\*\*5 Tests in 2 Spezifikationen\*\*/);
  const text = `vorher\n${BLOCK_START}\nalt\n${BLOCK_ENDE}\nnachher\n`;
  const neu = setzeBlock(text, inhalt);
  assert.equal(leseBlock(neu), inhalt);
  assert.ok(neu.startsWith('vorher\n') && neu.endsWith('nachher\n'));
  assert.equal(setzeBlock(neu, inhalt), neu, 'idempotent');
  assert.equal(setzeBlock('ohne Markierung', inhalt), null);
});

test('OPT-5: check:docs bleibt grün und README/MASTERDOTO tragen denselben Block', () => {
  const r = spawnSync('node', ['scripts/check-docs.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /README: Testzahlen-Block == docs\/testlauf\.json/);
  assert.match(r.stdout, /MASTERDOTO: Testzahlen-Block == docs\/testlauf\.json/);
});

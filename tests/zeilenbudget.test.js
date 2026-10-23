import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, '..');

/**
 * Zeilenbudgets für die größten HANDGEPFLEGTEN Dateien (C-9 im Befundregister).
 *
 * Vorher gab es nur für `match.js` ein Budget. Die größten übrigen Dateien
 * wuchsen unbewacht — wer sie zerlegen wollte, hatte keinen Anlass. Die Budgets
 * liegen bewusst ÜBER dem heutigen Stand (gemessen 2026-10-19): Sie sollen
 * Wachstum sichtbar machen, nicht den Bestand abwürgen. Wird eines gerissen,
 * ist das ein Auftrag zum Zerlegen — nicht zum Erhöhen ohne Begründung.
 *
 * Genau das ist am 2026-10-23 passiert: Nach dem Zusammenführen der beiden
 * Linien stand `main.js` bei 4492 und `renderer.js` bei 2844 Zeilen. Die Zahlen
 * sind NICHT erhöht worden; ausgezogen sind zwei Module:
 * `client/kaderansicht.js` (Kader- und Hilfeansicht, ~720 Zeilen) und
 * `client/kulisseUndWasser.js` (Himmel/Kulisse und Wasserebene, ~390 Zeilen).
 *
 * `weapons.js` ist GENERIERT (`npm run weapons:build`) und wird hier bewusst
 * NICHT budgetiert; Handarbeit dort geht beim nächsten Lauf verloren.
 */
const BUDGETS = new Map([
  ['src/client/main.js', 4000],
  ['src/engine/match.js', 3200], // bestehendes Budget, hier gebündelt
  ['src/server/gameServer.js', 3000],
  ['src/shared/terrainGen3.js', 2500],
  ['src/client/renderer.js', 2500],
  ['src/shared/protocol.js', 1600],
]);

for (const [relat, limit] of BUDGETS) {
  test(`${relat} hat <= ${limit} Zeilen (Zeilenbudget)`, () => {
    const quelle = fs.readFileSync(path.join(ROOT, relat), 'utf8');
    const zeilen = quelle.split('\n').length;
    assert.ok(zeilen <= limit, `${relat} hat ${zeilen} Zeilen — Limit ${limit}`);
  });
}

test('weapons.js bleibt generiert — kein Hand-Budget, kein Hand-Wachstum', () => {
  const waffen = path.join(ROOT, 'src', 'shared', 'config', 'weapons.js');
  const quelle = fs.readFileSync(waffen, 'utf8');
  assert.match(quelle, /GENERIERT|generiert|weapons:build/,
    'weapons.js muss als generierte Datei gekennzeichnet sein');
});

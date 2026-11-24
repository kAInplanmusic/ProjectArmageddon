#!/usr/bin/env node
/**
 * Zieht die Fundstellen der Einzweig-Belege im Ereigniskatalog nach (`src/shared/ereigniskatalog.js`, Form „pfad.js:zeile (anker)“).
 *
 * Anlass: Jede eingefügte Zeile in `main.js` oder `renderer.js` verschob die Fundstellen, und `tests/event-coverage.test.js` („Jede
 * Fundstelle eines Einzweig-Belegs zeigt wirklich auf ihren Anker“) fiel um (2026-11-23/24 viermal). Das Werkzeug sucht je Fundstelle die
 * nächste Zeile, die den Anker enthält (bis 30 Zeilen weit), und schreibt nur die Zeilennummer neu. Findet es den Anker nicht, bleibt
 * die Fundstelle stehen und das Werkzeug meldet es (dann ist die Aussage selbst zu prüfen, nicht die Nummer).
 *
 * Aufruf: node scripts/fundstellen-nachziehen.mjs [--pruefen]   (--pruefen: nichts schreiben, Exit 1 bei veralteten Fundstellen)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const KATALOG = `${WURZEL}src/shared/ereigniskatalog.js`;
const nurPruefen = process.argv.includes('--pruefen');

const dateien = new Map();
const zeilenVon = pfad => {
  if (!dateien.has(pfad)) dateien.set(pfad, readFileSync(`${WURZEL}${pfad}`, 'utf8').split('\n'));
  return dateien.get(pfad);
};

let verschoben = 0;
let fehlend = 0;
const text = readFileSync(KATALOG, 'utf8');
const neu = text.replace(/(src\/[\w/]+\.(?:m?js)):(\d+) \(([^)]+)\)/g, (ganz, pfad, nummer, anker) => {
  const zeilen = zeilenVon(pfad);
  const n = Number(nummer);
  const suche = anker.replace(/`/g, '');
  if (zeilen[n - 1]?.includes(suche)) return ganz;
  for (let d = 1; d <= 30; d += 1) {
    for (const k of [n + d, n - d]) {
      if (k >= 1 && k <= zeilen.length && zeilen[k - 1].includes(suche)) {
        verschoben += 1;
        console.log(`${pfad}:${n} → ${k} (${suche})`);
        return `${pfad}:${k} (${anker})`;
      }
    }
  }
  fehlend += 1;
  console.log(`NICHT GEFUNDEN: ${pfad}:${n} (${suche})`);
  return ganz;
});

if (nurPruefen) {
  console.log(`${verschoben} veraltet, ${fehlend} ohne Anker`);
  process.exit(verschoben + fehlend > 0 ? 1 : 0);
}
if (neu !== text) writeFileSync(KATALOG, neu);
console.log(`${verschoben} Fundstellen nachgezogen, ${fehlend} ohne Anker`);
process.exit(fehlend > 0 ? 1 : 0);

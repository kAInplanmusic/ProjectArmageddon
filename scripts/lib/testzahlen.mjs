/**
 * Testzahlen der Dokumentation (OPT-5).
 *
 * Die Zahl der Tests kann nur ein Lauf sagen. Sie steht deshalb nicht mehr von
 * Hand in README und MASTERDOTO, sondern wird einmal erfasst
 * (`npm run testlauf:erfassen`, Datei `docs/testlauf.json`) und von dort in zwei
 * erzeugte Blöcke geschrieben (`npm run check:docs -- --schreiben`). Den
 * Verlauf führt Git (`git log -p -- docs/testlauf.json`), nicht die Tabelle.
 *
 * Dieses Modul ist reine Logik ohne Nebenwirkung auf Dateien, damit Test und
 * Werkzeuge dieselbe Darstellung benutzen.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const BLOCK_START = '<!-- testzahlen:start (erzeugt von scripts/check-docs.mjs --schreiben, nicht von Hand ändern) -->';
export const BLOCK_ENDE = '<!-- testzahlen:ende -->';

/** Tracked-Dateien eines Ordners, die auf `endung` enden (Fallback: Verzeichnis). */
export function zaehleDateien(root, ordner, endung) {
  const passt = f => f.endsWith(endung) && !f.includes('/');
  try {
    const out = execFileSync('git', ['ls-files', '--', ordner], { cwd: root, encoding: 'utf8' });
    const rel = out.split('\n').filter(Boolean).map(p => p.slice(ordner.length + 1));
    return rel.filter(passt).length;
  } catch {
    return readdirSync(join(root, ordner)).filter(passt).length;
  }
}

/**
 * Liest die Schlusszeilen von `node --test` („ℹ tests 12“ im spec-, „# tests 12“ im TAP-Format).
 * Gibt null zurück, wenn der Lauf nicht bis zur Zusammenfassung kam.
 */
export function parseNodeTestAusgabe(text) {
  const wert = name => {
    const m = text.match(new RegExp(`^(?:ℹ|#) ${name} (\\d+)\\s*$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const tests = wert('tests');
  const bestanden = wert('pass');
  const rot = wert('fail');
  const uebersprungen = wert('skipped');
  const abgebrochen = wert('cancelled');
  if ([tests, bestanden, rot, uebersprungen].includes(null)) return null;
  return { tests, bestanden, rot: rot + (abgebrochen ?? 0), uebersprungen };
}

/** „Total: 392 tests in 78 files“ aus `playwright test --list`. */
export function parsePlaywrightListe(text) {
  const m = text.match(/Total: (\d+) tests? in (\d+) files?/);
  return m ? { tests: Number(m[1]), spezifikationen: Number(m[2]) } : null;
}

/** Prüft die Form von `docs/testlauf.json`; liefert Fehlertexte (leer = in Ordnung). */
export function pruefeTestlauf(t) {
  const f = [];
  const ganz = v => Number.isInteger(v) && v >= 0;
  const u = t?.unit;
  const e = t?.e2e;
  if (!u) f.push('`unit` fehlt');
  else {
    for (const k of ['tests', 'bestanden', 'rot', 'uebersprungen', 'dateien']) {
      if (!ganz(u[k])) f.push(`unit.${k} ist keine ganze Zahl`);
    }
    if (ganz(u.tests) && u.bestanden + u.rot + u.uebersprungen !== u.tests) {
      f.push(`unit: ${u.bestanden} + ${u.rot} + ${u.uebersprungen} ergibt nicht ${u.tests}`);
    }
    for (const k of ['datum', 'commit']) if (typeof u[k] !== 'string' || !u[k]) f.push(`unit.${k} fehlt`);
  }
  if (!e) f.push('`e2e` fehlt');
  else {
    for (const k of ['tests', 'spezifikationen']) if (!ganz(e[k])) f.push(`e2e.${k} ist keine ganze Zahl`);
    for (const k of ['datum', 'commit']) if (typeof e[k] !== 'string' || !e[k]) f.push(`e2e.${k} fehlt`);
  }
  return f;
}

/** Der erzeugte Block (ohne Markierungszeilen), eine Zahl je Zeile statt einer Riesenzelle. */
export function renderBlock(t) {
  const u = t.unit;
  const e = t.e2e;
  const rot = u.rot === 0 ? '0 rot' : `**${u.rot} rot**`;
  const zeilen = [
    `- Unit/Integration (\`npm test\`): **${u.tests} Tests**, ${u.bestanden} grün, ${u.uebersprungen} übersprungen, ${rot}; `
    + `${u.dateien} Testdateien beim Lauf (${u.datum}, Stand \`${u.commit}\`).`,
    `- Browser-E2E (\`npx playwright test --list\`): **${e.tests} Tests in ${e.spezifikationen} Spezifikationen** `
    + `(Zählung ${e.datum}, Stand \`${e.commit}\`; das ist eine Zählung, kein Lauf).`,
    '- Aktuelle Dateizahlen: `npm run check:docs` (zählt die getrackten Dateien). Erfassen: `npm run testlauf:erfassen`. '
    + 'Verlauf: `git log -p -- docs/testlauf.json`.',
  ];
  return zeilen.join('\n');
}

/** Ersetzt den Block im Text; gibt null zurück, wenn die Markierungen fehlen. */
export function setzeBlock(text, inhalt) {
  const a = text.indexOf(BLOCK_START);
  const b = text.indexOf(BLOCK_ENDE);
  if (a < 0 || b < a) return null;
  return `${text.slice(0, a + BLOCK_START.length)}\n${inhalt}\n${text.slice(b)}`;
}

export function leseBlock(text) {
  const a = text.indexOf(BLOCK_START);
  const b = text.indexOf(BLOCK_ENDE);
  if (a < 0 || b < a) return null;
  return text.slice(a + BLOCK_START.length, b).replace(/^\n/, '').replace(/\n$/, '');
}

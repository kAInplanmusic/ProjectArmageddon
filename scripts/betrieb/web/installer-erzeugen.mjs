/**
 * Erzeugt `installer-text.mjs` aus `scripts/betrieb/server-erstinstallation.sh`.
 *
 * Ein Worker (Cloudflare) liest keine Dateien; der Installer, den der Web-Einstieg dem neuen Server per cloud-init
 * mitgibt, muss als Text im Code stehen. `npm run web:installer` schreibt die Datei neu; `tests/cloudflare-einstieg.test.js`
 * schlägt an, wenn sie nicht zur Quelle passt (`node installer-erzeugen.mjs --pruefen` gibt Exit 1).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('../../../', import.meta.url));
const QUELLE = `${WURZEL}scripts/betrieb/server-erstinstallation.sh`;
const ZIEL = `${WURZEL}scripts/betrieb/web/installer-text.mjs`;

export function erzeugeText() {
  const sh = readFileSync(QUELLE, 'utf8');
  return `// ERZEUGT aus scripts/betrieb/server-erstinstallation.sh (npm run web:installer) — nicht von Hand ändern.\nexport default ${JSON.stringify(sh)};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = erzeugeText();
  if (process.argv.includes('--pruefen')) {
    let alt = ''; try { alt = readFileSync(ZIEL, 'utf8'); } catch { /* fehlt */ }
    if (alt !== text) { console.error('installer-text.mjs ist veraltet: npm run web:installer'); process.exit(1); }
  } else {
    writeFileSync(ZIEL, text);
    console.log(`geschrieben: ${ZIEL}`);
  }
}

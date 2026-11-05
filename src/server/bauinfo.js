/**
 * Versionskennung des Servers (DEP-1): Welcher Build wird ausgeliefert?
 *
 * Quelle ist `dist/version.json`, die der Client-Build schreibt (`vite.config.mjs`,
 * `scripts/release/bauinfo.mjs`). Der Server meldet sie in `/healthz` — der Smoke-Test nach einem
 * Deploy (`scripts/release/smoke.mjs`) vergleicht sie mit der erwarteten Version, und ein Rückfall
 * ist daran ablesbar.
 *
 * Fehlt die Datei (Entwicklung ohne Build, Tests), gilt die Version aus `package.json` und der
 * Git-Stand als `unbekannt`. Der Inhalt wird nicht blind durchgereicht: nur kurze Zeichenketten,
 * sonst Platzhalter (die Datei liegt im ausgelieferten Verzeichnis und ist damit Eingabe).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAKET_URL = new URL('../../package.json', import.meta.url);

function kurz(wert, fallback) {
  return typeof wert === 'string' && wert.length > 0 && wert.length <= 64 && !/[\0\n\r]/.test(wert) ? wert : fallback;
}

function paketVersion() {
  try {
    return kurz(JSON.parse(readFileSync(PAKET_URL, 'utf8')).version, 'unbekannt');
  } catch {
    return 'unbekannt';
  }
}

/**
 * @param {{distDir?: string, cwd?: string}} [optionen]
 * @returns {{version: string, gitSha: string, bauzeit: string|null, quelle: 'dist/version.json'|'package.json'}}
 */
export function leseBauinfo({ distDir = 'dist', cwd = process.cwd() } = {}) {
  try {
    const roh = JSON.parse(readFileSync(resolve(cwd, distDir, 'version.json'), 'utf8'));
    if (roh && typeof roh === 'object') {
      return {
        version: kurz(roh.version, paketVersion()),
        gitSha: kurz(roh.gitSha, 'unbekannt'),
        bauzeit: kurz(roh.bauzeit, null),
        quelle: 'dist/version.json',
      };
    }
  } catch {
    // kein Build oder unlesbar: Rückfall auf package.json
  }
  return { version: paketVersion(), gitSha: 'unbekannt', bauzeit: null, quelle: 'package.json' };
}
